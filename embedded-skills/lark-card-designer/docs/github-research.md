# GitHub 飞书卡片项目调研

更新日期：2026-06-30

本文汇总前期提到的飞书/Lark 卡片相关 GitHub 仓库，用来支撑 `lark-card-designer` 的 skill 设计。

`lark-card-designer` 的定位不是直接生成最终卡片，也不是再做一个 SDK。它应该根据数据类型、数据意图和输出口径，给出稳定的卡片样式决策、信息架构、组件建议、视觉规则和 JSON 骨架示意，让下游实现者或卡片生成器少漂移。

## 调研方法

- 优先读取公开 GitHub 仓库元信息、README、子目录 `SKILL.md`。
- 对无法读取 README 或 README 信息很少的仓库，标记为低信号，不把仓库名推断成事实。
- 将项目价值转译为设计证据：它解决了什么场景、使用了什么卡片结构、如何处理状态/表格/长内容/交互，以及哪些规则可迁移到本 skill。

## 全局结论

现有 GitHub 项目大多不是“卡片设计规范”，而是围绕某个固定场景做卡片实现，主要落在八类：

1. 格式化规范：约束 Markdown、标题、表格、折叠面板，保证飞书渲染稳定。
2. 组件构建器：把 button、table、column、div、image 等组件封装成代码 API。
3. 原生表格渲染：把 Markdown 表格或结构化 rows 转换成飞书 native table。
4. 流式进度卡片：把 AI 输出、工具调用、任务状态持续 patch 到同一张卡片。
5. 操作台/审批卡片：用选择器、按钮、锁定态、历史记录承载流程操作。
6. 资讯/日报聚合：按优先级、分类、摘要、来源和反馈按钮组织信息集合。
7. 通知/告警适配器：把外部事件映射到短标题、状态色、少量字段和动作链接。
8. 轻量发送工具：只解决 webhook、签名、发送 envelope，不解决信息设计。

对本项目最关键的启发是：不要把“请生成一个清晰的飞书卡片”当作主要产物。要把决策拆成矩阵和检查表：数据类型 -> 意图 -> 口径 -> 卡片模式 -> 信息层级 -> 组件选择 -> 视觉状态 -> 约束校验。

## 仓库全量索引

