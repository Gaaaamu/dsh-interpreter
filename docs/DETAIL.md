# Condensed view

Appends a 「速览」 block below each assistant reply: conclusion first, about a third of the original length, with numbers, code, paths, and commands kept verbatim. The rewrite runs beside the conversation—the main model's system prompt and context stay untouched.

Project page: [dsh-interpreter](https://github.com/Gaaaamu/dsh-interpreter)

## Using it

- **Manual (default)**: a reply long enough shows a single 「› 速览」 row. Click it to generate; nothing is spent until you click.
- **One menu for the switches**: `⋯` at the block's top-right folds every per-block switch into five rows, each showing the value in force. Picking a value applies it and closes the menu; 「返回」 drills back out of the 「模型」 list.
- **Automatic**: in that menu, 「自动速览」 switches between 「手动」, 「本会话」 and 「全部」. Automatic mode covers only replies written after the switch; opening an old session never backfills it. At most 2 rewrites run at once.
- **Model**: the 「模型」 row lists the providers and models configured in DSH. No model is bundled, and nothing is generated until you pick one.
- **Length**: 「详略」 switches between 「普通」 and 「详细」 in one click. This block is rewritten at the new tier, other blocks follow the setting, and any block opened later uses it. Each tier keeps its own cache, so switching back and forth is free. 普通 uses the configured ratio and ceiling; 详细 uses 0.5 / 1600 instead.
- **Language**: 「语言」 picks between 「跟随」, 「中文」 and 「英文」; the default follows the original reply. A fixed language also governs the tightening pass when the draft runs over budget. Each choice keeps its own cache.
- **Prompt**: 「提示词」 switches between two built-in prompts. 「基准」 is the long-standing one, and a prompt edited in the settings dialog applies to it (the row then reads 「自定义」). 「角色版（实验）」 is written to be read in half a minute: its prompt decides only what to keep (a table of passed checks becomes one sentence, an explanation keeps only its core idea, long lists keep their key items), and the layout is decided in code: a reply with three or more sections becomes 2–4 headed blocks in its own order, anything else one opening sentence and a few points; a reply that ends by asking the reader puts those questions, verbatim, in the first block after the conclusion. Code then checks the draft's layout (opening sentence first, the right number of blocks, no category words as headings, no line packing several points, no block shredded into too many items, no bare label line such as 「常用组合：」) and sends a faulty one back once with what to fix; the draft with fewer faults wins. Each keeps its own cache, so the two can be compared on the same reply at one rewrite each.
- Both prompts notice a reply that ends by asking the reader: 基准 is told no layout, but it is told to keep those questions verbatim at the end of the 速览.
- Folded, the block is one row: 「› 速览 · first sentence」. Expanded, the bottom-right corner shows the tokens this rewrite cost, copies the whole Markdown, and discards the result to redo it. Hovering the token count shows input (with cache hits), output (with thinking) and total, and one line on how it was made: prompt, layout, draft size, number of calls, and which draft was kept.
- **How it was made**: once a rewrite has finished, the `⋯` menu gains 「复制生成过程」, which copies the full record as Markdown: the budget, the layout code decided, each call's instruction and the problems code found, each call's tokens, and the first draft when a second call replaced it.
- **English counted in words**: length is measured by display width (a CJK character counts 1, a letter or half-width symbol half), and an English reply is told its budget in words. English no longer gets half the room a character count would leave it.
- **Long waits say how long**: after 10 seconds, 「整理中」 is followed by 「已等 45 秒」, so a slow rewrite can be told from a stuck one.

## The settings dialog

The menu's last row, 「设置」, opens 「速览设置」 as a small panel over the conversation, drawn with the app's own Modal (not a panel switch of the plugin's own, and not DSH's Settings): the page behind dims and stays exactly where it was. The dialog carries every tuning row the bundle owns except the automation scope: model, 「详略」, 「语言」, 「提示词」, the 基准 prompt (with one-click restore default when customized; while 角色版 is selected the box shows that built-in prompt read-only), trigger length bounds (`min` / `max`), the 普通-tier `ratio` and `cap`, `Temperature`, and the daily token ceiling. 「保存」 stays disabled until something changes, writes the whole page in one request, and turns into a disabled 「已保存」 state while keeping the dialog open; Esc, the × in the title bar, or a click on the dimmed page closes it.

- Every editable field is a live field, so a save takes effect in place: no plugin restart, and no interruption to a rewrite in flight. A prompt or number change makes the next click generate afresh, while a tier, language, built-in prompt or model switch keeps its own cache.
- Only a prompt of your own is written to the profile. Saving the built-in text (or restoring it) leaves the field out, so a later release's built-in prompt reaches you; a verbatim copy that an earlier release saved is recognised and treated the same way.
- 「自动速览」 and its session allow-list are deliberately not on this page: scope is per session and stays in the block's own menu, so a stale copy of the allow-list can never overwrite another block's change.
- The page checks its own numbers before sending (blank fields, out-of-range values, shortest > longest) and the Host re-checks them, surfacing any error directly above the dialog footer instead of after a failed round trip.


## When it appears

- A reply must have prose and be at least `minChars` (default 400) and at most `maxChars` (default 40000) characters long.
- Tool-only turns and turns without prose get no entry point. An interrupted answer skips automatic rewriting only: clicking it by hand still generates. The Host decides with one local request that calls no model.

## Cost and boundaries

- Each generation is one model call. If the result exceeds 1.5× the target length, or a 角色版 draft fails the layout check, the draft is reworked once more and both calls' tokens are shown. That second pass only edits a draft by instruction, so it runs at the lightest reasoning effort the model offers (`off`, `minimal` or `low`, whichever comes first).
- Results are cached per session, turn, model, length tier, language, and built-in prompt: expanding again costs nothing, switching any of them regenerates, and switching back hits the cache.
- Only the reply already stored for this turn is sent to the model you picked. Nothing is uploaded elsewhere, the original reply is not modified, and the session log gains no events.
- With `dailyTokenCap` set, automatic rewriting stops once today's spend (manual generations included) reaches the ceiling and leaves one line in the block; clicking 「速览」 by hand is never capped, and tomorrow starts afresh. The count lives in memory only and resets with the plugin: it is a runaway brake, not a bill.

## Configuration

In the profile's `cordis.patch.yml`, under the `- id: interpreter` row's `config`. Every row in the settings dialog and every menu pick is written back to the same row, so the YAML is only needed for values the dialog does not show.

| Key | Default | Meaning |
| --- | --- | --- |
| `minChars` | `400` | Replies shorter than this are skipped |
| `maxChars` | `40000` | Replies longer than this are skipped |
| `ratio` | `0.35` | Target length as a share of the original |
| `capChars` | `900` | Upper bound for the condensed length, by display width (a letter or half-width symbol counts half) |
| `length` | `normal` | Length tier: `normal` / `detailed`. `detailed` carries its own ratio and ceiling (0.5 / 1600) and overrides `ratio` and `capChars`; `normal` uses the configured values |
| `language` | `auto` | Language of the 速览: `auto` follows the original, `zh` or `en` pins one |
| `variant` | `baseline` | Built-in prompt: `baseline` (基准) / `roles` (角色版, experimental) |
| `temperature` | `0.3` | Sampling temperature |
| `prompt` | built in | Your own rewrite instruction, replacing 基准 only; stored only when it differs from the built-in |
| `dailyTokenCap` | `0` | Tokens automatic mode may spend per local day; `0` means no ceiling. Over it, automation stops but manual clicks still generate |
