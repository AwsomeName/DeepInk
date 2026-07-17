import type {
  AgentCapabilityStatus,
  AgentToolModuleStatus,
  AgentToolRisk,
} from '../../shared/ipc/agent'
import type { CclinkStudioRuntimeState } from './app-runtime'

const MODULE_CATALOG: Record<string, { label: string; description: string }> = {
  browser: { label: '浏览器自动化', description: '读取和操作内嵌浏览器、页面、下载与网络请求。' },
  editor: { label: '编辑器与文件', description: '读取目录和文档，并写入、追加、插入或保存内容。' },
  'data-source': { label: '数据源', description: '查询本机配置的数据源、集合、记录和保存的查询。' },
  hardware: { label: '硬件工作区', description: '管理硬件项目结构、生产资料和工程工作流。' },
  cad: { label: 'CAD', description: '检测、转换和检查 STEP/STP 等结构件模型。' },
  meshy: { label: 'Meshy 3D', description: '通过 Meshy 生成、查询并保存 3D 资产。' },
  android: { label: 'Android 真机', description: '通过 ADB 检查和操作用户连接的 Android 真机。' },
  'agent-device': { label: '设备语义操作', description: '基于界面快照执行语义点击、输入和滑动。' },
}

export function getAgentCapabilities(runtime: CclinkStudioRuntimeState): AgentCapabilityStatus[] {
  return [
    {
      name: 'agent-backend',
      label: 'Agent',
      available: Boolean(runtime.agentBridge),
      reason: runtime.agentBridge ? undefined : 'Agent 后端未就绪',
    },
    {
      name: 'browser',
      label: 'Browser',
      available: Boolean(runtime.browserManager && runtime.playwrightBridge),
      reason: runtime.browserManager && runtime.playwrightBridge ? undefined : '浏览器自动化未就绪',
    },
    {
      name: 'editor',
      label: 'Editor',
      available: Boolean(runtime.editorModule),
      reason: runtime.editorModule ? undefined : '编辑器工具未注册',
    },
    {
      name: 'android',
      label: 'Android',
      available: runtime.activeDeviceManager?.getSource() === 'physical',
      reason:
        runtime.activeDeviceManager?.getSource() === 'physical' ? undefined : '未连接用户真机',
    },
    {
      name: 'agent-device',
      label: 'Device AI',
      available: runtime.agentDeviceManager?.isAvailable() ?? false,
      reason: runtime.agentDeviceManager?.isAvailable() ? undefined : 'agent-device 语义层不可用',
    },
    {
      name: 'meshy',
      label: 'Meshy',
      available: Boolean(runtime.meshyService),
      reason: runtime.meshyService ? undefined : 'Meshy 服务未初始化',
    },
    {
      name: 'mcp',
      label: 'MCP',
      available: Boolean(runtime.toolHost),
      reason: runtime.toolHost ? undefined : 'MCP 工具主机未启动',
    },
  ]
}

export function getAgentToolModules(runtime: CclinkStudioRuntimeState): AgentToolModuleStatus[] {
  const modules = runtime.toolHost?.getRegisteredModules() ?? []
  return modules.map((module) => {
    const catalog = MODULE_CATALOG[module.name] ?? {
      label: module.name,
      description: 'CCLink Studio 内置工具模块。',
    }
    const availability = getModuleAvailability(module.name, runtime)
    return {
      id: module.name,
      label: catalog.label,
      description: catalog.description,
      enabled: module.enabled,
      available: availability.available,
      ...(availability.reason ? { reason: availability.reason } : {}),
      toolCount: module.tools.length,
      tools: module.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        risk: getToolRisk(tool.annotations),
      })),
    }
  })
}

function getToolRisk(annotations: {
  readOnlyHint: boolean
  destructiveHint: boolean
}): AgentToolRisk {
  if (annotations.destructiveHint) return 'destructive'
  return annotations.readOnlyHint ? 'read' : 'write'
}

function getModuleAvailability(
  moduleName: string,
  runtime: CclinkStudioRuntimeState,
): { available: boolean; reason?: string } {
  switch (moduleName) {
    case 'browser':
      return runtime.browserManager && runtime.playwrightBridge
        ? { available: true }
        : { available: false, reason: '浏览器自动化未连接' }
    case 'editor':
      return runtime.editorModule && runtime.fileService
        ? { available: true }
        : { available: false, reason: '编辑器或文件服务未就绪' }
    case 'data-source':
      return runtime.dataSourceService
        ? { available: true }
        : { available: false, reason: '数据源服务未就绪' }
    case 'hardware':
      return runtime.hardwareService
        ? { available: true }
        : { available: false, reason: '硬件服务未就绪' }
    case 'cad':
      return runtime.cadConversionService
        ? { available: true }
        : { available: false, reason: 'CAD 服务未就绪' }
    case 'meshy':
      return runtime.meshyService
        ? { available: true }
        : { available: false, reason: 'Meshy 服务未就绪' }
    case 'android':
      return runtime.activeDeviceManager?.getSource() === 'physical'
        ? { available: true }
        : { available: false, reason: '未连接 Android 真机' }
    case 'agent-device':
      return runtime.agentDeviceManager?.isAvailable()
        ? { available: true }
        : { available: false, reason: '设备语义层不可用' }
    default:
      return { available: true }
  }
}
