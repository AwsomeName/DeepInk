# Claude Code 复刻方案调研报告

> 调研日期：2026-07-06
> 调研目标：寻找最接近 Claude Code 的开源基础版本，用于复刻三个版本：
> 1. **服务器编程版**（原版 Claude Code，终端 CLI）
> 2. **桌面版**（面向桌面，支持文档编辑等 GUI 能力）
> 3. **机器人版**（部署到 Jetson，控制机器人）

---

## 一、最终结论

### 推荐基础版本：ClawdCode

**仓库**：[kkkhs/ClawdCode](https://github.com/kkkhs/ClawdCode) · MIT 协议 · `npm install -g clawdcode`

**一句话理由**：ClawdCode 用与 Claude Code **完全相同的技术栈**（Node.js + Ink / React-for-CLI）、**完全相同的核心工具集**（Read/Write/Edit/Bash/Glob/Grep + MCP）、**完全相同的交互方式**（TUI 流式 + Markdown 渲染）重写了一遍 Claude Code。它是最纯粹的复刻，且 MIT 开源、活跃维护、技术栈与 DeepInk（Electron + React + TypeScript）完全一致，嵌入成本最低。

### 排除项

- **OpenClaw**（360K+ stars）：功能太重，桌面控制 + 28K skills + 多通道消息，远超需求范围，**排除**。
- **MiMo Code**：编程能力最强（SWE-bench 82%），但内置大量自有能力（持久记忆、Compose、语音、自进化），作为"基础版本"不够纯净，适合直接用而非作为复刻起点。
- **OpenCode**：生态最成熟（163K stars），但同样偏重，且 TUI 不可直接拆分复用。

---

## 二、ClawdCode 详细评估

### 与 Claude Code 的逐项对比

| 对比项 | Claude Code | ClawdCode |
|--------|------------|-----------|
| 技术栈 | Node.js + Ink (React for CLI) | **同样 Node.js + Ink** |
| 工具集 | Read/Write/Edit/Bash/Glob/Grep | **完全一样 7 个内核工具** |
| MCP 支持 | ✅ | ✅ |
| 权限模式 | 多级权限 | **4 种模式**（default / autoEdit / yolo / plan） |
| 命令行 TUI | 流式输出 + Markdown 渲染 | 流式输出 + **140+ 语言语法高亮** |
| Skills 扩展 | ✅ | ✅ Skills + Hooks（11 个生命周期事件） |
| 上下文压缩 | ✅ | ✅ 自动 token 计数 + 压缩 |
| 会话持久化 | ✅ | ✅ `--continue` 恢复 |
| 许可证 | 闭源付费 | **MIT 开源** |
| 模型 | 仅 Claude | **任意 OpenAI 兼容**（GPT / DeepSeek / Kimi 等） |

### 核心特性

- **智能 Agent Loop**：LLM + System Prompt + Context + Tools，流式输出，思考过程可折叠，AbortController 支持 Ctrl+C 中断
- **内置 7 工具**：Read / Write / Edit（带 diff 预览）/ Glob / Grep / Bash（带权限控制）/ MCP
- **4 权限模式 + 7 阶段执行管线 + 敏感文件检测**（.env、credentials）
- **终端 UI**：Ink（React for CLI）、Markdown 渲染、5 套主题、自动深浅色
- **扩展机制**：Slash 命令、自定义命令（Markdown）、Skills（SKILL.md）、Hooks（11 事件）
- **状态管理**：Zustand store（与 DeepInk 同款）、token 计数与自动压缩、会话持久化与恢复

### 三版本落地路径

```
ClawdCode 核心引擎 (MIT, ~10k LOC)
├── 服务器版 ── 直接 `clawdcode` 即用
│
├── 桌面版 ── 保留 Agent 核心，把 TUI 换成 DeepInk 的 Electron UI
│   ├── DeepInk 已有：Agent Panel + 文档编辑器 MCP 工具 + 浏览器
│   └── 只需嵌入 ClawdCode 的 agent loop，复用现有 UI
│
└── 机器人版 ── 两种方式：
    ├── Jetson 板载：装 Node.js 跑 `clawdcode` + 本地模型 API
    └── 远程控制：ClawdCode 的 MCP 连接 ROS MCP Server → ROS2 机器人
```

### fork 关键文件（嵌入 DeepInk 时关注）

- `src/agent.ts` — Agent 主循环（核心，约 500 行）
- `src/agent/permissions.ts` — 权限系统
- `src/agent/mcp.ts` — MCP 集成
- `src/tools/` — 工具实现（read / write / edit / bash / glob / grep）

> ClawdCode 的 Agent Loop 架构与 DeepInk 现有的 `src/main/agent/`（Agent Bridge + 可插拔后端 + MCP 工具系统）是对齐的，两边可以直接对接。DeepInk 已有的 66 个 MCP 工具（browser 46 + editor 5 + android 15）可直接接入。

---

## 三、完整候选方案对比（服务器编程版）

### 第一梯队

| 项目 | 语言 | 协议 | 核心优势 | 适合 |
|------|------|------|---------|------|
| **ClawdCode** ⭐推荐 | Node.js/TS | MIT | 最纯粹的 Claude Code 复刻，技术栈同构 | 复刻基础版本 |
| **MiMo Code** | TS | MIT | SWE-bench 82%（超 Claude Code 79%），持久记忆 + Compose | 直接用，追求最强编程能力 |
| **OpenCode** | 多语言 | MIT | 163K stars，75+ 模型，最成熟生态 | 直接用，追求稳定 |

### 第二梯队（轻量 / 可嵌入）

| 项目 | 语言 | 协议 | 特点 | 注意 |
|------|------|------|------|------|
| **Keen Code** | Go | MIT | 单二进制 9MB，仅 6 工具，TurnMemory 省上下文 | 无 TUI，体验不如 CC |
| **open-claude-cli** | TS | MIT | 仅 ~4000 行，架构清晰，8 项核心创新，可作 SDK | 0 star / 0 下载 / 单维护者 / 疑似基于泄漏代码 |
| **TIMPS Code** | Node.js | — | 默认 Ollama 本地模型，三层持久记忆 | 太新，社区小 |

#### open-claude-cli 的 8 项架构创新（学习价值高）

1. 流式工具执行（`tool_use_stop` 立即触发）
2. 并发安全调度（读工具并行、写工具串行）
3. 分层 System Prompt（静态缓存 + 动态分块）
4. 上下文压缩（截断 → LLM 摘要 → 断路器）
5. 多提供商（单一 Provider 接口）
6. 权限系统（auto / ask / bypass）
7. 子代理（隔离上下文、深度限制）
8. 延迟工具加载（ToolSearch，节约 40% token）

---

## 四、桌面版候选

| 项目 | 协议 | 特点 |
|------|------|------|
| **Open Claude Cowork** | 开源 | 桌面 AI 助手，兼容 `~/.claude/settings.json`，支持 GLM 4.7 / MiniMax 2.1 等国内模型 |
| **ClawdCode + DeepInk UI** | MIT | 推荐：ClawdCode 核心 + DeepInk 现有 Agent Panel / 文档编辑器 / 浏览器 |

> 桌面版的核心思路：**不重新做 GUI**，直接把 ClawdCode 的 agent loop 嵌入 DeepInk 的 Electron 主进程，复用 DeepInk 已有的桌面能力（Tiptap 文档编辑器、内嵌浏览器 + Playwright、Android 模拟器）。文档编辑通过 DeepInk 现有的 5 个 editor MCP 工具实现。

---

## 五、机器人版候选

机器人版有两种架构思路。

### 思路 A：Jetson 板载直接跑 Agent（离线）

#### Open-Jet ⭐推荐（板载场景）

**仓库**：[L-Forster/open-jet](https://github.com/L-Forster/open-jet) · `pip install open-jet`

就是"Jetson 上的 Claude Code"——自托管、离线、空气隔离的 Agentic TUI。

| 特性 | 说明 |
|------|------|
| 离线运行 | 无需互联网，完全空气隔离 |
| 硬件自动检测 | 自动选择最优推理设置 |
| 统一内存优化 | 针对 Jetson Orin Nano 避免 OOM |
| Agentic 工具 | 文件编辑/读写/创建、Shell、MCP、摄像头、麦克风、GPIO |
| 多运行时 | llama.cpp（本地 GGUF）、OpenAI 兼容 API、TensorRT-LLM |
| 低内存交换 | 重 Shell 命令前后可卸载/重载模型 |

**性能参考**：
- Jetson Orin Nano 8GB + Qwen3-4B-Instruct-4bit → ~17 tok/s
- RTX 3090 + Qwen3.5-27B-Q4_K_M → 38–70 tok/s

### 思路 B：桌面 Agent 远程调用机器人

#### ROS MCP Server ⭐推荐（远程场景）

**仓库**：[robotmcp/ros-mcp-server](https://github.com/robotmcp/ros-mcp-server) · v3.1.0（2026.6）

通过 MCP 协议把 LLM 连接到 ROS2 机器人。**无需修改 ROS 源码**，只需加 rosbridge 节点。双向通信——LLM 既可控制机器人，也可观测传感器数据。

> 这意味着选任何 MCP 兼容的 Agent（ClawdCode / MiMo Code 等），都可以通过 ROS MCP Server 控制机器人，复用 DeepInk 已有的 MCP 工具系统。

#### 其他机器人方案

| 项目 | 说明 |
|------|------|
| **ROS2-Skill** | [adityakamath/ros2-skill](https://github.com/adityakamath/ros2-skill)，通过 rclpy 直接控制 ROS2，无需 rosbridge |
| **RosClaw** | OpenClaw + ROS2 桥（依赖 OpenClaw，已排除） |
| **RAI (Robotec AI)** | 多模态多代理机器人框架，ROS2 集成 |
| **PEACE** | 自然语言驱动无人机/UAV 控制，Ollama + YOLO/VLM |

### 机器人版架构选择矩阵

| 方案 | 场景 | 部署位置 | 延迟 | 离线 |
|------|------|---------|------|------|
| **Open-Jet** | 板载 AI | Jetson 本机 | 低 | ✅ |
| **ROS MCP Server** | 远程控制 | 桌面 → Jetson | 中 | ❌ 需网络 |
| **ROS2-Skill** | Agent 技能嵌入 | 桌面/Jetson | 低 | ✅ 本机可离线 |

---

## 六、与 DeepInk 的关系

DeepInk 实际上已经在做这件事，且架构与 ClawdCode 对齐：

| DeepInk 已有 | 对标 |
|-------------|------|
| Agent Bridge + 可插拔后端 | ClawdCode 的 Agent Loop / MiMo Code 的多模型 |
| MCP 工具系统（66 个工具） | ClawdCode MCP / ROS MCP Server（同一协议栈） |
| 文档编辑器（Tiptap） | 桌面版的文档编辑能力 |
| 内嵌浏览器 + Playwright | 桌面版浏览器自动化 |
| Android 模拟器 | 机器人版的"移动设备操控" |
| Agent Panel UI | 桌面 Agent 面板 |

**落地建议**：以 ClawdCode 的 Agent Loop 为核心引擎，集成到 DeepInk 现有 Electron 主进程，做一个统一核心 + 三端适配（CLI / 桌面 / 机器人）的方案。这正是 DeepInk"下一代 AI 桌面服务"定位的自然延伸。

---

## 七、决策速查表

| 需求 | 最佳方案 | 协议 |
|------|---------|------|
| 复刻基础版本（最接近 CC） | **ClawdCode** | MIT |
| 服务器版（最强编程能力） | MiMo Code | MIT |
| 服务器版（干净可嵌入） | open-claude-cli（注意风险） | MIT |
| 桌面版（跟 DeepInk 集成） | **ClawdCode 引擎 + DeepInk UI** | MIT |
| 机器人版（Jetson 板载） | **Open-Jet** | 开源 |
| 机器人版（远程控制） | **ClawdCode + ROS MCP Server** | MIT / 开源 |

---

## 参考链接

**推荐基础版本**
- [kkkhs/ClawdCode](https://github.com/kkkhs/ClawdCode)

**服务器编程版**
- [XiaomiMiMo/MiMo-Code](https://github.com/XiaomiMiMo/mimo-code)
- [LikiosSedo/open-claudecode](https://github.com/LikiosSedo/open-claudecode)
- [mochow13/keen-code](https://github.com/mochow13/keen-code)
- [OpenCode（DigitalOcean 教程）](https://www.digitalocean.com/community/tutorials/opencode-serverless)

**桌面版**
- [caiqinghua/Open-Claude-Cowork](https://github.com/caiqinghua/Open-Claude-Cowork)

**机器人版**
- [L-Forster/open-jet](https://github.com/L-Forster/open-jet)
- [robotmcp/ros-mcp-server](https://github.com/robotmcp/ros-mcp-server)
- [adityakamath/ros2-skill](https://github.com/adityakamath/ros2-skill)
