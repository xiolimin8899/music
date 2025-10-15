import React, { useEffect, useState } from 'react'
import { preloadBackgroundImage } from '../utils/image'
import Manager from './Manager'

export default function Settings({ open, onClose, onAddSong, onImportRepo, onImportApi, onResetPlaylist, onWebDavUpload, onWebDavRestore }) {
  const [songUrl, setSongUrl] = useState('')
  const [songTitle, setSongTitle] = useState('')
  const [songMvUrl, setSongMvUrl] = useState('')
  const [localBase64, setLocalBase64] = useState('')
  const [localMime, setLocalMime] = useState('')
  const [localFileName, setLocalFileName] = useState('')
  const [gitRepo, setGitRepo] = useState('')
  const [gitToken, setGitToken] = useState('')
  const [gitBranch, setGitBranch] = useState('')
  const [gitPath, setGitPath] = useState('music')
  const [apiUrl, setApiUrl] = useState('')
  const [fontFamily, setFontFamily] = useState('')
  const [bgUrl, setBgUrl] = useState('')
  const [localBgFile, setLocalBgFile] = useState(null)
  const [localBgPreview, setLocalBgPreview] = useState('')
  const [audioLoadMethod, setAudioLoadMethod] = useState('builtin')
  const [customProxyUrl, setCustomProxyUrl] = useState('')
  const [appConfig, setAppConfig] = useState({
    customProxyUrl: '',
    hasCustomProxy: false
  })
  const FONT_PRESETS = [
    { label: '系统默认', value: '' },
    { label: '宋体', value: "'SimSun', 'NSimSun', 'Songti SC', serif" },
    { label: '楷体', value: "'KaiTi', 'STKaiti', 'Kaiti SC', serif" },
    { label: '仿宋', value: "'FangSong', 'STFangsong', 'FangSong_GB2312', serif" },
    { label: '黑体', value: "'SimHei', 'Heiti SC', 'PingFang SC', 'Microsoft YaHei', sans-serif" },
    { label: '微软雅黑', value: "'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif" },
    { label: '苹方', value: "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif" },
    { label: '思源黑体', value: "'Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', sans-serif" }
  ]
  const [fontPreset, setFontPreset] = useState('')
  const [showCacheManager, setShowCacheManager] = useState(false)

  useEffect(() => {
    if (!open) return
    try {
      setFontFamily(localStorage.getItem('ui.fontFamily') || '')
      setAudioLoadMethod(localStorage.getItem('ui.audioLoadMethod') || '')
      setCustomProxyUrl(localStorage.getItem('ui.customProxyUrl') || '')
      const localBgData = localStorage.getItem('ui.localBgFile')
      if (localBgData) {
        try {
          const parsed = JSON.parse(localBgData)
          if (parsed.dataUrl) {
            setLocalBgPreview(parsed.dataUrl)
            setBgUrl('')
          }
        } catch {}
      } else {
        setBgUrl(localStorage.getItem('ui.bgUrl') || '')
      }
      
      const saved = localStorage.getItem('ui.fontFamily') || ''
      const matched = FONT_PRESETS.find(p => p.value === saved)
      setFontPreset(matched ? matched.value : '')
      
      // 加载音频设置
      setAudioLoadMethod(localStorage.getItem('ui.audioLoadMethod') || '')
      setCustomProxyUrl(localStorage.getItem('ui.customProxyUrl') || '')
    } catch {}
  }, [open])

  // 获取应用配置
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

  const applyAppearance = ({ ff, bg }) => {
    const root = document.documentElement
    const body = document.body
    
    if (ff != null && root) {
      root.style.setProperty('--font-family', ff || 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, "Helvetica Neue", Arial')
    }
    
    if (bg != null && body) {
      const base = "linear-gradient(180deg, rgba(0, 0, 0, .3), rgba(0, 0, 0, .3))"
      if (bg) {
        body.style.backgroundImage = `${base}, url('${bg}')`
        preloadBackgroundImage(bg).catch(() => {})
      } else {
        body.style.backgroundImage = ''
      }
    }
  }


  if (!open) return null

  const handleAddSong = () => {
    if ((!songUrl && !localBase64) || !songTitle) return
    const normalizedTitle = (() => {
      const raw = String(songTitle || '').trim()
      const m = raw.match(/^(.+?)(?:\s{2,}|\s-\s)(.+)$/)
      if (m) return `${m[1].trim()} - ${m[2].trim()}`
      const single = raw.match(/^([^\s-].*?)\s([^\s].*?)$/)
      if (single) return `${single[1].trim()} - ${single[2].trim()}`
      return raw
    })()
    const urlStr = String(songUrl || '')
    const noQuery = urlStr.split('#')[0].split('?')[0]
    let ext = '.mp3'
    if (localFileName) {
      const m = String(localFileName).match(/\.[a-zA-Z0-9]{2,5}$/)
      if (m) ext = m[0]
    } else if (localMime) {
      const map = {
        'audio/mpeg': '.mp3',
        'audio/mp3': '.mp3',
        'audio/aac': '.aac',
        'audio/wav': '.wav',
        'audio/x-wav': '.wav',
        'audio/ogg': '.ogg',
        'audio/webm': '.webm',
        'audio/mp4': '.m4a',
        'audio/x-m4a': '.m4a',
        'audio/flac': '.flac',
        'audio/opus': '.opus'
      }
      if (map[localMime]) ext = map[localMime]
    } else {
      try {
        const u = new URL(urlStr)
        const last = (u.pathname.split('/').filter(Boolean).pop() || '')
        const m = last.match(/\.[a-zA-Z0-9]{2,5}$/)
        if (m) ext = m[0]
      } catch (e) {
        const last = (noQuery.split('/').filter(Boolean).pop() || '')
        const m = last.match(/\.[a-zA-Z0-9]{2,5}$/)
        if (m) ext = m[0]
      }
    }
    const baseRaw = normalizedTitle.trim()
    const base = baseRaw
      .replace(/[\/\\:*?"<>|]+/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^[\s.]+|[\s.]+$/g, '')
    const derived = base ? `${base}${ext}` : `audio-${Date.now()}${ext}`
    onAddSong && onAddSong({ songUrl, songTitle: normalizedTitle, fileName: derived, mvUrl: songMvUrl, base64: localBase64 || undefined, contentType: localMime || undefined })
    setSongUrl('')
    setSongTitle('')
    setSongMvUrl('')
    setLocalBase64('')
    setLocalMime('')
    setLocalFileName('')
  }

  return (
    <>
    <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title" style={{ textAlign: 'center' }}>设置</h3>
        <div className="modal-body">
          <div className="section-title">添加歌曲</div>
          <div className="form-group">
            <label className="form-label">从本地上传</label>
            <input
              className="form-input"
              type="file"
              multiple
              accept="audio/*"
              id="local-file-input"
              name="local-file"
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                if (!files.length) return
                if (files.length > 1) {
                  files.forEach((f) => {
                    const reader = new FileReader()
                    reader.onload = () => {
                      try {
                        const result = String(reader.result || '')
                        const m = result.match(/^data:([^;]+);base64,(.*)$/)
                        if (!m) return
                        const mime = m[1]
                        const b64 = m[2]
                        const base = String(f.name || '').replace(/\.[^.]+$/, '')
                        const title = base.replace(/\s*-\s*/g, ' - ').replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim() || `Track ${Date.now()}`
                        const fileName = f.name || `audio-${Date.now()}`
                        onAddSong && onAddSong({ songUrl: '', songTitle: title, fileName, mvUrl: '', base64: b64, contentType: mime, suppressClose: true })
                      } catch {}
                    }
                    reader.readAsDataURL(f)
                  })
                  setLocalFileName(`${files.length} 个文件`)
                  setLocalMime('')
                  setLocalBase64('')
                } else {
                  const file = files[0]
                  setLocalFileName(file.name || '')
                  const reader = new FileReader()
                  reader.onload = () => {
                    const result = String(reader.result || '')
                    const m = result.match(/^data:([^;]+);base64,(.*)$/)
                    if (m) {
                      const mime = m[1]
                      const b64 = m[2]
                      setLocalMime(mime || file.type || '')
                      setLocalBase64(b64 || '')
                    } else {
                      setLocalMime(file.type || '')
                    }
                  }
                  reader.readAsDataURL(file)
                  if (!songTitle) {
                    const base = String(file.name || '').replace(/\.[^.]+$/, '')
                    const title = base.replace(/\s*-\s*/g, ' - ').replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim()
                    setSongTitle(title)
                  }
                }
              }}
            />
            <div className="form-actions" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn-sakura"
                onClick={handleAddSong}
              >添加歌曲</button>
            </div>
            {localFileName ? (
              <div className="form-tip">已选择：{localFileName} {localMime ? `(${localMime})` : ''}</div>
            ) : null}
          </div>
          <div className="form-group">
            <div className="section-title">URL上传</div>
            <label className="form-label">歌曲URL</label>
            <input className="form-input" type="url" placeholder="https://player.zxlwq.dpdns.org.mp3" value={songUrl} onChange={(e) => setSongUrl(e.target.value)} id="song-url" name="song-url" />
          </div>
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">歌名-歌手</label>
              <input className="form-input" type="text" placeholder="歌名-歌手" value={songTitle} onChange={(e) => setSongTitle(e.target.value)} id="song-title" name="song-title" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">MV 链接（可选）</label>
            <input className="form-input" type="url" placeholder="https://example.com/video" value={songMvUrl} onChange={(e) => setSongMvUrl(e.target.value)} id="song-mv-url" name="song-mv-url" />
          </div>
          <div className="form-actions" style={{ gap: 10 }}>
            <button type="button" className="btn-sakura" onClick={handleAddSong}>添加歌曲</button>
            <button type="button" className="btn-sakura" onClick={() => onResetPlaylist && onResetPlaylist()}>恢复默认</button>
          </div>
          <hr className="hr" />
          <div className="section-title">导入GitHub仓库歌曲</div>
          <div className="form-group">
            <label className="form-label">GIT_REPO</label>
            <input className="form-input" type="text" placeholder="用户名/仓库名" value={gitRepo} onChange={(e) => setGitRepo(e.target.value)} id="git-repo" name="git-repo" />
          </div>
          <div className="form-group">
            <label className="form-label">GIT_TOKEN</label>
            <input
              className="form-input"
              type="password"
              placeholder="GitHub Token"
              value={gitToken}
              onChange={(e) => setGitToken(e.target.value)}
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              name="git-token"
              id="git-token"
            />
          </div>
          <div className="form-group">
            <label className="form-label">GIT_BRANCH（可选）</label>
            <input className="form-input" type="text" placeholder="main" value={gitBranch} onChange={(e) => setGitBranch(e.target.value)} id="git-branch" name="git-branch" />
          </div>
          <div className="form-group">
            <label className="form-label">导入路径</label>
            <input className="form-input" type="text" placeholder="public/music 或 music 或 ." value={gitPath} onChange={(e) => setGitPath(e.target.value)} id="git-path" name="git-path" />
          </div>
          <div className="form-actions">
            <button type="button" className="btn-sakura" onClick={() => onImportRepo && onImportRepo({ gitRepo, gitToken, gitBranch, gitPath })}>导入歌曲</button>
          </div>
          <hr className="hr" />
          <div className="section-title">导入API歌单</div>
          <div className="form-group">
            <label className="form-label">API链接</label>
            <input className="form-input" type="url" placeholder="https://player.zxlwq.dpdns.org" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} id="api-url" name="api-url" />
          </div>
          <div className="form-actions">
            <button type="button" className="btn-sakura" onClick={() => onImportApi && onImportApi({ apiUrl })}>导入歌曲</button>
          </div>
          <hr className="hr" />
          <div className="section-title">WebDAV</div>
          <div className="form-group">
            <div className="form-actions" style={{ gap: 10 }}>
              <button type="button" className="btn-sakura" onClick={() => onWebDavUpload && onWebDavUpload()}>上传</button>
              <button type="button" className="btn-sakura" onClick={() => onWebDavRestore && onWebDavRestore()}>恢复</button>
            </div>
          </div>
          <hr className="hr" />
          <div className="section-title">美化设置</div>
          <div className="form-group">
            <label className="form-label">字体预设</label>
            <select
              className="form-input"
              value={fontPreset}
              onChange={(e) => {
                const v = e.target.value
                setFontPreset(v)
                setFontFamily(v)
                try { localStorage.setItem('ui.fontFamily', v || '') } catch {}
                applyAppearance({ ff: v, bg: null })
              }}
              id="font-preset"
              name="font-preset"
            >
              {FONT_PRESETS.map(p => (
                <option key={p.label} value={p.value}>{p.label}</option>
              ))}
            </select>
            
          </div>
          <div className="form-group">
            <label className="form-label">添加本地背景图</label>
            <input
              className="form-input"
              type="file"
              accept="image/*"
              id="local-bg-file"
              name="local-bg-file"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) {
                  setLocalBgFile(null)
                  setLocalBgPreview('')
                  return
                }
                
                if (!file.type.startsWith('image/')) {
                  alert('请选择图片文件')
                  return
                }
                
                if (file.size > 5 * 1024 * 1024) {
                  alert('图片文件大小不能超过5MB')
                  return
                }
                
                setLocalBgFile(file)
                
                const reader = new FileReader()
                reader.onload = () => {
                  const dataUrl = reader.result
                  setLocalBgPreview(dataUrl)
                  const root = document.documentElement
                  const body = document.body
                  if (body) {
                    const base = "linear-gradient(180deg, rgba(0, 0, 0, .3), rgba(0, 0, 0, .3))"
                    body.style.backgroundImage = `${base}, url('${dataUrl}')`
                  }
                }
                reader.readAsDataURL(file)
              }}
            />
            {localBgPreview && (
              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                  onClick={() => {
                    setLocalBgFile(null)
                    setLocalBgPreview('')
                    const fileInput = document.querySelector('input[type="file"]')
                    if (fileInput) fileInput.value = ''
                    try {
                      localStorage.removeItem('ui.localBgFile')
                      localStorage.setItem('ui.bgUrl', '')
                    } catch {}
                    const body = document.body
                    if (body) {
                      body.style.backgroundImage = ''
                    }
                  }}
                >清除</button>
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">背景图 URL</label>
            <input 
              className="form-input" 
              type="url" 
              placeholder="images/background.webp" 
              value={bgUrl} 
              id="bg-url"
              name="bg-url"
              onChange={(e) => {
                const newBgUrl = e.target.value
                setBgUrl(newBgUrl)
                

                if (newBgUrl) {
                  setLocalBgFile(null)
                  setLocalBgPreview('')
                }
                

                if (newBgUrl) {
                  preloadBackgroundImage(newBgUrl).catch(() => {})
                }
              }} 
            />
            <div className="form-tip">留空恢复默认背景</div>
          </div>
          <div className="form-actions" style={{ gap: 10 }}>
            <button
              type="button"
              className="btn-sakura"
              onClick={() => {
                try {
                  localStorage.setItem('ui.fontFamily', fontFamily || '')
                  localStorage.setItem('ui.audioLoadMethod', audioLoadMethod || '')
                  localStorage.setItem('ui.customProxyUrl', customProxyUrl || '')

                  const finalBgUrl = localBgPreview || bgUrl
                  localStorage.setItem('ui.bgUrl', finalBgUrl || '')
                  

                  if (localBgFile && localBgPreview) {
                    localStorage.setItem('ui.localBgFile', JSON.stringify({
                      name: localBgFile.name,
                      type: localBgFile.type,
                      size: localBgFile.size,
                      dataUrl: localBgPreview
                    }))
                  } else {
                    localStorage.removeItem('ui.localBgFile')
                  }
                } catch {}
                applyAppearance({ ff: fontFamily, bg: localBgPreview || bgUrl })
              }}
            >应用并保存</button>
          </div>
          <hr className="hr" />
          <div className="section-title">音频加载设置</div>
          <div className="form-group">
            <label className="form-label" htmlFor="audio-load-method">音频加载方式</label>
            <select
              className="form-input"
              value={audioLoadMethod}
              onChange={(e) => setAudioLoadMethod(e.target.value)}
              id="audio-load-method"
              name="audio-load-method"
            >
              <option value="">内置代理</option>
              <option value="direct">原始URL</option>
              <option value="custom">自定义代理</option>
            </select>
            <div className="form-tip">
              {audioLoadMethod === '' && '使用内置代理服务，兼容性好'}
              {audioLoadMethod === 'direct' && '直接访问原始URL，但可能受CORS限制'}
              {audioLoadMethod === 'custom' && '使用自定义代理服务，需要配置代理URL'}
            </div>
          </div>
          {audioLoadMethod === 'custom' && (
            <div className="form-group">
              <label className="form-label">自定义代理URL</label>
              <input 
                className="form-input" 
                type="url" 
                placeholder={appConfig.customProxyUrl || "https://music-proxy.com/api/audio?url="} 
                value={customProxyUrl} 
                onChange={(e) => setCustomProxyUrl(e.target.value)}
                id="custom-proxy-url"
                name="custom-proxy-url"
              />
              {appConfig.customProxyUrl && (
                <div className="form-tip" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                  环境变量配置: {appConfig.customProxyUrl}
                  <br />
                  <span style={{ color: '#ff6b6b' }}>输入代理URL将自动覆盖环境变量</span>
                </div>
              )}
              {!appConfig.customProxyUrl && (
                <div className="form-tip" style={{ fontSize: '12px', color: '#888' }}>
                  当前无环境变量配置，将使用上方输入的代理URL
                </div>
              )}
            </div>
          )}
          <div className="form-actions" style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn-sakura"
              onClick={() => setShowCacheManager(true)}
            >
              音频缓存管理
            </button>
            <button
              type="button"
              className="btn-sakura"
              onClick={() => {
                try {
                  localStorage.setItem('ui.audioLoadMethod', audioLoadMethod || '')
                  localStorage.setItem('ui.customProxyUrl', customProxyUrl || '')
                  
                  // 触发自定义事件，通知Player组件设置已变化
                  window.dispatchEvent(new CustomEvent('audioSettingsChanged'))
                  
                  alert('音频加载设置已保存！')
                } catch (error) {
                  console.error('保存音频设置失败:', error)
                  alert('保存失败，请重试')
                }
              }}
             >
               应用并保存
             </button>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-danger" onClick={onClose}>关闭</button>
        </div>
    </div>
    
    {/* 音频缓存管理 */}
    <Manager 
      isOpen={showCacheManager} 
      onClose={() => setShowCacheManager(false)} 
    />
    </>
  )
}
