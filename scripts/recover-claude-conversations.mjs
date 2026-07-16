#!/usr/bin/env node
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

const DEFAULT_USER_DATA_DIR = join(homedir(), 'Library/Application Support/CCLink Studio')
const DEFAULT_STATE_FILE = join(DEFAULT_USER_DATA_DIR, 'workspace-state.json')

function printUsage() {
  console.log(`Usage:
  node scripts/recover-claude-conversations.mjs --workspace <path> [--apply]

Options:
  --workspace <path>           Local workspace path to recover.
  --state-file <path>          workspace-state.json path. Defaults to CCLink Studio userData.
  --claude-project-dir <path>  Claude JSONL project directory. Defaults from workspace path.
  --owner-key <key>            Force a WorkspaceState owner key.
  --limit <n>                  Recover at most n newest Claude sessions.
  --apply                      Write the recovered conversations. Without it, dry-run only.
`)
}

function parseArgs(argv) {
  const args = {
    apply: false,
    stateFile: DEFAULT_STATE_FILE,
    workspacePath: '',
    claudeProjectDir: '',
    ownerKey: undefined,
    limit: Number.POSITIVE_INFINITY,
  }

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }
    if (arg === '--apply') {
      args.apply = true
      continue
    }
    const next = argv[i + 1]
    if (!next) throw new Error(`Missing value for ${arg}`)
    if (arg === '--workspace') args.workspacePath = resolve(next)
    else if (arg === '--state-file') args.stateFile = resolve(next)
    else if (arg === '--claude-project-dir') args.claudeProjectDir = resolve(next)
    else if (arg === '--owner-key') args.ownerKey = next
    else if (arg === '--limit') args.limit = Number(next)
    else throw new Error(`Unknown argument: ${arg}`)
    i += 1
  }

  if (!args.workspacePath) throw new Error('Missing --workspace <path>')
  if (!Number.isFinite(args.limit) && args.limit !== Number.POSITIVE_INFINITY) {
    throw new Error('--limit must be a number')
  }
  return args
}

function claudeProjectDirForWorkspace(workspacePath) {
  return join(homedir(), '.claude/projects', workspacePath.replaceAll('/', '-'))
}

function getWorkspaceId(workspaceKey, ownerKey) {
  if (!workspaceKey && !ownerKey) return 'global'
  return createHash('sha256')
    .update(`${ownerKey ?? ''}\0${workspaceKey || 'global'}`)
    .digest('hex')
    .slice(0, 16)
}

function readJsonl(filePath) {
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line)
      } catch (error) {
        throw new Error(`${filePath}:${index + 1} is not valid JSON: ${error.message}`)
      }
    })
}

function extractUserText(text) {
  const marker = '\n\n用户消息:\n'
  const markerIndex = text.indexOf(marker)
  if (markerIndex >= 0) return text.slice(markerIndex + marker.length).trim()
  return text.trim()
}

function toTimestamp(value) {
  const timestamp = Date.parse(value ?? '')
  return Number.isFinite(timestamp) ? timestamp : Date.now()
}

function stringifyToolResultContent(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item?.type === 'text' && typeof item.text === 'string') return item.text
        return JSON.stringify(item)
      })
      .join('\n')
  }
  return content == null ? '' : JSON.stringify(content)
}

function convertContentBlocks(role, content) {
  if (typeof content === 'string') {
    const text = role === 'user' ? extractUserText(content) : content.trim()
    return {
      blocks: text ? [{ type: 'text', text }] : [],
      rawText: text,
    }
  }

  if (!Array.isArray(content)) return { blocks: [], rawText: '' }

  const blocks = []
  const rawParts = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    if (block.type === 'text') {
      const text = String(block.text ?? '')
      if (text) {
        blocks.push({ type: 'text', text })
        rawParts.push(text)
      }
    } else if (block.type === 'thinking') {
      const thinking = String(block.thinking ?? '')
      if (thinking) blocks.push({ type: 'thinking', thinking })
    } else if (block.type === 'tool_use') {
      blocks.push({
        type: 'tool_use',
        id: String(block.id ?? ''),
        name: String(block.name ?? ''),
        input: block.input && typeof block.input === 'object' ? block.input : {},
      })
    } else if (block.type === 'tool_result') {
      blocks.push({
        type: 'tool_result',
        tool_use_id: String(block.tool_use_id ?? ''),
        content: stringifyToolResultContent(block.content),
        ...(block.is_error ? { is_error: true } : {}),
      })
    }
  }

  return { blocks, rawText: rawParts.join('\n').trim() }
}

