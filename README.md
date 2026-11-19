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
2. 根据使用习惯切换运行模式（配置持久化保存在当前 Profile 目录（DSH 提供的 `profileContext.dir`）下的 `dsh-interpreter.json` 中，目录不存在会自动创建；文件无法读取时回退到手动模式）：

| 模式 | 行为说明 |
| :--- | :--- |
| `手动`（默认） | 不自动生成，仅在点击「› 速览」时触发请求。在「本会话」模式下切换到它，只把当前会话移出白名单，其他会话不受影响 |
| `本会话` | 仅对加入白名单的会话中，加入之后的新回答自动生成摘要 |
| `全部` | 开启之后符合长度条件的新回答自动生成摘要 |

自动模式只管**开启之后**新写出来的回答：翻开旧会话、或重启 DSH 之后，以前的回答仍然只是一行「› 速览」，点了才生成，不会一口气补跑整段历史。同一时间最多 2 个改写在跑，其余排队。

### 参数配置

可在 `cordis.patch.yml` 的 `- id: interpreter` 下通过 `config` 字段调整参数（优先级：内置默认 < YAML `config` < `dsh-interpreter.json` 界面配置）：

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

* **计费与缓存**：每次生成对应一次模型调用；若首次生成结果超出字数预算的 1.5 倍，插件会基于草稿自动执行二次压缩（界面显示的 Token 数为两次调用之和）。生成结果按「会话 + 轮次序号」缓存，重复展开不重复计费；切换模型后缓存自动清空。
* **数据边界**：除将当前轮次已生成的回答发送至用户所选的摘要模型接口外，不向任何第三方上传数据。

### 迭代计划 (Roadmap)

1. **可视化设置页**：支持在前端界面直接调整 `minChars`、`maxChars`、`ratio`、`temperature` 及编辑提示词，无需修改 YAML。
2. **场景化预设 (Presets)**：将「提示词 + 摘要模型 + 目标长度」封装为预设，支持按模型特性与任务类型（代码配置、概念解释、数据分析）灵活匹配，并逐步支持自动匹配。
3. **多视角快捷切换**：在同一摘要栏提供多种预设入口（如类比解析、场景化叙述、配合可视化技能生成图表等）。
4. **预设导入与共享**：支持以 JSON 格式导入/导出预设，并内置常用预设模板。

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
2. Switch modes as needed (persisted in `dsh-interpreter.json` in the launched profile's directory, DSH's `profileContext.dir`, created if missing; if the file cannot be read, the plugin falls back to manual mode):

| Mode | Behavior |
| :--- | :--- |
| `手动` (Manual, default) | Generates a summary only when clicked. Under This Session mode, choosing it only removes the current session from the allow-list |
| `本会话` (This Session) | Automatically summarizes new responses in allow-listed sessions, from the moment they were added |
| `全部` (All) | Automatically summarizes every eligible new response after it is switched on |

Automatic modes only cover answers written **after** they were switched on: opening an old session, or restarting DSH, leaves earlier answers as a folded 「› 速览」 line that waits for a click, so history is never rewritten in bulk. At most two rewrites run at once; the rest queue.

### Configuration

Parameters can be tuned under `config` of `- id: interpreter` in `cordis.patch.yml` (precedence: built-in defaults < YAML `config` < `dsh-interpreter.json`):

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

* **Billing & Caching**: Each rewrite is a standalone model call. If the initial draft exceeds 1.5× the target length budget, a second compression pass is executed automatically (the displayed token usage reflects the sum of both calls). Results are cached by session and sequence number; reopening a block is free, and switching models clears the cache.
* **Data Boundary**: No data is uploaded anywhere except sending the finalized turn response to your configured rewrite provider.

### Roadmap

1. **Visual Settings Page**: Adjust `minChars`, `maxChars`, `ratio`, `temperature`, and custom prompts directly in the UI without editing YAML.
2. **Scenario Presets**: Bundle "prompt + model + target length" into presets tailored to specific model behaviors or task types (code/config, conceptual explanation, data analysis), with optional auto-matching.
3. **One-Click Alternate Views**: Expose quick preset switches on the summary bar (e.g., analogy-based explanation, narrative walkthrough, or visual diagrams).
4. **Preset Sharing**: Import/export presets as JSON and ship curated built-in templates.

### License

MIT