| 仓库 | 信号 | 项目类型 | 可迁移设计支撑 | 主要限制 |
| --- | --- | --- | --- | --- |
| [alva-intelligence/agent-skills/lark-card-formatting](https://github.com/alva-intelligence/agent-skills/tree/main/lark/skills/lark-card-formatting) | 高 | 卡片格式化 skill | 明确 Markdown 渲染规则、表格限制、折叠面板伪语法、渐进加载 references。适合转化为 `rendering-rules` 参考。 | 重点是“如何写可渲染内容”，不是“根据意图选择卡片样式”。 |
| [baileyh8/hermes-feishu-streaming-card](https://github.com/baileyh8/hermes-feishu-streaming-card) | 高 | AI 流式交互卡片 | 单卡持续更新、thinking/tool/final 分区、状态 header、footer 统计、长内容与表格保护。适合支撑“过程态卡片”和“AI 结果卡片”。 | 深度绑定 Hermes 流式事件，不适合直接作为业务报表规范。 |
| [ppaibb/FeishuCardOps](https://github.com/ppaibb/FeishuCardOps) | 高 | 发版操作台/审批流程 | 项目/分支/环境选择、按钮锁定、主卡/副卡、进度追踪、审计群同步、审批人提示。适合审批、流程、执行口径。 | CI/CD 场景很强，报表和资讯类不应照搬它的操作密度。 |
| [ritaswc/lark-card-message-builder](https://github.com/ritaswc/lark-card-message-builder) | 中高 | PHP 卡片组件构建器 | 展示单列表单、按钮、列权重表格、小字号布局等组件封装方式。适合支撑组件词表和表格布局规则。 | 只提供构建 API，不做意图判断。 |
| [CatchZeng/feishu](https://github.com/CatchZeng/feishu) | 中 | Go webhook/机器人消息库 | 覆盖 text、post、image、share_chat、interactive，包含签名和链式写法。适合支撑发送 envelope 与基础消息类型边界。 | 不关注卡片视觉质量。 |
| [AllanChain/grafana-feishu](https://github.com/AllanChain/grafana-feishu) | 中 | Grafana 告警转卡片 | 外部事件 -> 卡片标题/描述/状态色的最小映射。适合告警、异常、红绿状态模型。 | 结构极简，无法覆盖复杂分析卡。 |
| [henryjing96/feishu-codex-bridge](https://github.com/henryjing96/feishu-codex-bridge) | 高 | Codex 远程桥接/流式卡片 | 占位卡、patch 更新、工具进度、权限模式、图片输入、多用户审批。适合支撑“等待中/执行中/需要确认/完成”的状态语义。 | 卡片风格服务于远程操作，不是通用商业数据展示。 |
| [ai-eifying/hermes-feishu-card](https://github.com/ai-eifying/hermes-feishu-card) | 中高 | Hermes 回复卡片化 | 把所有回复包进交互卡片，自动将 Markdown 表格转换为 native table，失败回退文本。适合表格转换和兜底策略。 | 主要是 final answer 包装。 |
| [ISQIShI/feishu_messaging_card_builder](https://github.com/ISQIShI/feishu_messaging_card_builder) | 高 | Hermes 最终回复卡片补丁 | 最终回复卡片化、正文预处理、上下文/进度 footer、长回复拆分、失败回退、标题栏取舍。适合长内容和汇报类卡片。 | 面向特定运行时，不是完整设计系统。 |
| [shareAI-lab/lark-channel](https://github.com/shareAI-lab/lark-channel) | 高 | Lark 群聊到 Claude Code agent | 群 = 独立 workspace，流式文本卡、工具卡、持久会话。适合“多轮任务上下文”和“会话态卡片”设计。 | 偏 agent runtime，不提供业务数据卡片规则。 |
| [arkseek/hermes-feishu](https://github.com/arkseek/hermes-feishu) | 高 | Hermes 飞书表格增强 | 明确指出飞书 post markdown 不支持 pipe table，提供 card table 工具和结构化 table 工具。适合强规则：结构化数据优先 native table。 | 重点是表格渲染，不含视觉分层规范。 |
| [maidou0215/hermes-feishu-card-progress-plugin](https://github.com/maidou0215/hermes-feishu-card-progress-plugin) | 高 | 工具执行进度卡片 | Running/Completed/Failed header、工具调用步骤、响应卡区别、运行统计 footer、表格溢出保护。适合进度卡和状态色规则。 | 针对 Hermes 工具调用。 |
| [Micar2024/hermes-feishu-interactive-cards](https://github.com/Micar2024/hermes-feishu-interactive-cards) | 中高 | Hermes 交互卡片插件 | initial card、tool progress、response text、按钮回调、撤回按钮等生命周期。适合可交互 AI 卡片状态机。 | README 偏安装和 runtime 架构。 |
| [theo-lee1/feishu-progress-card](https://github.com/theo-lee1/feishu-progress-card) | 中 | OpenClaw 多步进度卡 | 工具调用开始/结束/失败/心跳更新同一张卡。适合“任务进度”单卡 patch 模式。 | 场景单一，信息架构较少。 |
| [Matys1009/feishu_daily_news_card](https://github.com/Matys1009/feishu_daily_news_card) | 高 | 每日资讯互动卡片 | Excel 管理资讯，卡片含标题、摘要、图片、链接、点赞按钮和统计。适合文章/blog/资讯集合口径。 | 偏单条资讯/群发，不是复杂知识库整理。 |
| [leecyang/feishu-interactive-cards](https://github.com/leecyang/feishu-interactive-cards) | 低 | JS 交互卡片仓库 | 仓库可访问，但 README 未读取到，元信息也少。只能作为“存在同名交互卡片实现”的低信号样本。 | 不用于关键设计结论。 |
| [iwgyyyy/feishu-interactive-card](https://github.com/iwgyyyy/feishu-interactive-card) | 中 | OpenClaw 交互卡片 skill | buttons、forms、polls、confirmation card，强调不确定时用按钮让用户选择。适合一线执行和审批确认。 | 更像工具/模板集合，业务口径较少。 |
| [tenlywu/lark-push](https://github.com/tenlywu/lark-push) | 中高 | 交互卡片任务调度/管理服务 | 任务模型、收件人映射、callback、manual refresh、admin service。适合“周期推送卡片”和“刷新动作”规则。 | README 未展开具体卡片样式。 |
| [bellehe01/lark-daily-digest](https://github.com/bellehe01/lark-daily-digest) | 高 | 群消息每日摘要 | 聚合过去 24/72 小时群消息，按 Needs Attention/FYI 分类，结构化 DM 卡片。适合日报、周报、资讯 triage。 | 更偏个人效率，业务指标维度较少。 |
| [tagthai-actions/lark-notification-frontend](https://github.com/tagthai-actions/lark-notification-frontend) | 中 | GitHub Action 部署通知 | default/matrix 两种卡片模式，从 CSV 读取发布内容，发送部署摘要。适合“矩阵型部署/模块状态”卡片。 | 只覆盖部署通知。 |
| [DengMingXi777GZ/openclaw-feishu-InteractMeetingCard](https://github.com/DengMingXi777GZ/openclaw-feishu-InteractMeetingCard) | 中 | 会议邀请交互卡片 | 语音输入 -> 会议详情 -> 一键创建日程按钮 -> 群发送。适合“表单型信息 + 单一主动作”模式。 | 和数据展示关系弱。 |
| [Handsome-KK/Hermes-personal-stack](https://github.com/Handsome-KK/Hermes-personal-stack) | 高 | Hermes 个人 AI stack 与卡片渲染补丁 | 把 briefing 中的 Markdown 表格路由到 schema 2.0 native table，保留表格周围正文。适合报告/brief 卡片的正文与表格混排规则。 | 不是独立卡片库，证据来自其中一个补丁章节。 |
| [chareasy/LarkAPI](https://github.com/chareasy/LarkAPI) | 低 | Lark API 仓库 | README 只有极少信息，无法提炼卡片设计规则。 | 不用于关键设计结论。 |
| [kidari/feishu](https://github.com/kidari/feishu) | 低 | 飞书相关仓库 | 仓库可通过 git 访问，但未读取到 README。 | 不用于关键设计结论。 |
| [wr-rebirth/FeiShuMessageCard](https://github.com/wr-rebirth/FeiShuMessageCard) | 中 | Python 消息卡片模板封装 | 快速构建消息模板，表格仅支持 pandas DataFrame。适合“结构化数据输入应保留结构”的规则。 | README 信息较少，组件覆盖不详。 |
| [capediemmmm/feishu_2048_robot](https://github.com/capediemmmm/feishu_2048_robot) | 低 | 飞书消息 2048 小游戏 | 说明飞书消息也能承载游戏状态，但与当前业务卡片规范弱相关。 | 不纳入主要设计依据。 |
| [panda-xing/daily-push](https://github.com/panda-xing/daily-push) | 中高 | 自动化信息聚合推送 | GitHub Trending、NBA、澎湃新闻等多源信息聚合，支持飞书卡片推送。适合“信息源 -> 摘要 -> 推送”的知识口径。 | README 对卡片内部结构描述有限。 |
| [jackcheng321321/feishuproject-elt](https://github.com/jackcheng321321/feishuproject-elt) | 中 | 飞书项目 ETL/卡片通知 | 字段抽取、图片转 image_key、人员信息查询，并以消息卡片自定义通知。适合“项目字段/商品字段/图片字段预处理”规则。 | 更偏 ETL 和 API，卡片设计信息较少。 |
| [Guan-Yep/lark-industry-daily-report-skill](https://github.com/Guan-Yep/lark-industry-daily-report-skill) | 高 | 行业日报与推荐闭环 skill | 行业动态抓取、白板三列阅读、交互卡片、点赞/点踩反馈、偏好沉淀。适合知识/资讯口径和反馈闭环。 | 侧重资讯推荐，不覆盖销售/审批。 |
| [guanchunsheng/feishu-send-card](https://github.com/guanchunsheng/feishu-send-card) | 低中 | Go webhook 发卡脚本 | 使用群机器人 webhook、cardID/version 发送卡片。适合确认“模板卡片发送”边界。 | 不是设计规范。 |
| [benx-guo/github-trending](https://github.com/benx-guo/github-trending) | 中高 | GitHub Trending 到飞书/Bitable | 抓取榜单、写入 Bitable、通过 webhook 推交互卡片。适合榜单类、Top-N、外部链接和存档联动。 | README 未详细展示卡片层级。 |
| [clarklooking/feishu-push](https://github.com/clarklooking/feishu-push) | 中 | 机器人推送工具 | 支持文本、富文本、消息卡片，示例包含标题色。适合通知卡片的极简色彩规则。 | 只提供基础发送。 |
| [Coffee-Tang/feisms](https://github.com/Coffee-Tang/feisms) | 中 | Android 短信转飞书 | 短信用蓝色卡片，低电量告警用红色卡片。适合“普通通知 vs 风险告警”的状态色区分。 | 非业务数据展示。 |

## 类型洞察

### 1. 格式化规范与组件构建器

代表项目：

- `alva-intelligence/agent-skills/lark-card-formatting`
- `ritaswc/lark-card-message-builder`
- `wr-rebirth/FeiShuMessageCard`
- `CatchZeng/feishu`
- `clarklooking/feishu-push`
- `guanchunsheng/feishu-send-card`

设计支撑：

- skill 不应只给“审美建议”，要输出可执行的渲染规则，例如标题层级、空行、分隔、表格上限、图片/链接/按钮位置。
- 组件词表要稳定：header、markdown/div、table、chart、column_set、note、button、select、input、collapsible panel。
- 对小型通知卡，可以只使用标题、状态色、正文和一条动作链接；不要把它提升成复杂报告卡。
- 对结构化 rows/columns，输入阶段就应保留字段结构，不要先压成自然语言再让后续重新解析。

### 2. 原生表格与长内容渲染

代表项目：

- `arkseek/hermes-feishu`
- `ai-eifying/hermes-feishu-card`
- `ISQIShI/feishu_messaging_card_builder`
- `Handsome-KK/Hermes-personal-stack`
- `baileyh8/hermes-feishu-streaming-card`
- `maidou0215/hermes-feishu-card-progress-plugin`

设计支撑：

- Markdown pipe table 在飞书消息里不稳定，结构化表格应优先映射为 native table。
- 表格不是所有数字的默认归宿。趋势、占比、漏斗、达成率更适合 chart 或 KPI + sparkline/简图。
- 报告卡片应采用“结论先行 + 证据表格 + 次要明细折叠”的结构。
- 长回复要拆分或折叠，但拆分不能重复标题、footer 和上下文说明。
- footer/note 适合放来源、时间范围、数据更新时间、模型/工具统计、免责声明，不应抢正文层级。

### 3. 流式进度与任务状态

代表项目：

- `baileyh8/hermes-feishu-streaming-card`
- `shareAI-lab/lark-channel`
- `henryjing96/feishu-codex-bridge`
- `maidou0215/hermes-feishu-card-progress-plugin`
- `Micar2024/hermes-feishu-interactive-cards`
- `theo-lee1/feishu-progress-card`

设计支撑：

- 过程卡片和结果卡片应该分型：过程卡强调状态、当前步骤、下一步；结果卡强调结论、证据、动作。
- 同一任务用同一张卡片 patch 更新，比连续发多条消息更适合保留上下文。
- 状态机应明确：queued、running、waiting_for_input、needs_approval、completed、failed、cancelled。
- 卡片头部颜色要绑定状态，不要随意装饰。
- 工具调用、审批等待、用户选择都适合放在可折叠或二级区域，避免干扰最终结论。

### 4. 操作台、审批与执行

代表项目：

- `ppaibb/FeishuCardOps`
- `iwgyyyy/feishu-interactive-card`
- `DengMingXi777GZ/openclaw-feishu-InteractMeetingCard`
- `tagthai-actions/lark-notification-frontend`
- `tenlywu/lark-push`

设计支撑：

- 操作卡片不是报告卡片。它的第一目标是降低误操作：对象、范围、风险、确认动作必须清楚。
- 涉及环境、项目、模块、负责人等变量时，优先用 select/input/form 容器，不要让用户在聊天里手打。
- 破坏性动作要确认，运行中要锁定按钮，完成后要显示不可再次点击或已完成状态。
- 审批卡片必须保留审计字段：申请人、审批人、时间、原因、影响范围、当前状态。
- 矩阵型部署/模块状态适合 table 或 matrix layout；不要用一长串段落。

### 5. 日报、周报、资讯与知识集合

代表项目：

- `bellehe01/lark-daily-digest`
- `Matys1009/feishu_daily_news_card`
- `Guan-Yep/lark-industry-daily-report-skill`
- `panda-xing/daily-push`
- `benx-guo/github-trending`

设计支撑：

- 信息集合类卡片的核心不是“把文章列表塞进去”，而是 triage：需要关注、可稍后看、仅存档。
- 资讯卡应包含标题、摘要、来源、时间、链接，可选图片和反馈按钮。
- Top-N 榜单适合用排名、标签、短摘要和跳转链接，不适合大段全文。
- 个性化/推荐类卡片需要反馈入口，例如点赞、点踩、不感兴趣、稍后读。
- 日报/周报应该先给整体判断，再给重点变化、风险、行动项和可折叠明细。

### 6. 告警、通知与轻量推送

代表项目：

- `AllanChain/grafana-feishu`
- `Coffee-Tang/feisms`
- `clarklooking/feishu-push`
- `CatchZeng/feishu`
- `tagthai-actions/lark-notification-frontend`

设计支撑：

- 告警/通知卡片应短：状态、对象、原因、影响、动作链接。
- 红色用于失败、紧急、风险；绿色用于成功、恢复、健康；蓝色用于一般信息；橙/黄色用于待处理或警告；灰色用于历史/次要。
- 通知类不要追求完整分析，完整分析应通过链接、折叠面板或后续详情卡承载。

### 7. 字段预处理与数据接入

代表项目：

- `jackcheng321321/feishuproject-elt`
- `wr-rebirth/FeiShuMessageCard`
- `benx-guo/github-trending`
- `Matys1009/feishu_daily_news_card`

设计支撑：

- 卡片样式决策前要识别数据形态：标量 KPI、时间序列、明细表、Top-N、富媒体、人员、审批流、外部链接。
- 图片类字段要先转成飞书可用 image_key；人员字段要尽量转成可读名称或 mention。
- Excel/CSV/Bitable/项目字段这类来源通常天然结构化，应保留字段名、类型、单位和排序规则。

## 对输出口径的映射

用户已确认优先支持 1、2、3、4、6 五类输出口径。结合调研，建议这样落地：

| 输出口径 | 目标读者 | 首屏重点 | 适合借鉴的项目 | 推荐卡片模式 |
| --- | --- | --- | --- | --- |
| 1. 管理层口径 | 决策者、负责人 | 结论、风险、异常、关键 KPI、是否需要决策 | `bellehe01/lark-daily-digest`, `AllanChain/grafana-feishu`, `ISQIShI/feishu_messaging_card_builder` | Executive summary card：一屏结论 + KPI + 风险 + 行动建议，细节折叠 |
| 2. 业务运营口径 | 运营、项目 owner | 达成率、趋势、异常归因、待办 | `ppaibb/FeishuCardOps`, `tagthai-actions/lark-notification-frontend`, `benx-guo/github-trending` | Ops dashboard card：KPI + Top-N + 表格/矩阵 + 刷新/查看详情 |
| 3. 一线执行口径 | 执行人、审批人、值班人 | 当前要做什么、对象是谁、截止时间、按钮 | `ppaibb/FeishuCardOps`, `iwgyyyy/feishu-interactive-card`, `DengMingXi777GZ/openclaw-feishu-InteractMeetingCard` | Action card：对象 + 说明 + 风险 + 主按钮/次按钮 + 状态锁定 |
| 4. 复盘分析口径 | 分析师、项目复盘者 | 结论、证据、对比、原因、改进动作 | `Handsome-KK/Hermes-personal-stack`, `arkseek/hermes-feishu`, `maidou0215/hermes-feishu-card-progress-plugin` | Analysis card：结论先行 + 对比/趋势 + 证据表 + 原因与 action |
| 6. 知识/资讯口径 | 阅读者、研究者、团队成员 | 重要性、主题分类、摘要、来源、是否需跟进 | `Guan-Yep/lark-industry-daily-report-skill`, `Matys1009/feishu_daily_news_card`, `panda-xing/daily-push` | Digest card：分类列表 + 摘要 + 来源 + 标签 + 反馈按钮 |

## 对用户场景的设计支撑

### 日报/周报

推荐结构：

1. Header：日期范围 + 状态色，状态由整体健康度/风险决定。
2. 首屏：3 到 5 个关键结论，不超过一屏。
3. KPI 区：完成率、环比/同比、异常数量、待处理数量。
4. 重点变化：Top gains、Top drops、风险事项。
5. 行动项：owner、截止时间、下一步。
6. 明细：放入折叠面板或 native table。

调研支撑：

- `bellehe01/lark-daily-digest` 的 Needs Attention/FYI 分类适合日报 triage。
- `ISQIShI/feishu_messaging_card_builder` 的长回复拆分和 footer 适合周报。
- `arkseek/hermes-feishu` 与 `Handsome-KK/Hermes-personal-stack` 支撑 native table 规则。

### 商品数据

推荐结构：

1. Header：商品/类目/店铺 + 数据周期。
2. KPI：销售额、销量、库存、转化率、毛利、退款率。
3. 异常标签：缺货、滞销、高退货、价格异常。
4. Top-N：贡献最高/下降最快商品。
5. 商品明细：native table，字段含 SKU、价格、库存、销量、转化、状态。
6. 图片：只在需要识别商品时使用缩略图，不要让图片挤占核心指标。

调研支撑：

- `jackcheng321321/feishuproject-elt` 提醒图片、人员、字段预处理很重要。
- `wr-rebirth/FeiShuMessageCard` 的 DataFrame 输入说明结构化数据不应丢失。
- `ritaswc/lark-card-message-builder` 的列权重表格适合 SKU 明细。

### 销售数据

推荐结构：

1. Header：周期 + 区域/团队 + 状态。
2. 管理层：目标达成率、预测缺口、关键风险。
3. 运营层：渠道/区域/销售阶段拆解。
4. 一线层：客户/商机/跟进行动。
5. 分析层：同比、环比、漏斗、Top/bottom、原因假设。
6. 明细：只展示影响最大的记录，其余折叠或链接到表格。

调研支撑：

- `tagthai-actions/lark-notification-frontend` 的 matrix 思路适合多模块/多区域状态。
- `AllanChain/grafana-feishu` 支撑状态色和异常优先。
- `arkseek/hermes-feishu` 支撑结构化表格渲染。

### 前沿 blog / 文章收集汇总

推荐结构：

1. Header：主题 + 日期 + 推荐级别。
2. 分类：必读、可选、仅存档。
3. 每条内容：标题、1 句摘要、来源、发布时间、标签、链接。
4. 重点内容：可加 2 到 3 条“为什么重要”。
5. 反馈：喜欢/不感兴趣/稍后读，用于长期偏好。

调研支撑：

- `Guan-Yep/lark-industry-daily-report-skill` 支撑资讯抓取、反馈闭环和个性化沉淀。
- `Matys1009/feishu_daily_news_card` 支撑图片、链接、点赞互动。
- `panda-xing/daily-push` 与 `benx-guo/github-trending` 支撑榜单/热点类 Top-N 卡片。

### 审批卡片

推荐结构：

1. Header：审批对象 + 当前状态。
2. 申请信息：申请人、部门、时间、审批类型。
3. 核心内容：要审批什么、金额/范围/影响。
4. 风险与依据：为什么需要批、如果拒绝有什么影响。
5. 动作区：同意、拒绝、退回修改、查看更多。
6. 状态锁定：审批完成后按钮禁用或卡片更新为已处理。
7. 审计：审批人、审批时间、操作记录。

调研支撑：

- `ppaibb/FeishuCardOps` 的锁定态、审计同步和流程选择最有价值。
- `iwgyyyy/feishu-interactive-card` 的确认卡适合审批确认。
- `henryjing96/feishu-codex-bridge` 的多用户审批/RBAC 给权限边界提供参考。

### 复盘分析

推荐结构：

1. Header：主题 + 结果状态。
2. 结论：一句话判断。
3. 事实：核心指标、时间线、对比基准。
4. 分析：原因、影响范围、证据。
5. 行动：改进项、owner、截止时间。
6. 附录：原始数据、日志、详细表格折叠。

调研支撑：

- `Handsome-KK/Hermes-personal-stack` 的正文 + native table 混排适合 evidence-first。
- `maidou0215/hermes-feishu-card-progress-plugin` 的 footer 统计适合附加运行信息。
- `ISQIShI/feishu_messaging_card_builder` 的去噪、回退和拆分适合长复盘。

## 组件选择规则草案

| 输入/意图 | 首选组件 | 何时使用 | 避免 |
| --- | --- | --- | --- |
| 单一结论 | header + markdown/div | 管理层摘要、告警、日报首屏 | 用表格承载一句话结论 |
| 多 KPI | columns / KPI blocks | 3 到 5 个关键指标 | 超过 6 个指标平铺 |
| 明细 rows/columns | native table | 商品、销售、项目、榜单、审批记录 | 大表直接放首屏 |
| 趋势 | chart | 时间序列、环比、同比 | 用多列表格堆时间点 |
| 占比/构成 | chart | 渠道、品类、状态分布 | 只给百分比文字 |
| Top-N | table 或 list | 榜单、异常、贡献排行 | 混入完整明细 |
| 次要证据 | collapsible panel | 日志、原始数据、工具过程、参考链接 | 首屏展开所有细节 |
| 用户决策 | button/action | 审批、确认、跳转、反馈 | 让用户复制文字回复 |
| 多参数选择 | select/input/form | 环境、项目、人员、日期范围 | 多个按钮拼成表单 |
| 来源与元数据 | note/footer | 数据更新时间、来源、模型、工具、限制 | 放在标题或正文开头 |

## 状态色规则草案

| 状态 | 建议颜色 | 适用场景 |
| --- | --- | --- |
| 成功、恢复、健康、已完成、已批准 | 绿色 | 发布成功、告警恢复、审批通过、目标达成 |
| 失败、拒绝、严重风险、紧急告警 | 红色 | 部署失败、审批拒绝、销售目标严重缺口、库存断货 |
| 警告、待处理、需关注、临近风险 | 橙色/黄色 | 待审批、指标波动、低电量、库存预警 |
| 信息、分析中、执行中、普通通知 | 蓝色/青色 | 进度卡、普通短信转发、日报信息、AI 回复 |
| 历史、归档、禁用、次要说明 | 灰色 | 已关闭事项、附录、历史记录、无动作通知 |

## Skill 结构建议

结合官方文档与 GitHub 调研，后续 `lark-card-designer` 可以采用以下 references：

| 文件 | 作用 |
| --- | --- |
| `references/decision-matrix.md` | 数据类型 + 意图 + 输出口径 -> 卡片模式 |
| `references/audience-portfolios.md` | 管理层、业务运营、一线执行、复盘分析、知识资讯的不同信息密度和动作需求 |
| `references/card-patterns.md` | 日报周报、商品数据、销售数据、资讯汇总、审批卡片、复盘分析的固定结构 |
| `references/component-rules.md` | table、chart、button、select、collapsible、note、image 的选择规则 |
| `references/visual-status-rules.md` | 状态色、标题层级、标签、风险提示、强调规则 |
| `references/rendering-constraints.md` | 飞书 JSON 2.0、Markdown、表格、图片、交互回调等硬约束 |
| `references/github-project-lessons.md` | 本文压缩后的项目经验，可作为设计依据索引 |

`SKILL.md` 本体应保持短，只放工作流：

1. 识别数据类型：报告、明细、榜单、资讯、审批、任务、告警。
2. 识别数据意图：汇报、诊断、通知、决策、执行、沉淀。
3. 识别输出口径：管理层、业务运营、一线执行、复盘分析、知识资讯。
4. 选择卡片模式。
5. 输出信息架构和组件建议。
6. 输出视觉/状态规则。
7. 输出轻量 JSON 骨架示意。
8. 用检查表校验可读性和飞书约束。

## 不建议复制的做法

- 不要把 prompt template 当主产物。用户已经指出提示词容易漂移，调研也说明稳定性来自矩阵、状态机、组件规则。
- 不要做另一个卡片 SDK。已有大量 builder 和 sender，本项目应补“决策层”。
- 不要把所有场景统一成一种布局。审批、日报、商品数据、资讯集合的首屏目标完全不同。
- 不要把所有数字都做成表格。趋势、构成、目标差距和异常更适合图表/KPI/标签。
- 不要在首屏放完整明细。首屏服务扫描，明细服务追溯。
- 不要把状态色作为装饰色。颜色必须表达状态或优先级。

## 对 `lark-card-designer` 的核心设计命题

本 skill 应解决的是“选择什么卡片样式更合适”，不是“如何调用飞书 API 发出去”。

建议最终输出固定为：

1. `card_intent`：数据意图和输出口径判断。
2. `card_pattern`：推荐卡片模式。
3. `information_architecture`：首屏、正文、明细、footer 的层级。
4. `component_plan`：组件选择和原因。
5. `visual_rules`：状态色、强调、标签、折叠规则。
6. `interaction_rules`：按钮、审批、反馈、刷新、锁定态。
7. `json_skeleton`：非完整实现，只展示结构骨架。
8. `validation_checklist`：防止表格过大、首屏过载、状态不明、动作不清。

这样能把 GitHub 项目里的实践经验收敛成稳定、可复用、低漂移的设计规范。
