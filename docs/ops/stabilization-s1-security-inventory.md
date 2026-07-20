# S1 安全边界库存

> 状态：S1 进行中，S1.1 已完成。分支：`codex/stabilization-s1`。起始基线：`540b93e`。日期：2026-07-20。

## 结论

S1 的首要目标是切断不可信内容、密钥和高权限 IPC 之间的直接路径。本库存只记录可从当前代码验证的事实，不把测试绿色等同于安全边界完成。

## 威胁模型

- 本地 Markdown、HTML、SVG、下载文件和 Agent 输出均可能由不可信来源控制。
- 内嵌网页与认证网页不得获得主 renderer preload；主 renderer 即使发生内容注入，也应被 Chromium sandbox、CSP 和主进程 IPC 校验共同限制。
- API Key、token 和密码不得明文落盘，不得进入 renderer 全量状态、普通日志或诊断报告。
- 任何可读写文件、执行命令、控制浏览器或设备的 IPC 都必须校验调用者、参数结构和资源作用域。

## 当前库存

| 边界 | 当前事实 | 风险 | 状态 |
| --- | --- | --- | --- |
| 微信 HTML 预览 | 原实现允许 Markdown 原始 HTML，并通过 `dangerouslySetInnerHTML` 注入拥有 preload 的主 renderer | 恶意文档可尝试在高权限页面执行脚本 | S1.1 已修复：禁用原始 HTML，改用零权限 sandbox iframe，并增加 iframe 内 CSP |
| 主 renderer | `contextIsolation: true`、`nodeIntegration: false`；S1.1 前 `sandbox: false` | renderer 被攻破后缺少 Chromium 进程沙箱 | S1.1 已改为 `sandbox: true`，待完整 smoke 固化 |
| 主 renderer CSP | `src/renderer/index.html` 尚无 CSP，主窗口也未注入响应头 CSP | 内容和网络能力缺少第二层限制 | 待处理；必须兼容开发 HMR、blob worker、图片和本地预览 |
| Browser/Auth 视图 | 普通 WebContentsView、纯净窗口和认证子进程均启用 sandbox/context isolation，认证窗口无 preload/CDP | 边界已有实现，仍需保持回归门禁 | 已有 S0 smoke 与 H3 证据 |
| preload | `src/preload/index.ts` 约 769 行，向主 renderer 暴露浏览器、文件、Terminal、Agent、Android、数据源等多组高权限 API | 任一主 renderer 注入会获得较大攻击面 | 待按能力拆分并与 IPC contract 同源 |
| IPC sender | 只有少数窗口控制路径显式校验 `event.sender`；多数 handler 默认信任调用方 | 非预期 WebContents 若获得通道访问可能调用高权限能力 | 待建立统一 trusted sender guard |
| IPC schema/scope | 数据源等少数模块使用 Zod；文件、设置、Meshy 等大量 handler 仍接收普通 TS 参数 | 运行时类型、路径和工作区作用域可被绕过 | 待按风险从文件写入、设置、Terminal、设备开始补齐 |
| Agent API Key | `apiKey` 属于 `AppSettings`，写入 `settings.json`，并由 `settings:getAll` 返回 renderer store | 密钥明文落盘并长期暴露给 renderer | 下一工作包最高优先级 |
| Meshy API Key | `meshyApiKey` 同样属于 `AppSettings`；主进程服务直接从普通设置读取 | 密钥明文落盘并进入 renderer 全量状态 | 下一工作包最高优先级 |
| Git/Data source 凭证 | 已使用 Electron `safeStorage` 独立加密文件，普通配置只保留引用或是否已配置 | 已有正确模式，可复用 | 保持现有回归测试 |

## S1.1 不可信 HTML 隔离

实现边界：

- MarkdownIt 禁止原始 HTML；脚本、SVG、事件属性等输入只作为转义文本输出。
- 微信预览使用无 `allow-scripts`、无 `allow-same-origin`、无表单、无弹窗和无顶层导航权限的 iframe。
- iframe 文档增加 `default-src 'none'`、`base-uri 'none'`、`form-action 'none'`，只允许内联样式和受限图片来源。
- 保存 HTML 时转义文件名，避免文件名突破 `<title>`。
- 主 renderer 启用 Electron sandbox；preload 继续通过 contextBridge 提供显式 API。

验收：

- 恶意原始 HTML、事件属性和 `javascript:` Markdown 链接不能形成可执行标签。
- iframe 静态输出必须保留空 sandbox，不能加入 `allow-scripts` 或 `allow-same-origin`。
- `pnpm verify` 与 `pnpm smoke:standalone` 必须通过，确认 sandbox 没有破坏 preload 和本地能力。

结果：通过。`pnpm verify` 完成 111 个测试文件/726 项测试、typecheck 和生产构建；`pnpm smoke:standalone` 完成 local 9/9、UI 5/5、workflow 5/5、restore 4/4。

## 下一工作包

S1.2 迁移 Agent 与 Meshy 密钥：复用 `safeStorage` 模式，启动时显式迁移并删除 `settings.json` 中的明文字段；renderer 只能获取 `configured` 状态，写入使用独立 secret IPC，主进程服务按需读取，重置操作同时删除加密凭证。迁移失败必须保留原值并给出可诊断错误，禁止静默丢失用户密钥。
