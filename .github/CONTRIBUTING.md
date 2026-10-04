# 贡献

感谢你愿意为 md2pdf 作出贡献。

## 本仓库不接受外部 PR

md2pdf 仍处于早期阶段，且由单人维护，上游依赖（Electron 三平台打包、Chromium
`printToPDF` 保真）的验证成本很高。**很抱歉，本仓库目前无法接受外部 Pull Request。**

这不是对贡献价值的判断，而是能力边界：一个只在 Linux 上改过渲染器的补丁，
维护者无法在 macOS / Windows 上验证其视觉与导出结果，review 与返工的成本
高于自行实现。仓库的交付纪律（`AGENTS.md`、[Agent Notes](.agents/notes/README.md)）
也建立在只有维护者掌握的上下文之上。

Issue 通道完全开放——下面是最有用的几种参与方式。

## 你可以怎么参与

### 1. 报告问题（最有用）

开一个 [Issue](https://github.com/BoogonClothman/md2pdf/issues/new/choose)，模板会问你几件事：

- **最小复现的 `.md` 文件**是最高价值的一项：多数 PDF 导出问题（分页、公式、
  Mermaid 图表、代码高亮、字体）都能被一个几十行的 Markdown 文件精确复现；
- 期望结果 vs 实际结果，附截图或导出产物；
- 平台与本应用版本（`md2pdf` 版本见安装包文件名或 `package.json`）。

大规模 Markdown、特殊字体或超长文档导致的问题同样欢迎——请说明文档规模。

### 2. fork 自用

许可证是 MIT：你可以 fork 本仓库、自行修改并构建自用，无需征得同意。
`README.md` 的「开发」「打包」两节写了完整命令（`npm ci`、`npm run dev`、
`npm run dist:linux|win|mac`）。`.npmrc` 默认使用 npmmirror 镜像，
若你的网络访问该镜像不畅，可用 `npm ci --registry=https://registry.npmjs.org`。

### 3. 推动较大的改动

如果你认为某项能力缺失、方向需要调整，或愿意自己实现一个较大的改动：
请先开一个 Issue 说明**动机与使用场景**，由维护者判断是否纳入路线图并实现。
被采纳的议题会附上 Agent Note 记录决策依据。

## 安全漏洞

**请勿用公开 Issue 报告安全漏洞**：本应用渲染不可信 Markdown，
CSP、导航白名单与外链 IPC 白名单的绕过手法不适合公开披露。
请使用 GitHub 的私密漏洞报告，详见 [SECURITY.md](.github/SECURITY.md)。

## 语言

本仓库**仅中文**，不设 i18n 双语机制：Issue、讨论与仓库文档均以中文为准，
用英文提交同样会被阅读，只是回复也会是中文。

## 面向维护者

以下约定只对维护者（即唯一有合入权的人）生效，外部贡献者无需遵守。

- 开发命令与 Agent Notes 常设要求见 [AGENTS.md](AGENTS.md)；
- 非平凡变更在同一 PR 内留痕：新建用 `npm run note -- <class> <slug>`，
  更新已有 Note 亦可满足；纯机械或局部改动豁免；
- PR 正文按 [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) 填写；
- CI 三平台（Linux / Windows / macOS）执行 `verify:notes`、`typecheck`、`verify`
  与打包，这些无需在 PR 里复述，只需写清 CI 之外的验证与**未验证范围**；
- 本决策自身有回退条件：出现持续高质量的外部贡献者或决定引入 i18n /
  第二位维护者时，按 [Agent Note](.agents/notes/implemented/process/2026-10-04-pr-template-and-contribution-policy.md) 记录的条件重新评估。
