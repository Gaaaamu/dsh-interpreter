/**
 * The Client's pure helpers: link filtering and the small Markdown reader.
 * client.js is a browser module, so it is loaded the way the app loads it,
 * with a stand-in module loader and a React stub that records elements.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

/** Elements as plain records: `{ type, props, children }`. */
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  useEffect() {},
  useMemo() {},
  useState() {},
}

let helpers
globalThis.window = {
  __ModuleLoader__: { load: (definition) => definition.factory(() => React) },
  __DSH_INTERPRETER_TEST__: (exposed) => { helpers = exposed },
}
new Function(source)()
const { blocks, inline, safeHref, tableCells, effectiveMode, effectiveLength, effectiveLanguage, renderBlock, readReply, headline, probeTurn, copyText } = helpers

/** The href of every link in an inline run, or the text where a node is text. */
const hrefs = (text) => inline(text, 'k').map((node) => (typeof node === 'string' ? node : node.props.href ?? node.type))

test('links keep only web, file, mailto and path targets', () => {
  for (const bad of ['javascript:alert(1)', 'JavaScript:x', 'data:text/html,hi', 'vbscript:x', ' javascript:x']) {
    assert.equal(safeHref(bad), null, bad)
  }
  for (const good of ['https://example.com', 'http://x', 'file:///C:/x', 'mailto:a@b.c', 'C:/Users/x.md', './docs/x.md', '/abs/path', '#anchor']) {
    assert.equal(safeHref(good), good, good)
  }
  assert.deepEqual(hrefs('[a](javascript:x)'), ['a'])
  assert.deepEqual(hrefs('[a](https://example.com/x)'), ['https://example.com/x'])
  assert.deepEqual(hrefs('see https://example.com/y.'), ['see ', 'https://example.com/y', '.'])
})

test('emphasis needs to hug its words', () => {
  assert.deepEqual(hrefs('a * b * c'), ['a * b * c'])
  assert.deepEqual(hrefs('an *important* word'), ['an ', 'em', ' word'])
  assert.deepEqual(hrefs('*x*'), ['em'])
  assert.deepEqual(hrefs('**bold**'), ['strong'])
})

test('table cells keep escaped pipes and pipes inside code', () => {
  assert.deepEqual(tableCells('| `a | b` | x |'), ['`a | b`', 'x'])
  assert.deepEqual(tableCells('| a \\| b | x |'), ['a | b', 'x'])
  const [table] = blocks('| cmd | note |\n| --- | --- |\n| `ls | wc` | count |')
  assert.deepEqual(table.head, ['cmd', 'note'])
  assert.deepEqual(table.rows, [['`ls | wc`', 'count']])
})

test('lists nest by indentation', () => {
  const [list] = blocks('- a\n  - b\n  - c\n- d')
  assert.equal(list.items.length, 2)
  assert.equal(list.items[0].text, 'a')
  assert.deepEqual(list.items[0].children[0].items.map((item) => item.text), ['b', 'c'])
  assert.equal(list.items[1].text, 'd')
})

test('a wrapped line stays in its list item', () => {
  const parsed = blocks('1. step\n   more text\n2. next')
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].items[0].text, 'step\nmore text')
})

test('a blank line between items keeps one list; a paragraph after it ends the list', () => {
  assert.equal(blocks('- a\n\n- b').length, 1)
  assert.deepEqual(blocks('- a\n\nafter').map((block) => block.kind), ['list', 'paragraph'])
})

test('an ordered list keeps its first number', () => {
  const [list] = blocks('3. third\n4. fourth')
  assert.equal(list.start, 3)
  assert.equal(renderBlock(list, 0).props.start, 3)
  assert.equal(renderBlock(blocks('1. one')[0], 0).props.start, undefined)
})

test('a rule is not a list', () => {
  assert.deepEqual(blocks('- a\n---\n- b').map((block) => block.kind), ['list', 'rule', 'list'])
})

test('the mode a Session sees', () => {
  assert.equal(effectiveMode({ mode: 'global', sessions: [] }, 's'), 'global')
  assert.equal(effectiveMode({ mode: 'session', sessions: ['s'] }, 's'), 'session')
  assert.equal(effectiveMode({ mode: 'session', sessions: ['t'] }, 's'), 'manual')
  assert.equal(effectiveMode({ mode: 'manual', sessions: ['s'] }, 's'), 'manual')
})

