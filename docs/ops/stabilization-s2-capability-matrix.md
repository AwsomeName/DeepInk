# S2 能力独立降级矩阵

> 状态：S2.1、S2.2 已完成，S2.3 本地候选已通过。分支：`codex/stabilization-s2`。起始基线：`9fed92c`。S2.1 基线：`56afb38`。S2.2 基线：`fd267a2`。日期：2026-07-21。

## 结论

S2 的目标不是给启动异常多加几层 `catch`，而是保证每项可选能力拥有独立状态、独立失败边界和可验证的降级结果。任何可选模块失败后，本地工作区、文件、编辑器、Terminal 和不依赖该模块的 Agent 工具必须继续可用。

能力状态统一使用：

- `ready`：模块已初始化，当前运行条件满足。
- `degraded`：模块主体已启动，但部分子能力或外部前置条件缺失。
- `unavailable`：模块未配置、未连接或当前环境不提供，且不是程序异常。
- `failed`：模块初始化或运行时绑定发生异常，需要诊断和修复。

## 当前矩阵

| 能力                     | 状态所有者                                   | 当前启动依赖                     | 当前失败影响                                                                 | S2 目标                              |
| ------------------------ | -------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| 本地 Agent backend       | `AgentBridge` / `AgentRuntime`               | 窗口、设置、权限、MCP            | Playwright 和 ADB 已允许缺失；MCP 失败时明确为 `unavailable`                 | 后续验证运行时重连与窗口重建         |
| MCP 工具主机             | `McpToolHost`                                | 权限系统                         | 已在 Playwright 之前独立创建、启动；模块逐项注册                             | 后续纳入统一生命周期声明源           |
| Browser 自动化           | `PlaywrightBridge` / `BrowserManager`        | Browser 窗口构造、CDP 发现与连接 | 窗口构造与 CDP 失败均单独标记 `failed`；Android、MCP、Editor、Agent 继续启动 | S3 补进程内重试与窗口重建            |
| Editor / File Agent 工具 | `EditorToolModule` / `FileService`           | 主窗口与本地文件服务             | 已在 Playwright 之前初始化；MCP 注册失败时为 `degraded`，Editor IPC 仍可用   | 后续补窗口重建覆盖                   |
| Android 真机             | `ActiveDeviceManager` / `AdbBridge`          | 独立窗口能力构造，设备可稍后连接 | 无设备为 `unavailable`；构造异常为 `failed`，不阻断 Browser 与 Agent         | S3 补进程内重试与窗口重建            |
| agent-device 语义层      | `AgentDeviceManager`                         | ADB、active device、动态库       | 已独立初始化；不可用与初始化异常分别记录，不阻断 MCP                         | 后续验证设备连接后的状态迁移         |
| Meshy                    | `MeshyService` / `MeshyToolModule`           | 设置与 API 配置                  | 工具构造/注册已独立，失败不影响后续模块和 MCP                                | 后续隔离服务构造                     |
| Data source              | `DataSourceService` / `DataSourceToolModule` | 本地配置加载                     | 服务加载已独立；失败时 IPC 保留结构化错误，后续能力和 MCP 继续启动           | 后续补运行时重试入口                 |
| Hardware / CAD           | 对应 service / tool module                   | 本地服务、可选外部 CAD 后端      | 服务分别独立初始化；IPC 保留 unavailable 错误且原始原因不被 MCP 覆盖         | 后续补运行时重试入口                 |
| Terminal                 | Terminal orchestrator / execution adapter    | 主窗口、本地 PTY                 | 服务初始化已独立；失败时清理半初始化对象，IPC 保留未就绪响应                 | 后续由 S3 统一停止与窗口重建生命周期 |

## S2.1 验收结果

