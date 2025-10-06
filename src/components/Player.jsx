import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getImagePreloader } from '../utils/image'

function Icon({ name }) {
  const common = { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24' }
  switch (name) {
    case 'prev':
      return (
        <svg {...common}>
          <polygon points="19 20 9 12 19 4 19 20"></polygon>
          <line x1="5" y1="19" x2="5" y2="5"></line>
        </svg>
      )
    case 'next':
      return (
        <svg {...common}>
          <polygon points="5 4 15 12 5 20 5 4"></polygon>
          <line x1="19" y1="5" x2="19" y2="19"></line>
        </svg>
      )
    case 'play':
      return (
        <svg {...common}>
          <polygon points="6 3 20 12 6 21 6 3"></polygon>
        </svg>
      )
    case 'pause':
      return (
        <svg {...common}>
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
      )
    case 'repeat':
      return (
        <svg {...common}>
          <polyline points="17 1 21 5 17 9"></polyline>
          <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
          <polyline points="7 23 3 19 7 15"></polyline>
          <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
        </svg>
      )
    case 'repeat_on':
      return (
        <svg {...common}>
          <polyline points="17 1 21 5 17 9"></polyline>
          <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
          <polyline points="7 23 3 19 7 15"></polyline>
          <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
          <text x="12" y="13.5" fill="currentColor" font-size="6" text-anchor="middle" font-weight="300">1</text>
        </svg>
      )
    case 'shuffle':
      return (
        <svg {...common}>
          <line x1="4" y1="7" x2="20" y2="7"></line>
          <line x1="4" y1="12" x2="20" y2="12"></line>
          <line x1="4" y1="17" x2="20" y2="17"></line>
        </svg>
      )
    case 'shuffle_on':
      return (
        <svg {...common}>
          <polyline points="16 3 21 3 21 8"></polyline>
          <line x1="4" y1="20" x2="21" y2="3"></line>
          <polyline points="21 16 21 21 16 21"></polyline>
          <line x1="15" y1="15" x2="21" y2="21"></line>
          <line x1="4" y1="4" x2="9" y2="9"></line>
        </svg>
      )
    case 'volume':
      return (
        <svg {...common}>
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
      )
    case 'volume_muted':
      return (
        <svg {...common}>
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <line x1="16" y1="8" x2="22" y2="14"></line>
          <line x1="22" y1="8" x2="16" y2="14"></line>
        </svg>
      )
    default:
      return null
  }
}

const LOOP_MODES = ['off', 'one']

export default function Player({ tracks, currentIndex, onChangeIndex, forcePlayKey, onOpenSettings }) {
  const audioRef = useRef(null)
  const seekTimeoutRef = useRef(null)
  const isSeekingRef = useRef(false)
  const preloadAudioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [loopMode, setLoopMode] = useState('off')
  const [shuffle, setShuffle] = useState(false)
  const [hasInteracted, setHasInteracted] = useState(false)
  const [coverLoaded, setCoverLoaded] = useState(false)
  const [audioLoadTimeout, setAudioLoadTimeout] = useState(false)
  const [networkSlow, setNetworkSlow] = useState(false)
  const userVolumeRef = useRef(1)
  const userMutedRef = useRef(false)
  const audioCtxRef = useRef(null)
  const gainRef = useRef(null)
  const mediaSourceRef = useRef(null)
  const audioConnectedRef = useRef(false)
  const analyserRef = useRef(null)
  const rafRef = useRef(null)
  const loadTimeoutRef = useRef(null)
  const [appConfig, setAppConfig] = useState({
    customProxyUrl: '',
    hasCustomProxy: false
  })

  const hasTracks = Array.isArray(tracks) && tracks.length > 0
  const currentTrack = hasTracks ? tracks[currentIndex] : null
  
  const processLargeFileInWorker = async (base64, contentType) => {
    return new Promise((resolve, reject) => {
      // 创建内联Worker
      const workerCode = `
        self.onmessage = function(e) {
          const { base64, contentType } = e.data
          try {
            const binaryString = atob(base64)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }
            const blob = new Blob([bytes], { type: contentType })
            self.postMessage({ success: true, blob })
          } catch (error) {
            self.postMessage({ success: false, error: error.message })
          }
        }
      `
      
      const blob = new Blob([workerCode], { type: 'application/javascript' })
      const worker = new Worker(URL.createObjectURL(blob))
      
      worker.postMessage({ base64, contentType })
      
      worker.onmessage = (e) => {
        worker.terminate()
        if (e.data.success) {
          const blobUrl = URL.createObjectURL(e.data.blob)
          resolve(blobUrl)
        } else {
          reject(new Error(e.data.error))
        }
      }
      
      worker.onerror = (error) => {
        worker.terminate()
        reject(error)
      }
      
      // 设置超时
      setTimeout(() => {
        worker.terminate()
        reject(new Error('Worker timeout'))
      }, 10000)
    })
  }
  
  // 检测是否为移动端
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  
  // 获取应用配置（包括自定义代理URL）
  useEffect(() => {
    const fetchAppConfig = async () => {
      try {
        const response = await fetch('/api/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'getConfig' })
        })
        if (response.ok) {
          const config = await response.json()
          setAppConfig(config)
        }
      } catch (error) {
        console.warn('Failed to load app config:', error)
        // 如果获取配置失败，使用默认值
        setAppConfig({
          customProxyUrl: '',
          hasCustomProxy: false
        })
      }
    }
    
    fetchAppConfig()
  }, [])
  
  // 网络状态检测（移动端优化）
  useEffect(() => {
    const checkNetworkSpeed = async () => {
      try {
        const start = Date.now()
        
        // 移动端使用更短的超时时间
        const timeout = isMobile ? 3000 : 5000
        const slowThreshold = isMobile ? 1500 : 2000
        
        // 使用一个小的测试文件来检测网络速度
        const testUrl = 'https://raw.githubusercontent.com/github/gitignore/main/Node.gitignore'
        const response = await fetch(testUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(timeout)
        })
        const duration = Date.now() - start
        setNetworkSlow(duration > slowThreshold)
      } catch {
        setNetworkSlow(true) // 检测失败时假设网络较慢
      }
    }
    
    checkNetworkSpeed()
  }, [isMobile])
  
  // 获取音频 URL，智能选择代理方式
  const getAudioUrl = (track) => {
    if (!track?.url) return ''
    
    // 检测是否为GitHub raw链接或其他可能有CORS问题的链接
    const isCorsBlocked = (url) => {
      try {
        const urlObj = new URL(url)
        // GitHub raw链接、其他外部域名等可能有CORS限制
        return urlObj.hostname === 'raw.githubusercontent.com' || 
               urlObj.hostname === 'github.com' ||
               !urlObj.hostname.includes(window.location.hostname)
      } catch {
        return false
      }
    }
    
    // 如果有CORS问题，优先尝试原始URL，失败时再使用代理
    if (isCorsBlocked(track.url)) {
      // 优先尝试原始URL，让错误处理机制来选择代理
      return track.url
    }
    
    // 否则直接使用原始URL
    return track.url
  }
  
  // 音频加载失败时的处理
  const handleAudioError = async (e) => {
    const audio = audioRef.current
    if (!audio || !currentTrack) return
    
    // 防止无限循环：如果当前URL已经是代理URL，不再重试
    const currentSrc = audio.src
    const customProxyUrl = appConfig.customProxyUrl
    
    if (customProxyUrl && currentSrc.includes(customProxyUrl)) {
      console.log('Already using custom proxy, stopping retry')
      return
    }
    
    if (currentSrc.includes('/api/audio') || currentSrc.includes('/api/fetch')) {
      console.log('Already using built-in proxy, stopping retry')
      return
    }
    
    console.warn('Audio load error:', e)
    
    // 优先尝试内置代理服务
    const isCloudflarePages = window.location.hostname.includes('.pages.dev') || 
                              window.location.hostname.includes('cloudflare') ||
                              window.location.hostname.includes('workers.dev')
    
    if (isCloudflarePages) {
      // Cloudflare Pages：使用 fetch.js 代理获取 base64
      try {
        console.log('Direct URL failed, trying fetch.js proxy')
        const response = await fetch('/api/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: currentTrack.url })
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.base64 && data.contentType) {
            // 使用 base64 数据创建 blob URL
            const binaryString = atob(data.base64)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }
            const blob = new Blob([bytes], { type: data.contentType })
            const blobUrl = URL.createObjectURL(blob)
            audio.src = blobUrl
            audio.load()
            console.log('Successfully loaded audio via fetch.js proxy')
            return
          }
        }
      } catch (proxyError) {
        console.error('Fetch.js proxy also failed:', proxyError)
      }
    } else {
      // Docker 部署：尝试流式代理
      try {
        console.log('Direct URL failed, trying audio proxy')
        const proxyUrl = `/api/audio?url=${encodeURIComponent(currentTrack.url)}`
        audio.src = proxyUrl
        audio.load()
        console.log('Successfully loaded audio via audio proxy')
        return
      } catch (proxyError) {
        console.error('Audio proxy also failed:', proxyError)
      }
    }
    
    // 最后尝试自定义代理服务（移动端优化）
    if (appConfig.hasCustomProxy && appConfig.customProxyUrl) {
      try {
        console.log('Built-in proxy failed, trying custom proxy via fetch.js')
        
        // 移动端使用更短的超时时间
        const timeout = isMobile ? 15000 : 30000
        
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)
        
        const response = await fetch('/api/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'customProxy',
            url: currentTrack.url 
          }),
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        
        if (response.ok) {
          const data = await response.json()
          if (data.base64 && data.contentType) {
            // 移动端优化：分块处理大文件，避免内存溢出
            if (isMobile && data.base64.length > 1000000) { // 1MB
              console.log('Large file detected on mobile, processing in chunks')
              
              // 使用 Web Workers 处理大文件（如果支持）
              if (window.Worker) {
                try {
                  const blobUrl = await processLargeFileInWorker(data.base64, data.contentType)
                  audio.src = blobUrl
                  audio.load()
                  console.log('Successfully loaded large audio via custom proxy (Worker)')
                  return
                } catch (workerError) {
                  console.warn('Worker processing failed, falling back to main thread:', workerError)
                }
              }
            }
            
            // 标准处理方式
            const binaryString = atob(data.base64)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }
            const blob = new Blob([bytes], { type: data.contentType })
            const blobUrl = URL.createObjectURL(blob)
            audio.src = blobUrl
            audio.load()
            console.log('Successfully loaded audio via custom proxy')
            return
          }
        } else {
          console.error('Custom proxy response not ok:', response.status, response.statusText)
        }
      } catch (proxyError) {
        if (proxyError.name === 'AbortError') {
          console.error('Custom proxy timeout (mobile optimized)')
        } else {
          console.error('Custom proxy also failed:', proxyError)
        }
      }
    }
    
    // 如果所有方法都失败，尝试重新加载原始URL
    console.log('All methods failed, retrying original URL')
    audio.src = currentTrack.url
    audio.load()
  }
  
  // 解析歌曲标题，分离歌曲名和歌手
  const parseTrackTitle = (title) => {
    if (!title) return { song: '', artist: '' }
    // 兼容 "歌名   歌手"（多个空格）或 "歌名 - 歌手" 两种格式
    const match = title.match(/^(.+?)(?:\s{2,}|\s-\s)(.+)$/)
    if (match) {
      return { song: match[1].trim(), artist: match[2].trim() }
    }
    return { song: title, artist: '' }
  }
  
  const { song, artist } = parseTrackTitle(currentTrack?.title)

  // 确保在移动端首个播放手势触发时，音频图建立完成；桌面端不使用 WebAudio，避免影响原生音量
  const ensureAudioGraph = useCallback(() => {
    try {
      const audio = audioRef.current
      if (!audio) return
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      if (!isMobile) return
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      let ctx = audioCtxRef.current
      if (!ctx) {
        ctx = new AC()
        audioCtxRef.current = ctx
      }
      if (ctx.state === 'suspended') {
        // 尝试立即恢复，处于用户手势上下文中
        ctx.resume().catch(() => {})
      }
      if (!mediaSourceRef.current) {
        try { mediaSourceRef.current = ctx.createMediaElementSource(audio) } catch {}
      }
      if (!gainRef.current) {
        try { gainRef.current = ctx.createGain() } catch {}
      }
      const source = mediaSourceRef.current
      const gain = gainRef.current
      if (source && gain) {
        try {
          // 仅在未连接时建立连接，不主动断开，避免打断播放
          try { source.connect(gain) } catch {}
          try { gain.connect(ctx.destination) } catch {}
          // 使用用户当前设置初始化增益，避免卡在 0
          const target = userMutedRef.current ? 0 : userVolumeRef.current
          gain.gain.setValueAtTime(Math.max(0, Math.min(1, target)), ctx.currentTime)
          audioConnectedRef.current = true
          // 使用 WebAudio 时固定元素音量为 1，由增益控制实际音量
          try { audio.volume = 1 } catch {}
        } catch {}
      }
    } catch {}
  }, [])

  // 预加载当前歌曲的封面图片
  useEffect(() => {
    if (!currentTrack?.cover) {
      setCoverLoaded(false)
      return
    }

    const preloader = getImagePreloader()
    
    // 检查是否已缓存
    const cachedImage = preloader.getCachedImage(currentTrack.cover)
    if (cachedImage) {
      setCoverLoaded(true)
      return
    }

    // 预加载封面图片
    preloader.preloadImage(currentTrack.cover, {
      crossOrigin: 'anonymous',
      timeout: 5000
    }).then(() => {
      setCoverLoaded(true)
    }).catch(error => {
      setCoverLoaded(false)
    })
  }, [currentTrack?.cover])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    // 仅在移动端且已建立 WebAudio 图时，使用 Gain 控制；桌面端走原生 audio.volume
    const useWebAudio = !!audioCtxRef.current && !!gainRef.current && audioConnectedRef.current
    if (useWebAudio) {
      try { audio.volume = 1 } catch {}
      const target = muted ? 0 : volume
      try {
        const ctx = audioCtxRef.current
        gainRef.current.gain.cancelScheduledValues(ctx.currentTime)
        gainRef.current.gain.setValueAtTime(gainRef.current.gain.value, ctx.currentTime)
        gainRef.current.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.05)
      } catch {}
    } else {
      audio.volume = muted ? 0 : volume
    }
    userVolumeRef.current = volume
    userMutedRef.current = muted
  }, [volume, muted])
  // 初始化 WebAudio 管道：MediaElementSource -> Gain -> Destination（仅在用户交互后启用，符合移动端策略）
  useEffect(() => {
    if (!hasInteracted) return
    const audio = audioRef.current
    if (!audio) return
    if (audioConnectedRef.current) return
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    if (!isMobile) return
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      const ctx = audioCtxRef.current || new AC()
      audioCtxRef.current = ctx
      // 用户已交互，此时可安全 resume
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }
      const source = mediaSourceRef.current || ctx.createMediaElementSource(audio)
      mediaSourceRef.current = source
      const gain = gainRef.current || ctx.createGain()
      gainRef.current = gain
      gain.gain.setValueAtTime(0, ctx.currentTime)
      source.connect(gain)
      // 分支分析节点（不接到输出），用于自适应起跳偏移
      try {
        const analyser = analyserRef.current || ctx.createAnalyser()
        analyser.fftSize = 512
        analyserRef.current = analyser
        source.connect(analyser)
      } catch {}
      gain.connect(ctx.destination)
      audioConnectedRef.current = true
      try { audio.volume = 1 } catch {}
    } catch {}
  }, [hasInteracted])


  // 清理定时器
  useEffect(() => {
    return () => {
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current)
      }
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current)
      }
    }
  }, [])

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (e) => {
      // 避免在输入框中触发快捷键
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') {
        return
      }
      
      // 避免影响系统快捷键（如F5刷新、Ctrl+R等）
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return
      }
      
      // 避免影响功能键（F1-F12等）
      if (e.key.startsWith('F') && e.key.length <= 3) {
        return
      }
      
      // 特别处理F5刷新键
      if (e.key === 'F5' || e.code === 'F5') {
        return
      }
      
      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          // 上一首
          playPrev()
          break
        case 'ArrowRight':
          e.preventDefault()
          // 下一首
          playNext()
          break
        case 'ArrowUp':
          e.preventDefault()
          // 音量增加
          const newVolume = Math.min(1, volume + 0.1)
          setVolume(newVolume)
          setMuted(false)
          break
        case 'ArrowDown':
          e.preventDefault()
          // 音量减少
          const newVolume2 = Math.max(0, volume - 0.1)
          setVolume(newVolume2)
          if (newVolume2 === 0) {
            setMuted(true)
          }
          break
        case 'm':
        case 'M':
          e.preventDefault()
          toggleMute()
          break
        case 's':
        case 'S':
          e.preventDefault()
          onOpenSettings && onOpenSettings()
          break
        case 'z':
        case 'Z':
          e.preventDefault()
          setShuffle(s => !s)
          break
        case 'r':
        case 'R':
          e.preventDefault()
          toggleLoopMode()
          break
      }
    }

    // 添加键盘事件监听器
    document.addEventListener('keydown', handleKeyDown)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [volume, muted, shuffle, loopMode, tracks, currentIndex, onChangeIndex, onOpenSettings, isPlaying])

  // 预加载下一首歌曲，优化中国大陆网络环境
  useEffect(() => {
    if (!hasTracks || tracks.length <= 1) return

    // 预加载下一首歌曲
    const nextIndex = (currentIndex + 1) % tracks.length
    const nextTrack = tracks[nextIndex]
    if (nextTrack && nextTrack.url) {
      // 使用代理URL进行预加载，提高成功率
      const preloadUrl = getAudioUrl(nextTrack)
      
      // 创建预加载音频元素
      if (preloadAudioRef.current) {
        preloadAudioRef.current.muted = true
        preloadAudioRef.current.volume = 0
        preloadAudioRef.current.src = preloadUrl
        preloadAudioRef.current.load()
      } else {
        const preloadAudio = new Audio()
        preloadAudio.muted = true
        preloadAudio.volume = 0
        preloadAudio.src = preloadUrl
        preloadAudio.preload = 'metadata' // 只预加载元数据，减少带宽消耗
        preloadAudio.crossOrigin = 'anonymous'
        preloadAudio.load()
        preloadAudioRef.current = preloadAudio
      }
    }
  }, [currentIndex, tracks, hasTracks])

  const formattedTime = (sec) => {
    const s = Math.floor(sec || 0)
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const r = (s % 60).toString().padStart(2, '0')
    return `${m}:${r}`
  }

  const play = async () => {
    const audio = audioRef.current
    if (!audio) return Promise.reject(new Error('No audio element'))
    
    try {
      // 检测移动端
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      
      // 移动端激进策略：不等待加载完成，直接尝试播放
      if (isMobile) {
        // 移动端特殊处理：确保 WebAudio 图与 AudioContext 已建立并恢复
        ensureAudioGraph()
        const ctx = audioCtxRef.current
        if (ctx && ctx.state === 'suspended') {
          try { await ctx.resume() } catch (e) { }
        }
        try { audio.muted = false } catch {}
        try { audio.volume = 1 } catch {}
        
        // 确保音频源已设置
        if (!audio.src) {
          audio.src = currentTrack.url
          audio.load()
        }
        
        // 立即尝试播放，不等待加载
        await audio.play()
        setIsPlaying(true)
        return Promise.resolve()
      } else {
        // 桌面端：使用原有策略
        if (audio.readyState < 2) {
          await new Promise((resolve) => {
            const timeout = setTimeout(() => {
              audio.removeEventListener('canplay', onCanPlay)
              resolve() // 超时也继续播放
            }, 500)
            
            const onCanPlay = () => {
              clearTimeout(timeout)
              audio.removeEventListener('canplay', onCanPlay)
              resolve()
            }
            audio.addEventListener('canplay', onCanPlay)
          })
        }
        
        await audio.play()
        setIsPlaying(true)
        return Promise.resolve()
      }
    } catch (e) {
      // ignore autoplay rejection
      setIsPlaying(false)
      return Promise.reject(e)
    }
  }

  const pause = () => {
    audioRef.current.pause()
    setIsPlaying(false)
  }


  const togglePlay = () => {
    setHasInteracted(true)
    
    if (isPlaying) {
      pause()
    } else {
      // 确保音频存在且可播放
      const audio = audioRef.current
      if (!audio) return
      // 移动端 Chrome 上 readyState 可能尚未到达 2，但仍需触发播放，否则进度不会推进
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      if (isMobile) {
        play().catch(() => {})
      } else {
        if (audio.readyState >= 2) {
          play().catch(() => {})
        } else {
          // 桌面端保持原有策略：在 canplay 后再启动；设置一个兜底超时
          const onCanPlay = () => {
            audio.removeEventListener('canplay', onCanPlay)
            play().catch(() => {})
          }
          audio.addEventListener('canplay', onCanPlay)
          setTimeout(() => {
            audio.removeEventListener('canplay', onCanPlay)
            play().catch(() => {})
          }, 500)
        }
      }
    }
  }

  const onLoadedMetadata = () => {
    const a = audioRef.current
    if (a && a.duration && !isNaN(a.duration) && a.duration > 0) {
      setDuration(a.duration)
    }
    // 清除超时状态
    setAudioLoadTimeout(false)
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }
  }

  const onLoadedData = () => {
    // 一些安卓 Chrome 只在 loadeddata 后才给出有效 duration
    const a = audioRef.current
    if (a && a.duration && !isNaN(a.duration) && a.duration > 0) {
      setDuration(a.duration)
    }
    // 清除超时状态
    setAudioLoadTimeout(false)
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }
  }

  const onCanPlay = () => {
    // 移动端 Chrome 可能需要在 canplay 时再次尝试获取 duration
    const a = audioRef.current
    if (a && a.duration && !isNaN(a.duration) && a.duration > 0) {
      setDuration(a.duration)
    }
    // 清除超时状态
    setAudioLoadTimeout(false)
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }
  }


  const onSeeked = () => {
    // 音频时间设置完成后的回调
    const audio = audioRef.current
    if (audio) {
      setCurrentTime(audio.currentTime || 0)
    }
  }
  // 简化时间更新机制：使用定时器适配所有平台
  useEffect(() => {
    if (!isPlaying) return
    
    // 统一使用定时器，提供一致的行为，降低频率减少冲突
    const id = setInterval(() => {
      const a = audioRef.current
      if (!a) return
      // 如果正在seeking，跳过更新以避免闪跳
      if (isSeekingRef.current) return
      setCurrentTime(a.currentTime || 0)
      if (!duration && a.duration && !isNaN(a.duration) && a.duration > 0) {
        setDuration(a.duration)
      }
    }, 500) // 降低到500ms，减少更新频率
    
    return () => clearInterval(id)
  }, [isPlaying, duration])





  

  const seekChange = (e) => {
    const value = Number(e.target.value)
    
    // 设置seeking标志，防止时间更新干扰
    isSeekingRef.current = true
    
    // 立即更新UI状态
    setCurrentTime(value)
    
    // 使用防抖机制避免频繁设置音频时间
    if (seekTimeoutRef.current) {
      clearTimeout(seekTimeoutRef.current)
    }
    
    seekTimeoutRef.current = setTimeout(() => {
      const audio = audioRef.current
      if (audio && audio.readyState >= 2) {
        audio.currentTime = value
        // 重置seeking标志
        isSeekingRef.current = false
      }
    }, 100) // 100ms防抖
  }



  const changeVolume = (e) => {
    const v = Number(e.target.value)
    setVolume(v)
    setMuted(v === 0)
    setHasInteracted(true)
  }

  const toggleMute = () => { setHasInteracted(true); setMuted((m) => !m) }

  const nextIndex = useCallback(() => {
    if (!tracks.length) return currentIndex
    if (shuffle) {
      if (tracks.length <= 1) return currentIndex
      let idx = currentIndex
      while (idx === currentIndex) {
        idx = Math.floor(Math.random() * tracks.length)
      }
      return idx
    }
    return (currentIndex + 1) % tracks.length
  }, [currentIndex, tracks.length, shuffle])

  const prevIndex = useCallback(() => {
    if (!tracks.length) return currentIndex
    if (shuffle) return nextIndex()
    return (currentIndex - 1 + tracks.length) % tracks.length
  }, [currentIndex, tracks.length, shuffle, nextIndex])

  const playNext = () => { 
    setHasInteracted(true)
    const nextIdx = nextIndex()
    if (nextIdx !== currentIndex) {
      onChangeIndex(nextIdx)
    }
  }
  
  const playPrev = () => { 
    setHasInteracted(true)
    const prevIdx = prevIndex()
    if (prevIdx !== currentIndex) {
      onChangeIndex(prevIdx)
    }
  }

  const onEnded = () => {
    if (loopMode === 'one') {
      audioRef.current.currentTime = 0
      play()
      return
    }
    const idx = nextIndex()
    if (idx === currentIndex && !shuffle) {
      pause()
      return
    }
    onChangeIndex(idx)
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    
    // 检测移动端
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    
    // 重置进度和时间
    setCurrentTime(0)
    setDuration(0)
    setAudioLoadTimeout(false)

    // 清除之前的超时定时器
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }

    // 切歌前确保暂停并回到起点，避免切换瞬间的残留音
    try { audio.pause() } catch {}
    try { audio.currentTime = 0 } catch {}
    // 显式触发加载（src 由 React 更新）
    audio.load()
    
    // 移动端音频加载超时检测
    if (isMobile) {
      loadTimeoutRef.current = setTimeout(() => {
        setAudioLoadTimeout(true)
        // 尝试重新加载
        if (audio.src) {
          audio.load()
        }
      }, 10000) // 10秒超时
    }
    
    if (hasInteracted && isPlaying) {
      if (isMobile) {
        // 移动端：等到 loadeddata/canplay 任一触发后再播，降噪；300ms 兜底
        let done = false
        const tryPlay = async () => {
          if (done) return
          done = true
          // 跳过可能的编码延迟/静音前导 30ms
          try { audio.currentTime = 0 } catch {}
          // 以 Gain=0 启动，随后 200ms 线性淡入至目标音量
          try { audio.muted = false } catch {}
          const ctx = audioCtxRef.current
          const gain = gainRef.current
          const analyser = analyserRef.current
          const targetVol = userMutedRef.current ? 0 : userVolumeRef.current
          if (ctx && gain) {
            try {
              gain.gain.cancelScheduledValues(ctx.currentTime)
              gain.gain.setValueAtTime(0, ctx.currentTime)
            } catch {}
          } else {
            try { audio.volume = 0 } catch {}
          }
          // 启动播放（静音）以便分析
          await play().catch(() => {})
          // 自适应选择起跳偏移：在静音状态下快速探测RMS，选取较安静的起点
          const pickOffset = async () => {
            if (!analyser) return 0.03
            const candidates = [0.02, 0.03, 0.04, 0.05]
            const data = new Uint8Array(512)
            for (let off of candidates) {
              try { audio.currentTime = off } catch {}
              // 稍等缓冲
              await new Promise(r => setTimeout(r, 60))
              let rmsSum = 0
              const samples = 3
              for (let i = 0; i < samples; i++) {
                analyser.getByteTimeDomainData(data)
                let acc = 0
                for (let j = 0; j < data.length; j++) {
                  const v = (data[j] - 128) / 128
                  acc += v * v
                }
                const rms = Math.sqrt(acc / data.length)
                rmsSum += rms
                await new Promise(r => setTimeout(r, 15))
              }
              const avg = rmsSum / samples
              // 阈值经验值：< 0.02 视为足够安静
              if (avg < 0.02) return off
            }
            return 0.03
          }
          const chosen = await pickOffset()
          try { audio.currentTime = chosen } catch {}
          // 开始淡入
          ;(async () => {
            if (targetVol <= 0) return
            if (ctx && gain) {
              try {
                gain.gain.cancelScheduledValues(ctx.currentTime)
                gain.gain.setValueAtTime(0, ctx.currentTime)
                gain.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + 0.2)
              } catch {}
            } else {
              // 无 WebAudio 时退化为步进淡入
              const steps = 10
              const step = 20
              let i = 0
              const tick = () => {
                i++
                const v = Math.min(targetVol, (i / steps) * targetVol)
                try { audio.volume = v } catch {}
                if (i < steps) setTimeout(tick, step)
              }
              setTimeout(tick, step)
            }
          })().catch(() => {})
        }
        const onLoaded = () => { audio.removeEventListener('loadeddata', onLoaded); audio.removeEventListener('canplay', onLoaded); tryPlay() }
        audio.addEventListener('loadeddata', onLoaded)
        audio.addEventListener('canplay', onLoaded)
        setTimeout(() => { tryPlay().catch(() => {}) }, 300)
      } else {
        // 桌面端：根据音频准备状态决定播放时机
        if (audio.readyState >= 2) {
          // 音频已准备好，立即播放
          play().catch(() => {})
        } else {
          // 音频未准备好，等待加载完成
          const onCanPlay = () => {
            audio.removeEventListener('canplay', onCanPlay)
            play().catch(() => {})
          }
          audio.addEventListener('canplay', onCanPlay)
          
          // 设置超时，避免无限等待
          setTimeout(() => {
            audio.removeEventListener('canplay', onCanPlay)
            play().catch(() => {})
          }, 500)
        }
      }
    } else {
      // 非播放状态：确保停止播放
      audio.pause()
      setIsPlaying(false)
    }
  }, [currentIndex])

  // 来自列表点击的强制播放信号
  useEffect(() => {
    if (!forcePlayKey) return
    if (!currentTrack) return
    
    setHasInteracted(true)
    setIsPlaying(true)
    
    // 统一延迟播放，避免与歌曲切换冲突
    setTimeout(() => {
      play()
    }, 100)
  }, [forcePlayKey, currentTrack])

  const toggleLoopMode = () => {
    const idx = (LOOP_MODES.indexOf(loopMode) + 1) % LOOP_MODES.length
    setLoopMode(LOOP_MODES[idx])
  }

  if (!hasTracks || !currentTrack) {
    return (
      <div className="player player-card">
        <div className="meta">
          <h2 className="track-title">无匹配结果</h2>
          <p className="track-sub">请调整搜索关键字</p>
        </div>
      </div>
    )
  }

  return (
    <div className="player player-card">
      <button className="settings-icon" aria-label="打开设置" onClick={onOpenSettings}>⚙️</button>
      <audio
        ref={audioRef}
        src={getAudioUrl(currentTrack)}
        onLoadedMetadata={onLoadedMetadata}
        onLoadedData={onLoadedData}
        onCanPlay={onCanPlay}
        onSeeked={onSeeked}
        onEnded={onEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={handleAudioError}
        preload="metadata"
        crossOrigin="anonymous"
        playsInline
        webkit-playsinline="true"
        controls={false}
        muted={false}
        loop={false}
      />

       <div className="top">
         <div className={`art-lg ${isPlaying ? 'playing' : ''}`} aria-hidden="true">
           <div className={`disc ${isPlaying ? 'playing' : ''}`}>
            {currentTrack.cover ? (
              <img 
                src={currentTrack.cover} 
                alt="封面" 
                loading={coverLoaded ? "eager" : "lazy"}
                style={{ 
                  opacity: coverLoaded ? 1 : 0.3,
                  transition: 'opacity 0.3s ease'
                }}
                onLoad={() => setCoverLoaded(true)}
                onError={() => setCoverLoaded(false)}
              />
            ) : (
              <div className="art-fallback" />
            )}
          </div>
        </div>
        <div className="meta">
          <h2 className="track-title">
            {artist ? `${song} - ${artist}` : song}
          </h2>
          <p className="track-sub">&nbsp;</p>
          <div className="controls-row">
            <button className="icon-btn" onClick={playPrev} aria-label="上一曲"><Icon name="prev" /></button>
            <button className="icon-btn icon-btn-primary" onClick={togglePlay} aria-label="播放/暂停">{isPlaying ? <Icon name="pause" /> : <Icon name="play" />}</button>
            <button className="icon-btn" onClick={playNext} aria-label="下一曲"><Icon name="next" /></button>
            <button className="icon-btn" onClick={() => setShuffle(s => !s)} aria-label="随机列表播放" aria-pressed={shuffle}><Icon name={shuffle ? 'shuffle_on' : 'shuffle'} /></button>
            <button className="icon-btn" onClick={toggleLoopMode} aria-label="单曲循环" aria-pressed={loopMode !== 'off'}><Icon name={loopMode !== 'off' ? 'repeat_on' : 'repeat'} /></button>
            <div className="vol">
              <button className="icon-btn" onClick={toggleMute} aria-label="静音"><Icon name={muted ? 'volume_muted' : 'volume'} /></button>
              <input 
                className="vol-line" 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                value={muted ? 0 : volume} 
                onChange={changeVolume} 
                aria-label="音量"
                style={{ '--p': `${(muted ? 0 : volume) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="progress-under">
        <span className="time-left">{formattedTime(currentTime)}</span>
        <input
          className="progress-line"
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={currentTime}
          onChange={seekChange}
          aria-label="播放进度"
          style={{ '--p': `${duration ? (currentTime / duration) * 100 : 0}%` }}
        />
        <span className="time-right">{formattedTime(duration)}</span>
      </div>
    </div>
  )
}


