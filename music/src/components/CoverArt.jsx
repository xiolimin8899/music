import React, { useEffect, useState } from 'react'
import { getImagePreloader } from '../utils/image'

export default function CoverArt({ currentTrack, isPlaying }) {
  const [coverLoaded, setCoverLoaded] = useState(false)

  useEffect(() => {
    if (!currentTrack?.cover) {
      setCoverLoaded(false)
      return
    }

    const preloader = getImagePreloader()
    
    const cachedImage = preloader.getCachedImage(currentTrack.cover)
    if (cachedImage) {
      setCoverLoaded(true)
      return
    }

    preloader.preloadImage(currentTrack.cover, {
      crossOrigin: 'anonymous',
      timeout: 5000
    }).then(() => {
      setCoverLoaded(true)
    }).catch(error => {
      setCoverLoaded(false)
    })
  }, [currentTrack?.cover])

  return (
    <div className={`art-lg ${isPlaying ? 'playing' : ''}`} aria-hidden="true">
      <div className={`disc ${isPlaying ? 'playing' : ''}`}>
        {currentTrack?.cover ? (
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
  )
}
