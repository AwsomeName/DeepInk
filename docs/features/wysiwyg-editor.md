# 所见即所得编辑器

## 概述

DeepInk 集成多格式富文本编辑器，支持 Markdown、Word、Excel、PowerPoint 等文件的编辑与渲染。编辑器以"所见即所得"为核心体验，让用户无需关心格式语法，专注于内容创作。

## 设计原则

1. **所见即所得** — 编辑即预览，无分离的预览模式
2. **多格式统一** — 不同文件类型共享编辑框架核心
3. **Agent 可控** — 编辑器暴露 API 供 Agent 程序化操作
4. **流畅体验** — 大文件编辑不卡顿

## 文档类型支持

### 优先级矩阵

| 格式 | 优先级 | 编辑 | 渲染 | 方案 |
|------|--------|------|------|------|
| Markdown | P0 | ✅ 编辑 | ✅ 渲染 | Tiptap + markdown 扩展 |
| Word (.docx) | P0 | ✅ 编辑 | ✅ 渲染 | docx 解析 → ProseMirror → docx 序列化 |
| Excel (.xlsx) | P1 | ✅ 编辑 | ✅ 渲染 | SheetJS + 自定义表格编辑器 |
| PowerPoint (.pptx) | P1 | ⚠️ 简单编辑 | ✅ 渲染 | pptxjs 渲染 + 基础编辑 |
| PDF | P1 | ❌ 只读 | ✅ 渲染 | PDF.js |
| 纯文本 | P0 | ✅ 编辑 | — | CodeMirror |

## 架构设计

### 编辑器核心

```
Tiptap (基于 ProseMirror)
├── Schema 层          — 定义文档结构
├── Plugin 层          — 协同编辑、快捷键、状态管理
├── Extension 层       — 功能扩展
│   ├── Markdown       — markdown 语法支持
│   ├── Table          — 表格编辑
│   ├── Image          — 图片插入与裁剪
│   ├── CodeBlock      — 代码高亮
│   └── Collaboration  — 变更追踪
├── Parser 层          — 外部格式 → ProseMirror Document
│   ├── DocxParser     — .docx → PM Doc
│   ├── MarkdownParser — .md → PM Doc
│   └── HtmlParser     — .html → PM Doc
└── Serializer 层      — PM Document → 外部格式
    ├── DocxSerializer — PM Doc → .docx
    ├── MarkdownSerializer — PM Doc → .md
    └── HtmlSerializer — PM Doc → .html
```

### 文件处理流程

```
用户打开文件
     ↓
文件后缀识别
     ↓
┌────┴─────┐
│ .md      │ → MarkdownParser → Tiptap 编辑器
│ .docx    │ → DocxParser → Tiptap 编辑器
│ .xlsx    │ → SheetJS → 表格编辑器
│ .pptx    │ → PptxParser → 幻灯片编辑器
│ .txt     │ → 纯文本编辑器
│ 其他      │ → CodeMirror（代码高亮）
└──────────┘
     ↓
用户编辑
     ↓
自动保存（防丢失）+ 手动保存
     ↓
对应 Serializer → 写入文件系统
```

## 功能清单

### P0 — MVP

- [ ] Markdown 编辑器（Tiptap 基础功能）
  - 标题、列表、加粗、斜体、链接、图片、代码块
  - 快捷键支持
  - 自动保存
- [ ] Word (.docx) 文件打开和渲染
  - 基本排版（标题、段落、列表、表格）
  - 字体、颜色、对齐
- [ ] Word (.docx) 编辑和保存
  - 基本编辑操作
  - 导出为 .docx
- [ ] 纯文本编辑器
- [ ] 文件标签页管理（多文件同时打开）

### P1 — 增强

- [ ] 表格高级编辑（合并单元格、排序）
- [ ] 图片编辑（裁剪、缩放、位置）
- [ ] Excel (.xlsx) 编辑器
  - 公式计算
  - 图表渲染
  - 多 Sheet 切换
- [ ] PPT 渲染和简单编辑
  - 幻灯片导航
  - 文字编辑
  - 图片替换
- [ ] PDF 渲染和标注

### P2 — 高级

- [ ] 协同编辑（多光标）
- [ ] 版本历史和 diff
- [ ] 模板系统
- [ ] 导出为 PDF
- [ ] AI 辅助写作（Agent 驱动的智能建议）

## Agent 编辑接口

编辑器暴露 API 供 Agent 程序化操作文档：

```typescript
interface EditorAPI {
  // 读取
  getDocumentContent(): DocumentContent
  getSelection(): Selection
  getBlockAt(position: number): Block

  // 编辑
  insertText(position: number, text: string): void
  replaceText(range: Range, text: string): void
  deleteText(range: Range): void
  formatText(range: Range, format: TextFormat): void

  // 结构
  insertBlock(type: BlockType, position: number, content: any): void
  deleteBlock(blockId: string): void
  moveBlock(blockId: string, newPosition: number): void

  // 高级
  findAndReplace(search: string, replace: string, options?: FindOptions): number
  applyTemplate(templateId: string): void
  getSuggestions(): EditorSuggestion[]
}
```

### 示例：Agent 优化简历

```
用户: "帮我把简历中的项目经验部分优化一下，目标公司是字节跳动"

Agent 执行链:
1. editor_api.getBlockAt(projectSectionIndex) → 读取当前内容
2. search_web("字节跳动 前端 JD 要求") → 搜索 JD
3. editor_api.replaceText(range, optimizedContent) → 替换优化后的内容
   ↳ 弹出确认: "将修改「项目经验」段落，是否确认？" → 用户确认
4. editor_api.formatText(range, { bold: true }) → 高亮关键技能词
```

## UI 设计

### 编辑器工具栏

```
┌──────────────────────────────────────────────────────────┐
│ B I U S │ H1 H2 H3 │ • 1. │ " ' │ 🖼 表 代码 │ 撤销 重做 │
└──────────────────────────────────────────────────────────┘
│                                                          │
│                  (编辑区域)                                │
│                                                          │
```

### 标签页

```
┌───────────┬──────────────┬─────────────────┐
│ 📄 简历.md  │ 📊 数据.xlsx ✕ │                  │
└───────────┴──────────────┴─────────────────┘
```

### 文件切换

点击侧栏文件 → 根据文件类型自动切换编辑器模式，无感知格式切换。

## 技术选型详情

### Markdown 编辑器

- **Tiptap** 作为核心编辑器框架
- `@tiptap/extension-markdown` 提供 Markdown 序列化
- 编辑时实时渲染 Markdown 格式，无需切换预览

### Word (.docx)

- **读取**: `mammoth.js` 或 `docx` 库解析
- **写入**: `docx` 库生成
- **中间表示**: 转换为 ProseMirror Document

### Excel (.xlsx)

- **SheetJS (xlsx)** 处理数据层
- 自定义表格编辑器组件（基于 canvas 或 DOM）
- 公式引擎: `hyperformula`

### PowerPoint (.pptx)

- **pptxjs** 或 `pptxgenjs` 处理
- 渲染为 HTML/CSS 幻灯片展示
- 编辑能力有限，先支持文字和图片替换
