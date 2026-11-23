# 速览（Interpreter）

在每条回答下面加一段「说人话」的版本：先给结论，再分点讲清楚，整体约为原文的三分之一；事实、数字、路径、命令、代码原样保留。改写用哪个模型由你在块内菜单或设置弹窗里挑，跟主对话用的模型无关，也不会花主对话的上下文。

## 为什么不是加一句提示词

把「请说人话」写进主模型的系统提示词，看着更省事，代价却不小：每个模型都得单独调、每次请求都要多背一截指令（还常把它的 prefix 缓存打掉）、换模型就得重调一遍。速览走旁路：主模型的系统提示词、工具定义、上下文一个字都不动，解释是一次独立调用 —— 输入是这一轮已经落盘的回答，输出只进界面。主对话的上下文一个 token 都没多，改写失败也只是这一块空着。

## 它不动什么

- 原文还在上面，一个字都没改。
- Session 日志没有新增事件，会话记录和上下文都不受影响。
- 后面轮次的模型看不到这段速览，它只出现在界面上。

## 什么时候会出现

- 回答要有正文，且长度落在 `minChars`（默认 400 字）与 `maxChars`（默认 40000 字）之间。
- 纯工具轮次、没有正文的轮次，以及短于 `minChars` 或长于 `maxChars` 的回答，连「› 速览」这一行都不出现：点了也只会回一句「这条没什么可压的」，不如别放。判定由 Host 侧做（`POST /interpreter/probe`），一次本地请求、不调模型、不进缓存。
- 还要看此刻的模式：`全部` 每条都做，`本会话` 只做加入白名单的会话，`手动` 一条都不做，等你去点。模式按「当前会话」显示：本会话模式下，不在白名单里的会话显示为 `手动`；在白名单里的会话切回 `手动`，只把它自己移出白名单。
- 自动模式只管打开之后（以及本次启动 DSH 之后）新写出来的回答，且跳过被用户中途打断（`interrupted`）的回答。翻开旧会话时，以前的回答一律是收起的一行「› 速览」，点了才生成，不会补跑整段历史。同一时间最多 2 个改写在跑，其余排队。
- 若配置了 `dailyTokenCap`（大于 0），当天插件自身累计用量（含手动生成）达到上限后会停下，该轮收起为一行 `› 速览 · 今日额度已用完`，点开可看当日用量并通过「现在整理这一条」手动触发；手动点击不受额度限制，次日按本机自然日自动重置。
- 链接只认网页（`http` / `https`）、`file:`、`mailto:` 和本地路径；`javascript:`、`data:` 这类地址只留文字、不做成链接。
- 默认是 `手动`：装上之后，够长的回答下面只有一行「› 速览」，点一下才生成，不会自己花钱。用顺手了在右上角 `⋯` 菜单里切到「本会话」或「全部」。

## 第一次用

不自带模型。点开速览，点右上角 `⋯` → 「模型」（或进入「设置」弹窗），从列出的 provider / model 里选一个（列表就是这台机器上 `ctx.llm` 能用的那些）；没选之前点开只会提示一句，不发请求。选中之后这一条立刻重做，以后都按这个来。

