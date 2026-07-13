# React 状态管理调研报告（2025-2026）

> 调研日期：2026-05-31
> 调研目的：为 DeepInk（Electron + React 桌面应用）选择状态管理方案

## 一、行业全景

### npm 周下载量（2026-02）

| 方案 | 周下载量 | 月下载量趋势 | GitHub Stars | 未关闭 Issues | 体积 (gzip) |
|------|---------|-------------|-------------|--------------|------------|
| **Zustand** | 2250 万 | 2670 万 → 7290 万（3 倍） | 57.1K | **4** | 1.2 KB |
| Redux Toolkit | 1140 万 | 1830 万 → 3710 万（2 倍） | 11.2K | 260 | 12 KB |
| TanStack Store | 720 万 | 多为间接依赖 | 790 | 15 | 1.4 KB |
| Jotai | 290 万 | 8-10 万/月稳定增长 | 21.0K | **3** | 3.5 KB |
| Nanostores | 150 万 | 73.7 万 → 490 万（6.6 倍） | 7.1K | 26 | **0.3 KB** |
| Valtio | 120 万 | 稳定 | 10.1K | **2** | 3.2 KB |
| MobX | 290 万 | — | 28.2K | 86 | — |
| Recoil | — | 已归档废弃 | 19.5K | 322 | — |

### 关键趋势

- Zustand 在 2025 年反超 Redux，成为新项目首选（State of React 2025 使用率 50%，两年内从 28% → 50%）
- Recoil 已被 Meta 归档，切勿使用
- MobX 自 2025-09 停更，不推荐新项目
- Nanostores 增速最快（6.6 倍），主要受 Astro 生态驱动
- 前三名（Zustand / Jotai / Valtio）均为同一作者 **Daishi Kato**（pmndrs 组织），质量一致

### 权威推荐

- **Nadia Makarevich**（developerway.com，React 渲染机制最权威博客）：
  > 2025 推荐技术栈：**TanStack Query + nuqs + Zustand**
  > Zustand 在简洁性、无 Provider、精确重渲染、React 兼容性、开源健康度所有维度胜出

- **Sascha Becker**（saschb2b.com，2026 最详尽数据驱动对比）：
  > Zustand 是 2026 年的"直接用这个就行"之选。57K stars 只有 4 个未关闭 issue。

## 二、三大轻量方案深度对比

| 维度 | Zustand | Jotai | Valtio |
|------|---------|-------|--------|
| **心智模型** | 集中式 store（类 Redux） | 原子化 atom（自底向上） | 可变 Proxy |
| **Hello World 行数** | 5 行 | 4 行 | 5 行 |
| **Provider** | 不需要 | 基本不需要 | 不需要 |
| **重渲染优化** | Selector 自动精确更新 | 每个 atom 独立订阅 | Proxy 追踪属性访问 |
| **计算/派生状态** | 需 middleware | **原生支持** `atom((get) => ...)` | 自动（Proxy） |
| **可在 React 外使用** | ✅ | ❌ | ✅ |
| **DevTools** | Redux DevTools | Jotai DevTools | Valtio DevTools |
| **中间件生态** | **最丰富**（persist, immer, devtools） | 较少 | 较少 |
| **TypeScript** | 极好 | 极好 | 好 |
| **社区/招聘池** | **最大** | 中等 | 较小 |

### 代码风格对比（计数器示例）

```tsx
// Zustand — 集中式 store，读两行文档就会
const useStore = create((set) => ({
  count: 0,
  inc: () => set((s) => ({ count: s.count + 1 })),
}))

// Jotai — 每个 state 是独立 atom
const countAtom = atom(0)
const doubledAtom = atom((get) => get(countAtom) * 2)  // 派生状态原生支持

// Valtio — 直接改对象，像写普通 JS
const state = proxy({ count: 0 })
state.count++  // 直接变异
```

## 三、Electron 桌面应用专属考量

| 考量 | Zustand | Jotai | Valtio |
|------|---------|-------|--------|
| **跨进程状态同步** | ✅ 有社区 IPC middleware + persist middleware | 需自己实现 | 需自己实现 |
| **在主进程使用** | ✅ 不依赖 React | ❌ 绑定 React | ✅ 不依赖 React |
| **状态持久化** | ✅ persist middleware 原生支持 | 需额外库 | 需额外库 |
| **多窗口同步** | ✅ BroadcastChannel + persist-and-sync 方案 | 可行但无现成方案 | 可行但无现成方案 |
| **Electron 参考案例** | GitHub Desktop 迁移到类 Zustand 模式 | 无知名 Electron 案例 | 无知名 Electron 案例 |

