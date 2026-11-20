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

/**
 * One Host against stand-in DSH services. A save rewrites the plugin's config
 * row and restarts it, exactly as the Host does, so the next request meets the
 * config the save left behind.
 * @param model - `async function* (request, call)`: what the model streams back.
 * @param options - `rejection`: what the Host's own request check answers.
 */
async function host(model, options = {}) {
  const log = { events: {}, nodes: [] }
  const session = {
    surface: { get nodes() { return log.nodes } },
    eventAt: (seq) => log.events[seq],
    deriveEventMessage: (event) => ({ content: [{ type: 'text', text: event.text }] }),
  }
  const routes = {}
  const state = { calls: 0, active: 0, peak: 0, saves: 0, models: [] }
  const row = { options: { config: { provider: 'p', model: 'm' } } }

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

  /** One plugin instance: its own effects, disposed together on restart. */
  const start = (config) => {
    const disposers = []
    const ctx = {
      ...services,
      effect: (install) => {
        const dispose = install()
        if (typeof dispose === 'function') disposers.push(dispose)
      },
    }
    apply(ctx, config)
    return { dispose: () => { for (const dispose of disposers.splice(0)) dispose() } }
  }

  /**
   * Like the Host's config editor: saves run one at a time, each re-reads the
   * row as it is now, replaces its config wholesale, then reloads the plugin.
   * The old instance's routes are gone for a moment before the new ones exist.
   */
  let queue = Promise.resolve()
  const editor = {
    edit(entry, change) {
      const run = queue.then(async () => {
        await sleep(3)
        entry.options.config = change(structuredClone(entry.options.config ?? {}), {})
        state.saves += 1
        instance.dispose()
        await sleep(2)
        instance = start(entry.options.config)
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
  return { state, setLog, send, rewrite, config, cleanup: async () => {} }
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

test('a failed second pass keeps the first draft', async () => {
  const h = await host(async function* (request, call) {
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

test('a save restarts the plugin: the cache starts empty and the new model is used', async () => {
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
