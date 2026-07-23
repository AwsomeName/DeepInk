# Desktop Release And Updates

> 状态：R0 实施中。直接分发是当前目标；Mac App Store 不在本阶段范围。

## 结论

CCLink Studio 采用 Developer ID 直接分发：官方发布层从不可变 Git Tag 构建，
完成签名和 Apple 公证后，将安装包及更新元数据发布到 GitHub Releases。Studio
负责检查、展示、下载和用户确认后的安装，不承载发布凭证。

开源默认构建继续保持无生产更新源。`cclink-dev` 是唯一官方发布编排者，并在
官方构建时注入公开、无凭证的 Release Provider 配置。

## 架构原则

1. **不可变版本**：`package.json` 版本、`vX.Y.Z` Tag 和 Release 版本必须一致。
   已发布 Tag、安装包和更新元数据不得覆盖；修复必须发布更高版本。
2. **单一状态所有者**：主进程 `UpdateService` 是检查、下载和安装状态的唯一
   所有者。renderer 只消费快照并发出用户命令。
3. **发布权限隔离**：签名证书、Apple 公证凭证、GitHub 写权限只存在于
   `cclink-dev` 的受保护发布环境，不能进入 Studio 源码、安装包、renderer、
   preload、日志或诊断包。
4. **默认无副作用**：OSS no-op provider、开发模式、网络失败和元数据损坏都不得
   阻塞 Studio 启动，也不得自动下载。
5. **双重信任**：文件哈希用于检测传输损坏，Developer ID 代码签名用于确认
   发布者身份。只依赖 HTTPS 或同源 URL 不足以自动安装。
6. **人工发布与安装确认**：GitHub Release 先生成 Draft，经人工批准后公开；
   客户端退出和安装前必须由用户确认。
7. **工作保护**：存在未保存编辑、运行中的 Agent 或 Terminal 时，不得直接退出
   安装；必须先展示影响并完成可恢复状态写入。

## 边界与所有权

| 能力 | 所有者 |
| --- | --- |
| 中性更新契约、no-op provider、UpdateService、更新 UI | `cclink-studio` |
| 官方 feed、渠道、签名、公证、Release 上传 | `cclink-dev` |
| 二进制与公开更新元数据托管 | GitHub Releases |
| 发布批准、安装确认 | 人类 |

Studio 不保存 GitHub Token。公开 Release 的检查和下载不需要用户凭证。

## 更新状态机

```text
disabled
  └─> idle
       ├─> checking ──> idle
       │       └─────> available
       └─> failed ───> idle

available ──> downloading ──> downloaded ──> installing
                   └────────> failed
```

状态迁移、错误码、下载路径和校验结果由主进程拥有。renderer Zustand store 只能是
可丢弃的视图镜像，不得缓存可信下载 URL 或自行决定安装目标。

## 里程碑

### R0：可重复发布

目标：

- 从指定 Studio Tag 构建 arm64/x64 安装包。
- 执行确定性门禁，记录 Studio SHA、官方集成 SHA、架构和哈希。
- Developer ID 签名、Apple 公证并 staple。
- 创建 GitHub Draft Release；人工批准后公开。

验收：

- 版本、Tag 和 Release 一致。
- 缺少任一发布凭证时在构建前失败，不生成“正式版”。
- `codesign --verify --deep --strict`、`spctl --assess` 和 `stapler validate` 通过。
- 两种架构在干净 Mac 上安装启动，不要求 `xattr` 绕过。
- Release 资产包含 DMG、ZIP、校验和及构建记录。跨架构更新元数据由 R1
  在全部架构汇总后统一生成。

### R1：可靠半自动更新

目标：

- 官方构建注入 `stable` 或 `beta` Release Provider。
- 启动延迟、周期和手动检查使用同一个 UpdateService。
- 下载适配当前架构的 DMG，支持进度、取消、重试、临时文件和哈希校验。
- 下载完成后打开安装包，由用户手动替换应用。

验收：

- 无 provider、离线、超时、404、损坏元数据和校验失败均可诊断且不阻塞启动。
- renderer 无下载 URL 的权威副本，不接触发布凭证。
- 修改下载文件后必须拒绝继续。

### R2：用户确认后的自动安装

目标：

- 使用签名 ZIP 和成熟 Electron 更新实现下载及安装。
- 用户确认后保存工作区并重启安装。
- 支持“立即重启”和“稍后”，不做强制静默更新。

验收：

- `X.Y.Z` 能发现并安装更高版本，不能覆盖安装同版本或隐式降级。
- Agent、Terminal、未保存编辑和浏览器 Profile 的退出行为可预测且可恢复。
- 安装失败保留旧版本可用，并提供脱敏诊断。

## Mac App Store

Mac App Store 需要独立的沙箱、权限、签名和审核策略。它可以作为未来的第二分发
渠道，但不得通过条件分支污染 Developer ID 直接分发的默认运行时。启动该工作前
必须单独提交 ADR。