**关键发现**：Zustand 是唯一在 Electron 生态中有成熟跨进程同步方案的轻量库。

## 四、决策矩阵

| Criteria | Zustand | Jotai | Nanostores | Valtio | RTK |
|----------|---------|-------|-----------|--------|-----|
| Bundle size | 1.2 KB | 3.5 KB | 0.3 KB | 3.2 KB | 12 KB |
| Learning curve | Low | Medium | Low | Low | High |
| TypeScript DX | Excellent | Excellent | Good | Good | Good |
| Computed state | Via middleware | Built-in | Built-in | Automatic | Via selectors |
| DevTools | Redux DevTools | Jotai DevTools | None | Valtio DevTools | Redux DevTools |
| Framework agnostic | Partial | No | Yes | Partial | No |
| Community size | Very large | Large | Medium | Medium | Very large |
| Maintenance | Excellent | Excellent | Good | Excellent | Good |

## 五、DeepInk 决策结论

### ✅ 选择 Zustand

**理由**：

1. **集中式 store 天然契合 DeepInk 的模块划分**（UI / Browser / Agent / Settings 各一个 store）
2. **persist middleware** 直接解决设置持久化（Phase 4 设置页可直接使用）
3. **Electron IPC middleware** 解决未来跨窗口同步（Agent 面板独立窗口等场景）
4. **可在 React 外使用** — 未来主进程也需要读状态时有现成方案
5. **最大社区和招聘池** — 万一项目扩张，找人最容易
6. **行业共识** — 2025-2026 新项目首选，State of React 使用率 50%

**不选 Jotai 的理由**：
- 原子化模型适合复杂派生状态（如表单构建器），但 DeepInk 的状态结构更偏向"几个清晰的集中式 store"
- 不支持在 React 外使用，Electron 主进程无法读取状态
- Electron 生态无成熟跨进程同步方案

**不选 Valtio 的理由**：
- Proxy 心智模型与 React 不可变理念冲突
- 社区规模小，Electron 参考案例少

### 已实施的 Store 结构

```
stores/
├── ui-store.ts       # 布局/面板状态（activePanel, sidebarVisible, 面板宽度）
├── browser-store.ts  # 浏览器状态（tabs, URL, 导航）
├── agent-store.ts    # Agent 状态（对话消息, Playwright 状态, 后端连接状态）
└── index.ts          # 统一导出

types/
└── index.ts          # 全局类型定义
```

## 参考来源

- [npm trends: zustand vs jotai vs valtio vs redux](https://npmtrends.com/jotai-vs-recoil-vs-redux-vs-valtio-vs-zustand)
- [React State Management in 2026: A Data-Driven Comparison — Sascha Becker](https://saschb2b.com/en/blog/react-state-management-2026)
- [React State Management in 2025: What You Actually Need — Nadia Makarevich](https://www.developerway.com/posts/react-state-management-2025)
- [State Management in 2026: Zustand vs Jotai vs Redux Toolkit vs Signals](https://dev.to/jsgurujobs/state-management-in-2026-zustand-vs-jotai-vs-redux-toolkit-vs-signals-2gge)
- [Zustand Official Docs — Comparison](https://zustand.docs.pmnd.rs/learn/getting-started/comparison)
- [Zustand IPC Middleware Gist](https://gist.github.com/anis-dr/5cba43157b87ecab19e59bd8fecca638)
- [Sync Store Between Main and Renderer in Electron](https://dev.to/tsudhishnair/creating-a-synchronized-store-between-main-and-renderer-process-in-electron-5ao1)
- [GitHub Desktop: State Management Framework Discussion](https://github.com/desktop/desktop/issues/5144)
- [When to Use Zustand, Jotai, XState, or Something Else](https://makersden.io/blog/react-state-management-in-2025)
- [Zustand vs Legend-State vs Valtio 2026 — PkgPulse](https://www.pkgpulse.com/guides/zustand-vs-legend-state-vs-valtio-2026)
