# M5 上下文操作退出验收

> 状态：已通过。日期：2026-07-22。分支：`codex/context-action-m5`。

## 自动化基线

- [x] catalog：command/contribution 唯一、无孤儿、21 种 target 全覆盖。
- [x] boundary：17 个 renderer owner、1 个 native owner、1 个 Store owner。
- [x] 诊断：构建失败、陈旧目标、权限拒绝、领域失败可区分且默认脱敏。
- [x] `pnpm verify` 和 `pnpm smoke:standalone` 在实现提交的全新 detached worktree 通过。

焦点时序修正提交 `c2d8262` 的全新 detached worktree 证据：`pnpm install --frozen-lockfile`、
`pnpm verify` 通过（155 files / 937 tests）；`pnpm smoke:standalone` 通过（local 9/9、
UI 6/6、workflow 9/9、restore 4/4）。远端 CI run `29905998042` 的 verify 和 smoke
job 均通过。

## H1 区域与对象

- [x] 在项目、文件、Tab、消息、Terminal 和任一领域对象上右键，菜单只出现与当前对象有关的操作。
- [x] 装饰空白和凭证输入行不出现无意义或敏感菜单。

结果：用户于 2026-07-22 接受按简单检查通过 H1；自动化 workflow 已覆盖项目、文件、Tab、
消息、Terminal、运营、生产和设置目标，catalog/inventory 门禁补充覆盖完整性证据。

## H2 纯键盘

- [x] 使用 `Shift+F10` 打开菜单，方向键、Home/End、Tab/Shift+Tab 可移动，Enter/Space 可执行，Escape 可关闭并回到原对象。

结果：用户接受按简单检查通过 H2；workflow 覆盖 `Shift+F10`、Tab/Shift+Tab、Home/End、
Space 和 Escape，焦点时序修正后连续五轮 9/9 通过。

## H3 视觉与边界

- [x] 普通、禁用和危险项可区分；禁用项显示原因。
- [x] 窄窗口、全屏和屏幕边缘菜单不被裁切，长文本不溢出。

结果：用户接受按简单检查通过 H3；workflow 已验证禁用原因和 900x620 紧凑视口边界，
菜单 CSS 使用有界宽高与视口避让。

## H4 诊断与隔离

- [x] “开发者：复制工作台状态诊断”包含“上下文操作”小节且不包含凭证原值。
- [x] 项目切换会关闭旧菜单，旧动作不能落到新项目；一个可选模块失败不影响其他菜单。

结果：用户接受简化验收；诊断命令测试验证“上下文操作”小节，M5 单元测试验证敏感字段
脱敏、陈旧目标拒绝和失败 contribution 隔离。

## H5 关键回归

- [x] Browser 登录 Profile、Terminal 粘贴/终止确认、Agent 引用/停止和领域人工确认边界保持不变。

结果：用户接受简化验收；M3 已完成人工回归，本轮未修改 Browser Profile、Terminal 或 Agent
领域执行入口，完整 verify 与 standalone 回归通过。

## 关闭条件

- H1-H5 全部通过并写回结果。
- 区域库存、README、架构与开发文档均为当前事实。
- 最新提交在全新 detached worktree 通过锁定安装、`pnpm verify` 和 standalone。
- 分支已推送且工作树干净，之后才能宣称统一上下文操作系统完成。

结论：H1-H5 全部通过，M5 功能与验收边界关闭。验收记录提交后仍需在最新 HEAD 重跑
干净门禁并等待对应远端 CI，通过后方可合并。
