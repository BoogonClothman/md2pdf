# AGENTS.md — 开发约定

面向本仓库的维护者与编码 agent。**本仓库仅中文**，不做 i18n 双语机制。

## 项目速览

md2pdf：Electron 跨平台 Markdown → PDF 桌面应用（TypeScript + esbuild 打包，
npm 管理依赖）。用户文档在 `README.md`（打包 / 架构 / 安全模型），发行文档在
`docs/releases/<tag>.md`，设计决策留痕在 `.agents/notes/`。

```bash
npm run dev             # 构建并启动应用
npm run typecheck       # tsc --noEmit
npm run verify:notes    # Agent Notes 门禁（结构 / 格式 / 链接）
npm run verify          # 11 项运行时验证（PDF / 截图 / 退出路径 / 安全守卫）
npm run note -- <class> <slug>   # 新建符合门禁骨架的 Agent Note
```

## Agent Notes —— 常设要求

本仓库采用 Agent Notes 机制（移植自 DeepSeek Harness，适配说明见
[.agents/notes/README.md](.agents/notes/README.md)）：

- **每个非平凡变更**，在同一 PR 内新增或更新至少一份 Agent Note。非平凡变更包括：
  行为、结构与跨文件契约、流程或工具、测试策略、磁盘/协议/配置格式，以及维护者
  可能重新审视的其他决策。
- 更新**已经拥有该决策**的 Note 即满足规则，不造重复记录；纯机械或局部编辑
  （含局部 UI 展示与交互调整）豁免。平凡与否由 review 判断——**不设自动分类门禁**。
- 对未来重大工作的提案写入 `proposed/`，已做出的决策写入 `implemented/`；路径、
  头部、章节骨架与相对链接由 `npm run verify:notes` 强制（CI 三平台执行，发行
  流水线复用同一检查）。
- **发行文档与 Agent Note 互不替代**：`docs/releases/` 面向用户描述"发了什么"，
  Agent Note 面向维护者记录"为什么这样决定、否决了什么"。

## 贡献入口 —— 封闭 PR，开放 Issue

**本仓库不接受外部 PR**：合入权只在维护者手里，所有外部输入走 Issue
（姿态、替代路径与语言约定见 [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)，
安全漏洞走 [.github/SECURITY.md](.github/SECURITY.md) 的私密报告）。
理由是 review 成本：Agent Note 的"非平凡"与"取代检查"判断预设维护者的隐性知识，
Electron 三平台的验证也无法由单个外部贡献者完成。该决策带**回退条件**，
写在[对应的 Agent Note](.agents/notes/implemented/process/2026-10-04-pr-template-and-contribution-policy.md)里。

## PR 约定

- 正文按 [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) 填写，
  只写 CI 之外的自测证据——CI 三平台做了什么无需复述，
  「未验证范围」必须写清（这是 review 的第一入口）。
- 标题用 `type(scope): 摘要`，type 取 feat / fix / refactor / docs / ci / release；
  标题会成为 merge commit 的 subject。

## 变更纪律

- 实现改动与对应 Note 的**事实在同一 PR 同步**：文件移动、改名、默认值变更时，
  更新 Note 中的路径与事实（更正事实，不改写决策）。
- 删除或合并 Note 时修复全部入站链接；被完全取代的记录按
  [归档与删除](.agents/notes/README.md#归档与删除)处理。
- `archived/` 下的记录已冻结：永不编辑，也不作为当前行为的权威。
