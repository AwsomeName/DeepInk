# S4 与稳定化退出验收

> 状态：H1-H4 真人验收通过，等待最终关闭提交自身复验。分支：`codex/stabilization-s4`。日期：2026-07-21。

## 范围

本记录只验收 S4.4 新增的诊断关联，以及 S1-S4 改造后仍需真人操作的 Agent 运行、取消、压缩和项目切换。S0 的 Markdown、Terminal 应用内 URL、真实 V2EX 登录持久化、双项目隔离和长 Terminal 任务已在 `docs/ops/stabilization-s0-acceptance.md` 留证；本轮不重复输入密码、验证码或执行任何远端发布动作。

退出稳定化阶段必须同时满足：最新提交当前工作树门禁、全新 detached worktree 门禁、远端 CI、以下 H1-H4、工作树干净。未全部满足前，S4 和稳定化阶段保持进行中。

## 自动化证据

- 候选提交：`f07dbea`（包含 H4 首测失败后的修复）。
- 当前工作树 `pnpm verify`：通过，145 个测试文件/878 项测试，typecheck 与生产构建成功。
- 当前工作树 `pnpm smoke:standalone`：通过，local 9/9、UI 6/6、workflow 5/5、restore 4/4。
- 当前工作树严格 `smoke:auth-window`：通过；Profile Cookie/localStorage 跨进程重启保留，干净认证进程到达 Google account validation，CDP 对照被拒绝。
- detached worktree 路径与结果：`/tmp/cclink-studio-s4-h4-verify.t0YF07`，从 `f07dbea` 执行锁定安装、145/878、standalone 24/24、严格认证 smoke，全部通过且 HEAD 与工作树干净。
- GitHub Actions run：`29841461326`，绑定 `f07dbea`，`verify` 与确定性 `smoke` job 成功。
- 安全检查：复制报告不得包含真实 Session ID、Cookie 值、密码、验证码、token 或完整手机号/邮箱。

## 真人验收

每次只执行一个低风险步骤。结果只能是 `通过`、`失败` 或 `阻塞`；失败必须先转成复现测试并修复，不能靠重复点击涂绿。

### H1：真实 Agent 浏览器任务完成与关联日志

1. 在本地项目选择一个已打开的普通网页 Tab，不执行登录、发布或删除。
2. 在绑定该浏览器的 Agent 会话发送一个只读任务，例如读取页面标题并概括首屏。
3. 等待任务完成，确认会话不再显示运行中，BrowserTask 有明确终态。
4. 点击复制诊断，确认 `关联链` 为 `matched`，workspace、conversation、taskRunId、run、session 引用、tab 和 profile 均可判断，时间线中的浏览器动作带同一 `taskRunId`。

- 结果：通过
- 时间：2026-07-21 22:35 CST
- 证据：真人在 `woniu-forward` 的 `V2EX操作会话` 完成只读页面标题与首屏概括。复制诊断显示关联状态 `matched`，workspace/conversation/tab/default profile 均一致，BrowserTask 终态为 `completed`；title、extract、screenshot、evaluate 的 action 起止事件携带同一 `taskRunId`。UI/Main Session 一致且只输出进程内随机引用，未输出 Session ID、Cookie 值或其他登录凭证。同会话此前一次 429 作为旧时间线保留，但未污染本次任务归因。

### H2：人工取消收敛

1. 启动一个可安全取消、持续足够时间的只读 Agent 任务。
2. 在运行中点击停止一次，再重复点击一次。
3. 确认只有一次取消生效，会话退出运行态，不出现重复错误或空白状态。
4. 复制诊断，确认 BrowserTask 为 `cancelled`、`failureReason=user_interrupted`，关联链没有串到其他会话。

- 结果：通过
- 时间：2026-07-21 22:37 CST
- 证据：真人在 H1 同一会话启动 60 秒只读等待任务，并在 Agent 进入运行态后手动停止。复制诊断显示关联状态 `matched`，workspace/conversation/session-ref/tab/default profile 全部保持一致；会话运行标记和最近终止原因均为 `cancelled`，BrowserTask 终态为 `cancelled`、`failureReason=user_interrupted`，UI loading、main busy 与流式消息均已清空，未出现重复错误或串到 H1 的 taskRunId。

### H3：手动上下文压缩

1. 在已有 backend Session 且当前不运行的会话触发手动压缩。
2. 等待压缩完成，确认会话消息不重复、不丢失，压缩状态回到 idle/完成态。
3. 再发送一条短消息，确认沿用同一会话继续运行；失败时必须显示明确错误而不是一直 loading。

- 结果：通过
- 时间：2026-07-21 22:39 CST
- 证据：真人在已有 backend Session 且 Agent 空闲的 H1/H2 会话打开上下文窗口，手动触发压缩并确认完成；压缩后会话可继续发送和接收短消息，未出现持续 loading、消息重复或消息丢失。

### H4：运行中项目切换与回切

1. 在项目 A 启动一个持续至少 20 秒的低风险 Agent 只读任务。
2. 切到项目 B，确认 B 不显示 A 的会话、BrowserTask 或确认卡。
3. 切回 A，确认任务仍明确显示 running/completed/cancelled/failed 之一，不出现“看不出是否停止”的状态。
4. 完成或取消任务后复制诊断，确认 workspace/conversation/task/run/session/profile 仍属于 A。

- 结果：通过（首次失败后修复复测）
- 时间：首次失败 2026-07-21 22:42 CST；修复复测通过 2026-07-21 23:40 CST。
- 首次失败证据：真人在项目 A 的 `V2EX操作会话` 启动 30 秒只读任务，切到项目 B 后项目条至少 10 秒停留在“正在切换”，未在可接受时间内完成。诊断显示第一次标题为 `仪表盘 - Brioi`，等待期间切换项目后第二次标题错误变为项目 B 的 `V2EX › 使用邀请码激活账号`。根因拆为两条：Agent 流式会话快照逐次排队落盘，切换等待旧项目写队列；Browser MCP 按 workspace 同步 Tab 后仍从全局活跃 Page 执行动作，和 UI 切换发生竞态。
- 修复与复测证据：`f07dbea` 将快照持久化改为单飞并只合并最新待写值，为 Browser/Terminal 可选对账设置 1.5 秒上限，并按 conversation 关联的 BrowserTask 精确选择 Tab Page。回归测试、当前工作树、全新 detached worktree 和远端 CI 均通过。真人在修复后的新 Studio 进程重复 30 秒只读任务，在运行中切换到项目 B、等待并回切项目 A；项目切换不再出现 10 秒卡顿，B 未混入 A 的运行投影，A 的两次页面标题保持一致且未漂移到 B，H4 确认通过。

## 退出结论

H1-H4 真人验收及 `f07dbea` 的当前工作树、全新 detached worktree、严格认证 smoke 和远端 CI 均通过。下一步只形成独立关闭提交，并要求该最新 HEAD 再次通过干净工作树、完整门禁、全新 detached worktree 与远端 CI；在这组关闭提交证据完成前不提前宣称稳定化阶段已关闭。
