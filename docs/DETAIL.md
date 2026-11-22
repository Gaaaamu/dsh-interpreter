# Condensed view

Appends a 「速览」 block below each assistant reply: conclusion first, about a third of the original length, with numbers, code, paths, and commands kept verbatim. The rewrite runs beside the conversation—the main model's system prompt and context stay untouched.

Project page: [dsh-interpreter](https://github.com/Gaaaamu/dsh-interpreter)

## Using it

- **Manual (default)**: a reply long enough shows a single 「› 速览」 row. Click it to generate; nothing is spent until you click.
- **One menu for the switches**: `⋯` at the block's top-right folds every per-block switch into four rows, each showing the value in force. Picking a value applies it and closes the menu; 「返回」 drills back out of the 「模型」 list.
- **Automatic**: in that menu, 「自动速览」 switches between 「手动」, 「本会话」 and 「全部」. Automatic mode covers only replies written after the switch; opening an old session never backfills it. At most 2 rewrites run at once.
- **Model**: the 「模型」 row lists the providers and models configured in DSH. No model is bundled, and nothing is generated until you pick one.
- **Length**: 「详略」 switches between 「普通」 and 「详细」 in one click. This block is rewritten at the new tier, other blocks follow the setting, and any block opened later uses it. Each tier keeps its own cache, so switching back and forth is free. 普通 uses the configured ratio and ceiling; 详细 uses 0.5 / 1600 instead.
- **Language**: 「语言」 picks between 「跟随」, 「中文」 and 「英文」; the default follows the original reply. A fixed language also governs the tightening pass when the draft runs over budget. Each choice keeps its own cache.
- Folded, the block is one row: 「› 速览 · first sentence」. Expanded, the bottom-right corner shows the tokens this rewrite cost, copies the whole Markdown, and discards the result to redo it.

## The settings dialog

The menu's last row, 「设置」, opens 「速览设置」 as a small panel over the conversation, drawn with the app's own Modal (not a panel switch of the plugin's own, and not DSH's Settings): the page behind dims and stays exactly where it was. The dialog carries every row the bundle owns: model, 「详略」, 「语言」, the prompt, the shortest / longest answer, the 普通-tier ratio and ceiling, temperature, and the daily token ceiling. 「保存」 sends the whole page in one write and leaves the dialog open with a 「已保存」 note beside the button; Esc, the × in the title bar, or a click on the dimmed page closes it.

- Every editable field is a live field, so a save takes effect in place: no plugin restart, and no interruption to a rewrite in flight. A prompt or number change makes the next click generate afresh, while a tier, language or model switch keeps its own cache.
- 「自动速览」 and its session allow-list are deliberately not on this page: scope is per session and stays in the block's own menu, so a stale copy of the allow-list can never overwrite another block's change.
- The page checks its own numbers before sending (blank fields, out-of-range values, shortest > longest) and the Host re-checks them, so a mistyped row answers beside the field instead of after a failed round trip.


## When it appears

- A reply must have prose and be at least `minChars` (default 400) and at most `maxChars` (default 40000) characters long.
- Tool-only turns, turns without prose, and interrupted turns get no entry point; the Host decides with one local request that calls no model.

## Cost and boundaries

- Each generation is one model call. If the result exceeds the target length by 1.5×, the draft is condensed once more and both calls' tokens are shown.
- Results are cached per session, turn, model, length tier, and language: expanding again costs nothing, switching any of them regenerates, and switching back hits the cache.
- Only the reply already stored for this turn is sent to the model you picked. Nothing is uploaded elsewhere, the original reply is not modified, and the session log gains no events.
- With `dailyTokenCap` set, automatic rewriting stops once today's own spend reaches the ceiling and leaves one line in the block; clicking 「速览」 by hand is never capped, and tomorrow starts afresh. The count lives in memory only and resets with the plugin: it is a runaway brake, not a bill.

## Configuration

In the profile's `cordis.patch.yml`, under the `- id: interpreter` row's `config`. Every row in the settings dialog and every menu pick is written back to the same row, so the YAML is only needed for values the dialog does not show.

| Key | Default | Meaning |
| --- | --- | --- |
| `minChars` | `400` | Replies shorter than this are skipped |
| `maxChars` | `40000` | Replies longer than this are skipped |
| `ratio` | `0.35` | Target length as a share of the original |
| `capChars` | `900` | Upper bound for the condensed length |
| `length` | `normal` | Length tier: `normal` / `detailed`. `detailed` carries its own ratio and ceiling (0.5 / 1600) and overrides `ratio` and `capChars`; `normal` uses the configured values |
| `language` | `auto` | Language of the 速览: `auto` follows the original, `zh` or `en` pins one |
| `temperature` | `0.3` | Sampling temperature |
| `prompt` | built in | The rewrite instruction; change it to change the style |
| `dailyTokenCap` | `0` | Tokens automatic mode may spend per local day; `0` means no ceiling. Over it, automation stops but manual clicks still generate |
