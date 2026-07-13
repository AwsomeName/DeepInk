import { describe, expect, it } from 'vitest'
import type { TerminalRuntimeRef } from '../../shared/terminal'
import {
  assertTerminalStatusTransition,
  canTransitionTerminalStatus,
  createTerminalSessionState,
  transitionTerminalSessionState,
} from './terminal-session-state'

const runtime: TerminalRuntimeRef = {
  location: 'local',
  transport: 'local',
  backend: 'local-shell',
  workspaceRef: {
    kind: 'local',
    path: '/Users/apple/Desktop/DeepInk',
  },
  cwd: '/Users/apple/Desktop/DeepInk',
}

describe('terminal session state', () => {
  it('creates an idle session snapshot', () => {
    const session = createTerminalSessionState({
      sessionId: 'terminal-1',
      runtime,
      now: 100,
    })

    expect(session).toEqual({
      sessionId: 'terminal-1',
      runtime,
      status: 'idle',
      createdAt: 100,
      updatedAt: 100,
    })
  })

  it('allows the normal execution lifecycle', () => {
    const idleSession = createTerminalSessionState({
      sessionId: 'terminal-1',
      runtime,
      now: 100,
    })
    const startingSession = transitionTerminalSessionState(idleSession, 'starting', {
      now: 120,
    })
    const runningSession = transitionTerminalSessionState(startingSession, 'running', {
      now: 130,
      processId: 42,
    })
    const blockedSession = transitionTerminalSessionState(runningSession, 'blocked', {
      now: 140,
      lastCommand: 'rm -rf dist',
    })
    const resumedSession = transitionTerminalSessionState(blockedSession, 'running', {
      now: 150,
    })
    const exitedSession = transitionTerminalSessionState(resumedSession, 'exited', {
      now: 160,
      exitCode: 0,
    })

    expect(exitedSession).toMatchObject({
      status: 'exited',
      processId: 42,
      exitCode: 0,
      lastCommand: 'rm -rf dist',
      updatedAt: 160,
    })
  })

  it('rejects transitions out of terminal states', () => {
    const exitedSession = {
      ...createTerminalSessionState({ sessionId: 'terminal-1', runtime, now: 100 }),
      status: 'exited' as const,
    }

    expect(canTransitionTerminalStatus('exited', 'running')).toBe(false)
    expect(() => transitionTerminalSessionState(exitedSession, 'running')).toThrow(
      '非法 Terminal 状态迁移：exited -> running',
    )
  })

  it('allows idempotent state updates for metadata refreshes', () => {
    const session = {
      ...createTerminalSessionState({ sessionId: 'terminal-1', runtime, now: 100 }),
      status: 'running' as const,
      processId: 42,
    }

    const refreshedSession = transitionTerminalSessionState(session, 'running', {
      now: 200,
      lastCommand: 'pwd',
    })

    expect(refreshedSession).toMatchObject({
      status: 'running',
      processId: 42,
      lastCommand: 'pwd',
      updatedAt: 200,
    })
  })

  it('allows an idle session to block on command confirmation and return to idle', () => {
    const session = createTerminalSessionState({
      sessionId: 'terminal-1',
      runtime,
      now: 100,
    })

    const blockedSession = transitionTerminalSessionState(session, 'blocked', {
      now: 120,
      lastCommand: 'rm -rf dist',
    })
    const restoredSession = transitionTerminalSessionState(blockedSession, 'idle', {
      now: 140,
    })

    expect(restoredSession).toMatchObject({
      status: 'idle',
      lastCommand: 'rm -rf dist',
      updatedAt: 140,
    })
  })

  it('throws a readable error when asserting an invalid transition', () => {
    expect(() => assertTerminalStatusTransition('idle', 'running')).toThrow(
      '非法 Terminal 状态迁移：idle -> running',
    )
  })
})
