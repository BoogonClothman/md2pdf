# Agent Note: 文档渲染主题试点

Status: implemented

## 问题

md2pdf 的文档渲染只有一套写死的 GitHub 风浅色样式（`src/renderer/doc.css`），
预览与 PDF 导出共用它。用户对个性化输出有真实需求：屏幕阅读的深色稿、
打印/交稿用的衬线学术稿、代码重文档的深色配色。样式还散落着硬编码——
hljs 十几个 token 色、表格斑马纹、mermaid `theme: 'default'`、
`@media print` 的 `background: #fff`、导出页码 footer 的 `#666`——
任何"换个外观"的改动都要同时改 HTML/CSS/TS 多处，没有收口。

同时要明确边界：**应用外壳**（工具栏、编辑器）的换肤不在本决策范围内，
外壳主题另有安排；本决策只管 `.doc` 文档内容的渲染主题，且必须
预览与 PDF 一致（README 的卖点是所见即所得 `printToPDF`）。

## 决策

分两个 PR 交付，均已合入。

**PR-1：纯重构，token 化（输出逐像素等价）。**

- `doc.css` 的 hljs token 色、字体栈、表格斑马纹全部收进 CSS 变量
  （`--hljs-*`、`--doc-font`，与 `--doc-*` 并列）；
- `@media print` 页底与 `styles.css` 的 `#preview-wrap` 底色改用 `var(--doc-bg)`；
- 新建 `src/shared/themes.ts` 注册表：`id / label / mermaidTheme / footerColor`
  纯数据 + `isThemeId()` 校验，主进程 footer、渲染端下拉与 mermaid
  映射共用这一处（单一事实源）；
- `PdfOptions.theme` + `ExportPayload.theme` 贯通导出链：
  toolbar 下拉 → `readPdfOptions()` → `md2pdf.settings` → `ExportRequest`
  → export payload → 导出页设 `documentElement.dataset.theme` → `printToPDF`；
- `render.ts` 的 mermaid 初始化从模块级写死改为 `setMermaidTheme()` 入口
  （mermaid 11.17 的 `initialize` 可重复调用）；
- `export.ts` 的页码 footer 颜色改查注册表
  （footer 是独立 HTML 上下文，吃不到页面 CSS 变量，必须在主进程拼）；
- 等价性证明：verify 11 项原样通过，**窗口截图与重构前 md5 全等，
  PDF 仅 `/CreationDate`/`/ModDate` 共 10 字节差异**。

**PR-2：注册三个新主题 + toolbar 下拉 + verify 扩展。**

| id | 标签 | 定位 | mermaid |
|---|---|---|---|
| `github-light` | GitHub Light | 默认，零回归基线 | `default` |
| `github-dark` | GitHub Dark | 屏幕阅读，逼通深色链路 | `dark` |
| `serif-print` | Serif Print | 衬线栈、黑白为主（打印/交稿） | `neutral` |
| `vscode-dark` | VS Code Dark+ | 代码重文档 | `dark` |

CSS 作用域三层规则（**深色不得污染编辑器**——编辑器 overlay 靠 doc.css 的
`.hljs-*` 全局规则上色，而它在 `.doc` 之外）：

```css
:root { ...全部浅色 token... }              /* 编辑器/外壳恒取此层 */
html[data-theme='x'] { --doc-bg: ...; }      /* 仅页面底色：预览纸面、print 页底 */
html[data-theme='x'] .doc { ...内容 token... } /* 仅 .doc 子树覆盖 */
```

- 下拉选项由 JS 从 `THEMES` 填充，防止 HTML 与注册表漂移；主题切换
  联动 `applyTheme()`（data-theme + mermaid）+ `persistSettings()` +
  `scheduleRender()`（mermaid 把颜色烙进 SVG，必须重渲染）；
- verify 新增 7 条（11→18 项）：深色主题完整导出（3 条：无错/体积/魔数）、
  GUI 切主题后 `data-theme` 生效 + 预览计算色变化 + 编辑器仍浅色 +
  设置持久化（4 条）；
