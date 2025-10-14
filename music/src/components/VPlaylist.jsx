import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import VScroll from './VScroll'
import VItem from './VItem'

/**
 * 虚拟播放列表组件
 * 使用虚拟滚动优化长歌单性能
 */
export default function VPlaylist({ 
  tracks, 
  currentIndex, 
  onSelect, 
  onDelete,
  itemHeight = 45, // 每个播放列表项的高度
  containerHeight = 400, // 容器高度
  overscan = 5 // 额外渲染的项目数量
}) {
  const containerRef = useRef(null)
  const virtualScrollRef = useRef(null)
  const [showLocate, setShowLocate] = useState(false)
  const idleTimerRef = useRef(null)
  const locateBtnRef = useRef(null)
  const hoveringRef = useRef(false)

  // 调度隐藏定位按钮
  const scheduleHide = useCallback((delay = 700) => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => {
      if (hoveringRef.current) {
        scheduleHide(delay)
      } else {
        setShowLocate(false)
      }
    }, delay)
  }, [])

  // 定位到正在播放的歌曲
  const locateNowPlaying = useCallback((e) => {
    if (e) e.stopPropagation()
    if (virtualScrollRef.current && currentIndex >= 0) {
      virtualScrollRef.current.scrollToIndex(currentIndex)
    }
  }, [currentIndex])

  // 处理滚动事件
  const handleScroll = useCallback((scrollTop) => {
    setShowLocate(true)
    scheduleHide(900)
  }, [scheduleHide])

  // 更新定位按钮位置
  const updateBtnTop = useCallback(() => {
    const btn = locateBtnRef.current
    const container = containerRef.current
    if (!btn || !container) return
    
    const centerTop = container.scrollTop + (container.clientHeight / 2) - (btn.offsetHeight / 2)
    btn.style.top = `${Math.max(0, centerTop)}px`
  }, [])

  // 监听滚动和窗口大小变化
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onScroll = () => {
      updateBtnTop()
    }

    const onResize = () => updateBtnTop()

    container.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)

    updateBtnTop()

    return () => {
      container.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [updateBtnTop])

  // 当当前播放索引改变时，自动滚动到该位置
  useEffect(() => {
    if (currentIndex >= 0 && virtualScrollRef.current) {
      // 延迟一点时间确保虚拟滚动已经初始化
      setTimeout(() => {
        virtualScrollRef.current.scrollToIndex(currentIndex)
      }, 100)
    }
  }, [currentIndex])

  // 为每个轨道添加唯一键
  const tracksWithKeys = useMemo(() => {
    return tracks.map((track, index) => ({
      ...track,
      key: track.url || `track-${index}`,
      id: track.url || `track-${index}`
    }))
  }, [tracks])

  return (
    <div className="virtual-playlist" ref={containerRef}>
      <VScroll
        ref={virtualScrollRef}
        items={tracksWithKeys}
        itemHeight={itemHeight}
        containerHeight={containerHeight}
        overscan={overscan}
        onScroll={handleScroll}
        className="virtual-scroll-container"
        style={typeof window !== 'undefined' && window.innerWidth <= 480 ? { height: 'auto', maxHeight: 'calc(100vh - 330px)' } : undefined}
      >
        {({ item, index, isVisible }) => (
          <VItem
            item={item}
            index={index}
            isVisible={isVisible}
            isActive={index === currentIndex}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        )}
      </VScroll>
      
      {/* 定位按钮 */}
      <button
        type="button"
        className={`locate-fab ${showLocate ? 'visible' : ''}`}
        aria-label="定位到正在播放"
        onClick={locateNowPlaying}
        ref={locateBtnRef}
        onMouseEnter={() => { 
          hoveringRef.current = true
          setShowLocate(true)
        }}
        onMouseLeave={() => { 
          hoveringRef.current = false
          scheduleHide(700)
        }}
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          viewBox="0 0 24 24" 
          width="20" 
          height="20" 
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
          <line x1="12" y1="1" x2="12" y2="5" stroke="currentColor" strokeWidth="2" />
          <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" />
          <line x1="1" y1="12" x2="5" y2="12" stroke="currentColor" strokeWidth="2" />
          <line x1="19" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
    </div>
  )
}