function appendToolResults(messages, blocks) {
  const target =
    [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === 'assistant' &&
          message.content.some((block) => block.type === 'tool_use'),
      ) ?? messages[messages.length - 1]

  if (target?.role === 'assistant') {
    target.content.push(...blocks)
    return
  }

  messages.push({
    id: `recovered-tool-results-${messages.length + 1}`,
    role: 'assistant',
    content: blocks,
    rawText: '',
    timestamp: Date.now(),
  })
}

function deriveTitle(messages, fallback, workspacePath) {
  const firstUser = messages.find((message) => message.role === 'user' && message.rawText.trim())
  const source = firstUser?.rawText.trim() || fallback
  let oneLine = source.replace(/\s+/g, ' ')
  if (oneLine.startsWith(workspacePath)) {
    oneLine = oneLine.slice(workspacePath.length).replace(/^[\s/,，:：-]+/, '')
  }
  return oneLine.length > 28 ? `${oneLine.slice(0, 28)}...` : oneLine || '恢复的 Claude 会话'
}

function recoverSession(filePath, workspacePath) {
  const events = readJsonl(filePath)
  const messages = []
  const assistantByClaudeId = new Map()
  let sessionId = basename(filePath, '.jsonl')
  let createdAt = Number.POSITIVE_INFINITY
  let updatedAt = 0

  for (const event of events) {
    if (event.sessionId) sessionId = event.sessionId
    if (event.timestamp) {
      const timestamp = toTimestamp(event.timestamp)
      createdAt = Math.min(createdAt, timestamp)
      updatedAt = Math.max(updatedAt, timestamp)
    }
    if (!event.message?.role) continue

    const role = event.message.role
    const timestamp = toTimestamp(event.timestamp)
    const { blocks, rawText } = convertContentBlocks(role, event.message.content)
    if (!blocks.length && !rawText) continue

    if (role === 'user' && blocks.every((block) => block.type === 'tool_result')) {
      appendToolResults(messages, blocks)
      continue
    }

    if (role === 'assistant') {
      const claudeMessageId = event.message.id
      const existing = claudeMessageId ? assistantByClaudeId.get(claudeMessageId) : null
      if (existing) {
        existing.content.push(...blocks)
        existing.rawText = [existing.rawText, rawText].filter(Boolean).join('\n')
        existing.timestamp = Math.min(existing.timestamp, timestamp)
        continue
      }

      const message = {
        id: claudeMessageId || `recovered-assistant-${messages.length + 1}`,
        role: 'assistant',
        content: blocks,
        rawText,
        timestamp,
      }
      messages.push(message)
      if (claudeMessageId) assistantByClaudeId.set(claudeMessageId, message)
      continue
    }

    messages.push({
      id: event.uuid || `recovered-user-${messages.length + 1}`,
      role: 'user',
      content: blocks,
      rawText,
      timestamp,
    })
  }

  if (!messages.length) return null

  const safeCreatedAt = Number.isFinite(createdAt) ? createdAt : messages[0].timestamp
  const safeUpdatedAt = updatedAt || messages[messages.length - 1].timestamp
  return {
    id: `agent-claude-${sessionId}`,
    title: deriveTitle(messages, basename(filePath, '.jsonl'), workspacePath),
    surface: 'assistant-panel',
    runtime: {
      location: 'local',
      transport: 'local',
      backend: 'claude-code',
      workspaceRef: { kind: 'local', path: workspacePath },
    },
    messages,
    input: '',
    loading: false,
    backendState: 'disconnected',
    sessionId,
    streamingMessageId: null,
    lastCost: null,
    scope: { kind: 'all' },
    mountedResources: [],
    mountedSkills: [],
    createdAt: safeCreatedAt,
    updatedAt: safeUpdatedAt,
    archivedAt: null,
  }
}

function isEmptySeedConversation(conversation) {
  return (
    conversation?.id === 'agent-default' &&
    conversation?.messages?.length === 1 &&
    conversation.messages[0]?.id === 'welcome' &&
    !conversation.sessionId
  )
}

function chooseSnapshot(workspaces, workspacePath, ownerKey) {
  const matches = Object.values(workspaces).filter(
    (snapshot) =>
      snapshot.workspaceKey === workspacePath &&
      (ownerKey === undefined || snapshot.ownerKey === ownerKey),
  )
  return matches.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0] ?? null
}

