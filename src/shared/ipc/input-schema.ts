import path from 'node:path'
import { z } from 'zod'

const MAX_JSON_DEPTH = 64
const MAX_JSON_NODES = 100_000

export const boundedIdentifierSchema = (maxLength = 512) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .refine((value) => !/[\0\r\n]/.test(value), '包含非法控制字符')

export const boundedTextSchema = (maxLength: number) =>
  z
    .string()
    .max(maxLength)
    .refine((value) => !value.includes('\0'), '包含非法控制字符')

export const absolutePathSchema = z
  .string()
  .min(1)
  .max(32_768)
  .refine((value) => !value.includes('\0'), '路径包含非法控制字符')
  .refine((value) => path.isAbsolute(value), '路径必须是绝对路径')

export const optionalOwnerKeySchema = boundedIdentifierSchema().nullable().optional()

export const httpUrlSchema = (maxLength = 32_768) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .url()
    .superRefine((value, context) => {
      const url = new URL(value)
      if (!['http:', 'https:'].includes(url.protocol)) {
        context.addIssue({ code: 'custom', message: '仅允许 HTTP(S) URL' })
      }
      if (url.username || url.password) {
        context.addIssue({ code: 'custom', message: 'URL 不得包含明文凭证' })
      }
    })

export function boundedJsonValueSchema(maxBytes: number, label: string): z.ZodType<unknown> {
  return z.unknown().superRefine((value, context) => {
    const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }]
    let nodes = 0

    while (pending.length > 0) {
      const current = pending.pop()!
      nodes += 1
      if (nodes > MAX_JSON_NODES || current.depth > MAX_JSON_DEPTH) {
        context.addIssue({ code: 'custom', message: `${label} JSON 结构过于复杂` })
        return
      }
      if (
        current.value === null ||
        typeof current.value === 'string' ||
        typeof current.value === 'boolean'
      ) {
        continue
      }
      if (typeof current.value === 'number') {
        if (!Number.isFinite(current.value)) {
          context.addIssue({ code: 'custom', message: `${label} JSON 包含非有限数字` })
          return
        }
        continue
      }
      if (Array.isArray(current.value)) {
        for (const entry of current.value) pending.push({ value: entry, depth: current.depth + 1 })
        continue
      }
      if (typeof current.value === 'object') {
        const prototype = Object.getPrototypeOf(current.value)
        if (prototype !== Object.prototype && prototype !== null) {
          context.addIssue({ code: 'custom', message: `${label} 必须只包含普通 JSON 对象` })
          return
        }
        for (const [key, entry] of Object.entries(current.value)) {
          if (key.length > 1_024) {
            context.addIssue({ code: 'custom', message: `${label} JSON 字段名过长` })
            return
          }
          pending.push({ value: entry, depth: current.depth + 1 })
        }
        continue
      }
      context.addIssue({ code: 'custom', message: `${label} 必须是标准 JSON 值` })
      return
    }

    try {
      const serialized = JSON.stringify(value)
      if (serialized === undefined) {
        context.addIssue({ code: 'custom', message: `${label} 必须是可序列化 JSON` })
      } else if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
        context.addIssue({ code: 'custom', message: `${label} JSON 超过大小限制` })
      }
    } catch {
      context.addIssue({ code: 'custom', message: `${label} 必须是可序列化 JSON` })
    }
  })
}