- 字体只用系统栈（serif 主题含中文回退 Songti SC/SimSun/Noto Serif CJK），
  不捆绑字体文件；PDF 内嵌字体实测：serif 导出嵌 LiberationSerif（Linux
  无 Georgia 时的回退），浅色嵌 LiberationSans。

深色 PDF 页底经字节级验证：github-dark 为 `#0d1117`、vscode-dark 为
`#1e1e1e`，预览与打印一致。

## 曾考虑的替代方案

**完全自定义（用户任意 CSS 文件）（否决）。** 任意 CSS 意味着 `npm run verify`
的截图/几何断言对它无意义——无法验证；用户写坏 CSS 时预览与 PDF 一起坏，
故障归因到应用；且 CSP `img-src` 允许 `https:`，CSS `url()` 可发起外联，
扩大安全面。白名单 token 层覆盖了大部分自定义需求且保持可验证。
（日后若出现真实 Issue 需求，只考虑开放 `--doc-*` 变量层，不开放选择器。）

**应用外壳与文档主题同批换肤（否决）。** 工具栏/编辑器主题是独立工作项，
维护者已明确"应用主题后面再说"；同批做会把本次变更的验证面翻倍，
且外壳与文档的主题 id 不必一一对应（文档主题影响 PDF，外壳不影响）。

**按文档覆盖主题（frontmatter 读取）（推迟）。** 应用级设置先行（与
pageSize/margin 同存 `md2pdf.settings`）；frontmatter 需要额外定义
优先级与用户可见性，等应用级主题稳定后再评估。

**深色主题导出时强制回浅色（否决）。** 这会破坏"预览=PDF"的所见即所得
承诺——用户在预览里看到深色却导出浅色是可感知的欺骗。深色 PDF 费墨、
部分打印机不吃深底，是有意接受的代价（用户明确要求打印效果=预览效果）。

**主题走 CSS 文件而非注册表（否决）。** mermaid theme 与 footer 颜色无法用
CSS 变量表达（前者是 JS API，后者在主进程拼 HTML），必须有 TS 侧数据；
拆成"CSS 文件 + TS 映射"两处会让每个主题的定义散在两个文件里，
注册表方案让一个主题=一个对象+一个 CSS 覆盖块。

## 后果

**收益。** 文档外观成为一等公民设置，与 pageSize/margin 同链路持久化；
新增主题 = 注册表一行 + CSS 覆盖块一段，无管道改动；深色链路
（printBackground、footer 对比度、mermaid 切换）被 verify 兜住；
重构先于功能的两段式让等价性可用 md5/PDF 字节机械证明。

**代价。** 主题数量是线性维护成本——每个主题都要过三平台 verify 与人工目检，
试点期定 4 个（1 默认 + 3 新增），加第五个前先问是否砍一个；深色 PDF 费墨、部分打印机不吃深底，有意接受；
`vscode-dark` 与 `github-dark` 同为深色，区分度主要在代码配色（人工目检确认
存在差异但不大），若后续 Issue 反馈两者混淆，宁可砍掉一个也不加第五个。

**WYSIWYG 的边界（写给用户，也写给未来的发行文档）**：颜色/字体/风格
预览=PDF；页码 footer、页边距、分页位置预览不可见——这是现状固有行为，
非本变更引入，主题上线后用户可能误以为"预览坏了"，发行文档需说明。

**已知风险。** serif 主题跨平台字形差异（系统字体栈，不捆绑字体文件）——
有意接受；旧版本升级时 `StoredSettings` 无 `theme` 或含未知 id 由
`isThemeId()` 回退默认，不炸；mermaid `initialize` 重复调用的合并行为
若在未来 mermaid 版本变化，深色图可能回浅——切换后强制
`scheduleRender()` 已把影响面收在单次渲染内。

## 相关

- 主题注册表：`src/shared/themes.ts`
- CSS 作用域规则注释：`src/renderer/doc.css` 头部
- 四主题截图与 PDF 实证：`verify-md2pdf/themes/`（工作区 verify 输出目录）