- [x] CDP 发现或 Playwright 连接失败时，MCP 主机、Editor 工具和本地 Agent backend 仍为 `ready`，Browser 为 `failed`。
- [x] Meshy 工具模块构造失败的注入测试证明后续 Hardware、CAD、Data source、Android、agent-device 和 MCP server 继续初始化。
- [x] `agent:getCapabilities` 返回 `ready`、`degraded`、`unavailable`、`failed` 之一，并包含有界失败原因；`available` 仅作为兼容派生字段。
- [x] 设置页显示四态真实状态；真实启动快照包含 11 项能力，Android 与 Device AI 为 `unavailable`，其余当前能力为 `ready`。
- [x] Agent 面板复制诊断日志包含同一能力快照、状态、原因和更新时间，并继续执行敏感字段脱敏。
- [x] `pnpm verify` 通过：136 个测试文件、812 项测试、typecheck 与生产构建全部返回 0。
- [x] `pnpm smoke:standalone` 通过：local 9/9、UI 6/6、workflow 5/5、restore 4/4。
- [x] 严格 `CCLINK_AUTH_SMOKE_REQUIRE_GOOGLE=1 pnpm smoke:auth-window` 通过：Profile Cookie/localStorage 跨进程保留，纯净认证窗口到达 Google 账号校验页；CDP 与当前自动化窗口对照仍被判为不安全浏览器。
- [x] GitHub Actions run `29798156373` 绑定 `56afb38`，`verify` 和独立 `smoke` job 均成功；CI 认证检查保持为确定性 Profile/窗口机制。

严格认证结果只证明纯净认证窗口路径和 Profile 持久化有效，不表示 Google 接受带 CDP 的自动化登录窗口。S2.1 没有改变该安全边界。

## S2.2 验收结果

- [x] CAD、Hardware、Data Source、Meshy 和 Terminal 主服务逐项初始化；任一失败不阻断后续能力。
- [x] Data Source 缺失时 IPC 返回 `DATA_SOURCE_INTERNAL_ERROR`，CAD/Hardware 缺失时返回明确能力不可用错误，不再退化为 “No handler registered”。
- [x] Terminal 初始化失败时清理半初始化确认服务、Session registry 和执行 adapter，IPC 仍返回明确未就绪结果。
- [x] Official integration 初始化失败回退到 loader 提供的 OSS no-op；Local Identity、Git Backup 和 WeChat 转换失败不再阻断核心服务。
- [x] 主服务的首个 `failed` 原因被保留，后续 MCP 模块注册不会用泛化依赖错误覆盖第一现场。
- [x] `pnpm verify` 通过：137 个测试文件、817 项测试、typecheck 与生产构建全部返回 0。
- [x] `pnpm smoke:standalone` 通过：local 9/9、UI 6/6、workflow 5/5、restore 4/4。
- [x] 严格 `CCLINK_AUTH_SMOKE_REQUIRE_GOOGLE=1 pnpm smoke:auth-window` 通过，结果与 S2.1 安全边界一致。

GitHub Actions run `29799199378` 绑定 `fd267a2`，`verify` 和独立 `smoke` job 均成功。

## S2.3 验收结果

- [x] 主窗口、Dialog IPC 和 Window IPC 保持核心启动路径；Browser 与 Android 改为两个独立窗口能力启动器。
- [x] Browser 构造失败时只清理 Browser 半初始化资源，Android 仍继续启动并保持 `unavailable`；即使 Browser 清理自身抛错，也不扩大失败面。
- [x] Android 构造失败时只清理 Android 半初始化资源，Browser 仍继续启动并等待后续 CDP 连接。
- [x] Browser 窗口构造已标记 `failed` 时，自动化阶段跳过 CDP/Playwright，保留第一现场，不把空的 `BrowserManager` 误报为 `ready`。
- [x] Browser Profile 与下载状态的异步加载失败已被捕获，不再形成未处理 Promise rejection。
- [x] `pnpm verify` 通过：138 个测试文件、820 项测试、typecheck 与生产构建全部返回 0。
- [x] `pnpm smoke:standalone` 通过：local 9/9、UI 6/6、workflow 5/5、restore 4/4。
- [x] 严格 `CCLINK_AUTH_SMOKE_REQUIRE_GOOGLE=1 pnpm smoke:auth-window` 通过，Profile 持久化与 Google 安全边界保持不变。

S2.3 仍需提交、远端 CI 和全新 detached worktree 复验；三项完成前 S2 不关闭。

## 恢复与诊断边界

设置页显示当前四态、失败原因并支持刷新快照，Agent 诊断日志可复制同一份脱敏能力状态。S2 不声称支持进程内自愈：环境修复后，当前恢复入口是重启 Studio，再刷新状态并复验；若仍失败，复制诊断日志定位。服务级重试、统一回滚和窗口重建由 S3 的生命周期注册表负责。

## 后续边界

S2.1 已拆自动化 runtime 内部硬依赖，S2.2 已拆 `bootstrapMainProcessServices` 中的可选主服务，S2.3 已拆 Browser 与 Android 的窗口构造失败边界。服务启动、重试、回滚、窗口重建和停止完全统一到同一声明源属于 S3，本阶段不提前重写整个生命周期框架。
