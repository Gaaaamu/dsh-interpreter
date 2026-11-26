/**
 * The Host routes against a stand-in DSH context: a scripted Session log, a
 * scripted model stream, and requests driven through the registered handlers.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { apply, inject } from '../index.js'

const LONG = 'x'.repeat(600)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** The fields index.js declares `.volatile()` in its Config. */
const LIVE_FIELDS = [
  'provider', 'model', 'mode', 'sessions', 'length', 'language', 'variant', 'autoSince',
  'temperature', 'ratio', 'capChars', 'minChars', 'maxChars', 'prompt', 'dailyTokenCap',
]

/** The marker and writer of DSH's live config references (cosmokit's shared protocol). */
const WRITE = Symbol.for('cosmokit.volatile.write')

/** A live reference shaped like the ones DSH hands a plugin. */
function liveRef(value) {
  let current = value
  return { get: () => current, [WRITE]: (next) => { current = next } }
}

/**
 * One Host against stand-in DSH services. A save rewrites the plugin's config
 * row and restarts it, exactly as the Host does, so the next request meets the
 * config the save left behind.
 * @param model - `async function* (request, call)`: what the model streams back.
 * @param options - `live`: hand the plugin live references, as DSH does when its
 *   Config loads.
 */
async function host(model, options = {}) {
  const log = { events: {}, nodes: [] }
  const session = {
    surface: { get nodes() { return log.nodes } },
    eventAt: (seq) => log.events[seq],
    deriveEventMessage: (event) => ({ content: [{ type: 'text', text: event.text }] }),
  }
  const routes = {}
  const state = { calls: 0, active: 0, peak: 0, saves: 0, restarts: 0, models: [] }
  const row = { options: { config: { provider: 'p', model: 'm', ...options.config } } }

  /** Stand-in services every plugin instance shares. */
  const services = {
    connection: {},
    fiber: { entry: row },
    get: (name) => (name === 'configEditor' ? editor : undefined),
    webServer: {
      /** Like the Host's registry: the returned disposer takes the route away again. */
      register: (route) => {
        routes[route.path] = route
        return () => { if (routes[route.path] === route) delete routes[route.path] }
      },
    },
    sessions: { get: () => session },
    llm: {
      listProviders: () => [{ id: 'p' }],
      listModels: async () => [{ id: 'm' }, { id: 'm2' }],
      async *stream(request) {
        state.calls += 1
        state.models.push(request.model)
        state.active += 1
        state.peak = Math.max(state.peak, state.active)
        try {
          yield* model(request, state.calls)
        } finally {
          state.active -= 1
        }
      },
    },
  }

  /**
   * One plugin instance: its own effects, disposed together on restart. With
   * `options.live`, the fields the plugin declares `.volatile()` reach it as
   * references, as DSH hands them over; otherwise as plain values.
   */
  const start = (config) => {
    const disposers = []
    const ctx = {
      ...services,
      effect: (install) => {
        const dispose = install()
        if (typeof dispose === 'function') disposers.push(dispose)
      },
    }
    const refs = {}
    const parsed = { ...config }
    if (options.live) {
      for (const key of LIVE_FIELDS) {
        refs[key] = liveRef(config[key])
        parsed[key] = refs[key]
      }
    }
    apply(ctx, parsed)
    return { refs, dispose: () => { for (const dispose of disposers.splice(0)) dispose() } }
  }

  /**
   * Like the Host's config editor: saves run one at a time and each re-reads the
   * row as it is now and replaces its config wholesale. A save that changes only
   * live fields updates them in place; any other change reloads the plugin, and
   * the old instance's routes are gone for a moment before the new ones exist.
   */
  let queue = Promise.resolve()
  const editor = {
    edit(entry, change) {
      const run = queue.then(async () => {
        await sleep(3)
        const before = entry.options.config ?? {}
        const next = change(structuredClone(before), {})
        entry.options.config = next
        state.saves += 1
        const changed = Object.keys({ ...before, ...next })
          .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(next[key]))
        if (options.live && changed.every((key) => LIVE_FIELDS.includes(key))) {
          for (const key of changed) instance.refs[key][WRITE](next[key])
          return
        }
        state.restarts += 1
        instance.dispose()
        await sleep(2)
        instance = start(next)
      })
      queue = run.catch(() => {})
      return run
    },
  }

  let instance = start(row.options.config)

  /** Replace the Session log; events are numbered from 1. */
  const setLog = (events) => {
    log.events = {}
    events.forEach((event, at) => { log.events[at + 1] = { seq: at + 1, ...event } })
    log.nodes = events.map((_, at) => at + 1)
  }

  /** Send one request; `res` can be closed to play a reader leaving. */
  const send = (path, body, method = 'POST') => {
    const req = new EventEmitter()
    req.method = method
    req.headers = { 'content-type': 'application/json' }
    const res = new EventEmitter()
    res.writableEnded = false
    res.statusCode = 200
    res.writeHead = () => {}
    const done = new Promise((resolve) => {
      res.end = (text) => {
        res.writableEnded = true
        resolve(typeof text === 'string' ? JSON.parse(text) : { status: res.statusCode })
      }
    })
    const route = routes[path]
    // Between one instance and the next nothing answers, as on the real server.
    if (route === undefined) {
      res.statusCode = 404
      res.end()
      return { done, res }
    }
    route.handler(req, res)
    setImmediate(() => { req.emit('data', Buffer.from(JSON.stringify(body ?? {}))); req.emit('end') })
    return { done, res }
  }
  const rewrite = (body) => send('/interpreter/rewrite', body)
  const config = (body) => send('/interpreter/config', body)
  const probe = (body) => send('/interpreter/probe', body)
  return { state, routes, row, setLog, send, rewrite, config, probe, cleanup: async () => {} }
}

