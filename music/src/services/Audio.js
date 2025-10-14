/**
 * 音频缓存服务
 * 提供音频文件的缓存、预加载和管理功能
 */
class AudioCacheService {
  constructor() {
    this.cache = new Map() // 内存缓存
    this.preloadQueue = [] // 预加载队列
    this.maxCacheSize = 50 // 最大缓存数量
    this.maxPreloadSize = 5 // 最大预加载数量
    this.cacheSize = 0 // 当前缓存大小
    this.isPreloading = false // 是否正在预加载
    this.preloadTimeout = null // 预加载超时
  }

  /**
   * 获取音频URL
   */
  getAudioUrl(track) {
    if (!track || !track.url) return ''
    
    // 检查是否有自定义代理设置
    const customProxyUrl = localStorage.getItem('ui.customProxyUrl') || ''
    if (customProxyUrl) {
      return `${customProxyUrl}?url=${encodeURIComponent(track.url)}`
    }
    
    // 检查是否需要使用内置代理
    if (track.url.includes('github.com') || track.url.includes('raw.githubusercontent.com')) {
      return `/api/audio?url=${encodeURIComponent(track.url)}`
    }
    
    return track.url
  }

  /**
   * 预加载音频
   */
  async preloadAudio(track, priority = 'normal') {
    if (!track || !track.url) return null
    
    const audioUrl = this.getAudioUrl(track)
    const cacheKey = this.getCacheKey(track)
    
    // 检查是否已缓存
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)
    }
    
    // 添加到预加载队列
    this.addToPreloadQueue(track, priority)
    
    // 开始预加载
    this.startPreloading()
    
    return null
  }

  /**
   * 获取缓存的音频
   */
  getCachedAudio(track) {
    if (!track || !track.url) return null
    
    const cacheKey = this.getCacheKey(track)
    return this.cache.get(cacheKey) || null
  }

  /**
   * 缓存音频
   */
  async cacheAudio(track) {
    if (!track || !track.url) return null
    
    const audioUrl = this.getAudioUrl(track)
    const cacheKey = this.getCacheKey(track)
    
    // 如果已缓存，直接返回
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)
    }
    
    try {
      // 创建音频对象
      const audio = new Audio()
      audio.crossOrigin = 'anonymous'
      audio.preload = 'metadata'
      audio.src = audioUrl
      
      // 等待音频加载
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Audio load timeout'))
        }, 10000)
        
        const cleanup = () => {
          clearTimeout(timeout)
          audio.removeEventListener('canplay', onCanPlay)
          audio.removeEventListener('error', onError)
        }
        
        const onCanPlay = () => {
          cleanup()
          resolve()
        }
        
        const onError = (e) => {
          cleanup()
          reject(e)
        }
        
        audio.addEventListener('canplay', onCanPlay)
        audio.addEventListener('error', onError)
        audio.load()
      })
      
      // 缓存音频
      this.setCache(cacheKey, audio)
      
      return audio
    } catch (error) {
      console.warn('音频缓存失败:', error)
      return null
    }
  }

  /**
   * 预加载下一首歌曲
   */
  async preloadNext(tracks, currentIndex) {
    if (!tracks || !Array.isArray(tracks)) return
    
    const nextIndex = (currentIndex + 1) % tracks.length
    const nextTrack = tracks[nextIndex]
    
    if (nextTrack) {
      await this.preloadAudio(nextTrack, 'high')
    }
  }

  /**
   * 预加载上一首歌曲
   */
  async preloadPrev(tracks, currentIndex) {
    if (!tracks || !Array.isArray(tracks)) return
    
    const prevIndex = (currentIndex - 1 + tracks.length) % tracks.length
    const prevTrack = tracks[prevIndex]
    
    if (prevTrack) {
      await this.preloadAudio(prevTrack, 'high')
    }
  }

  /**
   * 批量预加载
   */
  async preloadBatch(tracks, startIndex, count = 3) {
    if (!tracks || !Array.isArray(tracks)) return
    
    const preloadPromises = []
    
    for (let i = 0; i < count; i++) {
      const index = (startIndex + i) % tracks.length
      const track = tracks[index]
      
      if (track) {
        preloadPromises.push(this.preloadAudio(track, 'normal'))
      }
    }
    
    await Promise.allSettled(preloadPromises)
  }

  /**
   * 清理缓存
   */
  clearCache() {
    // 清理内存缓存
    this.cache.forEach(audio => {
      if (audio && audio.src) {
        audio.src = ''
        audio.load()
      }
    })
    this.cache.clear()
    this.cacheSize = 0
    
    // 清理预加载队列
    this.preloadQueue = []
    
    // 清理Service Worker缓存
    if ('caches' in window) {
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          if (cacheName.includes('audio-cache')) {
            caches.delete(cacheName)
          }
        })
      })
    }
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return {
      cacheSize: this.cacheSize,
      maxCacheSize: this.maxCacheSize,
      preloadQueueLength: this.preloadQueue.length,
      isPreloading: this.isPreloading
    }
  }

  /**
   * 设置缓存大小限制
   */
  setMaxCacheSize(size) {
    this.maxCacheSize = Math.max(1, size)
    this.cleanupCache()
  }

  /**
   * 私有方法：获取缓存键
   */
  getCacheKey(track) {
    return `${track.url}_${track.title || ''}`
  }

  /**
   * 私有方法：添加到预加载队列
   */
  addToPreloadQueue(track, priority) {
    const existing = this.preloadQueue.find(item => item.track.url === track.url)
    if (existing) return
    
    this.preloadQueue.push({
      track,
      priority,
      timestamp: Date.now()
    })
    
    // 按优先级排序
    this.preloadQueue.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })
  }

  /**
   * 私有方法：开始预加载
   */
  async startPreloading() {
    if (this.isPreloading || this.preloadQueue.length === 0) return
    
    this.isPreloading = true
    
    try {
      while (this.preloadQueue.length > 0 && this.cacheSize < this.maxCacheSize) {
        const { track } = this.preloadQueue.shift()
        await this.cacheAudio(track)
      }
    } catch (error) {
      console.warn('预加载失败:', error)
    } finally {
      this.isPreloading = false
    }
  }

  /**
   * 私有方法：设置缓存
   */
  setCache(key, audio) {
    // 检查缓存大小限制
    if (this.cacheSize >= this.maxCacheSize) {
      this.cleanupCache()
    }
    
    this.cache.set(key, audio)
    this.cacheSize++
  }

  /**
   * 私有方法：清理缓存
   */
  cleanupCache() {
    if (this.cacheSize <= this.maxCacheSize) return
    
    // 按使用时间排序，删除最旧的缓存
    const entries = Array.from(this.cache.entries())
    entries.sort((a, b) => {
      const aTime = a[1].lastUsed || 0
      const bTime = b[1].lastUsed || 0
      return aTime - bTime
    })
    
    const toDelete = entries.slice(0, this.cacheSize - this.maxCacheSize)
    toDelete.forEach(([key, audio]) => {
      if (audio && audio.src) {
        audio.src = ''
        audio.load()
      }
      this.cache.delete(key)
      this.cacheSize--
    })
  }
}

// 创建单例实例
const audioCacheService = new AudioCacheService()

export default audioCacheService
