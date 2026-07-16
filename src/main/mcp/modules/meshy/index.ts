import type { ToolDefinition, ToolModule } from '../../types'
import type { MeshyService } from '../../../meshy/meshy-service'
import type {
  MeshyCreatePreviewOptions,
  MeshyCreateRefineOptions,
  MeshyGenerateAndSaveOptions,
  MeshySaveAssetOptions,
} from '../../../meshy/types'

const FORMAT_SCHEMA = {
  type: 'string',
  enum: ['glb', 'obj', 'fbx', 'stl', 'usdz', '3mf'],
  description: '输出模型格式，默认 glb。glb 最适合保存为项目资产。',
}

const TARGET_FORMATS_SCHEMA = {
  type: 'array',
  items: FORMAT_SCHEMA,
  description: '希望 Meshy 返回的模型格式列表。默认只请求 glb 以缩短生成时间。',
}

const MESHY_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'meshy_create_preview',
    description:
      '使用 Meshy Text to 3D 创建 preview 任务。preview 会根据 prompt 生成未贴图的 3D 网格，返回 taskId。需要先在设置中配置 Meshy API Key。',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '3D 模型描述，最多 600 字符' },
        modelType: {
          type: 'string',
          enum: ['standard', 'lowpoly'],
          description: '网格类型，默认 standard',
        },
        aiModel: {
          type: 'string',
          enum: ['meshy-5', 'meshy-6', 'latest'],
          description: 'Meshy 模型，默认 latest',
        },
        shouldRemesh: { type: 'boolean', description: '是否启用 remesh' },
        topology: { type: 'string', enum: ['quad', 'triangle'], description: '拓扑类型' },
        targetPolycount: { type: 'number', description: '目标面数' },
        poseMode: { type: 'string', enum: ['a-pose', 't-pose', ''], description: '角色姿态' },
        targetFormats: TARGET_FORMATS_SCHEMA,
        autoSize: { type: 'boolean', description: '是否自动估算真实尺寸' },
      },
      required: ['prompt'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'meshy_create_refine',
    description:
      '使用 Meshy Text to 3D 创建 refine 任务。refine 会给成功的 preview 模型生成纹理，返回新的 taskId。',
    inputSchema: {
      type: 'object',
      properties: {
        previewTaskId: { type: 'string', description: '已成功的 preview 任务 ID' },
        texturePrompt: { type: 'string', description: '可选纹理描述，最多 600 字符' },
        enablePbr: { type: 'boolean', description: '是否生成 PBR 贴图' },
        hdTexture: { type: 'boolean', description: '是否生成 4K base color 贴图' },
        aiModel: {
          type: 'string',
          enum: ['meshy-5', 'meshy-6', 'latest'],
          description: 'Meshy 模型，默认 latest',
        },
        targetFormats: TARGET_FORMATS_SCHEMA,
        autoSize: { type: 'boolean', description: '是否自动估算真实尺寸' },
      },
      required: ['previewTaskId'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'meshy_get_task',
    description: '查询 Meshy Text to 3D 任务状态、进度、模型下载 URL、缩略图 URL 和错误信息。',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Meshy 任务 ID' },
      },
      required: ['taskId'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: 'meshy_save_asset',
    description:
      '把已成功的 Meshy 任务模型下载保存到项目中。默认保存到当前工作区 assets/meshy，并同时保存 .meshy.json 元数据和缩略图。',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: '已成功的 Meshy 任务 ID' },
        format: FORMAT_SCHEMA,
        outputDir: {
          type: 'string',
          description: '可选保存目录。省略则使用当前工作区 assets/meshy',
        },
        fileName: { type: 'string', description: '可选文件名，不需要扩展名' },
        includeMetadata: { type: 'boolean', description: '是否保存 .meshy.json 元数据，默认 true' },
        includeThumbnail: { type: 'boolean', description: '是否保存缩略图，默认 true' },
      },
      required: ['taskId'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'meshy_generate_and_save',
    description:
      '从 prompt 自动完成 Meshy preview、等待完成、可选 refine、下载模型并保存到项目中。默认 refine=true、format=glb、保存到当前工作区 assets/meshy。',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '3D 模型描述，最多 600 字符' },
        format: FORMAT_SCHEMA,
        refine: { type: 'boolean', description: '是否自动 refine 生成贴图模型，默认 true' },
        texturePrompt: { type: 'string', description: '可选纹理描述' },
        enablePbr: { type: 'boolean', description: '是否生成 PBR 贴图' },
        hdTexture: { type: 'boolean', description: '是否生成 4K base color 贴图' },
        modelType: {
          type: 'string',
          enum: ['standard', 'lowpoly'],
          description: '网格类型，默认 standard',
        },
        aiModel: {
          type: 'string',
          enum: ['meshy-5', 'meshy-6', 'latest'],
          description: 'Meshy 模型，默认 latest',
        },
        targetPolycount: { type: 'number', description: '目标面数' },
        poseMode: { type: 'string', enum: ['a-pose', 't-pose', ''], description: '角色姿态' },
        autoSize: { type: 'boolean', description: '是否自动估算真实尺寸' },
        outputDir: {
          type: 'string',
          description: '可选保存目录。省略则使用当前工作区 assets/meshy',
        },
        fileName: { type: 'string', description: '可选文件名，不需要扩展名' },
        pollIntervalMs: { type: 'number', description: '轮询间隔，默认 5000ms' },
        timeoutMs: { type: 'number', description: '总等待超时，默认 10 分钟' },
      },
      required: ['prompt'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
]

export class MeshyToolModule implements ToolModule {
  readonly name = 'meshy'
  readonly tools: ToolDefinition[] = MESHY_TOOL_DEFINITIONS

  constructor(private readonly meshyService: MeshyService) {}

  async execute(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'meshy_create_preview':
        return this.meshyService.createPreview(params as unknown as MeshyCreatePreviewOptions)
      case 'meshy_create_refine':
        return this.meshyService.createRefine(params as unknown as MeshyCreateRefineOptions)
      case 'meshy_get_task':
        return this.meshyService.getTask(String(params.taskId ?? ''))
      case 'meshy_save_asset':
        return this.meshyService.saveAsset(params as unknown as MeshySaveAssetOptions)
      case 'meshy_generate_and_save':
        return this.meshyService.generateAndSave(params as unknown as MeshyGenerateAndSaveOptions)
      default:
        throw new Error(`未知 Meshy 工具: ${toolName}`)
    }
  }
}
