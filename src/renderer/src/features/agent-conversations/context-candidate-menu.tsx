import type { AgentMountedResourceKind } from '../../types'
import {
  IconFile,
  IconFolder,
  IconGlobe,
  IconMobile,
  IconSearch,
  IconSparkle,
  IconTerminal,
} from '../../components/common/Icons'
import type { AgentResourceCandidate, AgentSkillCandidate } from './view-model'

export function ResourceCandidateMenu({
  candidates,
  onPick,
}: {
  candidates: AgentResourceCandidate[]
  onPick: (candidate: AgentResourceCandidate) => void
}): React.ReactElement {
  return (
    <div className="agent-resource-menu">
      {candidates.length === 0 ? (
        <div className="agent-resource-menu-empty">
          <IconSearch size={13} />
          没有匹配资源
        </div>
      ) : (
        candidates.map((candidate) => (
          <button
            key={candidate.id}
            className="agent-resource-menu-row"
            onMouseDown={(event) => {
              event.preventDefault()
              onPick(candidate)
            }}
            title={candidate.detail}
          >
            {resourceMenuIcon(candidate.kind)}
            <span>{candidate.label}</span>
            <em>{resourceSourceLabel(candidate)}</em>
          </button>
        ))
      )}
    </div>
  )
}

export function SkillCandidateMenu({
  candidates,
  onPick,
}: {
  candidates: AgentSkillCandidate[]
  onPick: (candidate: AgentSkillCandidate) => void
}): React.ReactElement {
  return (
    <div className="agent-resource-menu agent-skill-menu">
      {candidates.length === 0 ? (
        <div className="agent-resource-menu-empty">
          <IconSearch size={13} />
          没有匹配 Skill
        </div>
      ) : (
        candidates.map((candidate) => (
          <button
            key={candidate.id}
            className="agent-resource-menu-row"
            onMouseDown={(event) => {
              event.preventDefault()
              onPick(candidate)
            }}
            title={candidate.description}
          >
            <IconSparkle size={13} />
            <span>/{candidate.label}</span>
            <em>{skillSourceLabel(candidate)}</em>
          </button>
        ))
      )}
    </div>
  )
}

function resourceMenuIcon(kind: AgentMountedResourceKind): React.ReactElement {
  switch (kind) {
    case 'browser':
      return <IconGlobe size={13} />
    case 'android':
      return <IconMobile size={13} />
    case 'terminal':
      return <IconTerminal size={13} />
    case 'file':
    case 'tab':
    case 'artifact':
      return <IconFile size={13} />
    case 'project':
      return <IconFolder size={13} />
  }
}

function skillSourceLabel(candidate: AgentSkillCandidate): string {
  switch (candidate.source) {
    case 'builtin':
      return '内置'
    case 'workspace':
      return '项目'
    case 'user':
    default:
      return '用户 Skill'
  }
}

function resourceSourceLabel(candidate: AgentResourceCandidate): string {
  switch (candidate.source) {
    case 'workspace':
      return '当前项目'
    case 'selected-file':
      return '当前文件'
    case 'open-tab':
      return candidate.kind === 'browser' ? '浏览器 Tab' : '打开 Tab'
    case 'draft':
      return '草稿'
  }
}
