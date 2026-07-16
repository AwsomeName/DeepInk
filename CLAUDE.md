# CCLink Studio — CLAUDE.md

> Claude Code 项目上下文。事实源与 `AGENTS.md`、`README.md`、`docs/architecture.md` 保持一致。

## 结论

CCLink Studio 是 CCLink 的开源桌面工作台端。本仓库只承载可以独立运行的本地桌面壳，不内置官方生产 API、账号真相源、消息凭证、订阅、配额、支付、官方更新源、签名、公证或上传链路。

官方账号、设备注册、配对、消息路由、官方运行时和发布链路由 `/Users/apple/Desktop/cclink-dev` 与 `/Users/apple/Desktop/chat-cc` 承接：

- `/Users/apple/Desktop/cclink-dev`：官方构建/总控工作区。
- `/Users/apple/Desktop/chat-cc/deploy`：CCLink 云函数和账号体系。
- `/Users/apple/Desktop/chat-cc/Agent`：CCLink Agent runtime。

不存在额外拆分出的云端或 Agent 独立项目。

## OSS 默认能力

- Electron + React + TypeScript 桌面工作台。
- 本地工作空间、文件树、Tab、草稿、会话和 workspace state。
- 内嵌浏览器和 Playwright 自动化。
- Markdown 编辑器和微信 HTML 转换。
- 本地 Agent 面板、本机 Claude Code 后端、MCP 工具和权限确认。
- 本地 Terminal、审计和历史记录。
- 数据源只读查询。
- Android 真机连接和本地设备自动化。
- 本地设置、主题、命令面板、状态栏和诊断。

## 禁区

不要在 OSS 默认路径加入或恢复：

- 官方登录、订阅、支付、entitlement、quota。
- 官方消息网络、设备注册、配对、消息凭证。
- 云同步、网络工作区、网络文件树、网络执行。
- Android SDK 下载、AVD 管理、模拟器启动、托管设备服务。
- 生产 API 地址、制品上传、签名、公证、官方更新源。

## 开发命令

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

也可以用后台脚本：

```bash
bash scripts/restart.sh restart
bash scripts/restart.sh status
```

## /grilling 规则

架构方案、阶段总结、质量判断和重大技术取舍必须先给结论，再拷问假设、完成度、边界、失败路径和下一步最该做什么。
