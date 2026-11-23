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

/** Local route that says whether a Turn is worth an entry, without a rewrite. */
const PROBE_PATH = '/interpreter/probe'

/** Local routes the page uses to read and change the rewrite model. */
const MODELS_PATH = '/interpreter/models'
const CONFIG_PATH = '/interpreter/config'

/** The three ways a new answer can get a 速览. */
const MODES = ['global', 'session', 'manual']

/** The length tiers the block offers: the row's own size, or a longer one. */
const LENGTH_TIERS = ['normal', 'detailed']

/** The languages a 速览 can be written in: the answer's own, or one fixed. */
const LANGUAGES = ['auto', 'zh', 'en']

/** Largest request body accepted from the page, in bytes. A prompt save is the
 * biggest one by far: it carries the whole instruction the model reads. */
const MAX_BODY_BYTES = 65536

/** Longest rewrite instruction the settings page accepts, in characters. */
const MAX_PROMPT_CHARS = 8000

/** Cached rewrites kept in memory; the oldest entry is dropped past this. */
const MAX_CACHE_ENTRIES = 500

/** Sessions remembered in the 本会话 allow-list. */
const MAX_SESSIONS = 200

/** Rewrites allowed to talk to a model at once; the rest wait their turn. */
const MAX_CONCURRENT_REWRITES = 2

/**
 * Smallest target length ever asked for, in characters. A short answer's share
 * would otherwise come out below what a usable 速览 needs.
 */
const MIN_BUDGET = 150

/**
 * The length tiers the block can switch between without a restart. 详细 replaces
 * the configured `ratio`/`capChars` with its own; 普通 keeps them, so a reader
 * who never touches the switch sees exactly what the row says.
 */
const LENGTHS = {
  detailed: { ratio: 0.5, capChars: 1600 },
}

/**
 * Fields a rewrite reads that its cache key does not already name. Changing one means
 * work cached or started with the old value no longer answers a request made after the
 * save, so the revision every cache key carries is bumped for them. The tier, language
 * and model are in the key itself, so switching back to one still hits its own answer.
 */
const REWRITE_FIELDS = ['temperature', 'ratio', 'capChars', 'minChars', 'maxChars', 'prompt']

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
  /** Ceiling on that target, in characters: a share of a long answer would
   * otherwise still buy a long summary. */
  capChars: 900,
  /** 普通 / 详细, switched in the block. 普通 (the default) uses the configured
   * ratio and ceiling; 详细 overrides them for a reader who wants more. */
  length: 'normal',
  /** 跟随回答 / 固定中文 / 固定英文. 'auto' keeps prompt rule 2 (the answer's own
   * language); a fixed one is said in the user Turn, after that rule. */
  language: 'auto',
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
  /** Tokens automatic 速览 may spend per local day; 0 means no ceiling. A manual
   * click still goes through, so the guard stops a runaway mode, not the reader. */
  dailyTokenCap: 0,
}

/** Services required before the route can be installed. */
export const inject = ['webServer', 'llm', 'sessions', 'connection']

/**
 * The schema library ships with DSH and is resolved from its installation.
 * Where it cannot be found the plugin declares no Config: every field is then a
 * plain value and a save restarts the plugin, which is slower but still right.
 */
const z = await import('@deepseek-ai/schemastery').then((module) => module.default ?? module, () => undefined)

/**
 * The row's config. Every field the block or the settings page saves is declared
 * live with `.volatile()`, so a save updates it in place instead of restarting
 * the plugin: rewrites in flight keep running, the cache survives, and no
 * request meets the gap between two instances. They are read on every use; see
 * {@link read}. A field a reader writes by hand in the row still works the same.
 */
