import type { AgentMessage, ContentBlock } from '../../types'
import { IconCheck, IconError, IconThinking, IconTool } from './Icons'

export function ConversationMessageRenderer({
  message,
}: {
  message: AgentMessage
}): React.ReactElement {
  return (
    <div className={`agent-message ${message.role} ${message.isStreaming ? 'streaming' : ''}`}>
      {message.content.map((block, index) => (
        <ContentBlockRenderer key={index} block={block} />
      ))}
      {message.isStreaming && <span className="streaming-cursor" />}
    </div>
  )
}

export function ContentBlockRenderer({ block }: { block: ContentBlock }): React.ReactElement {
  switch (block.type) {
    case 'text':
      return (
        <div className="content-text">
          {block.text.split('\n').map((line, index) => (
            <span key={index}>
              {line}
              {index < block.text.split('\n').length - 1 && <br />}
            </span>
          ))}
        </div>
      )

    case 'thinking':
      return (
        <details className="content-thinking">
          <summary>
            <IconThinking size={12} />
            思考过程
          </summary>
          <div className="thinking-content">{block.thinking}</div>
        </details>
      )

    case 'tool_use':
      return (
        <div className="content-tool-use">
          <div className="tool-header">
            <IconTool size={12} />
            {block.name}
          </div>
          <pre className="tool-input">{JSON.stringify(block.input, null, 2)}</pre>
        </div>
      )

    case 'tool_result':
      return (
        <div className={`content-tool-result ${block.is_error ? 'error' : 'success'}`}>
          {block.is_error ? <IconError size={12} /> : <IconCheck size={12} />}
          {block.content}
        </div>
      )
  }
}