/** A model that answers `text`, optionally after `delay` ms, honouring aborts. */
const answers = (text, delay = 0) => async function* (request, call) {
  if (delay > 0) {
    await new Promise((resolve) => { request.signal.addEventListener('abort', resolve); setTimeout(resolve, delay) })
    if (request.signal.aborted) {
      yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'aborted' } } }
      return
    }
  }
  yield { type: 'text-delta', text: typeof text === 'function' ? text(call) : text }
  yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

const answer = (time = Date.now() + 1000) => ({ type: 'assistant/message', data: { turn: 1 }, text: LONG, time })

test('the plugin asks for the connection that admits its routes', () => {
  assert.ok(inject.includes('connection'))
  assert.ok(!inject.includes('profileContext'))
})

test('every route asks the Host for the browser login', async () => {
  const h = await host(answers('ok'))
  for (const path of ['/interpreter/models', '/interpreter/config', '/interpreter/rewrite', '/interpreter/probe']) {
    assert.equal(h.routes[path]?.kind, 'exact', path)
    assert.equal(h.routes[path]?.auth, 'required', path)
  }
})

test('an answer the reader stopped is not rewritten unasked', async () => {
  const h = await host(answers('ok'))
  h.setLog([{ ...answer(), data: { turn: 1, interrupted: true } }])
  assert.deepEqual(await h.rewrite({ sessionId: 's', seq: 1, auto: true }).done, {
    status: 'skip',
    reason: 'interrupted',
  })
  assert.equal(h.state.calls, 0)
  assert.equal((await h.rewrite({ sessionId: 's', seq: 1 }).done).status, 'ok')
  await h.cleanup()
})

test('a Turn without answer text does not borrow the one before it', async () => {
  const h = await host(answers('ok'))
  const t = Date.now() + 1000
  h.setLog([
    { type: 'turn/start', data: { turn: 1 }, time: t },
    { type: 'assistant/message', data: { turn: 1 }, text: LONG, time: t },
    { type: 'turn/end', data: { turn: 1 }, time: t },
    { type: 'turn/start', data: { turn: 2 }, time: t },
    { type: 'tool/call', data: { turn: 2 }, time: t },
    { type: 'turn/end', data: { turn: 2 }, time: t },
  ])
  assert.deepEqual(await h.rewrite({ sessionId: 's', seq: 6 }).done, { status: 'skip', reason: 'no-answer' })
  assert.equal((await h.rewrite({ sessionId: 's', seq: 3 }).done).status, 'ok')
  assert.equal(h.state.calls, 1)
  await h.cleanup()
})

test('automatic requests skip answers older than the switch, asked ones do not', async () => {
  const h = await host(answers('ok'))
  h.setLog([answer(Date.now() - 3600e3)])
  assert.deepEqual(await h.rewrite({ sessionId: 'a', seq: 1, auto: true }).done, { status: 'skip', reason: 'history' })
  assert.equal(h.state.calls, 0)
  assert.equal((await h.rewrite({ sessionId: 'a', seq: 1, auto: false }).done).status, 'ok')

  h.setLog([answer(Date.now())])
  await sleep(5)
  await h.config({ mode: 'global' }).done
  assert.equal((await h.rewrite({ sessionId: 'b', seq: 1, auto: true }).done).reason, 'history')
  h.setLog([answer(Date.now() + 1000)])
  assert.equal((await h.rewrite({ sessionId: 'c', seq: 1, auto: true }).done).status, 'ok')
  await h.cleanup()
})

test('at most two rewrites talk to a model at once', async () => {
  const h = await host(answers('ok', 20))
  h.setLog([answer()])
  await Promise.all([...Array(6)].map((_, at) => h.rewrite({ sessionId: `s${at}`, seq: 1 }).done))
  assert.equal(h.state.calls, 6)
  assert.equal(h.state.peak, 2)
  await h.cleanup()
})

test('a reader leaving does not cancel a rewrite another reader waits for', async () => {
  const h = await host(answers('ok', 100))
  h.setLog([answer()])
  const first = h.rewrite({ sessionId: 's', seq: 1 })
  const second = h.rewrite({ sessionId: 's', seq: 1 })
  setTimeout(() => first.res.emit('close'), 20)
  assert.deepEqual((await second.done).status, 'ok')
  assert.equal(h.state.calls, 1)
  await h.cleanup()
})

test('work everyone left is replaced, not joined', async () => {
  const h = await host(answers((call) => `draft ${call}`, 60))
  h.setLog([answer()])
  const gone = h.rewrite({ sessionId: 's', seq: 1 })
  setTimeout(() => gone.res.emit('close'), 10)
  await sleep(30)
  assert.equal((await h.rewrite({ sessionId: 's', seq: 1 }).done).text, 'draft 2')
  await h.cleanup()
})