test('the length tier a gate names', () => {
  assert.equal(effectiveLength({ mode: 'manual', sessions: [], length: 'short' }), 'short')
  assert.equal(effectiveLength({ mode: 'manual', sessions: [], length: 'detailed' }), 'detailed')
  // 适中 is the standing answer: a gate from an older Host, or a typo, reads as it.
  assert.equal(effectiveLength({ mode: 'manual', sessions: [] }), 'normal')
  assert.equal(effectiveLength({ length: 'huge' }), 'normal')
})

test('the language a gate names', () => {
  assert.equal(effectiveLanguage({ mode: 'manual', sessions: [], language: 'zh' }), 'zh')
  assert.equal(effectiveLanguage({ mode: 'manual', sessions: [], language: 'en' }), 'en')
  assert.equal(effectiveLanguage({ mode: 'manual', sessions: [], language: 'auto' }), 'auto')
  // 跟随回答 is the standing answer: a gate from an older Host, or a typo, reads as it.
  assert.equal(effectiveLanguage({ mode: 'manual', sessions: [] }), 'auto')
  assert.equal(effectiveLanguage({ language: 'fr' }), 'auto')
})

test('the folded line says what the rewrite concluded', () => {
  const line = (text) => headline(blocks(text))
  assert.equal(line('结论：直接装依赖。\n\n- 下一步'), '结论：直接装依赖')
  assert.equal(line('- 先装依赖\n- 再启动'), '先装依赖')
  assert.equal(line('**加粗**开头。'), '加粗开头')
  assert.equal(line('改 `*.md` 里的配置。'), '改 *.md 里的配置')
  assert.equal(line('见 [说明](https://a.b) 后文。'), '见 说明 后文')
  // Structure alone says nothing: a heading or a code block is not a conclusion.
  assert.equal(line('# 标题\n\n正文结论。'), '正文结论')
  assert.equal(line('```\nls\n```\n\n结论。'), '结论')
  assert.equal(line('| a | b |\n| --- | --- |\n| 1 | 2 |'), '')
  assert.equal(line(''), '')
  // A sentence that outruns the header is cut, and says so.
  const long = line(`${'很长的开头'.repeat(20)}。\n\n后面`)
  assert.equal(long.length, 37)
  assert.ok(long.endsWith('…'))
})

test('refused and failed replies turn into messages a reader can act on', async () => {
  const reply = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input')
      return body
    },
  })
  assert.deepEqual(await readReply(reply(200, { status: 'ok' })), { status: 'ok' })
  assert.throws(() => readReply(reply(401)), /登录已失效/)
  assert.throws(() => readReply(reply(403)), /请求被拒绝/)
  await assert.rejects(readReply(reply(400, { status: 'error', message: 'that model is not available right now' })), /not available/)
  await assert.rejects(readReply(reply(500)), /HTTP 500/)
})

test('a Turn is asked about once, and only a settled answer is remembered', async () => {
  const asked = []
  const original = globalThis.fetch
  let answer
  globalThis.fetch = async (path, init) => {
    asked.push({ path, body: JSON.parse(init.body) })
    return { ok: true, status: 200, json: async () => answer }
  }
  try {
    answer = { status: 'ok' }
    assert.equal(await probeTurn('s', 1), true)
    assert.equal(await probeTurn('s', 1), true)
    assert.equal(asked.length, 1)
    assert.equal(asked[0].path, '/interpreter/probe')
    assert.deepEqual(asked[0].body, { sessionId: 's', seq: 1 })

    // A short answer stays hidden, and stays remembered as hidden.
    answer = { status: 'skip', reason: 'too-short' }
    assert.equal(await probeTurn('s', 2), false)
    assert.equal(await probeTurn('s', 2), false)
    assert.equal(asked.length, 2)

    // An answer that has not landed yet may land later: ask again next mount.
    answer = { status: 'skip', reason: 'no-answer' }
    assert.equal(await probeTurn('s', 3), false)
    assert.equal(await probeTurn('s', 3), false)
    assert.equal(asked.length, 4)

    // A failed read is not a judgment: never remembered as hidden.
    globalThis.fetch = async () => { throw new Error('offline') }
    await assert.rejects(probeTurn('s', 4), /offline/)
    await assert.rejects(probeTurn('s', 4), /offline/)
  } finally {
    globalThis.fetch = original
  }
})

test('a copy with no clipboard to reach reports itself instead of throwing', async () => {
  // Outside a browser there is no Clipboard API and no document to select text
  // in: the button has to hear 「复制失败」 rather than an exception escaping the
  // click, which would leave it looking like nothing happened.
  assert.equal(await copyText('速览'), false)
})
