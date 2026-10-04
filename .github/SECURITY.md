# 安全策略

本应用会渲染**不可信的 Markdown 输入**（用户打开的任何 `.md` 文件与其中的 HTML），
因此安全问题按漏洞处理，不走公开 Issue。

## 报告漏洞

优先使用 GitHub 的**私密漏洞报告**：

<https://github.com/BoogonClothman/md2pdf/security/advisories/new>

如果该入口不可用，可发邮件至 `BoogonClothman@outlook.com`（公开仓库已包含该地址），
标题以 `[SECURITY]` 开头。

请**不要**用公开 Issue 或 PR 披露下列内容——在修复发布前公开，等于把利用手法交给所有人：

- CSP、导航白名单或外链 IPC 白名单的绕过；
- 通过恶意 Markdown 触达 Node / 文件系统 / 网络的路径；
- 经由导出页面（`printToPDF` 路径）逃出渲染沙箱的手法。

请附：最小复现的 `.md` 文件、应用版本与平台、期望与实际结果；如能给出影响评估更好。

## 处置预期

- 单人维护的项目，无法承诺响应时限；收到后会尽快确认并给出初步判断。
- 修复随**最新发行版**发布；本项目不维护旧版本分支。
- 确认修复后，会在 GitHub Release 的发行说明中致谢（如你希望匿名请说明）。

## 安全模型摘要

完整描述见 [README.md § 安全模型](../README.md#安全模型)。当前防线：

- 无 HTTP 服务、不监听任何端口（`file://` 直载），CSP `connect-src 'none'`；
- `contextIsolation` + `sandbox` + `nodeIntegration: false`；
- `will-navigate` 仅允许 `dist/renderer` 下的 `file://`；弹窗一律拒绝；
- 外链经 IPC 白名单（仅 `https?` / `mailto`）交给系统浏览器。

相关实现：`src/main/security.ts`（隔离与导航策略）、`src/main/export.ts`（导出路径）、
`src/preload/preload.ts`（contextBridge 白名单 API）。

## 不在范围内

- 需要本机已被攻破或需要物理访问的攻击场景；
- 应用以非官方方式重新打包、签名或修改后的行为；
- 依赖项的已知漏洞若无本应用内的可达路径（请直接向上游报告）。
