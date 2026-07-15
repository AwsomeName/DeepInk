/**
 * agent-device 工具模块
 *
 * 提供 4 个基于 agent-device 语义层 的 Android 工具，注册到 McpToolHost：
 *  - agent_device_snapshot：抓取语义化无障碍树（含 ref），补强 android_dump_ui
 *  - agent_device_click：ref 语义点击 或 坐标点击
 *  - agent_device_swipe：滑动手势（坐标式）
 *  - agent_device_type：文本输入（ref 定位 或 焦点）
 *
 * 与现有 15 个 android_* 工具【并存】（互补）：agent-device 提供语义 UI 感知，
 * 现有工具提供坐标操作 + 包管理 + shell。Agent 按场景选用。
 *
 * 所有失败都抛带【降级指引】的错误，引导 Agent 退回 android_dump_ui / android_tap。
 * agent-device 不可用时（库未装/daemon 起不来），manager 返回 null/false，
 * 此处据此抛错——工具表稳定（始终注册），Agent 行为可预测。
 */
import type { ToolModule, ToolDefinition } from '../../types'
import type { AgentDeviceManager } from '../../../android/agent-device-manager'

/** 给 Agent 的精简节点（裁掉纯结构噪音，省 token） */
interface TrimmedNode {
  ref: string
  role?: string
  label?: string
  identifier?: string
  bounds?: { x: number; y: number; width: number; height: number }
  interactive?: boolean
}

/** 客户端裁剪上限（防止 token 爆炸；truncated 时提示 Agent 收窄查询） */
const MAX_NODES = 60

