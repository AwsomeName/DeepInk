# S0 核心流程验收记录

> 状态：进行中。候选分支：`codex/stabilization-s0`。日期：2026-07-20。

## 结论

自动化基线已经通过；下表只保留必须由可见应用和真人参与才能确认的产品行为。真实账号密码、验证码、Cookie 和 token 不得写入本文、截图文件名或诊断日志。

## 自动化证据

| 能力                                   | 状态 | 证据                                                     |
| -------------------------------------- | ---- | -------------------------------------------------------- |
| 免登录启动与本地能力降级               | 通过 | `smoke:local` 9/9；缺少 adb 时应用启动，设备能力明确降级 |
| 工作台入口与本地 UI                    | 通过 | `smoke:ui` 5/5                                           |
| Markdown 文本编辑、保存与 Terminal cwd | 通过 | `smoke:workflow` 5/5                                     |
| 工作区重启恢复                         | 通过 | `smoke:restore` 4/4                                      |
| Profile 跨 Electron 重启持久化         | 通过 | 严格 `smoke:auth-window`：local storage 与 Cookie 均保留 |
| 纯净 Google 登录兼容性                 | 通过 | 纯净窗口到达账号校验；CDP 对照窗口被判为不安全           |
| 完整门禁和生产构建                     | 通过 | 107 个测试文件、718 项测试、typecheck 和 build 通过      |

## 真人验收

每项执行后填写结果、时间和证据位置。结果只能是 `通过`、`失败` 或 `阻塞`。

### H1：Markdown 图片与重启恢复

1. 打开一个本地项目中的 Markdown 文件。
2. 插入一张本地图片，保存后关闭该 Tab。
3. 重启 Studio，重新打开文件。
4. 确认正文和图片均存在，图片路径仍属于该工作区，未生成丢失或重复资源。

期望：保存、关闭和重启后内容一致；失败时记录 Markdown 文件路径和脱敏诊断日志。

- 结果：通过
- 时间：2026-07-20 19:42 CST
- 证据：候选提交 `6588cf2`；验收项目 `cclink-s0-acceptance`。真人确认关闭并重新打开 Tab 后正常；随后完全重启 Studio，重新打开同一文件，自动检查确认正文仅有一个托管图片引用，图片完整加载为 1196×1338，托管资源和 manifest 均位于该工作区。运行日志：`/tmp/cclink-studio-dev/cclink-studio-dev.log`。

### H2：Terminal URL 留在应用内

1. 在当前项目新建 Terminal，确认提示符 cwd 是项目目录。
2. 执行 `open https://example.com/cclink-s0-terminal-browser`。
3. 确认 Studio 内出现纯净网页窗口，没有启动系统默认浏览器。
4. 关闭纯净窗口，确认焦点回到 Studio，Terminal session 状态仍可判断。

期望：URL 只进入 Studio 管理的纯净窗口；窗口关闭不会终止无关 Terminal。

- 结果：通过
- 时间：2026-07-20 19:55 CST
- 证据：候选基线 `6588cf2` 加当前待提交 Terminal shim 修复；验收项目 `cclink-s0-acceptance`。自动检查确认新建 Terminal 的 cwd 为验收项目目录，`open` 解析到 Studio 管理的 `cclink-studio-terminal-browser/open`，测试 URL 启动带 `--cclink-clean-browser` 标识的独立应用内进程。真人确认出现 CCLink 管理的纯净窗口而非 Safari/Chrome，关闭后焦点返回 Studio，原 Terminal 仍存在且可继续使用。运行日志：`/tmp/cclink-studio-dev/cclink-studio-dev.log`。

### H3：真实站点登录、回接与持久化

1. 从 Studio 内嵌浏览器发起已支持站点的登录。
2. 在纯净认证窗口中由用户完成密码、验证码或安全密钥步骤。
3. 登录完成后确认认证窗口关闭或进入完成态，焦点回到 Studio。
4. 确认原浏览器 Tab 显示已登录状态。
5. 完全退出并重启 Studio，再次打开同一 Profile，确认仍保持登录；站点主动过期除外。

期望：认证状态只写回匹配的 `tabId/profileId`；不打开系统浏览器，不记录密码、验证码或完整 Cookie。

- 站点：V2EX
- Profile：`v2ex`
- 结果：通过
- 时间：2026-07-20 20:03 CST
- 证据：候选提交 `6588cf2`。此前真人在 Studio 管理的独立纯净认证窗口中完成真实站点认证，认证结果回接到 V2EX Tab；认证窗口与系统浏览器隔离，未记录密码、验证码、账号标识或 Cookie 值。随后为 H1/H2 完全退出并重启 Studio；本项验收时真人重新打开同一 `v2ex` Profile，确认页面仍为登录状态，证明登录状态已跨 Studio 进程重启持久化。

### H4：双项目切换隔离

1. 同时打开项目 A 和项目 B。
2. 在 A 中打开独有 Markdown、Browser、Terminal 和 Agent 会话。
3. 切换到 B，创建不同的 Tab 和 Terminal cwd。
4. 来回切换两次，确认 Tab、浏览器页面、会话、Terminal cwd 和运行状态不串项目。
5. 关闭其中一个项目，确认另一个项目继续正常工作。

期望：每项状态都归属正确 workspace；后台任务可见且不被误判为停止。

- 结果：通过
- 时间：2026-07-20 21:08 CST
- 证据：候选基线 `6588cf2` 加当前待提交修复。项目 A 使用 `woniu-forward` 的 V2EX Browser 与会话状态，项目 B 使用 `cclink-s0-acceptance` 的 Markdown 与 Terminal。真人在两个项目间来回切换，确认 Browser、会话和 Terminal 未串项目；重新打开项目 B 的 `h1-markdown-image.md` 后再次往返，Markdown Tab 仍保留。关闭项目 B 未影响项目 A 的现有页面和操作状态。

### H5：任务状态与项目切换

1. 在项目 A 启动一个持续至少 30 秒且可安全终止的 Agent 或 Terminal 任务。
2. 切换到项目 B，再切回 A。
3. 确认任务明确显示为运行、完成、失败或已终止，不出现无状态空白。
4. 终止任务并确认状态和日志收敛。

期望：项目切换不隐式终止任务，UI 与诊断日志使用同一任务归属和终态。

- 结果：通过
- 时间：2026-07-20 21:31 CST
- 证据：候选基线 `6588cf2` 加当前待提交修复。真人在 `cclink-s0-acceptance` Terminal 启动 60 秒本地倒计时，运行中切换到 `woniu-forward` 再返回，确认输出继续增长且没有被项目切换隐式终止。随后使用 `Control+C` 终止命令并执行 `exit`，Terminal 明确显示“进程已退出，退出码 130”，未停留在运行中或无状态空白；验收截图：`codex-clipboard-94cd0e86-2855-4ba2-9f67-a9d20432c9c5.png`。

## 失败记录要求

失败或阻塞项必须记录：候选 commit、操作步骤、预期、实际、发生时间、工作区非敏感标识、诊断日志路径和截图路径。诊断日志默认位置为 `/tmp/cclink-studio-dev/cclink-studio-dev.log`；复制 Studio 诊断报告时继续保持脱敏。

全部 H1-H5 通过、CI 通过且工作树干净后，才可把 S0 标记为完成。
