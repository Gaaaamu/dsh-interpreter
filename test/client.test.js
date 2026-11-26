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
const { blocks, inline, safeHref, tableCells, effectiveMode, effectiveLength, effectiveLanguage, renderBlock, readReply, headline, probeTurn, copyText, draftOf, readDraft, resolveModelLabel, traceLine, traceText, waitedWords } = helpers

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

test('code and links inside bold keep their own look', () => {
  const [strong] = inline('**`Cache-Control` 管新鲜期**；其余', 'k')
  assert.equal(strong.type, 'strong')
  assert.equal(strong.children[0].type, 'code')
  assert.equal(strong.children[0].children[0], 'Cache-Control')
  assert.equal(strong.children[1], ' 管新鲜期')
  // The outer run carries on after the bold, not from its start.
  const nodes = inline('a **`x`** b `y` c', 'k')
  assert.deepEqual(nodes.map((node) => (typeof node === 'string' ? node : node.type)), ['a ', 'strong', ' b ', 'code', ' c'])
  assert.equal(inline('*see `z`*', 'k')[0].children[1].type, 'code')
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
  assert.equal(effectiveLength({ mode: 'manual', sessions: [], length: 'normal' }), 'normal')
  assert.equal(effectiveLength({ mode: 'manual', sessions: [], length: 'detailed' }), 'detailed')
  // 普通 is the standing answer: a gate from an older Host, a dropped tier, or a typo reads as it.
  assert.equal(effectiveLength({ mode: 'manual', sessions: [] }), 'normal')
  assert.equal(effectiveLength({ length: 'short' }), 'normal')
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

test('the settings page checks its own rows before spending a round trip', () => {
  const good = {
    temperature: '0.4',
    ratio: '0.35',
    capChars: '600',
    minChars: '400',
    maxChars: '1200',
    dailyTokenCap: '20000',
    prompt: '写得短一点。',
  }
  assert.deepEqual(readDraft(good), {
    temperature: 0.4,
    ratio: 0.35,
    capChars: 600,
    minChars: 400,
    maxChars: 1200,
    dailyTokenCap: 20000,
    prompt: '写得短一点。',
  })
  // 0 is a real value for the ceiling: it means no ceiling.
  assert.equal(readDraft({ ...good, dailyTokenCap: '0' }).dailyTokenCap, 0)
  const refuses = (draft, pattern) => assert.throws(() => readDraft({ ...good, ...draft }), pattern)
  refuses({ temperature: '3' }, /温度要在 0 到 2 之间/)
  refuses({ temperature: '' }, /温度不能为空/)
  refuses({ ratio: '1' }, /普通档比例要大于 0 且小于 1/)
  refuses({ ratio: '0' }, /普通档比例要大于 0 且小于 1/)
  refuses({ capChars: '149' }, /普通档上限要是不小于 150 的整数/)
  refuses({ capChars: '1.5' }, /普通档上限要是不小于 150 的整数/)
  refuses({ minChars: '-1' }, /最短字数要是不小于 0 的整数/)
  refuses({ minChars: '900', maxChars: '800' }, /最短字数不能大于最长字数/)
  refuses({ prompt: '   ' }, /提示词不能为空/)
  refuses({ prompt: 'x'.repeat(8001) }, /提示词最多 8000 字/)
  // The text is left exactly as typed; only the numbers are read.
  assert.equal(readDraft({ ...good, prompt: ' 两行\n三行 ' }).prompt, ' 两行\n三行 ')
})

test('the draft is the rows as text, and a missing row stays empty', () => {
  assert.deepEqual(draftOf(null), {
    temperature: '',
    ratio: '',
    capChars: '',
    minChars: '',
    maxChars: '',
    dailyTokenCap: '',
    prompt: '',
  })
  assert.deepEqual(draftOf({ temperature: 0, prompt: 'x' }), {
    temperature: '0',
    ratio: '',
    capChars: '',
    minChars: '',
    maxChars: '',
    dailyTokenCap: '',
    prompt: 'x',
  })
})

test('model labels resolve display names and fall back cleanly when missing', () => {
  const providers = [
    { id: 'ds', name: 'DeepSeek', models: [{ id: 'chat', name: 'DeepSeek Chat' }] },
  ]
  assert.deepEqual(resolveModelLabel('', providers), { empty: true, name: '选择模型', provider: '' })
  assert.deepEqual(resolveModelLabel('ds::chat', providers), { empty: false, name: 'DeepSeek Chat', provider: 'DeepSeek' })
  assert.deepEqual(resolveModelLabel('other::v1', providers), { empty: false, name: 'v1', provider: 'other' })
})

test('a rewrite says how it was made, in a line and in full', () => {
  const usage = { inputTokens: 3000, outputTokens: 400, totalTokens: 3400 }
  const single = {
    variant: 'roles', original: 3080, budget: 900, kept: 1,
    outline: { sections: ['一、强缓存', '二、协商缓存', '三、怎么配'], blocks: true, asks: false },
    hint: '原文分 3 节：…',
    calls: [{ kind: 'draft', chars: 620, over: false, problems: [], usage }],
  }
  assert.equal(traceLine(single), '角色版 · 分块（原文 3 节） · 初稿 620 字 · 1 次调用')
  const full = traceText(single)
  assert.match(full, /原文各节：「一、强缓存」、「二、协商缓存」、「三、怎么配」/)
  assert.match(full, /告诉模型的版式：原文分 3 节/)
  assert.match(full, /代码查出的排版问题：无/)
  assert.doesNotMatch(full, /初稿全文/)

  const repaired = {
    ...single,
    kept: 2,
    firstDraft: '结论。\n\n- 一',
    calls: [
      { kind: 'draft', chars: 1500, over: true, problems: ['没有分块：…'], usage },
      { kind: 'repair', instruction: '下面这段速览要再改一遍：…', effort: 'low', chars: 700, problems: [], usage },
    ],
  }
  assert.equal(traceLine(repaired), '角色版 · 分块（原文 3 节） · 初稿 1500 字，超预算，1 处排版问题 · 按排版问题重写后 700 字，用第二稿')
  assert.match(traceText(repaired), /## 第 2 次调用：按排版问题重写[\s\S]*最后用的是第二稿。[\s\S]*## 初稿全文\n\n结论。/)
  assert.match(traceText(repaired), /代码查出的排版问题：没有分块：…/)
  assert.match(traceText(repaired), /- 指令：下面这段速览要再改一遍：…\n- 思考档位：low\n/)
  assert.doesNotMatch(traceText(single), /思考档位/)

  // Several faults are listed one per line; tokens add up, with the cached and thinking parts inside.
  const cached = { inputTokens: 7, cacheReadTokens: 2944, cacheWriteTokens: 0, outputTokens: 973, reasoningTokens: 400, totalTokens: 3924 }
  const many = { ...repaired, calls: [{ ...repaired.calls[0], problems: ['一。', '二。'], usage: cached }, repaired.calls[1]] }
  assert.match(traceText(many), /- 代码查出 2 处排版问题：\n  - 一。\n  - 二。/)
  assert.match(traceText(many), /tokens：输入 2951（缓存命中 2944） · 输出 973（思考 400） · 合计 3924/)
  assert.match(traceText(single), /tokens：输入 3000 · 输出 400 · 合计 3400/)

  const failed = { ...repaired, kept: 1, calls: [repaired.calls[0], { kind: 'tighten', instruction: 'x', failed: 'RATE: limited' }] }
  assert.match(traceLine(failed), /再压一遍失败，用初稿$/)
  assert.equal(traceLine({ variant: 'baseline', outline: null, calls: [{ kind: 'draft', chars: 300, problems: [] }] }), '基准 · 不由代码定版式 · 初稿 300 字 · 1 次调用')
  // An English answer's record speaks in words, as the model was told.
  assert.equal(traceLine({ variant: 'baseline', outline: null, words: true, calls: [{ kind: 'draft', chars: 300, problems: [] }] }), '基准 · 不由代码定版式 · 初稿 100 个词 · 1 次调用')
  assert.match(traceText({ variant: 'baseline', original: 3300, budget: 900, words: true, outline: null, calls: [] }), /原文 1100 个词，预算 300 个词/)
  // 基准 told to keep the questions an answer ends on says so, and does not call it a layout.
  const asked = { variant: 'baseline', original: 900, budget: 300, outline: null, hint: '原文最后在问读者问题：……', calls: [{ kind: 'draft', chars: 280, problems: [] }] }
  assert.equal(traceLine(asked), '基准 · 不由代码定版式（末尾在问读者，提醒保留） · 初稿 280 字 · 1 次调用')
  assert.match(traceText(asked), /- 另外告诉模型：原文最后在问读者问题/)
  assert.doesNotMatch(traceText(asked), /告诉模型的版式/)
  // An older Host sends no record: nothing to say, nothing to copy.
  assert.equal(traceLine(undefined), '')
  assert.equal(traceText(undefined), '')
})

test('a long wait says how long it has been', () => {
  const since = 1_000_000
  assert.equal(waitedWords(since, since + 9_999), '')
  assert.equal(waitedWords(since, since + 45_000), '已等 45 秒')
  assert.equal(waitedWords(since, since + 125_400), '已等 2 分 5 秒')
  // The first render's phase carries no start time: nothing to say.
  assert.equal(waitedWords(undefined, since), '')
})
