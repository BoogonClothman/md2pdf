# Agent Note: PR 模板与贡献准入策略

Status: implemented

## 问题

仓库此前只有一份 24 行的 PR 模板，且规则文件里对"谁可以提交"没有任何规定——
`AGENTS.md`、`.agents/notes/README.md`、`.agents/notes/AGENTS.md` 全文未提外部贡献者。
空白由 review 临场判断填补，导致两个已发生的后果：

- 模板里的「设计依据」小节要求贴 Agent Note 链接，但 PR #1 以"暂缺"合并，
  至今 `implemented/` 下没有一份 Note——规则与事实不一致；
- 模板措辞面向"其他开发者"，而仓库没有 `CONTRIBUTING.md` 说明姿态，
  外部人无法判断自己的 PR 是否受欢迎。

## 决策

三层，分别管入口、模板与留痕。

**入口封闭。** 本仓库不接受外部 PR：`.github/CONTRIBUTING.md` 明确写出这一点，
并给出三条替代路径——fork 自用（MIT）、开 Issue 报告问题、大改动先开 Issue 讨论
由维护者决定是否实现。Issue 通道保持开放并模板化（bug / feature 两个 issue form，
空白 issue 关闭），因为 bug 报告是信息、PR 是提案：前者收益高而成本近零，
后者附带社交成本且 review 费用高于自行重写。

**模板只服务一个读者：未来的 `git log`。** `.github/PULL_REQUEST_TEMPLATE.md` 收敛为
改动、验证、未验证范围、设计依据、风险与回退五节；删掉复述 CI 结果的自证式勾选，
保留只有作者答得上的字段。「未验证范围」独立成节，因为 CI 三平台测不到的部分
（真机 PDF 保真、Windows/macOS 安装包、IME 输入）才是 review 的第一入口。

**留痕责任落在变更，不落在人。** 与上游 dsh 同源：非平凡变更须有 Note，
但由说得出理由的人撰写；本项目只有维护者一人，故 `scripts/note.mjs`
（`npm run note -- <class> <slug>`）把"摆对骨架"这一步机械化，消除"想留痕但嫌麻烦"
这一实际阻力。

配套的安全私密报告入口写在 `.github/SECURITY.md`：渲染不可信 Markdown 并暴露
CSP / 导航白名单 / 外链 IPC 白名单（见 `README.md` § 安全模型），
公开 issue 不适合承载逃逸手法。

## 曾考虑的替代方案

**接受外部 PR，用规则兜底（否决）。** 曾倾向"允许提交但不强制写 Note、
外部人只进 `proposed/`"。否决理由是三项成本无法摊销：Agent Note 的"非平凡"判断与
"取代检查"预设维护者的隐性知识（`.agents/notes/AGENTS.md` 把取代检查定为硬要求）；
Electron 桌面的平台不对称使跨平台验证只能由维护者补做；`verify:notes` 的格式门禁
（首章节必须逐字为 `## 问题`、`## 曾考虑的替代方案` 无豁免、文件名 `yyyy-mm-dd-ascii-slug`）
会把格式失败全部转嫁给维护者。上游 deepseek-harness 提供了对照实证：
其 `CONTRIBUTING.zh.md` 明确"无法接受外部 PR"，并用
`.github/review-ownership/approval-policy.json`（`requiredPoints: 2`，仅 6 个具名
reviewer 计分）把合入权收在具名小圈子内——入口管控替代权限分层是成熟做法。

**多模板共存（`.github/PULL_REQUEST_TEMPLATE/` 目录 + `?template=` 参数）（否决）。**
GitHub 支持按 query 参数选择模板，但两种作者共用同一条开 PR 链接，判错比共用更糟；
且本项目封闭外部 PR 后只剩一个作者，第二份模板纯属漂移来源。

**为"外部人可写 Note"增设权限表或作者字段（否决）。** 权限属于 PR 准入轨道，
不属于决策记录：上游 455 份 implemented Note 全部无作者字段，署名靠 git 历史，
权限靠 `review-ownership`。把权限写进 Note 规则会污染权威文档。

**对"非平凡"设自动门禁（否决）。** 与 `.agents/notes/README.md` 现有判断一致：
机械检查无法可靠判断语义重大程度，误判成本高于收益。

**把 AI 使用披露写进模板（否决）。** Kubernetes / Rust / Electron / Deno 均已强制披露，
但本仓库是 agent 重度、单人维护的项目，披露对象即维护者本人，属自证而无外部约束力。

## 后果

**收益。** 所有变更流经同一条可控流水线，Agent Notes 保持单一叙事；
无外部 PR 的 review 等待，修复与发行节奏只受限于维护者；
Issue 模板强制"最小复现 `.md`"，把最常见的信息缺失挡在入口；
`npm run note` 使留痕从口头纪律变成一条命令。

**代价。** 失去外部适配层（例如 i18n——`AGENTS.md` 已定"仅中文"，
上游恰为英文 + `.zh.md` 对侧）与外部视角的真实使用反馈；
封闭姿态会让一部分人在报告 bug 前就离开，这是**无法测量**的损失；
模板与 Note 规则全部由维护者自审，缺少第二双眼睛。

**回退条件（本决策非永久）。** 出现以下任一即重新评估，届时按上游的
`approval-policy.json` + 作者信用分路线做渐变信任，而非一直封闭：
① 出现持续高质量的外部贡献者（如连续 2–3 个高质量 Issue 附带可用的补丁片段）；
② 决定引入 i18n 或第二位维护者。

## 相关

- 模板：`.github/PULL_REQUEST_TEMPLATE.md`
- 姿态与替代路径：`.github/CONTRIBUTING.md`
- 安全问题私密报告：`.github/SECURITY.md`
- 留痕脚手架：`scripts/note.mjs`
