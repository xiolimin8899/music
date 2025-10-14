import React, { useState, useEffect } from 'react'
import { useAudioCache, useAudioCacheConfig } from '../hooks/Cache'

/**
 * 音频缓存管理组件
 * 提供缓存状态显示和管理功能
 */
export default function Manager({ isOpen, onClose }) {
  const { cacheStats, isEnabled, toggleCache, setMaxCacheSize, clearCache } = useAudioCache()
  const { config, updateConfig, resetConfig } = useAudioCacheConfig()
  const [showAdvanced, setShowAdvanced] = useState(false)

  if (!isOpen) return null

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getCacheUsagePercent = () => {
    return Math.round((cacheStats.cacheSize / cacheStats.maxCacheSize) * 100)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">音频缓存管理</h3>
        
        <div className="modal-body">
          {/* 缓存状态 */}
          <div className="cache-status">
            <h4>缓存状态</h4>
            <div className="status-grid">
              <div className="status-item">
                <span className="label">缓存状态:</span>
                <span className={`value ${isEnabled ? 'enabled' : 'disabled'}`}>
                  {isEnabled ? '已启用' : '已禁用'}
                </span>
              </div>
              <div className="status-item">
                <span className="label">缓存数量:</span>
                <span className="value">{cacheStats.cacheSize} / {cacheStats.maxCacheSize}</span>
              </div>
              <div className="status-item">
                <span className="label">预加载队列:</span>
                <span className="value">{cacheStats.preloadQueueLength}</span>
              </div>
              <div className="status-item">
                <span className="label">预加载状态:</span>
                <span className={`value ${cacheStats.isPreloading ? 'loading' : 'idle'}`}>
                  {cacheStats.isPreloading ? '进行中' : '空闲'}
                </span>
              </div>
            </div>
            
            {/* 缓存使用率 */}
            <div className="cache-usage">
              <div className="usage-header">
                <span>缓存使用率</span>
                <span>{getCacheUsagePercent()}%</span>
              </div>
              <div className="usage-bar">
                <div 
                  className="usage-fill" 
                  style={{ width: `${getCacheUsagePercent()}%` }}
                />
              </div>
            </div>
          </div>

          {/* 基本设置 */}
          <div className="cache-settings">
            <h4>基本设置</h4>
            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => toggleCache(e.target.checked)}
                />
                启用音频缓存
              </label>
            </div>
            <div className="setting-item">
              <label>
                最大缓存数量:
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={config.maxCacheSize}
                  onChange={(e) => updateConfig({ maxCacheSize: parseInt(e.target.value) })}
                  disabled={!isEnabled}
                />
              </label>
            </div>
          </div>

          {/* 高级设置 */}
          <div className="advanced-settings">
            <button
              className="btn-ghost"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? '隐藏' : '显示'}高级设置
            </button>
            
            {showAdvanced && (
              <div className="advanced-content">
                <div className="setting-item">
                  <label>
                    预加载数量:
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={config.preloadCount}
                      onChange={(e) => updateConfig({ preloadCount: parseInt(e.target.value) })}
                      disabled={!isEnabled}
                    />
                  </label>
                </div>
                <div className="setting-item">
                  <label>
                    预加载延迟 (ms):
                    <input
                      type="number"
                      min="100"
                      max="5000"
                      value={config.preloadDelay}
                      onChange={(e) => updateConfig({ preloadDelay: parseInt(e.target.value) })}
                      disabled={!isEnabled}
                    />
                  </label>
                </div>
                <div className="setting-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={config.autoCleanup}
                      onChange={(e) => updateConfig({ autoCleanup: e.target.checked })}
                      disabled={!isEnabled}
                    />
                    自动清理缓存
                  </label>
                </div>
                <div className="setting-item">
                  <label>
                    清理间隔 (ms):
                    <input
                      type="number"
                      min="60000"
                      max="3600000"
                      value={config.cleanupInterval}
                      onChange={(e) => updateConfig({ cleanupInterval: parseInt(e.target.value) })}
                      disabled={!isEnabled || !config.autoCleanup}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="cache-actions">
            <button
              className="btn-danger"
              onClick={() => {
                if (confirm('确定要清理所有缓存吗？')) {
                  clearCache()
                }
              }}
              disabled={!isEnabled}
            >
              清理缓存
            </button>
            <button
              className="btn-ghost"
              onClick={resetConfig}
            >
              重置配置
            </button>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

// 缓存状态指示器组件
export function AudioCacheIndicator({ className = '' }) {
  const { cacheStats, isEnabled } = useAudioCache()
  
  if (!isEnabled) return null
  
  return (
    <div className={`audio-cache-indicator ${className}`}>
      <div className="indicator-dot" />
      <span className="indicator-text">
        缓存: {cacheStats.cacheSize}/{cacheStats.maxCacheSize}
      </span>
    </div>
  )
}