function main() {
  const args = parseArgs(process.argv)
  const stateFile = args.stateFile
  const claudeProjectDir = args.claudeProjectDir || claudeProjectDirForWorkspace(args.workspacePath)

  if (!existsSync(stateFile)) throw new Error(`Workspace state file not found: ${stateFile}`)
  if (!existsSync(claudeProjectDir))
    throw new Error(`Claude project directory not found: ${claudeProjectDir}`)

  const rawState = JSON.parse(readFileSync(stateFile, 'utf8'))
  rawState.workspaces =
    rawState.workspaces && typeof rawState.workspaces === 'object' ? rawState.workspaces : {}

  const files = Array.from(
    new Set(
      readdirSync(claudeProjectDir)
        .filter((file) => file.endsWith('.jsonl'))
        .map((file) => join(claudeProjectDir, file)),
    ),
  )

  const recovered = files
    .map((file) => recoverSession(file, args.workspacePath))
    .filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, args.limit)
    .sort((a, b) => a.createdAt - b.createdAt)

  const snapshot = chooseSnapshot(rawState.workspaces, args.workspacePath, args.ownerKey)
  const ownerKey = args.ownerKey ?? snapshot?.ownerKey ?? null
  const workspaceId = snapshot?.workspaceId ?? getWorkspaceId(args.workspacePath, ownerKey)
  const nextSnapshot = snapshot ?? {
    version: 1,
    workspaceId,
    ownerKey,
    workspaceKey: args.workspacePath,
    workspacePath: args.workspacePath,
    updatedAt: Date.now(),
    sections: {},
  }

  const currentAgent = nextSnapshot.sections.agentConversations ?? {
    conversations: {},
    conversationOrder: [],
    activeConversationId: null,
  }
  const conversations = { ...(currentAgent.conversations ?? {}) }
  let conversationOrder = Array.isArray(currentAgent.conversationOrder)
    ? [...currentAgent.conversationOrder]
    : Object.keys(conversations)
  const hadOnlySeedBeforeRecover =
    conversationOrder.length === 1 && isEmptySeedConversation(conversations[conversationOrder[0]])
  const existingSessionIds = new Set(
    Object.values(conversations)
      .map((conversation) => conversation?.sessionId)
      .filter(Boolean),
  )

  let added = 0
  let skipped = 0
  for (const conversation of recovered) {
    if (conversations[conversation.id] || existingSessionIds.has(conversation.sessionId)) {
      skipped += 1
      continue
    }
    conversations[conversation.id] = conversation
    conversationOrder.push(conversation.id)
    existingSessionIds.add(conversation.sessionId)
    added += 1
  }

  conversationOrder = conversationOrder.filter(
    (id, index, order) => conversations[id] && order.indexOf(id) === index,
  )

  const newestRecovered = recovered[recovered.length - 1]
  const activeConversationId =
    hadOnlySeedBeforeRecover && newestRecovered
      ? newestRecovered.id
      : currentAgent.activeConversationId && conversations[currentAgent.activeConversationId]
        ? currentAgent.activeConversationId
        : (conversationOrder.find((id) => !conversations[id].archivedAt) ??
          conversationOrder[0] ??
          null)

  nextSnapshot.sections = {
    ...nextSnapshot.sections,
    agentConversations: {
      conversations,
      conversationOrder,
      activeConversationId,
    },
  }
  nextSnapshot.updatedAt = Date.now()
  rawState.workspaces[workspaceId] = nextSnapshot

  const summary = {
    mode: args.apply ? 'apply' : 'dry-run',
    workspacePath: args.workspacePath,
    claudeProjectDir,
    stateFile,
    ownerKey,
    recovered: recovered.length,
    added,
    skipped,
    activeConversationId,
    conversations: recovered.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      messages: conversation.messages.length,
      sessionId: conversation.sessionId,
      updatedAt: new Date(conversation.updatedAt).toISOString(),
    })),
  }

  if (!args.apply) {
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  mkdirSync(dirname(stateFile), { recursive: true })
  const stamp = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14)
  const backupFile = `${stateFile}.recover-${stamp}.bak`
  copyFileSync(stateFile, backupFile)
  const tempFile = `${stateFile}.${process.pid}.recover.tmp`
  writeFileSync(tempFile, JSON.stringify(rawState, null, 2), 'utf8')
  renameSync(tempFile, stateFile)
  console.log(JSON.stringify({ ...summary, backupFile }, null, 2))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
