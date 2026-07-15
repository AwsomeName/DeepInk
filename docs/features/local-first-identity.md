# 本地优先身份

> 当前事实源。最后更新：2026-07-16。

## 结论

CCLink Studio 必须免登录进入本地工作台。登录 CCLink 是官方账号、设备网络、消息网络和跨设备任务状态的入口，不是本地桌面壳启动门槛。

## 当前边界

Studio 本地身份只负责：

- 给本机工作台状态一个稳定 owner。
- 保存本地 workspace state、草稿、Tab、浏览器状态和本地会话。
- 支持未登录状态下使用浏览器、Markdown、Terminal、数据源和设备自动化。

官方账号能力由 `/Users/apple/Desktop/chat-cc/deploy` 和 `/Users/apple/Desktop/chat-cc/Agent` 承接，通过 `cclink-dev` 官方集成层接入。

## 本地身份服务

- 主进程启动时确保存在稳定本地身份。
- 本地身份写入 `userData/local-identity.json`。
- preload 暴露 `identity.getLocalIdentity()`。
- 本地身份不包含官方账号 token、消息凭证、支付状态或配额信息。

## 验收标准

- 未登录可以进入主工作台。
- 未登录可以恢复本地 workspace state。
- 登出官方账号不删除本地工作现场。
- Renderer 只能看到非敏感本地身份 snapshot。
- 官方账号接入失败不影响本地工作台启动。
