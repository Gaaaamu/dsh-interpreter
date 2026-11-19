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
const { blocks, inline, safeHref, tableCells, effectiveMode, renderBlock } = helpers

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
