import type { ToolDefinition, ToolModule } from '../../types'
import type { HardwareService } from '../../../hardware/hardware-service'

const HARDWARE_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'hardware_scan_project',
    description:
      '扫描当前硬件项目目录，识别原理图、PCB/FPC 源工程、Gerber、BOM、坐标、结构件和 datasheet，并返回项目摘要与风险。',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: '本地工作空间路径。',
        },
      },
      required: ['workspacePath'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: 'hardware_inspect_production_package',
    description:
      '检查硬件项目生产包是否适合 PCB/FPC 打样或嘉立创报价，重点检查 Gerber、BOM 和坐标文件。',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: '本地工作空间路径。',
        },
      },
      required: ['workspacePath'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: 'hardware_write_production_report',
    description:
      '检查硬件项目生产包，并将结构化检查结果写入项目 hardware/reports 目录下的 Markdown 报告。',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: '本地工作空间路径。',
        },
      },
      required: ['workspacePath'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'hardware_read_gerber_layer_geometry',
    description:
      '读取 Gerber zip 内指定层的几何线段，用于判断 FPC/PCB 外形、尺寸和可视化轮廓。当前支持常见线段和圆弧近似，不是完整 DRC。',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: '本地工作空间路径。',
        },
        packagePath: {
          type: 'string',
          description: 'Gerber zip 文件路径，必须位于 workspacePath 内。',
        },
        entry: {
          type: 'string',
          description: 'zip 内的 Gerber 层条目名，例如 Edge_Cuts.gm1。',
        },
      },
      required: ['workspacePath', 'packagePath', 'entry'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
]

export class HardwareToolModule implements ToolModule {
  readonly name = 'hardware'
  readonly tools = HARDWARE_TOOL_DEFINITIONS

  constructor(private readonly hardwareService: HardwareService) {}

  async execute(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    const workspacePath = typeof params.workspacePath === 'string' ? params.workspacePath : ''
    if (!workspacePath) throw new Error('缺少 workspacePath')

    switch (toolName) {
      case 'hardware_scan_project':
        return this.hardwareService.scanWorkspace(workspacePath)
      case 'hardware_inspect_production_package':
        return this.hardwareService.inspectProductionPackage(workspacePath)
      case 'hardware_write_production_report':
        return this.hardwareService.writeProductionReportMarkdown(workspacePath)
      case 'hardware_read_gerber_layer_geometry': {
        const packagePath = typeof params.packagePath === 'string' ? params.packagePath : ''
        const entry = typeof params.entry === 'string' ? params.entry : ''
        if (!packagePath) throw new Error('缺少 packagePath')
        if (!entry) throw new Error('缺少 entry')
        return this.hardwareService.readGerberLayerGeometry(workspacePath, packagePath, entry)
      }
      default:
        throw new Error(`未知硬件工具: ${toolName}`)
    }
  }
}
