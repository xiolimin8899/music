/**
 * 统一错误处理系统
 * 提供标准化的错误类、错误边界和错误处理工具
 */

// 错误类型枚举
export const ERROR_TYPES = {
  NETWORK: 'NETWORK_ERROR',
  API: 'API_ERROR', 
  VALIDATION: 'VALIDATION_ERROR',
  AUTH: 'AUTH_ERROR',
  FILE: 'FILE_ERROR',
  AUDIO: 'AUDIO_ERROR',
  STORAGE: 'STORAGE_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR'
}

// 错误严重程度
export const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium', 
  HIGH: 'high',
  CRITICAL: 'critical'
}

/**
 * 基础错误类
 */
export class AppError extends Error {
  constructor(message, type = ERROR_TYPES.UNKNOWN, severity = ERROR_SEVERITY.MEDIUM, code = null, context = {}) {
    super(message)
    this.name = 'AppError'
    this.type = type
    this.severity = severity
    this.code = code
    this.context = context
    this.timestamp = new Date().toISOString()
    this.stack = this.stack || new Error().stack
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      severity: this.severity,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp
    }
  }
}

/**
 * 网络错误类
 */
export class NetworkError extends AppError {
  constructor(message, status = null, url = null) {
    super(message, ERROR_TYPES.NETWORK, ERROR_SEVERITY.HIGH, status, { url })
    this.name = 'NetworkError'
    this.status = status
    this.url = url
  }
}

/**
 * API错误类
 */
export class APIError extends AppError {
  constructor(message, status = null, endpoint = null, response = null) {
    super(message, ERROR_TYPES.API, ERROR_SEVERITY.HIGH, status, { endpoint, response })
    this.name = 'APIError'
    this.status = status
    this.endpoint = endpoint
    this.response = response
  }
}

/**
 * 验证错误类
 */
export class ValidationError extends AppError {
  constructor(message, field = null, value = null) {
    super(message, ERROR_TYPES.VALIDATION, ERROR_SEVERITY.MEDIUM, 'VALIDATION_FAILED', { field, value })
    this.name = 'ValidationError'
    this.field = field
    this.value = value
  }
}

/**
 * 认证错误类
 */
export class AuthError extends AppError {
  constructor(message, reason = null) {
    super(message, ERROR_TYPES.AUTH, ERROR_SEVERITY.HIGH, 'AUTH_FAILED', { reason })
    this.name = 'AuthError'
    this.reason = reason
  }
}

/**
 * 文件错误类
 */
export class FileError extends AppError {
  constructor(message, fileName = null, operation = null) {
    super(message, ERROR_TYPES.FILE, ERROR_SEVERITY.MEDIUM, 'FILE_ERROR', { fileName, operation })
    this.name = 'FileError'
    this.fileName = fileName
    this.operation = operation
  }
}

/**
 * 音频错误类
 */
export class AudioError extends AppError {
  constructor(message, audioUrl = null, codec = null) {
    super(message, ERROR_TYPES.AUDIO, ERROR_SEVERITY.MEDIUM, 'AUDIO_ERROR', { audioUrl, codec })
    this.name = 'AudioError'
    this.audioUrl = audioUrl
    this.codec = codec
  }
}

/**
 * 存储错误类
 */
export class StorageError extends AppError {
  constructor(message, key = null, operation = null) {
    super(message, ERROR_TYPES.STORAGE, ERROR_SEVERITY.LOW, 'STORAGE_ERROR', { key, operation })
    this.name = 'StorageError'
    this.key = key
    this.operation = operation
  }
}

/**
 * 错误处理工具类
 */
export class ErrorHandler {
  constructor() {
    this.errorLog = []
    this.maxLogSize = 100
  }

  /**
   * 处理错误
   */
  handle(error, context = '') {
    const appError = this.normalizeError(error, context)
    this.logError(appError)
    this.notifyError(appError)
    return appError
  }

  /**
   * 标准化错误
   */
  normalizeError(error, context = '') {
    if (error instanceof AppError) {
      return error
    }

    // 处理网络错误
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return new NetworkError(
        `网络请求失败: ${error.message}`,
        null,
        context
      )
    }

    // 处理API错误
    if (error.status || error.response) {
      return new APIError(
        error.message || 'API请求失败',
        error.status,
        context,
        error.response
      )
    }

    // 处理验证错误
    if (error.message && error.message.includes('验证')) {
      return new ValidationError(
        error.message,
        error.field,
        error.value
      )
    }

    // 处理音频错误
    if (error.message && (error.message.includes('音频') || error.message.includes('audio'))) {
      return new AudioError(
        error.message,
        error.audioUrl,
        error.codec
      )
    }

    // 处理文件错误
    if (error.message && (error.message.includes('文件') || error.message.includes('file'))) {
      return new FileError(
        error.message,
        error.fileName,
        error.operation
      )
    }

    // 默认错误
    return new AppError(
      error.message || '未知错误',
      ERROR_TYPES.UNKNOWN,
      ERROR_SEVERITY.MEDIUM,
      null,
      { originalError: error, context }
    )
  }

  /**
   * 记录错误
   */
  logError(error) {
    this.errorLog.push({
      ...error.toJSON(),
      id: this.generateErrorId()
    })

    // 限制日志大小
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize)
    }

    // 控制台输出
    console.error(`[${error.severity.toUpperCase()}] ${error.name}:`, error.message, error.context)
  }

  /**
   * 通知错误
   */
  notifyError(error) {
    // 高严重性错误需要特殊处理
    if (error.severity === ERROR_SEVERITY.CRITICAL) {
      // 可以在这里添加用户通知逻辑
      console.error('严重错误:', error.message)
    }
  }

  /**
   * 生成错误ID
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 获取错误日志
   */
  getErrorLog() {
    return [...this.errorLog]
  }

  /**
   * 清空错误日志
   */
  clearErrorLog() {
    this.errorLog = []
  }

  /**
   * 获取错误统计
   */
  getErrorStats() {
    const stats = {}
    this.errorLog.forEach(error => {
      stats[error.type] = (stats[error.type] || 0) + 1
    })
    return stats
  }
}

// 创建全局错误处理器实例
export const errorHandler = new ErrorHandler()

/**
 * 错误处理装饰器
 */
export function withErrorHandling(fn, context = '') {
  return async (...args) => {
    try {
      return await fn(...args)
    } catch (error) {
      throw errorHandler.handle(error, context)
    }
  }
}

/**
 * 错误处理Hook
 */
export function useErrorHandling() {
  const handleError = (error, context = '') => {
    return errorHandler.handle(error, context)
  }

  const handleAsyncError = async (asyncFn, context = '') => {
    try {
      return await asyncFn()
    } catch (error) {
      throw errorHandler.handle(error, context)
    }
  }

  return {
    handleError,
    handleAsyncError,
    errorLog: errorHandler.getErrorLog(),
    errorStats: errorHandler.getErrorStats()
  }
}

/**
 * 错误恢复策略
 */
export const ERROR_RECOVERY_STRATEGIES = {
  RETRY: 'retry',
  FALLBACK: 'fallback', 
  IGNORE: 'ignore',
  USER_INTERVENTION: 'user_intervention'
}

/**
 * 错误恢复工具
 */
export class ErrorRecovery {
  static async retry(fn, maxRetries = 3, delay = 1000) {
    let lastError
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)))
        }
      }
    }
    throw lastError
  }

  static async withFallback(fn, fallbackFn) {
    try {
      return await fn()
    } catch (error) {
      console.warn('主函数失败，使用备用方案:', error.message)
      return await fallbackFn()
    }
  }
}
