/**
 * Host half of the dsh-interpreter bundle.
 *
 * The Client renders a 「速览」 block under each finished answer and posts the
 * finished Turn's identity here; this half reads the committed assistant text
 * back out of the Session log, asks the configured model for a readable
 * rewrite, and caches the result. Display only: the Session log, the working
 * model's context and the original answer are never touched.
 */

/** Local route the Client module posts to. */
const ROUTE_PATH = '/interpreter/rewrite'

/** Local routes the page uses to read and change the rewrite model. */
const MODELS_PATH = '/interpreter/models'
const CONFIG_PATH = '/interpreter/config'

/** The three ways a new answer can get a 速览. */
const MODES = ['global', 'session', 'manual']

/** Largest request body accepted from the page, in bytes. */
const MAX_BODY_BYTES = 4096

/** Cached rewrites kept in memory; the oldest entry is dropped past this. */
const MAX_CACHE_ENTRIES = 500

/** Sessions remembered in the 本会话 allow-list. */
const MAX_SESSIONS = 200

/** Rewrites allowed to talk to a model at once; the rest wait their turn. */
const MAX_CONCURRENT_REWRITES = 2

/** Default rewrite instruction; overridable through `config.prompt`. */
const DEFAULT_PROMPT = `你把技术回答改写成「速览」。读者聪明但不熟悉这块，他只想知道：结论是什么、要不要动手、动手做什么、有什么坑。

最重要的一条：更短。字数上限写在原文末尾，照着它来。删掉过程叙述、验证细节、自我复盘、重复和客套；留下结论、必要的操作步骤、必须保留的数字和命令。改完长度没明显变短，就是没做完，请继续压。

硬规则：
1. 不加原文没有的信息，不改变结论。
2. 保留原文的语言：原文中文就写中文。
3. 路径、命令、参数名、错误信息、数字原样照抄，不改写不翻译；路径、命令和文件名用反引号包起来。
4. 形式跟着原文走：原文用表格就还是表格（保留表头，能删的行删掉），用列表、代码块、引用就照样用，不要把表格降级成文字。
5. 不写一级标题，不写「以下是」这类开场白，直接给正文。
6. 代码块只放要照抄的命令，能合并的合并。

写法：
- 第一段一句话说结论：能做还是不能做、怎么做、关键原因。
- 之后最多 5 条，每条一行，不超过 30 字，以动词或名词开头。
- 段落之间空一行，一段只说一件事。
- 关键结论和关键数字可以用 **加粗**，整篇最多 3 处。
- 风险、限制、代价放在最后一条，不要为了顺口软化它。

输出纯 Markdown 正文。`

/** Behaviour every field falls back to. */
const DEFAULTS = {
  /** No model is assumed: until the reader picks one no rewrite is attempted,
   * so a fresh install costs nothing. */
  provider: '',
  model: '',
  temperature: 0.3,
  /** Target length of the readable version, as a share of the original. */
  ratio: 0.35,
  /** When a new answer gets a 速览: 'global' every answer, 'session' the listed
   * Sessions only, 'manual' nothing until the reader asks. Manual is the
   * default so that installing the bundle spends nothing on its own. */
  mode: 'manual',
  /** Sessions that opted into automatic 速览 while `mode` is 'session'. */
  sessions: [],
  /** Answers shorter than this are left alone. */
  minChars: 400,
  /** Answers longer than this are left alone instead of rewritten. */
  maxChars: 40000,
  prompt: DEFAULT_PROMPT,
}

/** Services required before the route can be installed. */
export const inject = ['webServer', 'llm', 'sessions', 'connection']

/**
 * Last text block set of the assistant answer committed in the Turn that closes
 * at `upto`. The search never leaves that Turn: a Turn that answered no text
 * must not borrow the answer of the one before it.
 * @param session - live session owning the Turn.
 * @param upto - the Turn's closing sequence.
 * @returns the answer text, when it was committed and whether the reader
 *   stopped it, or undefined when the Turn answered no text.
 */
