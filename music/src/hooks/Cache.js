import { useState, useEffect, useRef, useCallback } from 'react'
import audioCacheService from '../services/Audio'

/**
 * 音频缓存Hook
 * 提供音频缓存的管理和预加载功能
 */
export function useAudioCache() {
  const [cacheStats, setCacheStats] = useState({
    cacheSize: 0,
    maxCacheSize: 50,
    preloadQueueLength: 0,
    isPreloading: false
  })
  
  const [isEnabled, setIsEnabled] = useState(() => {
    return localStorage.getItem('audioCache.enabled') !== 'false'
  })
  
  const preloadTimeoutRef = useRef(null)
  const lastPreloadIndexRef = useRef(-1)

  // 更新缓存统计
  const updateCacheStats = useCallback(() => {
    setCacheStats(audioCacheService.getCacheStats())
  }, [])

  // 启用/禁用缓存
  const toggleCache = useCallback((enabled) => {
    setIsEnabled(enabled)
    localStorage.setItem('audioCache.enabled', enabled.toString())
    
    if (!enabled) {
      audioCacheService.clearCache()
    }
  }, [])

  // 设置缓存大小
  const setMaxCacheSize = useCallback((size) => {
    audioCacheService.setMaxCacheSize(size)
    updateCacheStats()
  }, [updateCacheStats])

  // 清理缓存
  const clearCache = useCallback(() => {
    audioCacheService.clearCache()
    updateCacheStats()
  }, [updateCacheStats])

  // 预加载音频
  const preloadAudio = useCallback(async (track, priority = 'normal') => {
    if (!isEnabled || !track) return null
    
    try {
      return await audioCacheService.preloadAudio(track, priority)
    } catch (error) {
      console.warn('预加载失败:', error)
      return null
    }
  }, [isEnabled])

  // 获取缓存的音频
  const getCachedAudio = useCallback((track) => {
    if (!isEnabled || !track) return null
    
    return audioCacheService.getCachedAudio(track)
  }, [isEnabled])

  // 预加载下一首
  const preloadNext = useCallback(async (tracks, currentIndex) => {
    if (!isEnabled || !tracks || !Array.isArray(tracks)) return
    
    try {
      await audioCacheService.preloadNext(tracks, currentIndex)
      updateCacheStats()
    } catch (error) {
      console.warn('预加载下一首失败:', error)
    }
  }, [isEnabled, updateCacheStats])

  // 预加载上一首
  const preloadPrev = useCallback(async (tracks, currentIndex) => {
    if (!isEnabled || !tracks || !Array.isArray(tracks)) return
    
    try {
      await audioCacheService.preloadPrev(tracks, currentIndex)
      updateCacheStats()
    } catch (error) {
      console.warn('预加载上一首失败:', error)
    }
  }, [isEnabled, updateCacheStats])

  // 批量预加载
  const preloadBatch = useCallback(async (tracks, startIndex, count = 3) => {
    if (!isEnabled || !tracks || !Array.isArray(tracks)) return
    
    try {
      await audioCacheService.preloadBatch(tracks, startIndex, count)
      updateCacheStats()
    } catch (error) {
      console.warn('批量预加载失败:', error)
    }
  }, [isEnabled, updateCacheStats])

  // 智能预加载
  const smartPreload = useCallback(async (tracks, currentIndex) => {
    if (!isEnabled || !tracks || !Array.isArray(tracks)) return
    
    // 避免重复预加载
    if (lastPreloadIndexRef.current === currentIndex) return
    lastPreloadIndexRef.current = currentIndex
    
    // 清除之前的预加载超时
    if (preloadTimeoutRef.current) {
      clearTimeout(preloadTimeoutRef.current)
    }
    
    // 延迟预加载，避免影响当前播放
    preloadTimeoutRef.current = setTimeout(async () => {
      try {
        // 预加载下一首和上一首
        await Promise.all([
          audioCacheService.preloadNext(tracks, currentIndex),
          audioCacheService.preloadPrev(tracks, currentIndex)
        ])
        
        // 预加载更多歌曲
        await audioCacheService.preloadBatch(tracks, currentIndex, 3)
        
        updateCacheStats()
      } catch (error) {
        console.warn('智能预加载失败:', error)
      }
    }, 1000) // 1秒后开始预加载
  }, [isEnabled, updateCacheStats])

  // 监听缓存变化
  useEffect(() => {
    const interval = setInterval(updateCacheStats, 1000)
    return () => clearInterval(interval)
  }, [updateCacheStats])

  // 清理
  useEffect(() => {
    return () => {
      if (preloadTimeoutRef.current) {
        clearTimeout(preloadTimeoutRef.current)
      }
    }
  }, [])

  return {
    // 状态
    cacheStats,
    isEnabled,
    
    // 方法
    toggleCache,
    setMaxCacheSize,
    clearCache,
    preloadAudio,
    getCachedAudio,
    preloadNext,
    preloadPrev,
    preloadBatch,
    smartPreload,
    updateCacheStats
  }
}

/**
 * 音频缓存配置Hook
 * 提供缓存配置的管理功能
 */
export function useAudioCacheConfig() {
  const [config, setConfig] = useState(() => {
    const defaultConfig = {
      enabled: true,
      maxCacheSize: 50,
      preloadCount: 3,
      preloadDelay: 1000,
      autoCleanup: true,
      cleanupInterval: 300000 // 5分钟
    }
    
    try {
      const saved = localStorage.getItem('audioCache.config')
      return saved ? { ...defaultConfig, ...JSON.parse(saved) } : defaultConfig
    } catch {
      return defaultConfig
    }
  })

  // 更新配置
  const updateConfig = useCallback((newConfig) => {
    const updatedConfig = { ...config, ...newConfig }
    setConfig(updatedConfig)
    localStorage.setItem('audioCache.config', JSON.stringify(updatedConfig))
  }, [config])

  // 重置配置
  const resetConfig = useCallback(() => {
    const defaultConfig = {
      enabled: true,
      maxCacheSize: 50,
      preloadCount: 3,
      preloadDelay: 1000,
      autoCleanup: true,
      cleanupInterval: 300000
    }
    setConfig(defaultConfig)
    localStorage.setItem('audioCache.config', JSON.stringify(defaultConfig))
  }, [])

  return {
    config,
    updateConfig,
    resetConfig
  }
}
