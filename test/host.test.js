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
const LIVE_FIELDS = ['provider', 'model', 'mode', 'sessions', 'autoSince']

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
 * @param options - `rejection`: what the Host's own request check answers;
 *   `live`: hand the plugin live references, as DSH does when its Config loads.
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
    connection: { requestRejection: () => options.rejection },
    fiber: { entry: row },
    get: (name) => (name === 'configEditor' ? editor : undefined),
    webServer: {
      /** Like the Host's registry: the returned disposer takes the route away again. */
      register: (route) => {
        routes[route.path] = route.handler
        return () => { if (routes[route.path] === route.handler) delete routes[route.path] }
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
    const handler = routes[path]
    // Between one instance and the next nothing answers, as on the real server.
    if (handler === undefined) {
      res.statusCode = 404
      res.end()
      return { done, res }
    }
    handler(req, res)
    setImmediate(() => { req.emit('data', Buffer.from(JSON.stringify(body ?? {}))); req.emit('end') })
    return { done, res }
  }
  const rewrite = (body) => send('/interpreter/rewrite', body)
  const config = (body) => send('/interpreter/config', body)
  const probe = (body) => send('/interpreter/probe', body)
  return { state, setLog, send, rewrite, config, probe, cleanup: async () => {} }
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

test('the plugin asks for the connection it authenticates with', () => {
  assert.ok(inject.includes('connection'))
  assert.ok(!inject.includes('profileContext'))
})

test('a request the Host refuses is answered before its body is read', async () => {
  const h = await host(answers('ok'), { rejection: 401 })
  const refused = await h.rewrite({ sessionId: 's', seq: 1 }).done
  assert.equal(refused.status, 401)
  assert.equal(h.state.calls, 0)
  assert.equal((await h.config({ mode: 'global' }).done).status, 401)
  assert.equal((await h.probe({ sessionId: 's', seq: 1 }).done).status, 401)
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