const AGENT_DEVICE_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'agent_device_snapshot',
    description:
      '获取 Android 当前界面的语义化无障碍树（accessibility tree）。每个元素带 ref（如 @e3）+ 显示文本 + 坐标 + 可交互标记。比 android_dump_ui 更完整（含 WebView/Compose/系统浮层/键盘节点，裸 uiautomator dump 常漏这些）。' +
      '后续用 agent_device_click/swipe/type 配合 ref 操作。⚠️ ref 仅在下次调用本工具前有效，界面变化后必须重新 snapshot。',
    inputSchema: {
      type: 'object',
      properties: {
        interactiveOnly: {
          type: 'boolean',
          description: '仅返回可交互元素（按钮/输入框/开关等），减少噪音。默认 false 返回完整树',
        },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: 'agent_device_click',
    description:
      '点击元素。优先用 ref（agent_device_snapshot 返回的，如 @e3）语义定位——比 android_tap 坐标更稳，元素轻微移动也能命中。ref 失效或元素无法 snapshot 时，改用 x/y 坐标。',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'snapshot 返回的元素 ref（如 @e3），与 x/y 二选一' },
        x: { type: 'number', description: 'X 坐标（无 ref 时用），与 ref 二选一' },
        y: { type: 'number', description: 'Y 坐标（无 ref 时用），与 ref 二选一' },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'agent_device_swipe',
    description: '滑动手势（坐标式）。agent-device 的 swipe 仅支持坐标，与 android_swipe 功能相同，提供统一入口。',
    inputSchema: {
      type: 'object',
      properties: {
        fromX: { type: 'number', description: '起始 X 坐标' },
        fromY: { type: 'number', description: '起始 Y 坐标' },
        toX: { type: 'number', description: '结束 X 坐标' },
        toY: { type: 'number', description: '结束 Y 坐标' },
        durationMs: { type: 'number', description: '滑动持续时间（毫秒），默认 300' },
      },
      required: ['fromX', 'fromY', 'toX', 'toY'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'agent_device_type',
    description:
      '输入文本。传 ref 时用语义定位输入框后填入（fill，比 android_type_text 焦点注入更准）；不传 ref 则输入到当前焦点。支持中文/Unicode。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要输入的文本' },
        ref: { type: 'string', description: '可选，目标输入框的 ref（snapshot 返回）' },
      },
      required: ['text'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
]

export class AgentDeviceToolModule implements ToolModule {
  readonly name = 'agent-device'
  readonly tools: ToolDefinition[] = AGENT_DEVICE_TOOL_DEFINITIONS

  constructor(private manager: AgentDeviceManager) {}

  async execute(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'agent_device_snapshot':
        return await this.handleSnapshot(params)
      case 'agent_device_click':
        return await this.handleClick(params)
      case 'agent_device_swipe':
        return await this.handleSwipe(params)
      case 'agent_device_type':
        return await this.handleType(params)
      default:
        throw new Error(`未知的 agent-device 工具: ${toolName}`)
    }
  }

  // ─── handlers ───

  private async handleSnapshot(params: Record<string, unknown>): Promise<unknown> {
    const interactiveOnly = params.interactiveOnly === true ? true : undefined
    const result = await this.manager.captureSnapshot({ interactiveOnly })
    if (!result) {
      throw new Error(
        'agent_device_snapshot 失败：agent-device 不可用（库未加载/daemon 起不来/真机未连接）。' +
          '请改用 android_dump_ui 获取 UI（注意它可能漏部分元素）。',
      )
    }
    const { nodes, truncated } = this.trimNodes(result.nodes ?? [])
    return {
      nodes,
      truncated: truncated || result.truncated === true,
      nodeCount: nodes.length,
      hint: 'ref 仅在下次 agent_device_snapshot 前有效。操作后界面若变，须重新 snapshot 获取新 ref。',
      ...(truncated
        ? { truncationHint: '节点数已达上限，未展示全部。可传 interactiveOnly:true 收窄，或聚焦特定区域。' }
        : {}),
    }
  }

  private async handleClick(params: Record<string, unknown>): Promise<unknown> {
    const ref = typeof params.ref === 'string' ? params.ref : undefined
    const x = typeof params.x === 'number' ? params.x : undefined
    const y = typeof params.y === 'number' ? params.y : undefined
    if (!ref && (x === undefined || y === undefined)) {
      throw new Error('agent_device_click 需提供 ref 或 (x, y) 之一')
    }
    const target = ref ? { ref } : { x: x!, y: y! }
    const ok = await this.manager.click(target)
    if (!ok) {
      throw new Error(
        'agent_device_click 失败（ref 可能已失效，或 agent-device 不可用）。' +
          '请重新 agent_device_snapshot 获取新 ref，或改用 android_tap 按坐标点击。',
      )
    }
    return { ok: true, action: 'click', target }
  }

  private async handleSwipe(params: Record<string, unknown>): Promise<unknown> {
    const fromX = this.toNum(params.fromX)
    const fromY = this.toNum(params.fromY)
    const toX = this.toNum(params.toX)
    const toY = this.toNum(params.toY)
    if (fromX === undefined || fromY === undefined || toX === undefined || toY === undefined) {
      throw new Error('agent_device_swipe 需要 fromX/fromY/toX/toY')
    }
    const durationMs = this.toNum(params.durationMs)
    const ok = await this.manager.swipe(
      { x: fromX, y: fromY },
      { x: toX, y: toY },
      durationMs,
    )
    if (!ok) {
      throw new Error(
        'agent_device_swipe 失败（agent-device 不可用）。可改用 android_swipe 按坐标滑动。',
      )
    }
    return { ok: true, action: 'swipe', from: { x: fromX, y: fromY }, to: { x: toX, y: toY } }
  }

  private async handleType(params: Record<string, unknown>): Promise<unknown> {
    const text = typeof params.text === 'string' ? params.text : undefined
    if (text === undefined) {
      throw new Error('agent_device_type 需要 text')
    }
    const ref = typeof params.ref === 'string' ? params.ref : undefined
    const ok = await this.manager.inputText(text, ref)
    if (!ok) {
      throw new Error(
        'agent_device_type 失败（ref 可能已失效，或 agent-device 不可用）。' +
          '请重新 agent_device_snapshot，或改用 android_type_text 输入（焦点注入，仅 ASCII 时可用 adb 回退）。',
      )
    }
    return { ok: true, action: 'type', ref: ref ?? null }
  }

  // ─── 裁剪：去纯结构噪音，省 token ───

  private trimNodes(
    nodes: Array<Record<string, unknown>>,
  ): { nodes: TrimmedNode[]; truncated: boolean } {
    const trimmed: TrimmedNode[] = []
    let hitLimit = false
    for (const node of nodes) {
      const ref = node.ref
      if (typeof ref !== 'string') continue
      const label = this.firstString(node.label, node.value, node.text)
      const role = this.firstString(node.type, node.role)
      const identifier = this.firstString(node.identifier)
      const interactive = this.isInteractive(node, role)
      // 跳过既无文本、不可交互、又无标识的纯结构节点（容器/布局）
      if (!label && !interactive && !identifier) continue
      if (trimmed.length >= MAX_NODES) {
        hitLimit = true
        break
      }
      trimmed.push({
        ref,
        ...(role ? { role } : {}),
        ...(label ? { label } : {}),
        ...(identifier ? { identifier } : {}),
        ...(this.isRect(node.rect) ? { bounds: node.rect } : {}),
        ...(interactive ? { interactive: true } : {}),
      })
    }
    return { nodes: trimmed, truncated: hitLimit }
  }

  /** 判断节点是否可交互（agent-device 的 hittable 标记 + 常见可交互角色） */
  private isInteractive(node: Record<string, unknown>, role?: string): boolean {
    // hittable=true 且 enabled≠false 的元素可交互
    if (node.hittable === true) {
      return node.enabled !== false
    }
    if (!role) return false
    return /^(Button|EditText|ImageButton|CheckBox|Switch|ToggleButton|RadioButton|Link|Tab|MenuItem|Spinner)$/i.test(
      role,
    )
  }

  private firstString(...values: unknown[]): string | undefined {
    for (const v of values) {
      if (typeof v === 'string' && v.trim().length > 0) return v
    }
    return undefined
  }

  private isRect(v: unknown): v is { x: number; y: number; width: number; height: number } {
    return (
      typeof v === 'object' &&
      v !== null &&
      typeof (v as Record<string, unknown>).x === 'number' &&
      typeof (v as Record<string, unknown>).y === 'number' &&
      typeof (v as Record<string, unknown>).width === 'number' &&
      typeof (v as Record<string, unknown>).height === 'number'
    )
  }

  private toNum(v: unknown): number | undefined {
    return typeof v === 'number' ? v : undefined
  }
}
