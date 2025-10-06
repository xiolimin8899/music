import React, { useEffect, useState } from 'react'
import { preloadBackgroundImage } from '../utils/image'

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
  const [gitPath, setGitPath] = useState('public/music')
  const [apiUrl, setApiUrl] = useState('')
  const [fontFamily, setFontFamily] = useState('')
  const [bgUrl, setBgUrl] = useState('')
  const [localBgFile, setLocalBgFile] = useState(null)
  const [localBgPreview, setLocalBgPreview] = useState('')
  const [proxyTestResult, setProxyTestResult] = useState('')
  const [isTestingProxy, setIsTestingProxy] = useState(false)
  const [showProxyResult, setShowProxyResult] = useState(false)
  const [testUrl, setTestUrl] = useState('')
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

  useEffect(() => {
    if (!open) return
    try {
      setFontFamily(localStorage.getItem('ui.fontFamily') || '')
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
    } catch {}
  }, [open])

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

  const testProxyMethods = async () => {
    setIsTestingProxy(true)
    setProxyTestResult('')
    
    const currentTestUrl = testUrl.trim() || 'https://raw.githubusercontent.com/zxlwqa/music/main/public/music/犯错 - 降速版.mp3'
    let result = '               代理检测\n==========================================\n\n'
    
    try {
      result += '🌍 环境检测\n-------------------------------------\n'
      
      const isCloudflarePages = window.location.hostname.includes('.pages.dev') || 
                                window.location.hostname.includes('cloudflare') ||
                                window.location.hostname.includes('workers.dev') ||
                                window.location.hostname.includes('.dpdns.org') ||
                                window.location.hostname.includes('.cf') ||
                                window.location.hostname.includes('.pages')
      
      const isDocker = window.location.hostname.includes('localhost') || 
                       window.location.hostname.includes('127.0.0.1') ||
                       window.location.hostname.includes('192.168.') ||
                       window.location.hostname.includes('10.0.') ||
                       window.location.hostname.includes('.hf.space') ||
                       window.location.hostname.includes('huggingface.co/spaces') ||
                       window.location.port && window.location.port !== '80' && window.location.port !== '443'
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      
      let deploymentEnv = '未知'
      if (isCloudflarePages) {
        deploymentEnv = 'Cloudflare Pages'
      } else if (isDocker) {
        deploymentEnv = 'Docker'
      } else {
        deploymentEnv = '其他'
      }
      
      result += `   部署环境: ${deploymentEnv}\n`
      result += `   设备类型: ${isMobile ? '移动端' : '桌面端'}\n`
      result += `   当前域名: ${window.location.hostname}\n`
      result += `   协议: ${window.location.protocol}\n`
      
      let ipInfo = '获取中...'
      try {
        const ipResponse = await fetch('https://ipapi.co/json/', {
          signal: AbortSignal.timeout(3000)
        })
        if (ipResponse.ok) {
          const ipData = await ipResponse.json()
          
          const locationMap = {
            'Hong Kong': '香港',
            'China': '中国',
            'United States': '美国',
            'Japan': '日本',
            'Singapore': '新加坡',
            'Taiwan': '台湾',
            'South Korea': '韩国',
            'United Kingdom': '英国',
            'Germany': '德国',
            'France': '法国',
            'Canada': '加拿大',
            'Australia': '澳大利亚',
            'India': '印度',
            'Brazil': '巴西',
            'Russia': '俄罗斯'
          }
          
          let location = ''
          if (ipData.city && ipData.country_name && ipData.city !== ipData.country_name) {
            const cityName = locationMap[ipData.city] || ipData.city
            const countryName = locationMap[ipData.country_name] || ipData.country_name
            location = `${cityName}, ${countryName}`
          } else {
            location = locationMap[ipData.country_name] || ipData.country_name || '未知位置'
          }
          
          ipInfo = `${ipData.ip} (${location})`
        } else {
          throw new Error('第一个服务失败')
        }
      } catch (error) {
        try {
          const backupResponse = await fetch('https://api.ipify.org?format=json', {
            signal: AbortSignal.timeout(3000)
          })
          if (backupResponse.ok) {
            const backupData = await backupResponse.json()
            ipInfo = `${backupData.ip} (位置未知)`
          } else {
            throw new Error('备用服务失败')
          }
        } catch (backupError) {
          ipInfo = '获取失败'
        }
      }
      result += `   IP地址: ${ipInfo}\n`
      
      result += `   端口: ${window.location.port || '默认'}\n`
      result += `   用户代理: ${navigator.userAgent.substring(0, 50)}...\n`
      result += '\n'

      result += '🥇 测试1: 原始URL直接访问\n-------------------------------------\n'
      result += `   测试URL: ${currentTestUrl}\n`
      try {
        const startTime = Date.now()
        const response = await fetch(currentTestUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000)
        })
        const duration = Date.now() - startTime
        
        if (response.ok) {
          result += '✅ 原始URL访问成功\n'
          result += `   状态码: ${response.status}\n`
          result += `   响应时间: ${duration}ms\n`
          result += `   Content-Type: ${response.headers.get('content-type')}\n`
        } else {
          result += '❌ 原始URL访问失败\n'
          result += `   状态码: ${response.status}\n`
        }
      } catch (error) {
        result += '❌ 原始URL访问错误: ' + error.message + '\n'
        if (error.name === 'TypeError' && error.message.includes('CORS')) {
          result += '   💡 这是预期的CORS错误，说明需要代理\n'
        }
      }
      result += '\n'

      result += '🥈 测试2: 内置代理服务 (fetch.js)\n-------------------------------------\n'
      try {
        const startTime = Date.now()
        const response = await fetch('/api/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: currentTestUrl }),
          signal: AbortSignal.timeout(20000)
        })
        const duration = Date.now() - startTime
        
        if (response.ok) {
          const data = await response.json()
          result += '✅ 内置代理服务正常\n'
          result += `   状态码: ${response.status}\n`
          result += `   响应时间: ${duration}ms\n`
          result += `   Content-Type: ${data.contentType}\n`
          result += `   Base64长度: ${data.base64 ? data.base64.length : 0} 字符\n`
        } else {
          result += '❌ 内置代理服务失败\n'
          result += `   状态码: ${response.status}\n`
          const errorData = await response.json().catch(() => ({}))
          result += `   错误信息: ${errorData.error || '未知错误'}\n`
        }
      } catch (error) {
        result += '❌ 内置代理服务错误: ' + error.message + '\n'
      }
      result += '\n'

      result += '🥉 测试3: 自定义代理服务\n-------------------------------------\n'
      try {
        const configResponse = await fetch('/api/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'getConfig' })
        })
        
        if (configResponse.ok) {
          const config = await configResponse.json()
          result += '📋 配置信息:\n'
          result += `   自定义代理URL: ${config.customProxyUrl || '未配置'}\n`
          result += `   是否启用: ${config.hasCustomProxy ? '是' : '否'}\n`
          
          if (config.hasCustomProxy && config.customProxyUrl) {
            result += '\n🔄 测试自定义代理功能...\n'
            
            const startTime = Date.now()
            const proxyResponse = await fetch('/api/fetch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                action: 'customProxy',
                url: currentTestUrl 
              }),
              signal: AbortSignal.timeout(15000)
            })
            const duration = Date.now() - startTime
            
            if (proxyResponse.ok) {
              const data = await proxyResponse.json()
              result += '✅ 自定义代理服务正常\n'
              result += `   状态码: ${proxyResponse.status}\n`
              result += `   响应时间: ${duration}ms\n`
              result += `   Content-Type: ${data.contentType}\n`
              result += `   Base64长度: ${data.base64 ? data.base64.length : 0} 字符\n`
            } else {
              result += '❌ 自定义代理服务失败\n'
              result += `   状态码: ${proxyResponse.status}\n`
              const errorData = await proxyResponse.json().catch(() => ({}))
              result += `   错误信息: ${errorData.error || '未知错误'}\n`
            }
          } else {
            result += '⚠️  自定义代理服务未配置\n'
            result += '   请在Cloudflare Pages设置中添加 GIT_URL 环境变量\n'
          }
        } else {
          result += '❌ 无法获取配置信息\n'
        }
      } catch (error) {
        result += '❌ 自定义代理服务错误: ' + error.message + '\n'
      }
      result += '\n'


    } catch (error) {
      result += '❌ 检测过程中发生错误: ' + error.message + '\n'
    }
    
    setProxyTestResult(result)
    setIsTestingProxy(false)
    setShowProxyResult(true)
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
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
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
            <input className="form-input" type="url" placeholder="https://player.zxlwq.dpdns.org.mp3" value={songUrl} onChange={(e) => setSongUrl(e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">歌名-歌手</label>
              <input className="form-input" type="text" placeholder="歌名-歌手" value={songTitle} onChange={(e) => setSongTitle(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">MV 链接（可选）</label>
            <input className="form-input" type="url" placeholder="https://example.com/video" value={songMvUrl} onChange={(e) => setSongMvUrl(e.target.value)} />
          </div>
          <div className="form-actions" style={{ gap: 10 }}>
            <button type="button" className="btn-sakura" onClick={handleAddSong}>添加歌曲</button>
            <button type="button" className="btn-sakura" onClick={() => onResetPlaylist && onResetPlaylist()}>恢复默认</button>
          </div>
          <hr className="hr" />
          <div className="section-title">导入GitHub仓库歌曲</div>
          <div className="form-group">
            <label className="form-label">GIT_REPO</label>
            <input className="form-input" type="text" placeholder="用户名/仓库名" value={gitRepo} onChange={(e) => setGitRepo(e.target.value)} />
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
            />
          </div>
          <div className="form-group">
            <label className="form-label">GIT_BRANCH（可选）</label>
            <input className="form-input" type="text" placeholder="main" value={gitBranch} onChange={(e) => setGitBranch(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">导入路径</label>
            <input className="form-input" type="text" placeholder="public/music 或 music 或 ." value={gitPath} onChange={(e) => setGitPath(e.target.value)} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn-sakura" onClick={() => onImportRepo && onImportRepo({ gitRepo, gitToken, gitBranch, gitPath })}>导入歌曲</button>
          </div>
          <hr className="hr" />
          <div className="section-title">导入API歌单</div>
          <div className="form-group">
            <label className="form-label">API链接</label>
            <input className="form-input" type="url" placeholder="https://player.zxlwq.dpdns.org" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
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
          <div className="section-title">系统设置</div>
          <div className="form-group">
            <label className="form-label">测试URL</label>
            <input 
              className="form-input" 
              type="url" 
              placeholder="https://raw.githubusercontent.com/zxlwqa/music/main/public/music/.mp3" 
              value={testUrl} 
              onChange={(e) => setTestUrl(e.target.value)}
            />
          </div>
          <div className="form-group">
            <div className="form-actions">
              <button
                type="button"
                className="btn-sakura"
                onClick={testProxyMethods}
                disabled={isTestingProxy}
              >
                {isTestingProxy ? '检测中...' : '代理检测'}
              </button>
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-danger" onClick={onClose}>关闭</button>
        </div>
      </div>
      
      {/* 代理检测结果弹窗 */}
      {showProxyResult && (
        <div className="modal-backdrop" style={{ zIndex: 1001 }}>
          <div className="modal" style={{ 
            maxWidth: '90vw', 
            maxHeight: '90vh', 
            overflow: 'auto',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            backdropFilter: 'blur(15px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}>
            <h3 className="modal-title" style={{ textAlign: 'center' }}>代理检测结果</h3>
            <div className="modal-body">
              <pre className="proxy-result-pre" style={{ 
                whiteSpace: 'pre-wrap', 
                wordBreak: 'break-word', 
                fontSize: '14px', 
                lineHeight: '1.5',
                fontFamily: 'monospace',
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                backdropFilter: 'blur(8px)',
                padding: '16px',
                borderRadius: '8px',
                overflow: 'auto',
                maxHeight: '60vh',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'rgba(255, 255, 255, 0.95)'
              }}>
                {proxyTestResult}
              </pre>
            </div>
            <div className="modal-actions">
              <button 
                type="button" 
                className="btn-sakura" 
                onClick={() => setShowProxyResult(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
