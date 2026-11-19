# dsh-interpreter

Provide a condensed view for AI-generated content. It extracts and presents core conclusions alongside the original response, enhancing reading efficiency.

[中文](#中文) · [English](#english)

---

## 中文

### 功能概述
AI 模型生成的回答往往包含大量过程性描述、验证信息或冗余的交互用语，导致关键信息提取效率较低。`dsh-interpreter` 通过在回答下方生成一个独立的“速览”块，直接呈现结论和要点，实现快速扫描与信息重组。

### 核心优势
* **高效摘要**：在保留原文的同时，提供约原文三分之一长度的结论与要点速览。
* **信息完整**：表格、代码、命令及路径等关键技术信息保持原样，不做改写。
* **独立处理**：基于独立的模型调用，不干扰主对话的上下文或缓存策略。
* **样式集成**：样式完全遵循 DSH Markdown 主题，提供一致的阅读体验。

### 使用指南
#### 安装
1. **插件市场（推荐）**：前往「设置」→「插件」→「市场」，搜索 `dsh-interpreter` 进行安装。
2. **手动安装**：在 profile 的 `package.json` 中配置依赖，并将其添加到 `dsh.profile.bundles`，随后重启 DSH。

#### 配置与模式
初次安装时，插件处于**手动模式**。
* **手动模式**：仅在点击每条回答下方的「› 速览」时生成摘要。
* **全部模式**：自动为每一条回答生成摘要。
* **本会话模式**：仅在白名单会话中自动生成摘要。

配置结果将持久化保存在 profile 目录下的 `dsh-interpreter.json` 文件中。

### 调参说明
可在 `cordis.patch.yml` 中通过 `- id: interpreter` 的 `config` 字段进行调整：

| 参数 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `minChars` | 400 | 短于此长度的回答不进行摘要 |
| `maxChars` | 40000 | 超出此长度的回答不进行摘要 |
| `ratio` | 0.35 | 目标摘要长度占比 |
| `temperature` | 0.3 | 模型生成时的随机度 |

### 关于模型选择
摘要生成更依赖模型的表达与信息重组能力。建议在主对话中使用逻辑强、干活稳的模型，而在摘要侧选择表达能力强、擅长先讲结论的模型。

### 其他说明
* **成本**：摘要生成属于独立模型调用，费用根据模型提供商标准计算。
* **无侵入性**：原回答内容不被修改，Session 日志不新增事件，摘要仅呈现于界面。

---

## English

### Overview
AI models often generate responses filled with procedural descriptions, verification details, and pleasantries, which can bury key conclusions. `dsh-interpreter` improves efficiency by generating an independent "condensed view" block below each response, highlighting conclusions and core points for quick scanning.

### Core Features
* **Efficient Summarization**: Provides a concise summary—approximately one-third the length of the original—while keeping the full original text intact.
* **Information Integrity**: Keeps tables, code, commands, and paths unchanged, ensuring technical precision.
* **Independent Processing**: Uses separate model calls, avoiding any impact on the main conversation's context or caching strategies.
* **Seamless Integration**: Follows DSH Markdown styling, ensuring consistent visual integration with the UI.

### Usage
#### Installation
1. **Plugin Market (Recommended)**: Go to Settings → Plugins → Market, search for `dsh-interpreter`, and install.
2. **Manual Installation**: Add the dependency to your profile's `package.json` and include it in `dsh.profile.bundles`, then restart DSH.

#### Configuration and Modes
The plugin starts in **manual mode**:
* **Manual Mode**: Generates a summary only when you click "› 速览" under a response.
* **All Mode**: Automatically generates summaries for every response.
* **This Session Mode**: Automatically generates summaries only for sessions on the allow-list.

Settings are persisted in `dsh-interpreter.json` within the profile directory.

### Tuning
Adjust parameters via the `- id: interpreter` section in `cordis.patch.yml`:

| Key | Default | Description |
| :--- | :--- | :--- |
| `minChars` | 400 | Minimum length to trigger summary |
| `maxChars` | 40000 | Maximum length to trigger summary |
| `ratio` | 0.35 | Target length ratio |
| `temperature` | 0.3 | Model randomness |

### Model Selection
Summarization relies on a model's ability to restructure and communicate information effectively. It is recommended to use a robust model for the main dialogue, and a model with strong summarizing and metaphorical capabilities for the condensed view.

### Notes
* **Costs**: Summarization is a separate model call and is billed according to your model provider's pricing.
* **Non-intrusive**: The original response is never modified; no events are added to the session log, and summaries are displayed only in the UI.
