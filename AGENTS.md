# CCLink Studio — AGENTS.md

> 本文件为 Codex 提供项目上下文，每次会话自动加载。

## 默认协作规则

- **默认启用 `$grill-me`**：每次进行架构方案、实现计划、阶段总结、质量判断或重大技术取舍时，自动执行 `/grilling` 风格审查。
- `/grilling` 风格要求：先给结论，再主动拷问假设、完成度、边界条件、失败路径和下一步最该做什么；不能只报喜。
- 普通小修、小 bug、明确代码实现任务可以简洁执行；最终总结仍需点出残余风险和验证结果。

## 当前产品定位

**CCLink Studio 是 CCLink 的开源桌面工作台端。**

它不是“CCLink Studio 接入 CCLink”，也不是独立账号体系。用户心智只有：登录 CCLink 后看到桌面、手机、网络服务器、Agent 和任务状态。开源仓库当前只承载可以本地运行的桌面壳能力，不内置官方生产 API 地址、账号真相源、官方消息凭证、支付、配额、官方更新源、签名、公证或上传链路。

当前真实项目边界：

- `cclink-studio`：开源桌面壳。
- `cclink-dev`：闭源官方构建/总控工作区，承接发布集成、签名、公证、生产 API 注入、多仓库集成脚本。
- `/Users/apple/Desktop/chat-cc/deploy`：CCLink 云函数和账号体系。
- `/Users/apple/Desktop/chat-cc/Agent`：CCLink Agent runtime。

不存在额外拆分出的云端或 Agent 独立项目。

## 当前开源壳能力

保留在 `cclink-studio` 的能力：

- Electron 桌面壳、preload 白名单 API、React 工作台 UI。
- 本地项目/文件工作区、workspace state、最近项目。
- 内嵌浏览器和 Playwright 自动化。
- Markdown 编辑器和微信 HTML 转换。
- 本地 Agent 面板、MCP 工具、权限确认。
- 本地 Terminal、审计、历史记录。
- 数据源只读查询。
- Android 真机连接和本地设备自动化能力。
- 本地设置、主题、命令面板、状态栏。

启动边界：

- `cclink-studio` 必须可以单仓库独立启动。
- `pnpm dev` 和 `bash scripts/restart.sh restart` 不应依赖 `cclink-dev`、`chat-cc/deploy` 或 `chat-cc/Agent`。
- Android 只支持用户自有 USB / Wi-Fi ADB 真机；缺少 adb 时只降级设备能力，不阻断应用启动。

不在开源壳默认路径中的能力：

- CCLink Account、device registry、pairing、message routing。
- 官方消息凭证、实时消息网络、跨设备任务状态。
- 订阅、entitlement、quota、支付。
- 云同步、网络工作区、网络执行、网络文件树。
- Android SDK/AVD 管理、模拟器启动、托管设备服务。
- 官方发布上传、生产更新源、签名、公证。

## 开发规范

- TypeScript 严格模式。
- 文件名 kebab-case，React 组件 PascalCase，函数/变量 camelCase。
- 禁用 `nodeIntegration`，启用 `contextIsolation`。
- Renderer 只能通过 preload 暴露的白名单 IPC 访问主进程能力。
- 开源壳不得默认 import 或初始化账号、订阅、同步、官方消息网络或网络工作区模块。
- 开源发布脚本只做本地构建和本地打包；官方 release 由 `cclink-dev` 发布集成层承接。

## 常用命令

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm package
pnpm package:dev
```

## 当前验收基线

`cclink-studio` 必须至少通过：

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `git diff --check`
- 残留扫描：preload/runtime/renderer/shared 默认路径不再引用登录、订阅、同步、CCLink/官方消息网络、网络工作区或官方发布链路。