function answerAt(session, upto) {
  const nodes = session.surface.nodes
  /** The Turn number, taken from the latest event at or before `upto` that names one. */
  let turn
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const seq = nodes[index]
    if (seq === undefined || seq > upto) continue
    const event = session.eventAt(seq)
    if (event === undefined) continue
    const owner = event.data?.turn
    if (typeof owner === 'number') {
      if (turn === undefined) turn = owner
      else if (owner !== turn) return undefined
    }
    if (event.type === 'turn/start') return undefined
    if (event.type !== 'assistant/message') continue
    const message = session.deriveEventMessage(event)
    const content = message?.content
    if (!Array.isArray(content)) continue
    const text = content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n\n')
      .trim()
    if (text !== '') return { text, time: event.time, interrupted: event.data?.interrupted === true }
  }
  return undefined
}

/** Read one small JSON body. */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const parts = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      parts.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(parts).toString('utf8')))
      } catch {
        reject(new Error('request body is not JSON'))
      }
    })
    req.on('error', reject)
  })
}

/** Answer one HTTP request with a JSON result. */
function reply(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

/**
 * Install the rewrite route for the lifetime of the plugin.
 * @param ctx - Host plugin lifetime.
 * @param config - optional overrides for {@link DEFAULTS}.
 */
export function apply(ctx, config) {
  /** The patch's own overrides. */
  const patch = {}
  for (const [key, value] of Object.entries(config ?? {})) {
    if (value !== undefined) patch[key] = value
  }

  /** Built-in defaults, then the row this Host was loaded with. */
  const settings = () => ({ ...DEFAULTS, ...patch })

  /**
   * Automatic modes only reach answers committed while this bundle ran: opening
   * an old Session must not rewrite its whole history. A save rewrites the
   * profile, which restarts the plugin and starts this clock again.
   */
  const startedAt = Date.now()

  /** Rewrite results, including the decisions not to rewrite. */
  const cache = new Map()
  /** Bumped whenever the cache is emptied, so work started before cannot refill it. */
  let cacheGeneration = 0
  /** Rewrites already running, so a second request joins instead of paying twice. */
  const running = new Map()

  /** Model calls in flight, and the rewrites waiting for a free slot. */
  let active = 0
  const waiting = []

  /** Run one rewrite once a slot is free, so a long Session cannot fire dozens at once. */
  async function limited(signal, task) {
    while (active >= MAX_CONCURRENT_REWRITES) await new Promise((wake) => waiting.push(wake))
    if (signal.aborted) {
      // This waiter was woken for a slot it will not use; pass it on.
      waiting.shift()?.()
      throw new Error('aborted before it started')
    }
    active += 1
    try {
      return await task()
    } finally {
      active -= 1
      waiting.shift()?.()
    }
  }

  const remember = (key, result) => {
    cache.set(key, result)
    if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value)
  }

  /**
   * One model call, collected into plain text.
   * @param instruction - what the model reads as its user message.
   * @param sessionId - routes the call; some providers reject calls without one.
   * @param options - the settings in force for this call.
   * @param signal - aborts with the HTTP request.
   */
  /** Token accounting for one call, trimmed to the fields the block shows. */
  function normalizeUsage(usage) {
    if (usage === undefined || usage === null) return undefined
    const input = usage.inputTokens ?? 0
    const output = usage.outputTokens ?? 0
    const cacheRead = usage.cacheReadTokens ?? 0
    const cacheWrite = usage.cacheWriteTokens ?? 0
    return {
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      totalTokens: typeof usage.totalTokens === 'number' ? usage.totalTokens : input + output + cacheRead + cacheWrite,
    }
  }

  /** A second pass is a second billed call, so the block reports the pair. */
  function mergeUsage(a, b) {
    if (a === undefined) return b
    if (b === undefined) return a
    return {
      inputTokens: a.inputTokens + b.inputTokens,
      outputTokens: a.outputTokens + b.outputTokens,
      cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
      cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
      totalTokens: a.totalTokens + b.totalTokens,
    }
  }

  async function ask(instruction, sessionId, options, signal) {
    const stream = ctx.llm.stream({
      provider: options.provider,
      model: options.model,
      system: options.prompt,
      messages: [{ role: 'user', content: [{ type: 'text', text: instruction }] }],
      temperature: options.temperature,
      sessionId,
      signal,
    })
    let out = ''
    let usage
    let failure
    let finished = false
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') {
        out += chunk.text
        continue
      }
      if (chunk.type === 'usage') {
        usage = chunk.usage
        continue
      }
      if (chunk.type !== 'finish') continue
      finished = true
      const reason = chunk.reason
      // Anything but a clean stop is a failure, whether or not it says why:
      // a cut-off draft must never be shown, or cached, as the rewrite.
      if (reason?.kind !== 'stop') {
        const kind = reason?.kind ?? 'unknown'
        failure = reason?.failure ?? { code: kind, message: `ended with ${kind}` }
      }
      break
    }
    if (failure === undefined && !finished && signal.aborted) failure = { code: 'aborted', message: 'aborted' }
    if (failure !== undefined) throw new Error(`${failure.code}: ${failure.message}`)
    const result = out.trim()
    if (result === '') throw new Error('the rewrite model returned no text')
    return { text: result, usage: normalizeUsage(usage) }
  }

  /**
   * Ask the rewrite model for one readable version.
   * @param text - the committed answer.
   * @param sessionId - routes the call; some providers reject calls without one.
   * @param options - the settings in force for this call.
   * @param signal - aborts with the HTTP request.
   */
  async function rewrite(text, sessionId, options, signal) {
    /** A concrete number works better than "be shorter". */
    const ratio = typeof options.ratio === 'number' && options.ratio > 0 && options.ratio < 1 ? options.ratio : 0.35
    const budget = Math.max(150, Math.round(text.length * ratio))
    const first = await ask(`${text}\n\n---\n原文 ${text.length} 字，速览请控制在 ${budget} 字以内。`, sessionId, options, signal)
    if (first.text.length <= budget * 1.5) return first
    /** The model ignored the budget: say it once more with the draft in hand. */
    let second
    try {
      second = await ask(
        `下面这段已经压过一遍，但还有 ${first.text.length} 字，超过 ${budget} 字的上限。再压一遍：只留结论、必要步骤和风险，关键数字和命令不能丢。\n\n${first.text}`,
        sessionId, options, signal,
      )
    } catch {
      // The first draft is already paid for and usable: a failed tightening
      // pass must not throw it away.
      return first
    }
    const best = second.text.length < first.text.length ? second : first
    return { text: best.text, usage: mergeUsage(first.usage, second.usage) }
  }

  /** Resolve one request, sharing in-flight work and caching settled results. */
  async function resolve(sessionId, seq, force, auto, signal) {
    const key = `${sessionId}:${seq}`
    if (force !== true && cache.has(key)) return cache.get(key)
    const joined = running.get(key)
    // Work everyone has already walked away from is being torn down; start afresh.
    if (joined !== undefined && !joined.controller.signal.aborted) return attend(joined, signal)
    if (auto === true) {
      // Decided per request and never cached: the same Turn may still be asked
      // for by hand, and that request must go through.
      const session = ctx.sessions.get(sessionId)
      const answer = session === undefined ? undefined : answerAt(session, seq)
      // A stopped answer is only a prefix of what the reader meant to say; nobody
      // asked for this Turn by hand, so leave it alone.
      if (answer?.interrupted === true) return { status: 'skip', reason: 'interrupted' }
      if (answer !== undefined && !(typeof answer.time === 'number' && answer.time >= startedAt)) {
        return { status: 'skip', reason: 'history' }
      }
    }
    const generation = cacheGeneration
    const controller = new AbortController()
    const work = (async () => {
      const shared = controller.signal
      try {
        const session = ctx.sessions.get(sessionId)
        if (session === undefined) return { status: 'error', message: 'that Session is not loaded' }
        const answer = answerAt(session, seq)
        if (answer === undefined) return { status: 'skip', reason: 'no-answer' }
        const text = answer.text
        const options = settings()
        if (text.length < options.minChars) return { status: 'skip', reason: 'too-short' }
        if (text.length > options.maxChars) return { status: 'skip', reason: 'too-long' }
        // The reader meets this once, then picks a model from the block itself.
        if (options.provider === '' || options.model === '') return { status: 'error', message: 'no configured model' }
        const outcome = await limited(shared, () => rewrite(text, sessionId, options, shared))
        return { status: 'ok', text: outcome.text, usage: outcome.usage }
      } catch (error) {
        return { status: 'error', message: error instanceof Error ? error.message : String(error) }
      }
    })()
    const entry = { work, controller, users: 0 }
    running.set(key, entry)
    work.then((result) => {
      if (running.get(key) === entry) running.delete(key)
      // A model switch while this ran makes its answer stale before it lands.
      if (result.status !== 'error' && generation === cacheGeneration) remember(key, result)
    })
    return attend(entry, signal)
  }

  /**
   * Wait on shared work for one request. The work is aborted only once every
   * request waiting on it has gone, so a reader who leaves never cancels the
   * rewrite another reader is still waiting for.
   */
  async function attend(entry, signal) {
    if (signal.aborted) return { status: 'error', message: 'aborted' }
    entry.users += 1
    let left = false
    const leave = () => {
      if (left) return
      left = true
      entry.users -= 1
      if (entry.users === 0) entry.controller.abort()
    }
    signal.addEventListener('abort', leave, { once: true })
    try {
      return await entry.work
    } finally {
      signal.removeEventListener('abort', leave)
      if (!left) {
        left = true
        entry.users -= 1
      }
    }
  }

  /**
   * Every provider/model pair the rewrite model may be switched to. A provider
   * that cannot list its models is left out instead of failing the page.
   */
  async function catalog() {
    const providers = []
    for (const provider of ctx.llm.listProviders()) {
      let models
      try {
        models = await ctx.llm.listModels(provider.id)
      } catch {
        continue
      }
      if (!Array.isArray(models) || models.length === 0) continue
      providers.push({
        id: provider.id,
        name: provider.name ?? provider.id,
        models: models.map((model) => ({ id: model.id, name: model.name ?? model.id })),
      })
    }
    return providers
  }

  /**
   * Answer a request the page did not send. These routes read a Session's text
   * and change this profile's settings, so another local program must not reach
   * them; the Host's own check covers Host/Origin and the browser's login.
   * @param req - the request, before any body is read.
   * @param res - the response, answered here when the check refuses.
   * @returns true when the request was answered as unauthenticated.
   */
  function rejected(req, res) {
    const rejection = ctx.connection.requestRejection(req)
    if (rejection === undefined) return false
    res.statusCode = rejection
    res.end()
    return true
  }

  /**
   * Merge the page's change into the profile's config row. The editor owns that
   * file, validates the candidate and refuses a value a higher layer overrides,
   * so a save that cannot happen is reported instead of assumed.
   * @param next - the fields this request sets.
   * @param lists - the Session-list operations, when this request carries any.
   * @returns the config the row holds afterwards.
   */
  async function persist(next, lists) {
    const entry = ctx.fiber?.entry
    const editor = ctx.get('configEditor')
    if (entry === undefined || editor === undefined) throw new Error('this profile cannot save settings')
    let kept
    // The row replaces the whole config, so keep every field the reader already
    // has: sending only the change would silently drop the rest. The list is
    // applied to the row as it is now, so two saves in a row both count.
    await editor.edit(entry, (current) => {
      const before = { ...DEFAULTS, ...patch, ...current }
      let list
      if (lists !== undefined) {
        list = lists.sessions ?? (Array.isArray(before.sessions) ? before.sessions : [])
        if (lists.addSessions !== undefined) list = [...list, ...lists.addSessions]
        if (lists.removeSessions !== undefined) list = list.filter((id) => !lists.removeSessions.includes(id))
        // The newest entries are kept when the list overflows.
        list = [...new Set(list)].slice(-MAX_SESSIONS)
      }
      kept = { ...current, ...next }
      if (list !== undefined) kept.sessions = list
      return kept
    })
    return kept
  }

  /** The page reads the model list and the model in force. */
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: MODELS_PATH,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      if (req.method !== 'GET') {
        reply(res, 405, { status: 'error', message: 'GET only' })
        return
      }
      const options = settings()
      reply(res, 200, {
        status: 'ok',
        provider: options.provider,
        model: options.model,
        providers: await catalog(),
      })
    },
  }), 'interpreter: model route')

  /** The page saves its choice; the next rewrite uses it. */
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: CONFIG_PATH,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      if (req.method === 'GET') {
        const options = settings()
        reply(res, 200, {
          status: 'ok',
          mode: MODES.includes(options.mode) ? options.mode : DEFAULTS.mode,
          sessions: Array.isArray(options.sessions) ? options.sessions.filter((id) => typeof id === 'string') : [],
        })
        return
      }
      if (req.method !== 'POST') {
        reply(res, 405, { status: 'error', message: 'GET or POST only' })
        return
      }
      const type = String(req.headers['content-type'] ?? '')
      if (!type.startsWith('application/json')) {
        reply(res, 415, { status: 'error', message: 'application/json only' })
        return
      }
      let body
      try {
        body = await readJsonBody(req)
      } catch (error) {
        reply(res, 400, { status: 'error', message: error instanceof Error ? error.message : String(error) })
        return
      }
      const provider = body?.provider
      const model = body?.model
      const next = {}
      if (provider !== undefined || model !== undefined) {
        if (typeof provider !== 'string' || typeof model !== 'string' || provider === '' || model === '') {
          reply(res, 400, { status: 'error', message: 'provider and model are required together' })
          return
        }
        const route = (await catalog()).find((entry) => entry.id === provider)
        if (route === undefined || !route.models.some((entry) => entry.id === model)) {
          reply(res, 400, { status: 'error', message: 'that model is not available right now' })
          return
        }
        next.provider = provider
        next.model = model
      }
      if (body?.mode !== undefined) {
        if (!MODES.includes(body.mode)) {
          reply(res, 400, { status: 'error', message: `mode must be one of ${MODES.join(', ')}` })
          return
        }
        next.mode = body.mode
      }
      /** Each block holds its own copy of the list, so it sends changes, never the whole list. */
      const sessionLists = {}
      for (const field of ['sessions', 'addSessions', 'removeSessions']) {
        const list = body?.[field]
        if (list === undefined) continue
        if (!Array.isArray(list) || list.some((id) => typeof id !== 'string')) {
          reply(res, 400, { status: 'error', message: `${field} must be a list of Session ids` })
          return
        }
        sessionLists[field] = list
      }
      if (Object.keys(next).length === 0 && Object.keys(sessionLists).length === 0) {
        reply(res, 400, { status: 'error', message: 'nothing to save' })
        return
      }
      // The editor re-reads the row for every save, so a Session list is applied
      // to the config as it is now, not to the copy this run started with.
      let after
      try {
        after = await persist(next, Object.keys(sessionLists).length > 0 ? sessionLists : undefined)
      } catch (error) {
        reply(res, 500, { status: 'error', message: error instanceof Error ? error.message : String(error) })
        return
      }
      reply(res, 200, {
        status: 'ok',
        ...next,
        // The row's own value answers when this request did not set the mode.
        mode: MODES.includes(after.mode) ? after.mode : DEFAULTS.mode,
        sessions: Array.isArray(after.sessions) ? after.sessions : [],
      })
    },
  }), 'interpreter: config route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      if (req.method !== 'POST') {
        reply(res, 405, { status: 'error', message: 'POST only' })
        return
      }
      // A JSON content type keeps cross-origin pages out: a browser must
      // preflight it, and this route answers no preflight.
      const type = String(req.headers['content-type'] ?? '')
      if (!type.startsWith('application/json')) {
        reply(res, 415, { status: 'error', message: 'application/json only' })
        return
      }
      const lifetime = new AbortController()
      res.on('close', () => lifetime.abort())
      let body
      try {
        body = await readJsonBody(req)
      } catch (error) {
        reply(res, 400, { status: 'error', message: error instanceof Error ? error.message : String(error) })
        return
      }
      const sessionId = body?.sessionId
      const seq = body?.seq
      if (typeof sessionId !== 'string' || !Number.isSafeInteger(seq)) {
        reply(res, 400, { status: 'error', message: 'sessionId and seq are required' })
        return
      }
      const result = await resolve(sessionId, seq, body?.force, body?.auto, lifetime.signal)
      if (!res.writableEnded) reply(res, 200, result)
    },
  }), 'interpreter: rewrite route')
}
