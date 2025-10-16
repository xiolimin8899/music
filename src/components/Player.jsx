import React, { useCallback, useEffect, useRef, useState } from 'react'
import CoverArt from './CoverArt'
import Controls from './Controls'
import Progress from './Progress'
import { useAudioCache } from '../hooks/Cache'

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
  const [audioLoadTimeout, setAudioLoadTimeout] = useState(false)
  const [networkSlow, setNetworkSlow] = useState(false)
  const userVolumeRef = useRef(1)
  const userMutedRef = useRef(false)
  const loadTimeoutRef = useRef(null)
  const [appConfig, setAppConfig] = useState({
    customProxyUrl: '',
    hasCustomProxy: false
  })
  
  const audioContextRef = useRef(null)
  const blobUrlsRef = useRef(new Set()) // 用于跟踪创建的Blob URLs
  const testAudioRef = useRef(null) // 用于测试音频的临时对象

  // 音频缓存Hook
  const { 
    isEnabled: cacheEnabled, 
    preloadNext, 
    preloadPrev, 
    smartPreload, 
    getCachedAudio,
    preloadAudio 
  } = useAudioCache()

  const hasTracks = Array.isArray(tracks) && tracks.length > 0
  const currentTrack = hasTracks ? tracks[currentIndex] : null
  
  const parseTrackTitle = (title) => {
    if (!title) return { song: '', artist: '' }

    const match = title.match(/^(.+?)(?:\s{2,}|\s-\s)(.+)$/)
    if (match) {
      return { song: match[1].trim(), artist: match[2].trim() }
    }
    return { song: title, artist: '' }
  }
  
  const { song, artist } = parseTrackTitle(currentTrack?.title)
  
  
  
  useEffect(() => {
    const initAudioContext = async () => {
      try {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        const isChrome = /Chrome/i.test(navigator.userAgent)
        
        if (isMobile && window.AudioContext) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
          
          const activateContext = async () => {
            try {
              if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume()
                console.log('Audio context activated successfully')
              }
            } catch (error) {
              console.warn('Failed to activate audio context:', error)
            }
          }
          
          // 针对Chrome浏览器添加更多激活事件
          const events = isChrome ? 
            ['touchstart', 'touchend', 'click', 'keydown', 'mousedown', 'pointerdown'] :
            ['touchstart', 'touchend', 'click', 'keydown']
          
          const activateOnce = () => {
            activateContext()
            events.forEach(event => {
              document.removeEventListener(event, activateOnce)
            })
          }
          
          events.forEach(event => {
            document.addEventListener(event, activateOnce, { once: true, passive: true })
          })
          
          // 添加页面可见性变化时的处理
          const handleVisibilityChange = () => {
            if (!document.hidden && audioContextRef.current?.state === 'suspended') {
              activateContext()
            }
          }
          document.addEventListener('visibilitychange', handleVisibilityChange)
          
          // 返回清理函数
          return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            events.forEach(event => {
              document.removeEventListener(event, activateOnce)
            })
          }
        }
      } catch (error) {
        console.warn('Audio context initialization failed:', error)
      }
    }
    
    const cleanup = initAudioContext()
    return cleanup
  }, [])

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

        setAppConfig({
          customProxyUrl: '',
          hasCustomProxy: false
        })
      }
    }
    
    fetchAppConfig()
  }, [])
  
  useEffect(() => {
    const checkNetworkSpeed = async () => {
      try {
        const start = Date.now()
        
        const testUrl = 'https://raw.githubusercontent.com/github/gitignore/main/Node.gitignore'
        const response = await fetch(testUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000)
        })
        const duration = Date.now() - start
        setNetworkSlow(duration > 2000)
      } catch {
        setNetworkSlow(true)
      }
    }
    
    checkNetworkSpeed()
  }, [])
  
  const getAudioUrl = (track) => {
    if (!track?.url) return ''
    
    // 获取用户设置的音频加载方式，默认为内置代理
    const audioLoadMethod = localStorage.getItem('ui.audioLoadMethod')
    const userCustomProxyUrl = localStorage.getItem('ui.customProxyUrl') || ''
    
    try {
      const u = new URL(track.url)
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        // 只有当用户主动选择了其他方式时才使用用户设置
        if (audioLoadMethod === 'direct') {
          // 用户选择了直连原始URL
          return track.url
        } else if (audioLoadMethod === 'custom') {
          // 用户选择了自定义代理
          let proxyUrl
          
          if (userCustomProxyUrl) {
            // 用户输入了自定义代理，优先使用用户输入
            proxyUrl = userCustomProxyUrl
          } else if (appConfig.customProxyUrl) {
            // 用户没有输入，使用环境变量
            proxyUrl = appConfig.customProxyUrl
          }
          
          if (proxyUrl) {
            const finalProxyUrl = proxyUrl.endsWith('?') || proxyUrl.endsWith('&') 
              ? proxyUrl 
              : proxyUrl + (proxyUrl.includes('?') ? '&' : '?')
            return `${finalProxyUrl}url=${encodeURIComponent(track.url)}`
          } else {
            return `/api/audio?url=${encodeURIComponent(track.url)}`
          }
        } else {
          // 默认使用内置代理
          return `/api/audio?url=${encodeURIComponent(track.url)}`
        }
      }
    } catch {}
    return track.url
  }

  // 监听localStorage变化，实时更新音频URL
  useEffect(() => {
    const handleStorageChange = () => {
      // 当设置变化时，重新加载当前音频
      if (currentTrack) {
        const audio = audioRef.current
        if (audio) {
          const newUrl = getAudioUrl(currentTrack)
          if (audio.src !== newUrl) {
            audio.src = newUrl
            audio.load()
          }
        }
      }
    }

    // 监听localStorage变化
    window.addEventListener('storage', handleStorageChange)
    
    // 监听自定义事件（用于同页面内的设置变化）
    window.addEventListener('audioSettingsChanged', handleStorageChange)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('audioSettingsChanged', handleStorageChange)
    }
  }, [currentTrack])
  
  const handleAudioError = async (e) => {
    const audio = audioRef.current
    if (!audio || !currentTrack) return
    
    const currentSrc = audio.src
    const userCustomProxyUrl = localStorage.getItem('ui.customProxyUrl') || ''
    const customProxyUrl = appConfig.customProxyUrl || userCustomProxyUrl || ''
    
    console.warn('Audio load error:', e)
    
    // 检测是否为移动端Chrome浏览器
    const isMobileChrome = /Android.*Chrome/i.test(navigator.userAgent)
    
    if (!currentSrc.includes('/api/audio')) {
      try {
        const proxyUrl = `/api/audio?url=${encodeURIComponent(currentTrack.url)}`
        console.log('Trying built-in audio proxy:', proxyUrl)
        
        // 为移动端Chrome添加额外的重试机制
        if (isMobileChrome) {
          // 先尝试直接加载，如果失败再使用代理
          const directLoad = new Promise((resolve, reject) => {
            const testAudio = new Audio()
            testAudio.crossOrigin = 'anonymous'
            testAudio.preload = 'metadata'
            
            const cleanup = () => {
              testAudio.oncanplay = null
              testAudio.onerror = null
              testAudio.src = ''
              testAudio.load()
            }
            
            testAudio.oncanplay = () => {
              cleanup()
              resolve(true)
            }
            testAudio.onerror = () => {
              cleanup()
              reject(new Error('Direct load failed'))
            }
            testAudio.src = currentTrack.url
            testAudio.load()
            
            setTimeout(() => {
              cleanup()
              reject(new Error('Direct load timeout'))
            }, 8000) // 增加超时时间
          })
          
          try {
            await directLoad
            audio.src = currentTrack.url
            audio.load()
            return
          } catch (directError) {
            console.log('Direct load failed, using proxy:', directError.message)
          }
        }
        
        // 使用代理URL，增加重试机制
        let retryCount = 0
        const maxRetries = 2
        
        while (retryCount < maxRetries) {
          try {
            audio.src = proxyUrl
            audio.load()
            
            // 等待音频加载
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Proxy load timeout'))
              }, 10000) // 10秒超时
              
              const onCanPlay = () => {
                clearTimeout(timeout)
                audio.removeEventListener('canplay', onCanPlay)
                audio.removeEventListener('error', onError)
                resolve()
              }
              
              const onError = (error) => {
                clearTimeout(timeout)
                audio.removeEventListener('canplay', onCanPlay)
                audio.removeEventListener('error', onError)
                reject(error)
              }
              
              audio.addEventListener('canplay', onCanPlay)
              audio.addEventListener('error', onError)
            })
            
            console.log('Successfully loaded via proxy')
            return
          } catch (proxyError) {
            retryCount++
            console.warn(`Proxy attempt ${retryCount} failed:`, proxyError.message)
            
            if (retryCount < maxRetries) {
              // 等待一段时间后重试
              await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
            }
          }
        }
        
        throw new Error('All proxy attempts failed')
      } catch (err1) {
        console.error('Built-in audio proxy failed:', err1)
      }
    }
    
    if (appConfig.hasCustomProxy && appConfig.customProxyUrl) {
      try {
        console.log('Built-in proxy failed, trying custom proxy via fetch.js')
        
        const timeout = 30000
        
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

            if (data.base64.length > 1000000) {
              console.log('Large file detected, processing in chunks')
              
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
            
            const binaryString = atob(data.base64)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }
            const blob = new Blob([bytes], { type: data.contentType })
            const blobUrl = URL.createObjectURL(blob)
            blobUrlsRef.current.add(blobUrl) // 跟踪Blob URL
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
          console.error('Custom proxy timeout')
        } else {
          console.error('Custom proxy also failed:', proxyError)
        }
      }
    }
    
    if (!currentSrc.includes(currentTrack.url)) {
      console.log('All methods failed, retrying original URL')
      audio.src = currentTrack.url
      audio.load()
    }
  }
  



  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    audio.volume = muted ? 0 : volume
    userVolumeRef.current = volume
    userMutedRef.current = muted
  }, [volume, muted])


  useEffect(() => {
    return () => {
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current)
      }
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current)
      }
      
      // 清理预加载音频
      if (preloadAudioRef.current) {
        preloadAudioRef.current.src = ''
        preloadAudioRef.current.load()
        preloadAudioRef.current = null
      }
      
      // 清理测试音频
      if (testAudioRef.current) {
        testAudioRef.current.src = ''
        testAudioRef.current.load()
        testAudioRef.current = null
      }
      
      // 清理所有Blob URLs
      blobUrlsRef.current.forEach(url => {
        URL.revokeObjectURL(url)
      })
      blobUrlsRef.current.clear()
      
      // 清理AudioContext
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close()
        } catch (error) {
          console.warn('Failed to close audio context:', error)
        }
        audioContextRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') {
        return
      }
      
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return
      }
      
      if (e.key.startsWith('F') && e.key.length <= 3) {
        return
      }
      
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

          playPrev()
          break
        case 'ArrowRight':
          e.preventDefault()

          playNext()
          break
        case 'ArrowUp':
          e.preventDefault()

          const newVolume = Math.min(1, volume + 0.1)
          setVolume(newVolume)
          setMuted(false)
          break
        case 'ArrowDown':
          e.preventDefault()

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

    document.addEventListener('keydown', handleKeyDown)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [volume, muted, shuffle, loopMode, tracks, currentIndex, onChangeIndex, onOpenSettings, isPlaying])

  useEffect(() => {
    if (!hasTracks || tracks.length <= 1) return

    // 检测网络状况和浏览器类型
    const isMobileChrome = /Android.*Chrome/i.test(navigator.userAgent)
    const preloadDelay = isMobileChrome ? 3000 : 2000 // Chrome需要更长的延迟

    const preloadTimer = setTimeout(() => {
      const nextIndex = (currentIndex + 1) % tracks.length
      const nextTrack = tracks[nextIndex]
      if (nextTrack && nextTrack.url) {
        const preloadUrl = getAudioUrl(nextTrack)

        if (preloadAudioRef.current) {
          preloadAudioRef.current.muted = true
          preloadAudioRef.current.volume = 0
          preloadAudioRef.current.src = preloadUrl
          preloadAudioRef.current.preload = 'metadata'
          preloadAudioRef.current.crossOrigin = 'anonymous'
          
          // 为移动端Chrome添加额外的加载事件监听
          if (isMobileChrome) {
            preloadAudioRef.current.addEventListener('error', (e) => {
              console.warn('Preload failed for next track:', e)
            })
          }
          
          preloadAudioRef.current.load()
        } else {
          const preloadAudio = new Audio()
          preloadAudio.muted = true
          preloadAudio.volume = 0
          preloadAudio.src = preloadUrl
          preloadAudio.preload = 'metadata'
          preloadAudio.crossOrigin = 'anonymous'
          
          // 为移动端Chrome添加额外的加载事件监听
          if (isMobileChrome) {
            const errorHandler = (e) => {
              console.warn('Preload failed for next track:', e)
              preloadAudio.removeEventListener('error', errorHandler)
            }
            preloadAudio.addEventListener('error', errorHandler)
          }
          
          preloadAudio.load()
          preloadAudioRef.current = preloadAudio
        }
      }
    }, preloadDelay)

    return () => clearTimeout(preloadTimer)
  }, [currentIndex, tracks, hasTracks])


  const play = async () => {
    const audio = audioRef.current
    if (!audio) return Promise.reject(new Error('No audio element'))
    
    try {
      
      if (audio.readyState < 1) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            audio.removeEventListener('canplay', onCanPlay)
            audio.removeEventListener('canplaythrough', onCanPlay)
            audio.removeEventListener('loadeddata', onCanPlay)
            audio.removeEventListener('loadstart', onCanPlay)

            if (audio.readyState < 1) {
              console.warn('Audio still not ready after timeout, attempting to play anyway')
              // 尝试重新加载音频
              try {
                audio.load()
              } catch (loadError) {
                console.warn('Failed to reload audio:', loadError)
              }
              resolve()
            } else {
              resolve()
            }
          }, 5000) // 增加超时时间到5秒
          
          const onCanPlay = () => {
            clearTimeout(timeout)
            audio.removeEventListener('canplay', onCanPlay)
            audio.removeEventListener('canplaythrough', onCanPlay)
            audio.removeEventListener('loadeddata', onCanPlay)
            audio.removeEventListener('loadstart', onCanPlay)
            resolve()
          }
          
          audio.addEventListener('canplay', onCanPlay)
          audio.addEventListener('canplaythrough', onCanPlay)
          audio.addEventListener('loadeddata', onCanPlay)
          audio.addEventListener('loadstart', onCanPlay)
        })
      }
      
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }
      
      try {
        await audio.play()
        setIsPlaying(true)
        return Promise.resolve()
      } catch (playError) {
        console.warn('Audio play failed, but continuing:', playError.message)
        // 如果是网络问题，尝试重新加载
        if (playError.name === 'NotSupportedError' || playError.name === 'NotAllowedError') {
          try {
            audio.load()
            await new Promise(resolve => setTimeout(resolve, 1000))
            await audio.play()
            setIsPlaying(true)
            return Promise.resolve()
          } catch (retryError) {
            console.warn('Retry play failed:', retryError.message)
          }
        }
        setIsPlaying(false)
        return Promise.resolve()
      }
    } catch (e) {
      console.warn('Audio preparation failed:', e.message)
      setIsPlaying(false)
      return Promise.resolve()
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

      const audio = audioRef.current
      if (!audio) {
        console.warn('No audio element available')
        return
      }
      
      if (audio.readyState >= 1) {
        play().catch((error) => {
          console.warn('Play failed:', error.message)

        })
      } else {

        console.log('Audio not ready, waiting for load...')
        const onCanPlay = () => {
          audio.removeEventListener('canplay', onCanPlay)
          audio.removeEventListener('loadeddata', onCanPlay)
          audio.removeEventListener('loadstart', onCanPlay)
          play().catch((error) => {
            console.warn('Play failed after load:', error.message)
          })
        }
        
        audio.addEventListener('canplay', onCanPlay)
        audio.addEventListener('loadeddata', onCanPlay)
        audio.addEventListener('loadstart', onCanPlay)
        
        setTimeout(() => {
          audio.removeEventListener('canplay', onCanPlay)
          audio.removeEventListener('loadeddata', onCanPlay)
          audio.removeEventListener('loadstart', onCanPlay)

          play().catch((error) => {
            console.warn('Play failed after timeout:', error.message)
          })
        }, 2000)
      }
    }
  }

  const onLoadedMetadata = () => {
    const a = audioRef.current
    if (a && a.duration && !isNaN(a.duration) && a.duration > 0) {
      setDuration(a.duration)
    }

    setAudioLoadTimeout(false)
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }
  }

  const onLoadedData = () => {

    const a = audioRef.current
    if (a && a.duration && !isNaN(a.duration) && a.duration > 0) {
      setDuration(a.duration)
    }

    setAudioLoadTimeout(false)
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }
  }

  const onCanPlay = () => {

    const a = audioRef.current
    if (a && a.duration && !isNaN(a.duration) && a.duration > 0) {
      setDuration(a.duration)
    }

    setAudioLoadTimeout(false)
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }
  }


  const onSeeked = () => {
    // 添加防抖，避免在seekChange期间频繁触发
    if (isSeekingRef.current) return
    
    const audio = audioRef.current
    if (audio) {
      setCurrentTime(audio.currentTime || 0)
    }
  }

  useEffect(() => {
    if (!isPlaying) return
    
    const id = setInterval(() => {
      const a = audioRef.current
      if (!a) return

      if (isSeekingRef.current) return
      setCurrentTime(a.currentTime || 0)
      if (!duration && a.duration && !isNaN(a.duration) && a.duration > 0) {
        setDuration(a.duration)
      }
    }, 16)
    
    return () => clearInterval(id)
  }, [isPlaying, duration])

  const seekChange = (e) => {
    const value = Number(e.target.value)
    
    isSeekingRef.current = true
    
    setCurrentTime(value)
    
    if (seekTimeoutRef.current) {
      clearTimeout(seekTimeoutRef.current)
    }
    
    seekTimeoutRef.current = setTimeout(() => {
      const audio = audioRef.current
      if (audio && audio.readyState >= 2) {
        audio.currentTime = value
        isSeekingRef.current = false
      }
    }, 150) // 增加延迟时间，避免与onSeeked冲突
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
      // 预加载下一首
      if (cacheEnabled && tracks) {
        preloadNext(tracks, nextIdx)
      }
    }
  }
  
  const playPrev = () => { 
    setHasInteracted(true)
    const prevIdx = prevIndex()
    if (prevIdx !== currentIndex) {
      onChangeIndex(prevIdx)
      // 预加载上一首
      if (cacheEnabled && tracks) {
        preloadPrev(tracks, prevIdx)
      }
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
    
    setCurrentTime(0)
    setDuration(0)
    setAudioLoadTimeout(false)

    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }

    try { 
      audio.pause() 
      audio.currentTime = 0

      audio.removeAttribute('src')
      audio.load()
    } catch {}
    
    setTimeout(() => {
      if (audio) {
        // 检查是否有缓存的音频
        if (cacheEnabled && currentTrack) {
          const cachedAudio = getCachedAudio(currentTrack)
          if (cachedAudio) {
            audio.src = cachedAudio.src
            audio.load()
            console.log('使用缓存的音频:', currentTrack.title)
          } else {
            audio.src = getAudioUrl(currentTrack)
            audio.load()
            // 预加载当前音频
            preloadAudio(currentTrack, 'high')
          }
        } else {
          audio.src = getAudioUrl(currentTrack)
          audio.load()
        }
      }
    }, 50)
    
    if (hasInteracted && isPlaying) {
      let playCalled = false // 防止重复调用play
      
      const onCanPlay = () => {
        if (playCalled) return
        playCalled = true
        
        audio.removeEventListener('canplay', onCanPlay)
        audio.removeEventListener('canplaythrough', onCanPlay)
        audio.removeEventListener('loadeddata', onCanPlay)

        setTimeout(() => {
          play().catch(() => {})
        }, 100)
      }
      
      audio.addEventListener('canplay', onCanPlay)
      audio.addEventListener('canplaythrough', onCanPlay)
      audio.addEventListener('loadeddata', onCanPlay)
      
      setTimeout(() => {
        if (!playCalled) {
          playCalled = true
          audio.removeEventListener('canplay', onCanPlay)
          audio.removeEventListener('canplaythrough', onCanPlay)
          audio.removeEventListener('loadeddata', onCanPlay)
          play().catch(() => {})
        }
      }, 2000)
    } else {

      audio.pause()
      setIsPlaying(false)
    }
  }, [currentIndex])

  // 智能预加载
  useEffect(() => {
    if (cacheEnabled && tracks && tracks.length > 0) {
      smartPreload(tracks, currentIndex)
    }
  }, [currentIndex, tracks, cacheEnabled, smartPreload])

  useEffect(() => {
    if (!forcePlayKey) return
    if (!currentTrack) return
    
    setHasInteracted(true)
    setIsPlaying(true)
    
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
      <button className="settings-icon" aria-label="打开设置" onClick={onOpenSettings} id="settings-btn" name="settings">⚙️</button>
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
        preload="auto"
        crossOrigin="anonymous"
        playsInline
        webkit-playsinline="true"
        controls={false}
        muted={false}
        loop={false}
        x-webkit-airplay="allow"
        x-webkit-playsinline="true"

        style={{ 
          position: 'absolute',
          top: '-9999px',
          left: '-9999px',
          opacity: 0,
          pointerEvents: 'none'
        }}
      />

       <div className="top">
         <CoverArt currentTrack={currentTrack} isPlaying={isPlaying} />
         <div className="meta">
           <h2 className="track-title">
             {artist ? `${song} - ${artist}` : song}
           </h2>
           <p className="track-sub">&nbsp;</p>
           <Controls 
             isPlaying={isPlaying}
             shuffle={shuffle}
             loopMode={loopMode}
             volume={volume}
             muted={muted}
             onTogglePlay={togglePlay}
             onPlayPrev={playPrev}
             onPlayNext={playNext}
             onToggleShuffle={() => setShuffle(s => !s)}
             onToggleLoop={toggleLoopMode}
             onVolumeChange={changeVolume}
             onToggleMute={toggleMute}
           />
         </div>
       </div>

      <Progress 
        currentTime={currentTime}
        duration={duration}
        onSeekChange={seekChange}
      />
    </div>
  )
}




