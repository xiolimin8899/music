import React, { useEffect, useState } from 'react'
import { getImagePreloader } from '../utils/image'

export default function CoverArt({ currentTrack, isPlaying }) {
  const [coverLoaded, setCoverLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    if (!currentTrack?.cover) {
      setCoverLoaded(false)
      setImageError(false)
      return
    }

    // 立即设置加载状态，避免闪烁
    setCoverLoaded(false)
    setImageError(false)

    const preloader = getImagePreloader()
    
    const cachedImage = preloader.getCachedImage(currentTrack.cover)
    if (cachedImage) {
      setCoverLoaded(true)
      return
    }

    // 使用更激进的预加载策略
    preloader.preloadImage(currentTrack.cover, {
      crossOrigin: 'anonymous',
      timeout: 3000, // 减少超时时间
      priority: 'high' // 高优先级
    }).then(() => {
      setCoverLoaded(true)
    }).catch(error => {
      console.warn('Cover image preload failed:', error)
      setCoverLoaded(false)
      setImageError(true)
    })
  }, [currentTrack?.cover])

  return (
    <div className={`art-lg ${isPlaying ? 'playing' : ''}`} aria-hidden="true">
      <div className={`disc ${isPlaying ? 'playing' : ''}`}>
        {currentTrack?.cover && !imageError ? (
          <img 
            src={currentTrack.cover} 
            alt="封面" 
            loading="eager"
            fetchPriority="high"
            decoding="sync"
            style={{ 
              opacity: coverLoaded ? 1 : 0.1,
              transition: 'opacity 0.2s ease',
              willChange: 'opacity'
            }}
            onLoad={() => setCoverLoaded(true)}
            onError={() => {
              setCoverLoaded(false)
              setImageError(true)
            }}
          />
        ) : (
          <div className="art-fallback" style={{
            width: '70%',
            height: '70%',
            borderRadius: '50%',
            background: 'linear-gradient(45deg, #ff6b6b, #4ecdc4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '12px',
            fontWeight: 'bold'
          }}>
            🎵
          </div>
        )}
      </div>
    </div>
  )
}
