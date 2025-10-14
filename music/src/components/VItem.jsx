import React from 'react'

/**
 * 虚拟播放列表项组件
 * 用于虚拟滚动中的单个播放列表项
 */
export default function VItem({ 
  item, 
  index, 
  isVisible, 
  isActive, 
  onSelect, 
  onDelete 
}) {
  // 解析歌曲标题
  const parseTrackTitle = (title) => {
    if (!title) return { song: '', artist: '' }
    const match = title.match(/^(.+?)(?:\s{2,}|\s-\s)(.+)$/)
    if (match) {
      const song = match[1].trim()
      const artist = match[2].trim()
      return { song, artist }
    }
    return { song: title, artist: '' }
  }

  const { song, artist } = parseTrackTitle(item.title)

  // 如果不可见，返回占位符以保持高度
  if (!isVisible) {
    return (
      <div 
        className="playlist-item-placeholder"
        style={{ 
          height: '100%', 
          opacity: 0,
          pointerEvents: 'none'
        }}
      />
    )
  }

  return (
    <li
      className={`playlist-item ${isActive ? 'active' : ''}`}
      onClick={() => onSelect(index)}
      role="option"
      aria-selected={isActive}
    >
      <span className="index" style={{ color: 'var(--sub)' }}>
        {index + 1}
      </span>
      
      <span 
        className="name" 
        style={{ 
          whiteSpace: 'nowrap', 
          overflow: 'hidden', 
          textOverflow: 'ellipsis' 
        }}
      >
        {artist ? `${song} - ${artist}` : song}
      </span>
      
      <div 
        className="actions-inline" 
        style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '12px' 
        }}
      >
        {item.mvUrl ? (
          <a
            className="download-link"
            href={item.mvUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label={`打开MV ${song}${artist ? ' - ' + artist : ''}`}
            style={{
              color: 'var(--sub)',
              textDecoration: 'none',
              fontSize: '13px',
              padding: '0',
              border: 'none',
              verticalAlign: 'baseline',
              fontFamily: 'inherit'
            }}
            onMouseEnter={(e) => e.target.style.color = '#ff8fb3'}
            onMouseLeave={(e) => e.target.style.color = 'var(--sub)'}
          >
            MV
          </a>
        ) : null}
        
        <button
          type="button"
          className="delete-link"
          onClick={(e) => { 
            e.stopPropagation()
            onDelete && onDelete(item.url) 
          }}
          aria-label={`删除 ${song}${artist ? ' - ' + artist : ''}`}
          style={{
            color: 'var(--sub)',
            background: 'transparent',
            border: 'none',
            fontSize: '13px',
            padding: '0',
            cursor: 'pointer',
            verticalAlign: 'baseline',
            fontFamily: 'inherit'
          }}
          onMouseEnter={(e) => e.target.style.color = '#fda4af'}
          onMouseLeave={(e) => e.target.style.color = 'var(--sub)'}
        >
          删除
        </button>
        
        <a
          className="download-link"
          href={item.url}
          download
          onClick={(e) => e.stopPropagation()}
          aria-label={`下载 ${song}${artist ? ' - ' + artist : ''}`}
          style={{
            color: 'var(--sub)',
            textDecoration: 'none',
            fontSize: '13px',
            padding: '0',
            border: 'none',
            verticalAlign: 'baseline',
            fontFamily: 'inherit'
          }}
          onMouseEnter={(e) => e.target.style.color = '#ff8fb3'}
          onMouseLeave={(e) => e.target.style.color = 'var(--sub)'}
        >
          下载
        </a>
      </div>
    </li>
  )
}
