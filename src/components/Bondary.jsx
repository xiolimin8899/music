import React from 'react'
import { AppError, ERROR_TYPES, ERROR_SEVERITY, errorHandler } from '../utils/errors'

/**
 * React错误边界组件
 * 捕获子组件树中的JavaScript错误，记录这些错误，并显示备用UI
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      retryCount: 0
    }
  }

  static getDerivedStateFromError(error) {
    // 更新state使下一次渲染能够显示降级后的UI
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    // 创建标准化的错误对象
    const appError = new AppError(
      error.message || '组件渲染错误',
      ERROR_TYPES.UNKNOWN,
      ERROR_SEVERITY.HIGH,
      'COMPONENT_ERROR',
      {
        componentStack: errorInfo.componentStack,
        errorBoundary: this.props.name || 'ErrorBoundary',
        retryCount: this.state.retryCount
      }
    )

    // 记录错误
    errorHandler.handle(appError, 'ErrorBoundary')

    this.setState({
      error: appError,
      errorInfo: errorInfo
    })

    // 调用自定义错误处理函数
    if (this.props.onError) {
      this.props.onError(appError, errorInfo)
    }
  }

  handleRetry = () => {
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1
    }))
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      // 自定义错误UI
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRetry)
      }

      // 默认错误UI
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <div className="error-boundary-icon">⚠️</div>
            <h2 className="error-boundary-title">出现错误</h2>
            <p className="error-boundary-message">
              {this.state.error?.message || '应用程序遇到了一个错误'}
            </p>
            
            {process.env.NODE_ENV === 'development' && (
              <details className="error-boundary-details">
                <summary>错误详情</summary>
                <pre className="error-boundary-stack">
                  {this.state.error?.stack}
                </pre>
                <pre className="error-boundary-component-stack">
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div className="error-boundary-actions">
              <button 
                className="btn btn-primary" 
                onClick={this.handleRetry}
                disabled={this.state.retryCount >= 3}
                id="error-retry-btn"
                name="error-retry"
              >
                {this.state.retryCount >= 3 ? '重试次数已达上限' : '重试'}
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={this.handleReload}
                id="error-reload-btn"
                name="error-reload"
              >
                重新加载页面
              </button>
            </div>

            {this.state.retryCount > 0 && (
              <p className="error-boundary-retry-info">
                重试次数: {this.state.retryCount}/3
              </p>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * 高阶组件：为组件添加错误边界
 */
export function withErrorBoundary(Component, errorBoundaryProps = {}) {
  const WrappedComponent = (props) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  )
  
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`
  return WrappedComponent
}

/**
 * 错误边界Hook
 */
export function useErrorBoundary() {
  const [error, setError] = React.useState(null)

  const resetError = React.useCallback(() => {
    setError(null)
  }, [])

  const captureError = React.useCallback((error) => {
    setError(error)
  }, [])

  React.useEffect(() => {
    if (error) {
      throw error
    }
  }, [error])

  return { captureError, resetError }
}

export default ErrorBoundary