export const Config = z === undefined ? undefined : z.object({
  provider: z.string().volatile(),
  model: z.string().volatile(),
  mode: z.string().volatile(),
  sessions: z.array(z.string()).volatile(),
  /** Picked in the block; live so switching it costs no restart and no cache. */
  length: z.string().volatile(),
  /** Same, for the language the 速览 is written in. */
  language: z.string().volatile(),
  /** When automation was last switched on or widened, in epoch milliseconds. */
  autoSince: z.number().volatile(),
  temperature: z.number().volatile(),
  ratio: z.number().volatile(),
  capChars: z.number().volatile(),
  minChars: z.number().volatile(),
  maxChars: z.number().volatile(),
  prompt: z.string().volatile(),
  /** The ceiling on automatic rewrites; live so raising it takes effect now. */
  dailyTokenCap: z.number().volatile(),
})

/** The marker DSH's live config references carry (shared across library copies). */
const VOLATILE = Symbol.for('cosmokit.volatile.write')

/**
 * The current value of one config field, whether DSH handed over a live
 * reference or, without a Config schema, a plain value.
 * @param value - one field of the row's config.
 */
function read(value) {
  return isLive(value) ? value.get() : value
}

/** Whether one config field is a live reference handed over by DSH. */
function isLive(value) {
  return value !== null && typeof value === 'object' && VOLATILE in value
}

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
  /**
   * Built-in defaults, then the row's config as it is right now. Live fields
   * change under a running plugin, so this is read per use, never kept.
   */
  const settings = () => {
    const out = { ...DEFAULTS }
    for (const [key, value] of Object.entries(config ?? {})) {
      const current = read(value)
      if (current !== undefined) out[key] = current
    }
    return out
  }

  /**
   * Whether saves update this plugin in place. True only when the Config
   * schema loaded and DSH handed the saved fields over as live references;
   * false means every save restarts the plugin. Reported to the page so the
   * difference can be checked in a running Host.
   */
  const live = isLive(config?.provider)

  /**
   * The rows the settings page edits, as the page receives them: always the
   * effective value, never a live reference, and a number the row does not hold
   * stands in with its default so the form never shows a hole.
   * @param options - the settings in force.
   */
  function formOf(options) {
    const number = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
    return {
      temperature: number(options.temperature, DEFAULTS.temperature),
      ratio: number(options.ratio, DEFAULTS.ratio),
      capChars: number(options.capChars, DEFAULTS.capChars),
      minChars: number(options.minChars, DEFAULTS.minChars),
      maxChars: number(options.maxChars, DEFAULTS.maxChars),
      prompt: typeof options.prompt === 'string' && options.prompt.trim() !== '' ? options.prompt : DEFAULTS.prompt,
      dailyTokenCap: number(options.dailyTokenCap, DEFAULTS.dailyTokenCap),
    }
  }

  /** Bumped by a save that changes a rewrite's input, so the cache key moves on
   * and an in-flight rewrite is not joined by a request made with other numbers. */
  let revision = 0

  /** Answers committed before this moment were not written while the bundle ran. */
  const startedAt = Date.now()

  /**
   * Automatic modes only reach answers committed after they were switched on,
   * and after this plugin started: opening an old Session must not rewrite its
   * whole history. A live save does not restart the plugin, so the switch is
   * remembered in `autoSince` rather than in the start time.
   */
  const autoSince = () => {
    const since = settings().autoSince
    return Math.max(startedAt, typeof since === 'number' ? since : 0)
  }

  /** The reader's local date, the key today's spend resets on: a day boundary
   * should follow their calendar rather than UTC. */
  function today() {
    const now = new Date()
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
  }

  /**
   * Tokens this instance's own rewrites have spent today. In memory only: a
   * restart starts the day over, so the guard is a runaway brake, not a bill.
   */
  const spend = { day: today(), tokens: 0 }

  /** Today's spend, reset once the local date has turned over. */
  function spentToday() {
    const day = today()
    if (spend.day !== day) {
      spend.day = day
      spend.tokens = 0
    }
    return spend.tokens
  }

  /** Add what one rewrite cost, both passes included, to today's total. */
  function recordSpend(usage) {
    spentToday()
    const total = typeof usage?.totalTokens === 'number' ? usage.totalTokens : 0
    if (total > 0) spend.tokens += total
  }

  /** The daily ceiling in force, in tokens; 0 means no ceiling. */
  function dailyCap(options) {
    const cap = options.dailyTokenCap
    return typeof cap === 'number' && cap > 0 ? Math.round(cap) : 0
  }

  /** Rewrite results, including the decisions not to rewrite. */
  const cache = new Map()
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
   * The length one rewrite is asked to fit in: its share of the answer, held
   * above a floor and below the ceiling, so neither a tiny answer nor a huge
   * one decides how long a 速览 may be.
   * @param length - the answer's length, in characters.
   * @param options - the settings in force for this call.
   */
  function budgetOf(length, options) {
    /** 详细 replaces the row's numbers; 普通 keeps them. */
    const tier = LENGTHS[options.length]
    const wantedRatio = tier?.ratio ?? options.ratio
    const wantedCap = tier?.capChars ?? options.capChars
    const ratio = typeof wantedRatio === 'number' && wantedRatio > 0 && wantedRatio < 1 ? wantedRatio : DEFAULTS.ratio
    const cap = typeof wantedCap === 'number' && wantedCap > 0 ? wantedCap : DEFAULTS.capChars
    /** A concrete number works better than "be shorter". */
    const share = Math.round(length * ratio)
    return Math.min(Math.max(MIN_BUDGET, share), Math.max(MIN_BUDGET, Math.round(cap)))
  }

  /**
   * The sentence that fixes the language, or nothing when the 速览 follows the
   * answer. Said in the user Turn, so it stands after the prompt's own rule 2.
   * @param options - the settings in force for this call.
   */
  function languageRule(options) {
    if (options.language === 'zh') return ' 速览一律用中文写，即使原文是其他语言。'
    if (options.language === 'en') return ' 速览一律用英文写，即使原文是其他语言。'
    return ''
  }

  /**
   * Ask the rewrite model for one readable version.
   * @param text - the committed answer.
   * @param sessionId - routes the call; some providers reject calls without one.
   * @param options - the settings in force for this call.
   * @param signal - aborts with the HTTP request.
   */
  async function rewrite(text, sessionId, options, signal) {
    const budget = budgetOf(text.length, options)
    const language = languageRule(options)
    const first = await ask(`${text}\n\n---\n原文 ${text.length} 字，速览请控制在 ${budget} 字以内。${language}`, sessionId, options, signal)
    if (first.text.length <= budget * 1.5) return first
    /** The model ignored the budget: say it once more with the draft in hand. */
    let second
    try {
      second = await ask(
        `下面这段已经压过一遍，但还有 ${first.text.length} 字，超过 ${budget} 字的上限。再压一遍：只留结论、必要步骤和风险，关键数字和命令不能丢。${language}\n\n${first.text}`,
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

  /**
   * Why an answer is not worth a 速览, if it is not: too short to be worth
   * compacting, or too long to pay for. Both the rewrite and the entry probe
   * answer from this one rule, so the entry never offers a click that would
   * only come back empty.
   * @param text - the answer's text.
   * @param options - the settings in force.
   * @returns the skip reason, or undefined when the answer would be rewritten.
   */
  function unfitBecause(text, options) {
    if (text.length < options.minChars) return 'too-short'
    if (text.length > options.maxChars) return 'too-long'
    return undefined
  }

  /** Resolve one request, sharing in-flight work and caching settled results. */
  async function resolve(sessionId, seq, force, auto, signal) {
    /** The settings this request runs with, taken once so the key and the call agree. */
    const options = settings()
    // The model, the length tier and the language are part of the key: after a
    // live switch, work done with the old ones is neither served nor joined. The
    // revision covers the settings page's own rows the same way.
    const key = `${options.provider}/${options.model}/${options.length}/${options.language}@${revision}:${sessionId}:${seq}`
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
      if (answer !== undefined && !(typeof answer.time === 'number' && answer.time >= autoSince())) {
        return { status: 'skip', reason: 'history' }
      }
      // The fee guard: automatic rewriting stops once today's own spend reaches
      // the ceiling. Checked before any work is scheduled, and never cached, so
      // a hand-clicked Turn still goes through and tomorrow starts afresh.
      const cap = dailyCap(options)
      if (cap > 0 && spentToday() >= cap) {
        return { status: 'skip', reason: 'budget', used: Math.round(spentToday()), cap }
      }
    }
    const controller = new AbortController()
    const work = (async () => {
      const shared = controller.signal
      try {
        const session = ctx.sessions.get(sessionId)
        if (session === undefined) return { status: 'error', message: 'that Session is not loaded' }
        const answer = answerAt(session, seq)
        if (answer === undefined) return { status: 'skip', reason: 'no-answer' }
        const text = answer.text
        const unfit = unfitBecause(text, options)
        if (unfit !== undefined) return { status: 'skip', reason: unfit }
        // The reader meets this once, then picks a model from the block itself.
        if (options.provider === '' || options.model === '') return { status: 'error', message: 'no configured model' }
        const outcome = await limited(shared, () => rewrite(text, sessionId, options, shared))
        recordSpend(outcome.usage)
        return { status: 'ok', text: outcome.text, usage: outcome.usage }
      } catch (error) {
        return { status: 'error', message: error instanceof Error ? error.message : String(error) }
      }
    })()
    const entry = { work, controller, users: 0 }
    running.set(key, entry)
    work.then((result) => {
      if (running.get(key) === entry) running.delete(key)
      // A save restarts the plugin, so a model switch never meets this cache:
      // the new instance starts empty and this one is gone with its results.
      if (result.status !== 'error') remember(key, result)
    })
    return attend(entry, signal)
  }

  /**
   * Whether a Turn is worth an entry at all, answered without spending a
   * rewrite. The entry only exists where a click has something to do, so a
   * short answer or a Turn that answered no text never grows one.
   * @param sessionId - the Session the Turn belongs to.
   * @param seq - the Turn's closing sequence.
   */
  function entryOf(sessionId, seq) {
    const session = ctx.sessions.get(sessionId)
    if (session === undefined) return { status: 'skip', reason: 'no-answer' }
    const answer = answerAt(session, seq)
    if (answer === undefined) return { status: 'skip', reason: 'no-answer' }
    const unfit = unfitBecause(answer.text, settings())
    if (unfit !== undefined) return { status: 'skip', reason: unfit }
    return { status: 'ok' }
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
      const before = { ...DEFAULTS, ...current }
      const had = Array.isArray(before.sessions) ? before.sessions : []
      let list
      if (lists !== undefined) {
        list = lists.sessions ?? had
        if (lists.addSessions !== undefined) list = [...list, ...lists.addSessions]
        if (lists.removeSessions !== undefined) list = list.filter((id) => !lists.removeSessions.includes(id))
        // The newest entries are kept when the list overflows.
        list = [...new Set(list)].slice(-MAX_SESSIONS)
      }
      kept = { ...current, ...next }
      if (list !== undefined) kept.sessions = list
      // Turning automation on, or widening it to another Session, starts its
      // clock now: only answers committed from here on are rewritten unasked.
      // Decided against the row as it is now, so back-to-back saves agree.
      if (next.mode !== undefined || list !== undefined) {
        const wasMode = MODES.includes(before.mode) ? before.mode : DEFAULTS.mode
        const nowMode = MODES.includes(kept.mode) ? kept.mode : DEFAULTS.mode
        const widened = list !== undefined && list.some((id) => !had.includes(id))
        if (nowMode !== 'manual' && (nowMode !== wasMode || widened)) kept.autoSince = Date.now()
      }
      return kept
    })
    // A save that changes what a rewrite reads makes the results it already
    // produced stale, whether they are cached or still running.
    if (Object.keys(next).some((field) => REWRITE_FIELDS.includes(field))) revision += 1
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
          length: LENGTH_TIERS.includes(options.length) ? options.length : DEFAULTS.length,
          language: LANGUAGES.includes(options.language) ? options.language : DEFAULTS.language,
          live,
          /** What the guard has to work with: spent today, and the ceiling. */
          tokensToday: Math.round(spentToday()),
          tokenCap: dailyCap(options),
          /** Built-in prompt so the settings dialog can offer one-click restore. */
          defaultPrompt: DEFAULT_PROMPT,
          /** The rows the settings page edits. */
          settings: formOf(options),
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
      if (body?.length !== undefined) {
        if (!LENGTH_TIERS.includes(body.length)) {
          reply(res, 400, { status: 'error', message: `length must be one of ${LENGTH_TIERS.join(', ')}` })
          return
        }
        next.length = body.length
      }
      if (body?.language !== undefined) {
        if (!LANGUAGES.includes(body.language)) {
          reply(res, 400, { status: 'error', message: `language must be one of ${LANGUAGES.join(', ')}` })
          return
        }
        next.language = body.language
      }
      /** Each settings-page field, and what the Host accepts for it. */
      const fields = {
        temperature: (value) => typeof value === 'number' && value >= 0 && value <= 2,
        ratio: (value) => typeof value === 'number' && value > 0 && value < 1,
        capChars: (value) => Number.isSafeInteger(value) && value >= MIN_BUDGET,
        minChars: (value) => Number.isSafeInteger(value) && value >= 0,
        maxChars: (value) => Number.isSafeInteger(value) && value >= 0,
        dailyTokenCap: (value) => Number.isSafeInteger(value) && value >= 0,
      }
      for (const [field, accepts] of Object.entries(fields)) {
        const value = body?.[field]
        if (value === undefined) continue
        if (!accepts(value)) {
          reply(res, 400, { status: 'error', message: `${field} is out of range` })
          return
        }
        next[field] = value
      }
      if (body?.prompt !== undefined) {
        const prompt = body.prompt
        if (typeof prompt !== 'string' || prompt.trim() === '' || prompt.length > MAX_PROMPT_CHARS) {
          reply(res, 400, { status: 'error', message: `prompt must be text of 1 to ${MAX_PROMPT_CHARS} characters` })
          return
        }
        next.prompt = prompt
      }
      // Compared with the row as it will read afterwards, so saving only one of
      // the two bounds still catches a pair that leaves no answer eligible.
      const merged = { ...formOf(settings()), ...next }
      if (merged.minChars > merged.maxChars) {
        reply(res, 400, { status: 'error', message: 'the shortest answer cannot be longer than the longest' })
        return
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
        length: LENGTH_TIERS.includes(after.length) ? after.length : DEFAULTS.length,
        language: LANGUAGES.includes(after.language) ? after.language : DEFAULTS.language,
        settings: formOf({ ...DEFAULTS, ...after }),
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

  /**
   * The page asks, per Turn, whether to offer the entry at all. Deliberately
   * cheap: no model call and no cache, just the log read the rewrite would have
   * done anyway, so a Session full of Turns costs nothing.
   */
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: PROBE_PATH,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      if (req.method !== 'POST') {
        reply(res, 405, { status: 'error', message: 'POST only' })
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
      const sessionId = body?.sessionId
      const seq = body?.seq
      if (typeof sessionId !== 'string' || !Number.isSafeInteger(seq)) {
        reply(res, 400, { status: 'error', message: 'sessionId and seq are required' })
        return
      }
      reply(res, 200, entryOf(sessionId, seq))
    },
  }), 'interpreter: probe route')
}
