/**
 * ErrorBoundary — 通用 React 错误边界
 *
 * 捕获子组件树中的渲染错误，防止白屏。
 * 支持 fallback render prop 和内置默认回退 UI。
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** 自定义回退 UI，接收 error 和 retry 回调 */
  fallback?: (error: Error, retry: () => void) => ReactNode
  /** 错误发生时的回调（日志上报等） */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] 捕获到渲染错误:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRetry)
      }
      return <DefaultErrorFallback error={this.state.error} onRetry={this.handleRetry} />
    }
    return this.props.children
  }
}

/** 默认回退 UI（简单暗色页面，不依赖外部 CSS） */
function DefaultErrorFallback({
  error,
  onRetry,
}: {
  error: Error
  onRetry: () => void
}): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: 200,
        padding: 24,
        background: '#1e1e1e',
        color: '#ccc',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        textAlign: 'center',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <h3 style={{ margin: '0 0 8px', color: '#fff', fontWeight: 600 }}>出了点问题</h3>
      <pre
        style={{
          maxWidth: '100%',
          maxHeight: 120,
          overflow: 'auto',
          padding: '8px 12px',
          background: '#2d2d2d',
          borderRadius: 6,
          fontSize: 12,
          color: '#f48771',
          margin: '8px 0 16px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {error.message}
      </pre>
      <button
        onClick={onRetry}
        style={{
          padding: '6px 16px',
          border: '1px solid #555',
          borderRadius: 4,
          background: '#333',
          color: '#ccc',
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        重试
      </button>
    </div>
  )
}
