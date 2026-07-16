import type {
  AgentSendMessagePayload,
  AgentSendResource,
  AgentSendSkill,
} from '@shared/ipc/agent'
import type { AgentConversationState } from '../../stores/agent-store'
import type { AgentMountedResource, AgentMountedSkill } from '../../types'
import type { AgentResourceCandidate, AgentSkillCandidate } from './view-model'

export function toMountedResource(resource: AgentResourceCandidate): AgentMountedResource {
  return {
    id: resource.id,
    kind: resource.kind,
    label: resource.label,
    detail: resource.detail,
    ref: resource.ref,
  }
}

export function toMountedSkill(skill: AgentSkillCandidate): AgentMountedSkill {
  return {
    id: skill.id,
    name: skill.name,
    label: skill.label,
    description: skill.description,
    source: skill.source,
  }
}

export function toSendResources(resources: AgentMountedResource[]): AgentSendResource[] {
  return resources.map((resource) => ({
    id: resource.id,
    kind: resource.kind,
    label: resource.label,
    detail: resource.detail,
    ref: resource.ref,
  }))
}

export function toSendSkills(skills: AgentMountedSkill[]): AgentSendSkill[] {
  return skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    label: skill.label,
    description: skill.description,
    source: skill.source,
  }))
}

export function buildAgentSendPayload(
  message: string,
  conversation: AgentConversationState | undefined,
): AgentSendMessagePayload {
  return {
    message,
    resources: toSendResources(conversation?.mountedResources ?? []),
    skills: toSendSkills(conversation?.mountedSkills ?? []),
    sessionId: conversation?.sessionId ?? null,
    ...(conversation?.runtime.workspaceRef
      ? { workspaceRef: conversation.runtime.workspaceRef }
      : {}),
  }
}

export function stripTrailingMentionToken(text: string): string {
  return text.replace(/(^|\s)([@/])([^\s@/]*)$/, '$1').trimEnd()
}