挑模型时优先选「比喻多、先说结论」的那种：[Artificial Analysis 的 Metaphorical 榜](https://artificialanalysis.ai/evaluations/aa-personalitybench/traits/metaphorical)量的就是这个；同一张榜上的 Answer First、Bottom-Line Summary 也一样对口。干活用一个模型、速览用另一个，是最省心的搭配。

## 用法

### 回答下方的速览块

左边是一个「› 速览」的折线小三角，点它收起或展开这块内容。字体照着回答顶上那行状态文字来：15px、常规字重、次级色，折线图标中线与文字中线对齐。整块放在 `--dsw-alias-interactive-bg-hover` 的柔和卡片底色上（浅色模式下为浅灰块、深色模式下为微提亮卡片，避免浅色主题下 `bg-layer-*` 全白看不出边界）。

收起的时候只留一行 `› 速览 · 结论句`（中间圆点由样式绘制、垂直居中）：结论句取速览首段第一句，去掉 Markdown 记号后截断至 36 字加省略号（悬停显示完整句）。手动模式下未生成过的回答只有「› 速览」；探针结果回来前先不渲染，避免闪现又消失。

右上角收进一个 `⋯` 角落菜单，点开是单层不透明浮层卡片（空间够朝下弹，贴近输入框改朝上弹，避免被输入框遮挡）：
- **自动速览**：`全部` / `本会话` / `手动`
- **详略**：`普通` / `详细`（切完立即按新档重写当前块，其他块同步跟随；两档各自缓存，来回切换不重复计费）
- **语言**：`跟随原文` / `中文` / `英文`（三种选择各自缓存，首次生成与二次收紧均遵守）
- **模型**：列出本机全部可用的 provider / model，选中即保存并重做当前块
- 分隔线下是 **设置**：收起菜单并弹出「速览设置」弹窗

正文底下靠右是一行小字和两个小图标：`2.5k tokens` 是这条改写实际花掉的 token（悬停看输入 / 输出 / 合计）；复制按钮把整段 Markdown 原文放进剪贴板，按下去图标本身立刻变成勾（失败时变叉），1.5 秒后复原，不会多出文字把 token 计数挤开；最右边环形箭头丢掉缓存重做这一条。

改写进行中时，正文位置显示带扫光动画和逐次变长省略号（`.` → `..` → `...`）的「整理中」，遵循 `prefers-reduced-motion`。

### 设置弹窗（速览设置）

通过 `⋯` → 「设置」唤起，复用宿主 `@deepseek-ai/dsh-client-ui-primitives` 的 `Modal` 与 `Button`，挂载在 `shell.overlay` 上，背景压暗、底层会话位置不动。

弹窗分三块紧凑排布，统一适配深/浅色主题：
1. **核心配置卡片**：自定义分组模型下拉框（替代原生 `<select>`，按 provider 分组、带勾选高亮、Esc 优先收起下拉不误关弹窗、自动去重 `provider/` 前缀）、`详略` 分段切换器（`普通` / `详细`）、`语言` 分段切换器（`跟随原文` / `中文` / `英文`）。
2. **提示词编辑区**：使用正文无衬线字体（`--dsw-font-family`）和细圆角滚动条，右上角实时显示字数（`当前 / 8000`），与内置提示词不同时出现一键「恢复默认」。
3. **参数卡片**：
   - `触发字数`：`min` / `max`（原文字数范围）
   - `普通档篇幅`：`ratio` / `cap`（选「详细」档时柔和降不透明度，悬停或聚焦恢复可编辑）
   - `Temperature`：0–2 滑块与数值框联动
   - `自动日限额`：显示当日已用 / 不限状态 + 内嵌 `tokens` 单位的数值框
   - 四行参数的补充说明统一收进标签旁的 `ⓘ` 悬停/聚焦提示，不在界面上平铺长段解释。

底栏只放一个主按钮：无新改动时保持置灰不可点；有改动时亮起为「保存」（支持 `Ctrl/Cmd + S` 或 `Ctrl/Cmd + Enter`）；保存成功后变为置灰的「已保存」，弹窗不关闭。校验或请求报错固定显示在底栏上方，滚动后也不会漏看；按 `Esc`、点右上角 `×` 或点遮罩均可关闭弹窗。

## 配置

界面上的所有开关与设置弹窗里的每一项，均经 DSH 配置接口（`ctx.fiber.entry` + `configEditor`）写回**当前 profile 目录下** `cordis.patch.yml` 中 `- id: interpreter` 那一行的 `config`。

插件包自带的 `cordis.patch.yml` 仅作首次安装初始值；界面第一次保存后，profile 这一行会保存完整 `config` 并替代包内初始值。生效顺序为 `内置默认 → profile 该行 config`。删掉该行 `config` 即回到内置默认。

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `provider` / `model` | `''` | 改写模型，须成对配置 |
| `mode` | `'manual'` | 自动触发范围：`manual` / `session` / `global` |
| `sessions` | `[]` | `session` 模式下的会话白名单（最多保留最近 200 条） |
| `length` | `'normal'` | 长度档位：`normal`（普通）/ `detailed`（详细，固定 `0.5` / `1600`） |
| `language` | `'auto'` | 输出语言：`auto`（跟随原文）/ `zh` / `en` |
| `minChars` | `400` | 原文短于该字数跳过 |
| `maxChars` | `40000` | 原文长于该字数跳过 |
| `ratio` | `0.35` | 普通档目标字数占原文比例（`0 < ratio < 1`） |
| `capChars` | `900` | 普通档速览字数上限（不小于 150 的整数） |
| `temperature` | `0.3` | 采样温度（`0`–`2`） |
| `prompt` | 内置 | 改写系统提示词（1–8000 字） |
| `dailyTokenCap` | `0` | 自动模式每日 token 上限，`0` 为不限（内存按自然日计数，重启清零） |

## 它怎么变短

1. 每次请求都带上具体字数预算：`普通` 档按 `原文长度 × ratio` 并夹在 `150` 与 `capChars` 之间；`详细` 档固定用 `0.5` 与 `1600`。具体数字比「请短一点」稳定得多。
2. 若设定了固定语言（`zh` / `en`），会在用户消息末尾追加语言指令，覆盖默认「跟随原文」规则，且第一轮与二次压缩轮同时生效。
3. 首次结果超过预算 `1.5` 倍时，带着草稿自动再压一遍，取更短的一版；两次调用的 `usage` 累加后上报。第二遍失败时保留第一版草稿，不整条报错。
4. 渲染直接复用 DSH 的 Markdown 排版规则和主题变量，表格、列表、引用、代码块与链接图标和原文保持同一套视觉体系。

## 实现

### Host 侧（`index.js`）

注册四个本地路由，全部先过 `ctx.connection.requestRejection(req)` 鉴权（未通过直接返回 401/403，不读请求体）；三个 POST 路由仅接受 `application/json`：

- `POST /interpreter/rewrite`：按事件的 `data.turn` 与 `turn/start` 在当前轮次内提取落盘的 assistant 文本（不跨轮借用），经并发限流器（上限 2）调用 `ctx.llm.stream` 改写。流以 `stop` 以外的原因结束一律判为失败且不缓存。缓存键为 `${provider}/${model}/${length}/${language}@${revision}:${sessionId}:${seq}`（最多 500 条）；同一轮并发请求共享单次调用，仅当全部等待者断开连接才中止上游流。自动请求（`auto: true`）会额外检查 `interrupted`、`autoSince`（取 `startedAt` 与配置 `autoSince` 较大值）及当日 token 限额（`skip: budget`）。
- `POST /interpreter/probe`：读取同一份轮次日志判断是否满足正文存在与 `minChars`–`maxChars` 区间，返回 `ok` 或 `too-short` / `too-long` / `no-answer`；不调模型、不进缓存、不看 `autoSince`。
- `GET /interpreter/models`：枚举 `ctx.llm.listProviders()` × `listModels()` 及当前选中的 `provider` / `model`。
- `GET /interpreter/config`：返回 `mode`、`sessions`、`length`、`language`、`live`、`tokensToday`、`tokenCap`、`defaultPrompt` 及 `settings`（经 `formOf` 补齐默认值的表单字段）。
- `POST /interpreter/config`：校验并持久化局部更新；白名单通过 `addSessions` / `removeSessions` 增量合并避免并发覆盖。全部 14 个配置字段（含内部 `autoSince`）均通过动态导入 `@deepseek-ai/schemastery`（声明于可选 `peerDependencies`）标记为 `.volatile()`，保存时就地更新、不重启插件；加载不到 schema 时自动退回重启模式并通过 `live: false` 上报。改动 `REWRITE_FIELDS`（`temperature`、`ratio`、`capChars`、`minChars`、`maxChars`、`prompt`）时递增 `revision`，使旧缓存与在途任务自然失效。

### Client 侧（`client.js`）

以单文件浏览器模块（`window.__ModuleLoader__.load`）向宿主注册两个 slot：

- `conversation.chat.turnTail`（`Interpreter`）：单轮速览块，内含探针缓存（`probes`，上限 500）、共享配置存储（`gateStore`）、`⋯` 角落菜单、轻量 Markdown 解析与安全链接过滤、扫光等待态、token 展示、剪贴板复制与重试/刷新。
- `shell.overlay`（`SettingsDialog`）：由全局 `settingsStore` 控制显隐，打开时并行拉取 `/interpreter/config` 与 `/interpreter/models`，本地先用 `readDraft` 校验再提交；保存成功后同步更新 `gateStore` 与 `savedModel`，让页面上已挂载的速览块立即可见新值。
- 样式表通过 `ensureStyle()` 单例注入到 `#dsh-interpreter-css`（全部挂在 `ra-` 前缀下，内容变更时覆盖更新），深/浅色均依托 DSH 主题变量，不引入外部样式表。
- 测试钩子 `window.__DSH_INTERPRETER_TEST__` 仅在单测环境启用，供 `test/client.test.js` 直接覆盖纯逻辑函数。