test('the target length is a share of the answer, never above the ceiling', async () => {
  const prompts = []
  const echo = async function* (request) {
    prompts.push(request.messages[0].content[0].text)
    yield { type: 'text-delta', text: '短' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  // 600 字的回答按 0.35 换算出 210 字，够不到上限。
  const share = await host(echo)
  share.setLog([answer()])
  await share.rewrite({ sessionId: 's', seq: 1 }).done
  assert.match(prompts[0], /原文 600 字，速览请控制在 210 字以内/)
  await share.cleanup()

  // 上限比那个换算值小的时候，按上限说，不按比例。
  prompts.length = 0
  const capped = await host(echo, { config: { capChars: 200 } })
  capped.setLog([answer()])
  await capped.rewrite({ sessionId: 's', seq: 1 }).done
  assert.match(prompts[0], /控制在 200 字以内/)
  await capped.cleanup()

  // 短回答按比例会算出小于 150 字的数字，预算有下限。
  prompts.length = 0
  const floor = await host(echo)
  floor.setLog([{ ...answer(), text: 'x'.repeat(400) }])
  await floor.rewrite({ sessionId: 's', seq: 1 }).done
  assert.match(prompts[0], /控制在 150 字以内/)
  await floor.cleanup()
})

test('a question written into the answer as raw markup reaches the model in words', async () => {
  const prompts = []
  const echo = async function* (request) {
    prompts.push(request.messages[0].content[0].text)
    yield { type: 'text-delta', text: '短' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const asked = JSON.stringify({
    questions: [{
      id: 'next',
      header: '下一步',
      question: '要我顺手修掉吗？',
      options: [{ label: '修掉两处（推荐）', description: '一次提交解决。' }, { label: '都不修' }],
    }],
  })
  const h = await host(echo)
  h.setLog([{ ...answer(), text: `${LONG}\n\n<ask_user_question type="text">\n${asked}\n</ask_user_question>` }])
  await h.rewrite({ sessionId: 's', seq: 1 }).done
  const words = '原文末尾向读者提问：要我顺手修掉吗？\n- 修掉两处（推荐）：一次提交解决。\n- 都不修'
  assert.ok(prompts[0].startsWith(`${LONG}\n\n${words}\n\n---\n`))
  assert.doesNotMatch(prompts[0], /ask_user_question|"questions"/)
  // The length the budget is taken from is the answer as the model reads it.
  assert.match(prompts[0], new RegExp(`原文 ${LONG.length + 2 + words.length} 字`))

  // Markup that is not the tool's JSON loses only its tags.
  prompts.length = 0
  h.setLog([{ ...answer(), text: `${LONG}\n\n<ask_user_question>继续吗？</ask_user_question>` }])
  await h.rewrite({ sessionId: 's2', seq: 1 }).done
  assert.ok(prompts[0].startsWith(`${LONG}\n\n继续吗？\n\n---\n`))
  await h.cleanup()
})

test('a failed second pass keeps the first draft', async () => {
  const prompts = []
  const h = await host(async function* (request, call) {
    prompts.push(request.messages[0].content[0].text)
    if (call === 2) {
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'RATE', message: 'limited' } } }
      return
    }
    yield { type: 'text-delta', text: 'y'.repeat(1000) }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })
  h.setLog([answer()])
  const result = await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.equal(result.status, 'ok')
  assert.equal(result.text.length, 1000)
  // 第二遍拿到的预算和第一遍一样。
  assert.match(prompts[1], /但还有 1000 字，超过 210 字的上限/)
  await h.cleanup()
})

test('a stream that ends any way but stop is a failure', async () => {
  const h = await host(async function* () {
    yield { type: 'text-delta', text: 'PARTIAL' }
    yield { type: 'finish', reason: { kind: 'aborted' } }
  })
  h.setLog([answer()])
  assert.equal((await h.rewrite({ sessionId: 's', seq: 1 }).done).status, 'error')
  await h.cleanup()
})

test('without a Config schema a save restarts the plugin: empty cache, new model', async () => {
  const h = await host(answers((call) => `draft ${call}`))
  h.setLog([answer()])
  assert.equal((await h.rewrite({ sessionId: 's', seq: 1 }).done).text, 'draft 1')
  assert.equal((await h.rewrite({ sessionId: 's', seq: 1 }).done).text, 'draft 1')
  assert.equal(h.state.calls, 1)
  const saved = await h.config({ provider: 'p', model: 'm2' }).done
  assert.equal(saved.status, 'ok')
  // The save answers only after the reload, so the next request meets the new instance.
  assert.equal((await h.rewrite({ sessionId: 's', seq: 1 }).done).text, 'draft 2')
  assert.deepEqual(h.state.models, ['m', 'm2'])
  await h.cleanup()
})

test('the config row keeps the fields a save did not touch', async () => {
  const h = await host(answers('ok'))
  await h.config({ mode: 'global' }).done
  await h.config({ provider: 'p', model: 'm2' }).done
  const gate = await h.send('/interpreter/config', undefined, 'GET').done
  assert.equal(gate.mode, 'global')
  await h.cleanup()
})

test('the allow-list merges concurrent changes and supports removal', async () => {
  const h = await host(answers('ok'))
  const [, last] = await Promise.all([
    h.config({ mode: 'session', addSessions: ['A'] }).done,
    h.config({ mode: 'session', addSessions: ['B'] }).done,
  ])
  assert.deepEqual(last.sessions, ['A', 'B'])
  const removed = await h.config({ removeSessions: ['A'] }).done
  assert.deepEqual(removed.sessions, ['B'])
  assert.equal(removed.mode, 'session')
  assert.equal(h.state.saves, 3)
  await h.cleanup()
})

test('bad config bodies are refused', async () => {
  const h = await host(answers('ok'))
  assert.equal((await h.config({ mode: 'sometimes' }).done).status, 'error')
  assert.equal((await h.config({ addSessions: [1] }).done).status, 'error')
  assert.equal((await h.config({ provider: 'p', model: 'nope' }).done).status, 'error')
  assert.equal((await h.config({ length: 'medium' }).done).status, 'error')
  assert.equal((await h.config({ language: 'fr' }).done).status, 'error')
  assert.equal((await h.config({}).done).status, 'error')
  await h.cleanup()
})

test('a live save keeps the plugin running, and each model keeps its own cache', async () => {
  const h = await host(answers((call) => `draft ${call}`), { live: true })
  h.setLog([answer()])
  assert.equal((await h.rewrite({ sessionId: 's', seq: 1 }).done).text, 'draft 1')
  assert.equal((await h.config({ provider: 'p', model: 'm2' }).done).status, 'ok')
  assert.equal(h.state.restarts, 0)
  assert.equal((await h.rewrite({ sessionId: 's', seq: 1 }).done).text, 'draft 2')
  // Back to the first model: its answer is still remembered, nothing is paid twice.
  await h.config({ provider: 'p', model: 'm' }).done
  assert.equal((await h.rewrite({ sessionId: 's', seq: 1 }).done).text, 'draft 1')
  assert.deepEqual(h.state.models, ['m', 'm2'])
  const models = await h.send('/interpreter/models', undefined, 'GET').done
  assert.equal(models.model, 'm')
  await h.cleanup()
})

test('a rewrite in flight survives a live save', async () => {
  const h = await host(answers('ok', 60), { live: true })
  h.setLog([answer()])
  const pending = h.rewrite({ sessionId: 's', seq: 1 })
  await sleep(10)
  await h.config({ mode: 'session', addSessions: ['s'] }).done
  assert.equal((await pending.done).status, 'ok')
  assert.equal(h.state.restarts, 0)
  await h.cleanup()
})

test('switching automation on live starts its clock at the switch', async () => {
  const h = await host(answers('ok'), { live: true })
  // Written while the plugin ran, but before automation was switched on.
  h.setLog([answer(Date.now())])
  await sleep(5)
  await h.config({ mode: 'global' }).done
  assert.equal(h.state.restarts, 0)
  assert.equal((await h.rewrite({ sessionId: 'a', seq: 1, auto: true }).done).reason, 'history')
  h.setLog([answer(Date.now() + 1000)])
  assert.equal((await h.rewrite({ sessionId: 'b', seq: 1, auto: true }).done).status, 'ok')
  const gate = await h.send('/interpreter/config', undefined, 'GET').done
  assert.equal(gate.mode, 'global')
  await h.cleanup()
})

test('the daily ceiling stops automatic rewrites but not a hand click', async () => {
  // 每次改写花 15 tokens，上限 20：第二次自动整理越过线，第三次被拦下。
  const h = await host(answers('ok'), { config: { dailyTokenCap: 20 } })
  const write = async (sessionId, seq, auto) => {
    h.setLog([answer(Date.now() + 1000)])
    return h.rewrite({ sessionId, seq, auto }).done
  }
  assert.equal((await write('a', 1, true)).status, 'ok')
  assert.equal((await write('a', 2, true)).status, 'ok')
  assert.deepEqual(await write('a', 3, true), { status: 'skip', reason: 'budget', used: 30, cap: 20 })
  assert.equal(h.state.calls, 2)
  // A hand click is the reader asking, so the ceiling does not apply to it.
  assert.equal((await write('b', 1, false)).status, 'ok')
  assert.equal(h.state.calls, 3)
  const gate = await h.send('/interpreter/config', undefined, 'GET').done
  assert.equal(gate.tokensToday, 45)
  assert.equal(gate.tokenCap, 20)
  await h.cleanup()
})

test('a length tier sets the budget, and each tier keeps its own rewrite', async () => {
  const prompts = []
  const echo = async function* (request, call) {
    prompts.push(request.messages[0].content[0].text)
    yield { type: 'text-delta', text: `draft ${call}` }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const h = await host(echo, { live: true })
  h.setLog([answer()])
  await h.rewrite({ sessionId: 's', seq: 1 }).done
  // 普通 leaves the row's own numbers alone: 600 * 0.35 = 210.
  assert.match(prompts[0], /速览请控制在 210 字以内/)
  // 详细 overrides them instead of rewriting the row.
  assert.equal((await h.config({ length: 'detailed' }).done).status, 'ok')
  assert.equal(h.state.restarts, 0)
  await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.match(prompts[1], /速览请控制在 300 字以内/)
  // Each tier remembers its own answer: going back is a cache hit, not a bill.
  assert.equal((await h.config({ length: 'normal' }).done).status, 'ok')
  assert.equal((await h.rewrite({ sessionId: 's', seq: 1 }).done).text, 'draft 1')
  assert.equal(h.state.calls, 2)
  // The tier that was dropped is no longer a value.
  assert.equal((await h.config({ length: 'short' }).done).status, 'error')
  await h.cleanup()
})

test('the gate reports the length tier', async () => {
  const h = await host(answers('ok'), { live: true })
  assert.equal((await h.send('/interpreter/config', undefined, 'GET').done).length, 'normal')
  const saved = await h.config({ length: 'detailed' }).done
  assert.equal(saved.status, 'ok')
  assert.equal(saved.length, 'detailed')
  assert.equal((await h.send('/interpreter/config', undefined, 'GET').done).length, 'detailed')
  await h.cleanup()
})

test('a fixed language is said in the request, and each language keeps its own rewrite', async () => {
  const prompts = []
  const echo = async function* (request, call) {
    prompts.push(request.messages[0].content[0].text)
    yield { type: 'text-delta', text: `draft ${call}` }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const h = await host(echo, { live: true })
  h.setLog([answer()])
  await h.rewrite({ sessionId: 's', seq: 1 }).done
  // 跟随回答 leaves the prompt's own rule alone: no sentence is added.
  assert.doesNotMatch(prompts[0], /速览一律用/)
  assert.equal((await h.config({ language: 'zh' }).done).status, 'ok')
  assert.equal(h.state.restarts, 0)
  await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.match(prompts[1], /速览一律用中文写/)
  await h.config({ language: 'en' }).done
  await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.match(prompts[2], /速览一律用英文写/)
  // Each language remembers its own answer: going back is a cache hit, not a bill.
  await h.config({ language: 'zh' }).done
  assert.equal((await h.rewrite({ sessionId: 's', seq: 1 }).done).text, 'draft 2')
  await h.config({ language: 'auto' }).done
  assert.equal((await h.rewrite({ sessionId: 's', seq: 1 }).done).text, 'draft 1')
  assert.equal(h.state.calls, 3)
  await h.cleanup()
})

test('the gate reports the language, and refuses one it does not know', async () => {
  const h = await host(answers('ok'), { live: true })
  assert.equal((await h.send('/interpreter/config', undefined, 'GET').done).language, 'auto')
  const saved = await h.config({ language: 'en' }).done
  assert.equal(saved.status, 'ok')
  assert.equal(saved.language, 'en')
  assert.equal((await h.send('/interpreter/config', undefined, 'GET').done).language, 'en')
  const refused = await h.config({ language: 'fr' }).done
  assert.equal(refused.status, 'error')
  assert.match(refused.message, /language must be one of/)
  await h.cleanup()
})

test('a live allow-list change merges with the row as it is now', async () => {
  const h = await host(answers('ok'), { live: true })
  await Promise.all([
    h.config({ mode: 'session', addSessions: ['A'] }).done,
    h.config({ mode: 'session', addSessions: ['B'] }).done,
  ])
  const removed = await h.config({ removeSessions: ['A'] }).done
  assert.deepEqual(removed.sessions, ['B'])
  const gate = await h.send('/interpreter/config', undefined, 'GET').done
  assert.deepEqual(gate.sessions, ['B'])
  assert.equal(h.state.restarts, 0)
  await h.cleanup()
})

test('the gate reports whether saves update the plugin in place', async () => {
  const plain = await host(answers('ok'))
  assert.equal((await plain.send('/interpreter/config', undefined, 'GET').done).live, false)
  const live = await host(answers('ok'), { live: true })
  assert.equal((await live.send('/interpreter/config', undefined, 'GET').done).live, true)
  // A live save keeps the plugin, so the report does not change under it.
  await live.config({ mode: 'global' }).done
  assert.equal((await live.send('/interpreter/config', undefined, 'GET').done).live, true)
})

test('the gate reports every row the settings page edits', async () => {
  const h = await host(answers('ok'))
  const gate = await h.send('/interpreter/config', undefined, 'GET').done
  assert.deepEqual(gate.settings, {
    temperature: 0.3,
    ratio: 0.35,
    capChars: 900,
    minChars: 400,
    maxChars: 40000,
    prompt: gate.settings.prompt,
    dailyTokenCap: 0,
  })
  assert.match(gate.settings.prompt, /速览/)
  assert.equal(gate.defaultPrompt, gate.settings.prompt)
  assert.equal(gate.variant, 'baseline')
  assert.equal(gate.ownPrompt, false)
  assert.equal(gate.builtInPrompts.baseline, gate.defaultPrompt)
  assert.match(gate.builtInPrompts.roles, /这些说法不要写进速览/)
  await h.cleanup()
})

/** What the 0.1.1 – 0.2.1 releases shipped as the built-in prompt, rebuilt from today's. */
const releasedPrompt = (current) => current
  .replace('原文是 Markdown 链接的保留链接写法，其余路径、命令和文件名用反引号包起来', '路径、命令和文件名用反引号包起来')
  .replace('风险、限制、代价放在末尾', '风险、限制、代价放在最后一条')

test('a saved copy of an older built-in prompt is not the reader\'s own', async () => {
  const systems = []
  const echo = async function* (request) {
    systems.push(request.system)
    yield { type: 'text-delta', text: '短' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const fresh = await host(echo)
  const current = (await fresh.send('/interpreter/config', undefined, 'GET').done).defaultPrompt
  const released = releasedPrompt(current)
  assert.notEqual(released, current)

  // A profile saved under 0.2.1 holds that text verbatim, maybe with CRLF from the YAML.
  for (const saved of [released, `${released.replace(/\n/g, '\r\n')}\n`]) {
    systems.length = 0
    const h = await host(echo, { config: { prompt: saved } })
    const gate = await h.send('/interpreter/config', undefined, 'GET').done
    assert.equal(gate.ownPrompt, false)
    assert.equal(gate.settings.prompt, current)
    h.setLog([answer()])
    await h.rewrite({ sessionId: 's', seq: 1 }).done
    assert.equal(systems[0], current)
    // The next save of any row takes the stale copy out of the row.
    await h.config({ temperature: 0.5 }).done
    assert.equal('prompt' in h.row.options.config, false)
    await h.cleanup()
  }
})

test('only a prompt of the reader\'s own is written to the row', async () => {
  const h = await host(answers('ok'), { live: true })
  const current = (await h.send('/interpreter/config', undefined, 'GET').done).defaultPrompt
  // The settings page sends the prompt with every save; the built-in is not stored.
  let saved = await h.config({ temperature: 0.5, prompt: current }).done
  assert.equal('prompt' in h.row.options.config, false)
  assert.equal(saved.ownPrompt, false)
  saved = await h.config({ prompt: '只留结论。' }).done
  assert.equal(h.row.options.config.prompt, '只留结论。')
  assert.equal(saved.ownPrompt, true)
  assert.equal(saved.settings.prompt, '只留结论。')
  // 恢复默认 sends the built-in back: the reader's text leaves the row.
  saved = await h.config({ prompt: current }).done
  assert.equal('prompt' in h.row.options.config, false)
  assert.equal(saved.ownPrompt, false)
  assert.equal(saved.settings.prompt, current)
  await h.cleanup()
})

test('the prompt switch picks a built-in, and each keeps its own rewrite', async () => {
  const systems = []
  const h = await host(async function* (request, call) {
    systems.push(request.system)
    yield { type: 'text-delta', text: `draft ${call}` }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }, { live: true })
  const gate = await h.send('/interpreter/config', undefined, 'GET').done
  h.setLog([answer()])
  await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.equal(systems[0], gate.builtInPrompts.baseline)

  const switched = await h.config({ variant: 'roles' }).done
  assert.equal(switched.variant, 'roles')
  assert.equal(h.state.restarts, 0)
  assert.equal((await h.send('/interpreter/config', undefined, 'GET').done).variant, 'roles')
  assert.equal((await h.rewrite({ sessionId: 's', seq: 1 }).done).text, 'draft 2')
  assert.equal(systems[1], gate.builtInPrompts.roles)
  // Back to 基准: its own rewrite is still cached, so the comparison costs nothing more.
  await h.config({ variant: 'baseline' }).done
  assert.equal((await h.rewrite({ sessionId: 's', seq: 1 }).done).text, 'draft 1')
  assert.equal(h.state.calls, 2)

  // The reader's own prompt replaces 基准 only; 角色版 stays built in.
  await h.config({ prompt: '只留结论。' }).done
  await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.equal(systems.at(-1), '只留结论。')
  await h.config({ variant: 'roles' }).done
  await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.equal(systems.at(-1), gate.builtInPrompts.roles)

  const refused = await h.config({ variant: 'mine' }).done
  assert.equal(refused.status, 'error')
  assert.equal(refused.message, 'variant must be one of baseline, roles')
  await h.cleanup()
})

test('the tightening pass speaks the way of cutting of the prompt in force', async () => {
  const prompts = []
  const long = async function* (request) {
    prompts.push(request.messages[0].content[0].text)
    yield { type: 'text-delta', text: 'y'.repeat(1000) }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const h = await host(long, { live: true })
  h.setLog([answer()])
  await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.match(prompts[1], /再压一遍：只留结论、必要步骤和风险/)
  await h.config({ variant: 'roles' }).done
  await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.match(prompts[3], /保留开头的结论句和各块小标题/)
  await h.cleanup()
})

/** An answer in three sections under a title, with a `#` comment in a script that is not a heading. */
const SECTIONED = [
  '# HTTP 缓存', '先说清楚两层缓存。',
  '## 一、强缓存', 'a'.repeat(1000),
  '## 二、协商缓存', 'b'.repeat(1000), '```sh', '# 不是标题', 'curl -I /', '```',
  '## **三、怎么配：**', 'c'.repeat(1000),
].join('\n\n')

/** A 速览 laid out the way 角色版 asks for a sectioned answer. */
const BLOCKED = '强缓存不问服务器，协商缓存问一次。\n\n#### 两层缓存\n- 强缓存直接用本地副本\n\n#### 怎么配\n- 静态资源配长缓存'

/** A host whose model answers `drafts[call - 1]`, keeping each message it was sent. */
async function rolesHost(drafts, prompts, config = {}) {
  const h = await host(async function* (request, call) {
    prompts.push(request.messages[0].content[0].text)
    yield { type: 'text-delta', text: drafts[Math.min(call, drafts.length) - 1] }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }, { config: { variant: 'roles', ...config } })
  return h
}

test('角色版 is told the layout code read from the answer', async () => {
  const prompts = []
  // Every answer after the first is flat, and so is every draft after the first.
  const h = await rolesHost([BLOCKED, '结论。\n\n- 一\n- 二'], prompts)
  h.setLog([{ ...answer(), text: SECTIONED }])
  const result = await h.rewrite({ sessionId: 's', seq: 1 }).done
  // The lone title is not a section, the script comment is not a heading, and marks are dropped.
  const hint = prompts[0].split('\n---\n').at(-1)
  assert.match(hint, /原文分 3 节：「一、强缓存」、「二、协商缓存」、「三、怎么配」。速览按这个顺序合并成 2–4 块，每块用 #### 小标题/)
  assert.doesNotMatch(hint, /不是标题|原文最后在请读者做决定/)
  // A draft laid out as told goes out as it came: one call.
  assert.equal(result.text, BLOCKED)
  assert.equal(h.state.calls, 1)

  // An answer with no sections is told to stay flat.
  h.setLog([answer()])
  await h.rewrite({ sessionId: 's2', seq: 1 }).done
  assert.match(prompts[1], /这条速览不用分块：写成一句结论加几条要点，不用小标题。/)

  // Sections with no room for headings stay flat too: 600 characters leave a 210-character budget.
  h.setLog([{ ...answer(), text: `## 一\n\n${'a'.repeat(200)}\n\n## 二\n\n${'b'.repeat(200)}\n\n## 三\n\n${'c'.repeat(200)}` }])
  await h.rewrite({ sessionId: 's3', seq: 1 }).done
  assert.match(prompts[2], /这条速览不用分块/)

  // An answer that ends by asking puts the decision first, whether asked in prose or by the tool.
  h.setLog([{ ...answer(), text: `${LONG}\n\n要我按这个改吗？` }])
  await h.rewrite({ sessionId: 's4', seq: 1 }).done
  assert.match(prompts[3], /原文最后在请读者做决定：把要决定的事和各选项的代价放在结论之后。/)
  const asked = JSON.stringify({ questions: [{ question: '修吗', options: [{ label: '修' }] }] })
  h.setLog([{ ...answer(), text: `${LONG}\n\n<ask_user_question>${asked}</ask_user_question>` }])
  await h.rewrite({ sessionId: 's5', seq: 1 }).done
  assert.match(prompts[4], /原文最后在请读者做决定/)
  await h.cleanup()
})

test('a 角色版 draft laid out wrong goes back once with what to fix', async () => {
  const cases = [
    // Sectioned answer, flat draft: told the sections to block by.
    [SECTIONED, '结论。\n\n- 一\n- 二', /要再改一遍：没有分块：按「一、强缓存」、「二、协商缓存」、「三、怎么配」的顺序合并成 2–4 块，每块加 #### 小标题。内容不要增减。/],
    // A heading before the opening sentence.
    [SECTIONED, '#### 两层缓存\n- 强缓存\n\n#### 怎么配\n- 长缓存', /开头先写一句结论，小标题放在它后面。/],
    // A category word as a heading.
    [SECTIONED, '结论。\n\n#### 结论\n- 一\n\n#### 怎么配\n- 二', /小标题「结论」是分类名，换成内容本身的词。/],
    // Too many blocks.
    [SECTIONED, `结论。${'\n\n#### 块\n- 一'.repeat(5)}`, /分了 5 块，太多：合并成不超过 4 块。/],
    // Flat answer, headed draft.
    [LONG, '结论。\n\n#### 一\n- 一\n\n#### 二\n- 二', /这条不用分块：去掉小标题，写成一句结论加几条要点。/],
  ]
  for (const [text, draft, told] of cases) {
    const prompts = []
    const fixed = text === LONG ? '结论。\n\n- 一\n- 二' : BLOCKED
    const h = await rolesHost([draft, fixed], prompts)
    h.setLog([{ ...answer(), text }])
    const result = await h.rewrite({ sessionId: 's', seq: 1 }).done
    assert.match(prompts[1], told, draft)
    assert.ok(prompts[1].endsWith(`\n\n${draft}`))
    // The repair has no layout faults left, so it wins even where it is longer.
    assert.equal(result.text, fixed, draft)
    assert.equal(h.state.calls, 2)
    await h.cleanup()
  }
})

test('a 角色版 repair is kept only when its layout is no worse', async () => {
  // Over budget and laid out wrong: one pass fixes both, under the same language rule.
  let prompts = []
  let h = await rolesHost([`结论。\n\n- ${'y'.repeat(1500)}`, BLOCKED], prompts, { language: 'zh' })
  h.setLog([{ ...answer(), text: SECTIONED }])
  let result = await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.match(prompts[1], /没有分块.*另外它还有 \d+ 字，超过 900 字的上限，再压一遍：保留开头的结论句和各块小标题/)
  assert.match(prompts[1], /速览一律用中文写/)
  assert.equal(result.text, BLOCKED)
  assert.equal(h.state.calls, 2)
  await h.cleanup()

  // A repair that comes back with more faults than the draft loses to it.
  prompts = []
  const named = '结论。\n\n#### 结论\n- 一\n\n#### 怎么配\n- 二'
  h = await rolesHost([named, '#### 结论\n- 一'], prompts)
  h.setLog([{ ...answer(), text: SECTIONED }])
  result = await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.equal(result.text, named)
  await h.cleanup()

  // A tightening pass that drops the headings loses to the longer draft that kept them.
  prompts = []
  const long = `结论。\n\n#### 两层缓存\n- ${'y'.repeat(1400)}\n\n#### 怎么配\n- 二`
  h = await rolesHost([long, '结论。'], prompts)
  h.setLog([{ ...answer(), text: SECTIONED }])
  result = await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.match(prompts[1], /^下面这段已经压过一遍/)
  assert.equal(result.text, long)
  await h.cleanup()
})

test('a rewrite comes back with the record of how it was made', async () => {
  const prompts = []
  const flat = '结论。\n\n- 一\n- 二'
  const h = await rolesHost([flat, BLOCKED], prompts)
  h.setLog([{ ...answer(), text: SECTIONED }])
  const result = await h.rewrite({ sessionId: 's', seq: 1 }).done
  const { trace } = result
  assert.equal(trace.variant, 'roles')
  assert.equal(trace.budget, 900)
  assert.deepEqual(trace.outline.sections, ['一、强缓存', '二、协商缓存', '三、怎么配'])
  assert.equal(trace.outline.blocks, true)
  assert.match(trace.hint, /原文分 3 节/)
  assert.equal(trace.calls.length, 2)
  assert.equal(trace.calls[0].kind, 'draft')
  assert.equal(trace.calls[0].problems.length, 1)
  assert.equal(trace.calls[1].kind, 'repair')
  assert.deepEqual(trace.calls[1].problems, [])
  assert.equal(trace.kept, 2)
  assert.equal(trace.firstDraft, flat)
  // The record is cached with the text it explains.
  assert.deepEqual((await h.rewrite({ sessionId: 's', seq: 1 }).done).trace, trace)
  assert.equal(h.state.calls, 2)
  await h.cleanup()
})

test('基准 gets no layout hint and no layout check', async () => {
  const prompts = []
  const h = await host(async function* (request) {
    prompts.push(request.messages[0].content[0].text)
    yield { type: 'text-delta', text: '#### 结论\n- 一' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })
  h.setLog([{ ...answer(), text: SECTIONED }])
  const result = await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.ok(prompts[0].endsWith('速览请控制在 900 字以内。'))
  assert.equal(result.text, '#### 结论\n- 一')
  assert.equal(h.state.calls, 1)
  assert.equal(result.trace.outline, null)
  assert.equal(result.trace.calls.length, 1)
  await h.cleanup()
})

test('the settings page rows are checked before they are saved', async () => {
  const h = await host(answers('ok'))
  const refused = async (body, message) => {
    const answer = await h.config(body).done
    assert.equal(answer.status, 'error', JSON.stringify(body))
    assert.equal(answer.message, message, JSON.stringify(body))
  }
  // A model is one choice: half of it is not a save.
  await refused({ provider: 'p' }, 'provider and model are required together')
  await refused({ provider: 'p', model: 'nope' }, 'that model is not available right now')
  await refused({ temperature: 3 }, 'temperature is out of range')
  await refused({ temperature: '0.3' }, 'temperature is out of range')
  await refused({ ratio: 1 }, 'ratio is out of range')
  await refused({ capChars: 149 }, 'capChars is out of range')
  await refused({ minChars: -1 }, 'minChars is out of range')
  await refused({ dailyTokenCap: 1.5 }, 'dailyTokenCap is out of range')
  await refused({ prompt: '   ' }, 'prompt must be text of 1 to 8000 characters')
  await refused({ prompt: 'x'.repeat(8001) }, 'prompt must be text of 1 to 8000 characters')
  // The bounds are checked as the row will read afterwards, not as sent.
  await refused({ maxChars: 300 }, 'the shortest answer cannot be longer than the longest')
  await refused({}, 'nothing to save')
  assert.equal(h.state.saves, 0)
  await h.cleanup()
})

test('a settings save lands in place, and the next rewrite uses every row', async () => {
  const prompts = []
  const systems = []
  const echo = async function* (request, call) {
    prompts.push(request.messages[0].content[0].text)
    systems.push(request.system)
    yield { type: 'text-delta', text: `draft ${call}` }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const h = await host(echo, { live: true })
  const saved = await h.config({
    provider: 'p',
    model: 'm2',
    length: 'detailed',
    language: 'zh',
    temperature: 0.8,
    ratio: 0.2,
    capChars: 500,
    minChars: 300,
    maxChars: 3000,
    dailyTokenCap: 5000,
    prompt: '只留结论。',
  }).done
  assert.equal(saved.status, 'ok')
  assert.equal(h.state.restarts, 0)
  assert.deepEqual(saved.settings, {
    temperature: 0.8,
    ratio: 0.2,
    capChars: 500,
    minChars: 300,
    maxChars: 3000,
    prompt: '只留结论。',
    dailyTokenCap: 5000,
  })
  const gate = await h.send('/interpreter/config', undefined, 'GET').done
  assert.deepEqual(gate.settings, saved.settings)
  assert.equal(gate.tokenCap, 5000)
  h.setLog([answer()])
  assert.equal((await h.rewrite({ sessionId: 's', seq: 1 }).done).status, 'ok')
  assert.equal(h.state.models[0], 'm2')
  // The prompt is the system message; the tier's own budget and language still
  // ride in the user Turn.
  assert.equal(systems[0], '只留结论。')
  assert.match(prompts[0], /速览请控制在 300 字以内/)
  assert.match(prompts[0], /速览一律用中文写/)
  await h.cleanup()
})

test('a prompt change is not answered from a cache written with the old one', async () => {
  const h = await host(answers((call) => `draft ${call}`), { live: true })
  h.setLog([answer()])
  await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.equal(h.state.calls, 1)
  // Same tier and language, same answer: still a cache hit.
  await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.equal(h.state.calls, 1)
  await h.config({ prompt: '只留一句。' }).done
  await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.equal(h.state.calls, 2)
  // The numeric rows are read when the request is built, so they age the cache too.
  await h.config({ temperature: 0.9 }).done
  await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.equal(h.state.calls, 3)
  // The tier and the language are in the key itself: switching back hits its own answer.
  await h.config({ length: 'detailed' }).done
  await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.equal(h.state.calls, 4)
  await h.config({ length: 'normal' }).done
  await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.equal(h.state.calls, 4)
  await h.cleanup()
})

test('the entry is offered only where a click has something to do', async () => {
  const h = await host(answers('ok'))
  h.setLog([
    answer(Date.now() - 3600e3),
    // 短回答压在手里，改写也只会回一句「这条没什么可压的」。
    { ...answer(), text: 'x'.repeat(50) },
    { ...answer(), text: 'x'.repeat(40001) },
    { type: 'tool/call', data: { turn: 2 }, time: Date.now() },
  ])
  // A long answer gets an entry, even one written before automation was on:
  // in 手动 the entry is the only way to ask, so the probe must not age it out.
  assert.deepEqual(await h.probe({ sessionId: 's', seq: 1 }).done, { status: 'ok' })
  assert.deepEqual(await h.probe({ sessionId: 's', seq: 2 }).done, { status: 'skip', reason: 'too-short' })
  assert.deepEqual(await h.probe({ sessionId: 's', seq: 3 }).done, { status: 'skip', reason: 'too-long' })
  assert.deepEqual(await h.probe({ sessionId: 's', seq: 4 }).done, { status: 'skip', reason: 'no-answer' })
  // Judging an entry costs nothing: no model is asked, and no rewrite is cached.
  assert.equal(h.state.calls, 0)
  await h.cleanup()
})

test('the entry probe reads no body it cannot use', async () => {
  const h = await host(answers('ok'))
  assert.deepEqual(await h.send('/interpreter/probe', undefined, 'GET').done, { status: 'error', message: 'POST only' })
  const bad = (body) => h.probe(body).done
  for (const body of [{ sessionId: 's' }, { seq: 1 }, { sessionId: 's', seq: '1' }, { sessionId: 1, seq: 2 }]) {
    assert.deepEqual(await bad(body), { status: 'error', message: 'sessionId and seq are required' }, JSON.stringify(body))
  }
  assert.equal(h.state.calls, 0)
  await h.cleanup()
})
