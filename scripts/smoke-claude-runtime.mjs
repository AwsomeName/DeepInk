#!/usr/bin/env node

import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { query } from '@anthropic-ai/claude-agent-sdk'

const execFileAsync = promisify(execFile)
const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const SUCCESS_MARKER = 'CCLINK_RUNTIME_SMOKE_OK'

function usage() {
  console.log(`Usage: pnpm smoke:agent-runtime -- [options]

Required environment:
  CCLINK_AGENT_SMOKE_API_KEY   Dedicated API key for this smoke only

Options:
  --runtime-root <path>        Runtime resource root (default: .agent-runtime-staging)
  --arch <arm64|x64>           Runtime architecture (default: current process arch)
  --api-base-url <url>         Anthropic-compatible endpoint
  --model <name>               Explicit model name
  --max-budget-usd <amount>    Hard query budget (default: 0.10)
  --help                       Show this help
`)
}

function parseArgs(argv) {
  const options = {
    runtimeRoot: join(projectRoot, '.agent-runtime-staging'),
    arch: process.arch,
    apiBaseUrl: process.env.CCLINK_AGENT_SMOKE_API_BASE_URL?.trim() || '',
    model: process.env.CCLINK_AGENT_SMOKE_MODEL?.trim() || '',
    maxBudgetUsd: 0.1,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help') {
      usage()
      process.exit(0)
    }
    const value = argv[index + 1]
    if (!value) throw new Error(`${arg} 缺少参数值`)
    if (arg === '--runtime-root') options.runtimeRoot = resolve(projectRoot, value)
    else if (arg === '--arch') options.arch = value
    else if (arg === '--api-base-url') options.apiBaseUrl = value.trim()
    else if (arg === '--model') options.model = value.trim()
    else if (arg === '--max-budget-usd') options.maxBudgetUsd = Number(value)
    else throw new Error(`未知参数: ${arg}`)
    index += 1
  }

  if (!['arm64', 'x64'].includes(options.arch)) {
    throw new Error(`不支持的架构: ${options.arch}`)
  }
  if (!Number.isFinite(options.maxBudgetUsd) || options.maxBudgetUsd <= 0) {
    throw new Error('--max-budget-usd 必须是大于 0 的数字')
  }
  return options
}

async function verifyRuntime(options) {
  await execFileAsync(
    process.execPath,
    [
      join(scriptDir, 'stage-claude-runtime.mjs'),
      '--verify-only',
      '--arch',
      options.arch,
      '--output',
      options.runtimeRoot,
    ],
    { cwd: projectRoot, timeout: 30_000, maxBuffer: 1024 * 1024 },
  )
  const runtimeDir = join(options.runtimeRoot, `darwin-${options.arch}`)
  const manifest = JSON.parse(await readFile(join(runtimeDir, 'manifest.json'), 'utf8'))
  return { manifest, executablePath: join(runtimeDir, manifest.executable) }
}

async function runQuery(options, runtime) {
  const apiKey = process.env.CCLINK_AGENT_SMOKE_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('缺少 CCLINK_AGENT_SMOKE_API_KEY；拒绝借用本机 Claude 登录或普通环境凭证')
  }

  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), 90_000)
  const childEnv = { ...process.env }
  for (const key of [
    'ANTHROPIC_AUTH_TOKEN',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_USE_FOUNDRY',
  ]) {
    delete childEnv[key]
  }
  childEnv.ANTHROPIC_API_KEY = apiKey
  childEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
  if (options.apiBaseUrl) childEnv.ANTHROPIC_BASE_URL = options.apiBaseUrl

  const sdkQuery = query({
    prompt: `Reply with exactly ${SUCCESS_MARKER}. Do not use tools.`,
    options: {
      abortController,
      cwd: projectRoot,
      pathToClaudeCodeExecutable: runtime.executablePath,
      env: childEnv,
      tools: [],
      allowedTools: [],
      maxTurns: 1,
      maxBudgetUsd: options.maxBudgetUsd,
      ...(options.model ? { model: options.model } : {}),
    },
  })

  try {
    for await (const event of sdkQuery) {
      if (event.type !== 'result') continue
      if (event.is_error) {
        const detail = typeof event.result === 'string' ? event.result : 'Claude SDK error result'
        throw new Error(detail)
      }
      const result = typeof event.result === 'string' ? event.result.trim() : ''
      if (!result.includes(SUCCESS_MARKER)) {
        throw new Error('模型请求成功，但未返回预期 smoke 标记')
      }
      return {
        marker: SUCCESS_MARKER,
        durationMs: event.duration_ms,
        turns: event.num_turns,
        totalCostUsd: event.total_cost_usd,
      }
    }
    throw new Error('Claude SDK 流结束但没有 result 终态')
  } finally {
    clearTimeout(timeout)
    sdkQuery.close()
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const runtime = await verifyRuntime(options)
  const result = await runQuery(options, runtime)
  console.log(
    JSON.stringify(
      {
        success: true,
        arch: options.arch,
        sdkVersion: runtime.manifest.sdkVersion,
        claudeCodeVersion: runtime.manifest.claudeCodeVersion,
        ...result,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(`[agent-runtime-smoke] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
