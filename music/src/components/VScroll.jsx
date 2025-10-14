import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useVScroll, useVScrollMetrics } from '../hooks/VScroll'

/**
 * 虚拟滚动组件
 * 用于优化大量数据的渲染性能
 */
const VScroll = React.forwardRef(function VScroll({
  items = [],
  itemHeight = 60, // 每个项目的高度
  containerHeight = 400, // 容器高度
  overscan = 5, // 额外渲染的项目数量
  onScroll,
  children,
  className = '',
  style = {},
  enableSmoothScrolling = true, // 启用平滑滚动
  scrollBehavior = 'smooth', // 滚动行为
  enableMetrics = false // 启用性能监控
}, ref) {
  // 使用虚拟滚动Hook
  const {
    containerRef,
    scrollTop,
    containerHeightState,
    visibleRange,
    visibleItems,
    totalHeight,
    offsetY,
    handleScroll,
    scrollToIndex,
    scrollToItem,
    isScrolling
  } = useVScroll({
    items,
    itemHeight,
    containerHeight,
    overscan,
    enableSmoothScrolling,
    scrollBehavior
  })

  // 性能监控
  const { updateMetrics, getMetrics } = useVScrollMetrics()

  // 增强的滚动处理
  const enhancedHandleScroll = useCallback((e) => {
    handleScroll(e)
    updateMetrics('scroll')
    onScroll?.(e.target.scrollTop)
  }, [handleScroll, updateMetrics, onScroll])

  // 渲染性能监控
  useEffect(() => {
    if (enableMetrics) {
      updateMetrics('render')
    }
  }, [visibleItems, enableMetrics, updateMetrics])

  // 暴露方法给父组件
  React.useImperativeHandle(ref, () => ({
    scrollToIndex,
    scrollToItem,
    scrollTop: containerRef.current?.scrollTop || 0,
    getMetrics: enableMetrics ? getMetrics : undefined
  }), [scrollToIndex, scrollToItem, enableMetrics, getMetrics])

  return (
    <div
      ref={containerRef}
      className={`virtual-scroll-container ${className}`}
      style={{
        height: containerHeight,
        ...style
      }}
      onScroll={enhancedHandleScroll}
    >
      {/* 占位容器，保持总高度 */}
      <div
        style={{
          height: totalHeight,
          position: 'relative',
          width: '100%'
        }}
      >
        {/* 可见项目容器 */}
        <div
          style={{
            position: 'absolute',
            top: offsetY,
            left: 0,
            right: 0,
            height: visibleItems.length * itemHeight
          }}
        >
          {visibleItems.map((item, index) => (
            <div
              key={item.key || item.id || item.originalIndex}
              style={{
                height: itemHeight,
                position: 'absolute',
                top: index * itemHeight,
                left: 0,
                right: 0
              }}
            >
              {children?.({ item, index: item.originalIndex, isVisible: true })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})

// 高阶组件，用于包装虚拟滚动
export function withVScroll(WrappedComponent, options = {}) {
  return React.forwardRef((props, ref) => {
    const virtualScrollRef = useRef(null)
    
    React.useImperativeHandle(ref, () => ({
      scrollToIndex: (index) => virtualScrollRef.current?.scrollToIndex(index),
      scrollToItem: (item) => virtualScrollRef.current?.scrollToItem(item),
      scrollTop: virtualScrollRef.current?.scrollTop || 0
    }))

    return (
      <VScroll
        ref={virtualScrollRef}
        {...options}
        {...props}
      >
        {({ item, index, isVisible }) => (
          <WrappedComponent
            {...props}
            item={item}
            index={index}
            isVisible={isVisible}
          />
        )}
      </VScroll>
    )
  })
}

export default VScroll
