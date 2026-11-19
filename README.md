# dsh-interpreter（速览）

> 把「能干活、不说人话」的回答，翻译成人话。

每条回答跑完之后，在它下面追加一段更短、更好读的版本。原文一个字都不动，会话记录不动，只多一块。

[中文](#中文) · [English](#english)

---

## 中文

### 它解决什么

擅长干活的模型不太擅长说话。回答里塞满过程、验证、自我复盘、客套，结论常常淹在第三十行。你真正想知道的其实只有三件事：能不能做、怎么做、有什么坑。

速览把这三件事拎出来，放在原文正下方：

- 一眼先看到一行「› 速览」，点开是**结论 + 最多 5 条要点**，长度约原文的三分之一。
- 表格还是表格，代码还是代码，命令、路径、数字原样照抄 —— 该抄的地方不许改写。
- 右边可以换一个**专门管说人话的模型**来做这件事，跟主对话用的模型互不干扰。
- 右下角一行小字：这条改写花了多少 token。

读原文是检查，读速览是理解。两个都在，随便切换。

### 为什么不是加一句系统提示词

把「请说人话」写进主模型的系统提示词，看着更省事，其实代价不小：每个模型都得单独调、每次请求都要多背一截指令（还常把它的 prefix 缓存打掉）、换个模型就得重调一遍，而且本来该精确的地方可能因为这句要求变糊。

速览走的是旁路：

- **主模型保持原生状态**。系统提示词、工具定义、上下文一个字都不动，不需要为这个功能做任何配置。
- **解释是一次独立调用**。输入是这一轮已经落盘的回答，输出只进界面，主对话的上下文一个 token 都没多。
- **不打扰干活的那一侧**。长上下文、prefix 缓存、工具轮次都不受影响；改写失败最多是这一块空着，主流程照常。
- **换语气不用改代码**。想换个说法、换套预设，动的永远是旁路这一侧。

### 安装

**插件市场（推荐）**：设置 → 插件 → 市场，搜 `dsh-interpreter`（或搜「速览」），安装后按提示重载页面。

**手动装在某个 profile 里**：profile 的 `package.json` 里把依赖指向这个目录，并把它列进 `dsh.profile.bundles`：

```json
{
  "dependencies": { "dsh-interpreter": "link:D:/path/to/dsh-interpreter" },
  "dsh": { "profile": { "bundles": ["dsh-interpreter"] } }
}
```

然后重启 DSH。

### 第一次用

装上之后是**手动模式**：不自动花钱，每条回答下面只有一行「› 速览」，点一下才生成。

第一次点之前先选模型：点「模型」，从列表里挑一个你账号里能用的（列表就是这台机器上 `ctx.llm` 能看到的全部 provider / model）。没选之前只会提示一句，不发请求。

觉得好用了，在那一行右边把模式切成「全部」。

### 三种模式

| 模式 | 行为 |
| --- | --- |
| `全部` | 每条回答自动生成 |
| `本会话` | 只有加进白名单的会话自动生成 |
| `手动` | 一条都不自动生成，等你点（默认） |

选中结果存在 profile 目录的 `dsh-interpreter.json`，删掉这个文件就回到内置默认。

### 调参

`cordis.patch.yml` 里 `- id: interpreter` 的 `config`：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `minChars` | `400` | 短于这个长度不整理 |
| `maxChars` | `40000` | 长于这个长度不整理 |
| `ratio` | `0.35` | 目标字数占原文的比例 |
| `temperature` | `0.3` | |
| `prompt` | 内置 | 改写指令，换掉它就换了风格 |

`provider` / `model` 不要写进 YAML：界面里的选择优先，写了也不生效。生效顺序是 内置默认 → YAML 的 `config` → `dsh-interpreter.json`。

### 挑一个会说人话的模型

这件事吃的是**解释力**，不是智力。干活最强的那个不一定最会打比方。

[Artificial Analysis 的 AA-PersonalityBench](https://artificialanalysis.ai/evaluations/aa-personalitybench/traits/metaphorical) 里有一项叫 **Metaphorical**（归在 Expressiveness 指数下），问的就是「模型会不会用类比和比喻把概念落到地上」。截至 2026 年 11 月，这一项排在最前面的是 **Gemini 4 Argon (High)**。同一张榜上的 **Answer First**、**Bottom-Line Summary**、**Scannable**、**Information Dense** 几项，取向和速览完全一致 —— 先给结论、能扫读、信息密。

建议的做法：主对话用一个能干活的模型，速览换一个比喻多、先说结论的模型。两个模型各干各的，互不影响。

### 花多少钱

- 一次改写就是一次模型调用，token 数写在块右下角（鼠标停上去能看到输入 / 输出 / 合计）。
- 模型没按预算压下来时会带着草稿再压一遍 —— 那是两次计费，块里报的是两次之和。
- 结果按「会话 + 序号」缓存，同一块反复展开不重复花钱；换模型才清缓存。

### 它不动什么

- 原文还在上面，一个字都没改。
- Session 日志没有新增事件，后续轮次的模型看不到这段速览。
- 除了改写时把那一轮的回答发给你自己配置的 provider，不上传任何东西。

### Roadmap

按顺序做，不承诺时间：

1. **设置页**：不用改 YAML 就能调 `minChars` / `maxChars` / `ratio` / `temperature`，以及编辑提示词。
2. **预设（presets）**：一份预设 = 提示词 + 用哪个模型来解释 + 目标长度。两个维度都想要：
   - **按模型配**：模型的脾气不一样。对 GPT 系要更狠地逼它先说结论；对爱比喻的模型要压住它别跑太远；对上下文很长的模型可以让它一次多吃点原文。
   - **按任务配**：代码 / 配置类的回答要死死保住命令和路径；概念解释类更适合打比方、讲例子；数据分析类要保住数字和口径。
   - 再往后：按主对话当前的模型 id 或这一轮的形态自动挑一份预设，少点手动。
3. **换一种说法的一键入口**：同一个位置再挂几个预设 —— 「打个比方」「讲个小故事」「画成图（接 visualize skill）」。不是加功能，是加预设。
4. **预设分享**：导出成 JSON，或内置几份跟着插件一起发。

### 许可证

MIT。

---

## English

### What it does

Models that are good at work are often bad at talking. Their answers are full of process, verification, self-review and pleasantries, and the actual conclusion is buried somewhere around line 30. What you wanted to know is usually just three things: is it possible, how do I do it, what will bite me.

**dsh-interpreter** pulls those three things out and puts them right below the answer:

- A single line 「› 速览」 under the reply; open it for the **conclusion plus at most five bullets**, about one third the length.
- Tables stay tables, code stays code. Commands, paths, numbers and error strings are copied verbatim.
- The rewrite can use a **different model from the one that wrote the answer** — pick it inside the block.
- A small token counter in the corner tells you what that rewrite cost.

Reading the original is checking. Reading the condensed view is understanding. Both stay, one click apart.

### Why not just add a system prompt?

Telling the working model "please write plainly" in its system prompt looks cheaper, and it is not: every model needs its own tuning, every request carries extra instructions (often invalidating its prefix cache), switching models means retuning, and the places that must stay precise can get sloppier.

dsh-interpreter takes a side way instead:

- **The working model stays native.** System prompt, tool definitions and context are untouched; nothing needs configuring for this feature.
- **The explanation is a separate call.** It reads the answer already written to the session log and returns text that only reaches the UI. Not one extra token in the main conversation.
- **The working side is never disturbed.** Long context, prefix cache and tool turns behave exactly as before; a failed rewrite only leaves this block empty.
- **Changing the voice changes nothing else.** A different tone or preset lives entirely on the side path.

### Install

**Plugin market (recommended)**: Settings → Plugins → Market, search `dsh-interpreter` (or `速览`), install, then reload the page.

**Manually, into one profile**: point a dependency at this directory and list it as a bundle:

```json
{
  "dependencies": { "dsh-interpreter": "link:D:/path/to/dsh-interpreter" },
  "dsh": { "profile": { "bundles": ["dsh-interpreter"] } }
}
```

Restart DSH afterwards.

### First run

It starts in **manual** mode: nothing is rewritten on its own, so installing costs nothing. Each answer gets one folded 「› 速览」 line; click it to generate.

Pick a model first: open 「模型」 and choose one your account can reach (the list is whatever `ctx.llm` exposes on this machine). Until then a click only prints a hint and sends no request.

Once it earns its keep, switch the mode to 「全部」 on that same line.

### The three modes

| Mode | Behaviour |
| --- | --- |
| `全部` (all) | Every answer is rewritten |
| `本会话` (this session) | Only sessions added to the allow-list |
| `手动` (manual) | Nothing until you ask — the default |

The choice lives in `dsh-interpreter.json` in the profile directory. Delete that file to fall back to the built-in defaults.

### Tuning

`config` of `- id: interpreter` in `cordis.patch.yml`:

| Key | Default | Meaning |
| --- | --- | --- |
| `minChars` | `400` | Answers shorter than this are left alone |
| `maxChars` | `40000` | Answers longer than this are left alone |
| `ratio` | `0.35` | Target length, as a share of the original |
| `temperature` | `0.3` | |
| `prompt` | built in | The rewrite instruction; replace it to change the style |

Do not put `provider` / `model` in YAML: the in-page choice wins and silently overrides it. Precedence is built-in defaults → YAML `config` → `dsh-interpreter.json`.

### Pick a model that talks like a person

This job needs **explanatory power**, not raw intelligence. The strongest model at getting work done is not always the best at making a point land.

[AA-PersonalityBench by Artificial Analysis](https://artificialanalysis.ai/evaluations/aa-personalitybench/traits/metaphorical) has a trait called **Metaphorical** (under its Expressiveness index): does the model use analogies and figurative language to make ideas tangible? As of November 2026, **Gemini 4 Argon (High)** sits at the top of that board. The same benchmark's **Answer First**, **Bottom-Line Summary**, **Scannable** and **Information Dense** traits point in the same direction as this plugin: lead with the answer, stay scannable, stay dense.

A good split: let your working model do the work, and give the rewrite to a model that reaches for metaphors and leads with the conclusion. They never share context.

### What it costs

- One rewrite is one model call; the token count sits in the corner of the block (hover for input / output / total).
- If the result overshoots the length budget it is compressed a second time, with the draft in hand. That is billed twice, and the block reports the sum.
- Results are cached per session and sequence number, so reopening a block is free. Changing the model clears the cache.

### What it does not touch

- The original answer is untouched.
- No events are added to the session log, so later turns never see the rewrite.
- Nothing is uploaded anywhere, except the finished answer to the provider you configured for the rewrite.

### Roadmap

In order, no dates promised:

1. **Settings page** — adjust `minChars` / `maxChars` / `ratio` / `temperature` and edit the prompt without touching YAML.
2. **Presets** — a preset = a prompt, a model to explain with, and a target length. Wanted on two axes:
   - **Per model**: personalities differ. GPT-family models need to be pushed harder to lead with the conclusion; metaphor-happy models need to be kept from wandering; long-context models can be fed more of the original at once.
   - **Per task**: code and config answers must keep commands and paths intact; conceptual answers want analogies and examples; data answers must keep numbers and definitions straight.
   - Later: pick a preset automatically from the current model id or the shape of the turn.
3. **One-click alternate tellings** — more presets on the same line: “explain with an analogy”, “tell it as a short story”, “draw it” (wired to a visualize skill). Presets, not new features.
4. **Shareable presets** — export to JSON, or ship a few with the plugin.

### License

MIT.
