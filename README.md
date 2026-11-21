# dsh-interpreter

在 DSH 每条回答下方生成一个独立的「速览」摘要区块，提炼核心结论与要点，在不修改原文、不占用主对话上下文的前提下提升阅读效率。

Generates an independent "Condensed View" summary block below each DSH response, extracting core conclusions and key points to improve reading efficiency without modifying the original text or consuming main conversation context.

[中文](#中文) · [English](#english)

---

## 中文

### 功能概述

擅长执行任务的模型往往会在回答中包含大量推理过程、验证细节与交互寒暄，导致核心结论被拉长。`dsh-interpreter` 通过旁路调用，在每条回答正下方追加一段约原文三分之一长度的「速览」摘要，帮助用户先把握结论（能否实现、如何操作、注意事项），再按需核对原文细节。

### 核心特性

* **结论先行，保留精确项**：输出结论加最多 5 条要点；表格、代码块、命令行、文件路径、数字与报错信息保持原样，不做改写。
* **旁路运行，零上下文侵入**：基于已落盘的回答发起独立调用，输出仅渲染于前端界面。不修改主模型的系统提示词与工具定义，不写入会话日志（Session Log），不影响长上下文与 Prefix 缓存。
* **独立模型路由**：摘要生成可指定与主对话不同的模型（例如主对话使用强编码模型，摘要侧选用表达与概括能力更强的模型），互不干扰。
* **原生样式融合**：排版、字号、代码块、表格与链接样式直接复用 DSH 主题变量，随宿主主题与字号设置同步变化；右下角实时显示本次摘要消耗的 Token 数量（悬停可查看输入 / 输出明细）。

### 安装与使用

#### 1. 安装
* **插件市场（推荐）**：打开 DSH，前往「设置」→「插件」→「市场」，搜索 `dsh-interpreter`（或「速览」），安装后按提示重载页面。
* **手动安装**：在对应 Profile 的 `package.json` 中添加依赖并声明至 `dsh.profile.bundles`，随后重启 DSH：
  ```json
  {
    "dependencies": { "dsh-interpreter": "link:D:/path/to/dsh-interpreter" },
    "dsh": { "profile": { "bundles": ["dsh-interpreter"] } }
  }
  ```

#### 2. 首次配置与运行模式
插件安装后默认处于**手动模式**，不会自动触发调用产生费用：
1. 点击回答下方的「› 速览」展开区块，在右上角「模型」下拉菜单中选择当前环境中可用的 `provider / model`。
2. 根据使用习惯切换运行模式（选择存进**当前 Profile 目录下**的 `cordis.patch.yml`，即其中 `- id: interpreter` 那一行的 `config`，由界面经 DSH 的配置接口写回。模型、模式和白名单是 DSH 的 live 字段，保存后就地生效，插件不重启，正在生成的速览不受影响）：

| 模式 | 行为说明 |
| :--- | :--- |
| `手动`（默认） | 不自动生成，仅在点击「› 速览」时触发请求。在「本会话」模式下切换到它，只把当前会话移出白名单，其他会话不受影响 |
| `本会话` | 仅对加入白名单的会话中，加入之后的新回答自动生成摘要 |
| `全部` | 开启之后符合长度条件的新回答自动生成摘要 |

自动模式只管**开启之后**新写出来的回答：翻开旧会话、或重启 DSH 之后，以前的回答仍然只是一行「› 速览」，点了才生成，不会一口气补跑整段历史；你中途停掉的回答也不会自动整理，点了才整理。同一时间最多 2 个改写在跑，其余排队。

### 参数配置

在**当前 Profile 目录下**的 `cordis.patch.yml` 里，通过 `- id: interpreter` 那一行的 `config` 字段调整参数（优先级：内置默认 < 该行 `config`；界面上的选择也写回这一行）。

> 注意：插件包里也有一个同名的 `cordis.patch.yml`，那只是安装时的初始值。界面第一次保存后，Profile 里的这一行会带上完整的 `config`（包括当时的 `minChars` 等），从此整份替代插件包里的初始值；之后要调参，请改 Profile 目录下的那份。


| 参数 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `minChars` | `400` | 触发摘要的最小字符数，短于该长度的回答将被跳过 |
| `maxChars` | `40000` | 触发摘要的最大字符数，超出该长度的回答将被跳过 |
| `ratio` | `0.35` | 摘要目标字数占原文长度的比例 |
| `temperature` | `0.3` | 摘要生成的采样温度 |
| `prompt` | 内置 | 摘要改写指令，可通过自定义指令调整输出风格 |

### 模型选择建议

摘要质量取决于模型的**信息重组与表达能力**，而非单纯的推理或编码能力。参考 [Artificial Analysis AA-PersonalityBench](https://artificialanalysis.ai/evaluations/aa-personalitybench/traits/metaphorical) 中的 `Metaphorical`、`Answer First`、`Bottom-Line Summary` 与 `Scannable` 等指标，建议采用「主对话负责精确执行，旁路模型负责结论提炼与高可读性表达」的组合方式。

### 费用与隐私说明

* **计费与缓存**：每次生成对应一次模型调用；若首次生成结果超出字数预算的 1.5 倍，插件会基于草稿自动执行二次压缩（界面显示的 Token 数为两次调用之和）。生成结果按「模型 + 会话 + 轮次序号」缓存，重复展开不重复计费；换了模型会按新模型重新生成，切回原来的模型时，之前的结果仍然有效。
* **数据边界**：除将当前轮次已生成的回答发送至用户所选的摘要模型接口外，不向任何第三方上传数据。

### 开发

```bash
npm test
```

测试用 Node 自带的 `node:test`，不装任何依赖：Host 端用模拟的会话日志和模型流驱动三个路由，Client 端测链接过滤和 Markdown 解析。

### 迭代计划 (Roadmap)

按优先级排列。

#### 近期：让结论先到
1. **流式输出**：改写结果边生成边显示，第一句结论出来即可阅读；超出预算时先展示首版，二次压缩完成后再替换。
2. **长度上限**：目标长度改为「比例 + 绝对上限」，避免长回答产出长速览；速览中的代码块默认折叠，或仅保留第一条需要执行的命令。
3. **更靠前的位置**：若宿主提供回答顶部插槽，将结论置于回答上方；否则在回答完成时提供「跳到速览」提示。

#### 中期：降低理解成本
5. **模式分层**：全局默认模式移至设置页，块内只保留「本会话自动速览」开关，明确每个控件的作用范围。
6. **按条件显示入口**：仅在符合长度条件的回答下显示「› 速览」，短回答与纯工具轮次不再显示入口。
7. **首次引导**：未选模型时点击速览，直接弹出模型卡片并标注推荐项，选定后立即生成当前这一条。
8. **可视化设置页**：在前端调整长度档位（简短 / 适中）、模型与提示词；`temperature`、`minChars`、`maxChars` 收入高级选项，无需修改 YAML。

#### 后续：扩展价值
9. **复制与引用**：一键复制速览，或引用到输入框继续追问（仅在用户主动操作时进入对话上下文）。
10. **要点溯源**：每条要点可跳转至原文对应段落，便于核对。
11. **缓存持久化**：生成结果落盘保存（仍不写入 Session Log），重启 DSH 后重复展开不再计费。
12. **质量反馈**：本地记录「有用 / 太长 / 漏了重点」等反馈，为预设调优提供依据。
13. **场景化预设 (Presets)**：将「提示词 + 摘要模型 + 目标长度」封装为预设，按任务类型（代码配置、概念解释、数据分析）匹配，支持 JSON 导入/导出并内置常用模板。

#### 待评估
* **多视角切换**（类比解析、场景化叙述、配合可视化技能生成图表等）：这类视角偏向「解释」而非「压缩」，需先明确产品定位再决定是否推进。
* **本轮变更摘要**：面向 agent 类会话，将整轮的工具调用纳入，汇总改动的文件、执行的命令以及需要用户决定的事项。

### 许可证

MIT

---

## English

### Overview

Models optimized for complex tasks often include extensive reasoning steps, verification logs, and conversational filler in their replies, burying the actual takeaway. `dsh-interpreter` makes a side-channel model call to append a concise "Condensed View" block (roughly one-third the original length) directly below each response. It lets you grasp the conclusion immediately—whether it works, how to do it, and what pitfalls to watch out for—while keeping the original response intact for verification.

### Key Features

* **Conclusion-First with Technical Fidelity**: Presents a bottom-line conclusion followed by up to five key bullet points. Tables, code blocks, CLI commands, file paths, numbers, and error strings are preserved verbatim.
* **Non-Intrusive Side-Channel Execution**: Reads the finalized response from the session log and renders the output only in the UI. It never alters the main model's system prompt or tool definitions, adds no events to the session log, and preserves main context and prefix caching.
* **Independent Model Routing**: Use a dedicated model for summarization without affecting the main conversation's model selection.
* **Native UI Integration**: Typography, inline-code chips, tables, and link styles inherit directly from DSH theme tokens. A token counter in the bottom-right corner reports the exact cost of each rewrite (hover for input / output / total breakdown).

### Installation & Usage

#### 1. Install
* **Plugin Market (Recommended)**: Go to Settings → Plugins → Market, search for `dsh-interpreter`, install, and reload the page.
* **Manual Installation**: Add the dependency to your profile's `package.json`, list it under `dsh.profile.bundles`, and restart DSH:
  ```json
  {
    "dependencies": { "dsh-interpreter": "link:D:/path/to/dsh-interpreter" },
    "dsh": { "profile": { "bundles": ["dsh-interpreter"] } }
  }
  ```

#### 2. Initial Setup & Modes
The plugin defaults to **Manual** mode so no calls are made automatically upon installation:
1. Click "› 速览" below a response and open the "模型" (Model) menu to select an available `provider / model` exposed by `ctx.llm`.
2. Switch modes as needed (the choice lives in **the profile directory's** `cordis.patch.yml`, in the `config` of its `- id: interpreter` row, written back by the UI through DSH's config API. Model, mode and allow-list are DSH live fields: a save takes effect in place without restarting the plugin, so rewrites in progress are not interrupted):

| Mode | Behavior |
| :--- | :--- |
| `手动` (Manual, default) | Generates a summary only when clicked. Under This Session mode, choosing it only removes the current session from the allow-list |
| `本会话` (This Session) | Automatically summarizes new responses in allow-listed sessions, from the moment they were added |
| `全部` (All) | Automatically summarizes every eligible new response after it is switched on |

Automatic modes only cover answers written **after** they were switched on: opening an old session, or restarting DSH, leaves earlier answers as a folded 「› 速览」 line that waits for a click, so history is never rewritten in bulk. An answer you stopped midway is skipped too until you click. At most two rewrites run at once; the rest queue.

### Configuration

Parameters can be tuned in **the profile directory's** `cordis.patch.yml`, under `config` of its `- id: interpreter` row (precedence: built-in defaults < that row's `config`; UI choices are written back to the same row).

> Note: the plugin package ships its own `cordis.patch.yml`; that file only seeds the first install. After the first save from the UI, the profile row carries the complete `config` (including the `minChars` and other values in force at the time) and replaces the package's values entirely, so tune the profile directory's copy from then on.


| Key | Default | Description |
| :--- | :--- | :--- |
| `minChars` | `400` | Minimum character count required to trigger summarization |
| `maxChars` | `40000` | Maximum character count eligible for summarization |
| `ratio` | `0.35` | Target summary length as a ratio of the original response |
| `temperature` | `0.3` | Sampling temperature for the rewrite call |
| `prompt` | Built-in | Custom rewrite instruction to adjust the output style |

### Model Selection

Effective summarization relies on **explanatory clarity and information restructuring** rather than raw coding or reasoning capability. Referring to traits like `Metaphorical`, `Answer First`, `Bottom-Line Summary`, and `Scannable` on [AA-PersonalityBench by Artificial Analysis](https://artificialanalysis.ai/evaluations/aa-personalitybench/traits/metaphorical), we recommend pairing a task-focused model for the main dialogue with an expressive, conclusion-first model for the condensed view.

### Cost & Privacy

* **Billing & Caching**: Each rewrite is a standalone model call. If the initial draft exceeds 1.5× the target length budget, a second compression pass is executed automatically (the displayed token usage reflects the sum of both calls). Results are cached by model, session and sequence number; reopening a block is free, a new model rewrites afresh, and switching back to a previous model reuses its results.
* **Data Boundary**: No data is uploaded anywhere except sending the finalized turn response to your configured rewrite provider.

### Development

```bash
npm test
```

The suite runs on Node's built-in `node:test` with no dependencies: the Host routes are driven against a scripted session log and model stream, and the Client's link filter and Markdown reader are tested directly.

### Roadmap

Listed by priority.

#### Near Term: Put the Conclusion First
1. **Streaming Output**: Render the rewrite as it is generated, so the bottom line is readable as soon as its first sentence lands; when a draft exceeds the budget, show it first and swap in the tightened version once ready.
2. **Length Cap**: Set the target length as a ratio with an absolute ceiling, so long answers no longer produce long summaries; code blocks inside the summary fold by default, or only the first command to run is kept.
3. **Earlier Placement**: If the host exposes a slot above the answer, place the conclusion there; otherwise offer a "jump to summary" hint when the answer finishes.

#### Mid Term: Easier to Understand
5. **Layered Modes**: Move the global default mode to the settings page and keep only an "auto-summarize this session" toggle in the block, so the scope of each control is clear.
6. **Entry Only Where It Applies**: Show 「› 速览」 only under answers that meet the length threshold; short answers and tool-only turns get no entry.
7. **First-Run Guidance**: When no model is selected, clicking the block opens the model card directly with recommended picks marked, then generates the current answer right after a pick.
8. **Visual Settings Page**: Adjust a length level (brief / standard), the model, and the prompt in the UI; `temperature`, `minChars`, and `maxChars` move under advanced options, with no YAML editing required.

#### Later: More Value per Summary
9. **Copy & Quote**: Copy the summary in one click, or quote it into the composer to follow up (it enters the conversation context only when you do this yourself).
10. **Traceable Points**: Each bullet links back to the paragraph of the original it came from, for quick verification.
11. **Persistent Cache**: Save results to disk (still outside the Session Log), so reopening after a DSH restart costs nothing.
12. **Quality Feedback**: Record local feedback such as "useful / too long / missed the point" to guide preset tuning.
13. **Scenario Presets**: Bundle "prompt + model + target length" into presets matched to task types (code/config, conceptual explanation, data analysis), with JSON import/export and curated built-in templates.

#### Under Consideration
* **Alternate Views** (analogy-based explanation, narrative walkthrough, visual diagrams): these lean toward *explaining* rather than *condensing*; the product's positioning needs settling before committing to them.
* **Turn Change Digest**: For agent sessions, cover the whole turn's tool calls and summarize the files changed, the commands run, and the decisions left to the user.

### License

MIT
