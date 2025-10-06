import React, { useEffect, useState, Suspense } from 'react'
const Player = React.lazy(() => import('./components/Player.jsx'))
const SearchBar = React.lazy(() => import('./components/SearchBar.jsx'))
const Playlist = React.lazy(() => import('./components/Playlist.jsx'))
const Password = React.lazy(() => import('./components/Password.jsx'))
const Settings = React.lazy(() => import('./components/Settings.jsx'))
const Progress = React.lazy(() => import('./components/Progress.jsx'))
import { preloadCoverImages, preloadDefaultCovers, preloadBackgroundImage } from './utils/image'

export default function App() {
  const [tracks, setTracks] = useState([])
  const [query, setQuery] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [forcePlayKey, setForcePlayKey] = useState(0)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [pendingDeleteUrl, setPendingDeleteUrl] = useState('')
  const [pendingDeleteName, setPendingDeleteName] = useState('')
  const [passwordErrorCount, setPasswordErrorCount] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [progressTitle, setProgressTitle] = useState('')
  const [progressMessage, setProgressMessage] = useState('')
  const [progressValue, setProgressValue] = useState(0)
  const [showBadges, setShowBadges] = useState(false)

  const loadManifest = async () => {
      try {
        const tryServerList = async () => {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 5000)
          try {
            const ts = Date.now()
            const r = await fetch(`/api/music/list?t=${ts}`, { 
              headers: { 'accept': 'application/json' }, 
              cache: 'no-store', 
              signal: controller.signal 
            })
            
            if (!r.ok) {
              if (r.status === 503) {
                const errorData = await r.json().catch(() => ({}))
                if (errorData.error && errorData.error.includes('proxy')) {
                  console.warn('检测到代理环境，GitHub API访问被阻止:', errorData)
                  return null
                }
              }
              return null
            }
            
            const ct = r.headers.get('content-type') || ''
            if (!/json/i.test(ct)) return null
            const j = await r.json()
            if (!j || !Array.isArray(j.tracks)) return null
            return { tracks: j.tracks }
          } catch (error) {
            if (error.name === 'AbortError' || error.message.includes('fetch')) {
              console.warn('网络请求失败，可能是代理环境导致:', error.message)
            }
            return null
          } finally {
            clearTimeout(timer)
          }
        }
        const serverData = await tryServerList()
        let data = serverData
        if (!data) {
          
          console.log('服务端列表获取失败，使用静态manifest作为备用方案')
          const ts2 = Date.now()
          const res = await fetch(`/manifest.json?t=${ts2}`, { cache: 'no-store' })
          if (!res.ok) throw new Error(`加载清单失败: ${res.status}`)
          data = await res.json()
          
          console.info('当前使用静态歌单，如需实时更新请检查网络连接或代理设置')
        }
        const overrideRaw = localStorage.getItem('overrideTracks')
        let override = []
        try { override = JSON.parse(overrideRaw || '[]') } catch {}
        const baseTracks = Array.isArray(data.tracks) ? data.tracks : []
        const extraRaw = localStorage.getItem('extraTracks')
        let extra = []
        try { extra = JSON.parse(extraRaw || '[]') } catch {}
        const localPreferred = ['a.webp','b.webp','c.webp','d.webp','e.webp','f.webp','g.webp','h.webp','i.webp','j.webp','k.webp','l.webp','m.webp','n.webp','o.webp','p.webp','q.webp','r.webp','s.webp','t.webp','u.webp','v.webp','w.webp','x.webp','y.webp','z.webp']
        const assignCovers = (list) => {
          let idx = 0
          return (list || []).map((t) => {
            if (t && t.cover) return t
            const assigned = { ...(t || {}) }
            assigned.cover = `/covers/${localPreferred[idx % localPreferred.length]}`
            idx++
            return assigned
          })
        }
        const applyDeletionFilter = (list) => {
          try {
            const delRaw = localStorage.getItem('deletedUrls')
            const del = Array.isArray(JSON.parse(delRaw || '[]')) ? JSON.parse(delRaw || '[]') : []
            if (!Array.isArray(list) || !list.length || !del.length) return list
            const present = new Set((list || []).map(it => it?.url).filter(Boolean))
            const pruned = del.filter(u => !present.has(u))
            if (pruned.length !== del.length) {
              localStorage.setItem('deletedUrls', JSON.stringify(pruned))
            }
            if (!pruned.length) return list
            const prunedSet = new Set(pruned)
            return list.filter(it => !prunedSet.has(it?.url))
          } catch { return list }
        }

        if (Array.isArray(override) && override.length) {
          const extraRaw2 = localStorage.getItem('extraTracks')
          let extra2 = []
          try { extra2 = JSON.parse(extraRaw2 || '[]') } catch {}
          const titleToExtra = new Map()
          for (const et of extra2) {
            if (et && et.title) titleToExtra.set(et.title, et)
          }
          const withCovers = assignCovers(override)
          const enriched = withCovers.map((t) => {
            const title = t?.title || ''
            const ext = titleToExtra.get(title)
            if (!ext) return t
            const merged = { ...t }
            if (!merged.mvUrl && ext.mvUrl) merged.mvUrl = ext.mvUrl
            if (!merged.cover && ext.cover) merged.cover = ext.cover
            return merged
          })
          const finalList = applyDeletionFilter(enriched)
          setTracks(finalList)
          setLoading(false)
          ;(async () => { try { await preloadCoverImages(finalList) } catch {} })()
          ;(async () => { try { await preloadDefaultCovers() } catch {} })()
          return
        } else {
          const titleToIndex = new Map()
          const merged = []
          let coverIdx = 0
          const pushWithCover = (item) => {
            if (!item.cover) {
              const cover = `/covers/${localPreferred[coverIdx % localPreferred.length]}`
              merged.push({ ...item, cover })
              coverIdx++
            } else {
              merged.push(item)
            }
            titleToIndex.set(item.title || '', merged.length - 1)
          }
          for (const t of baseTracks) {
            if (!t || !t.url) continue
            const title = t.title || ''
            if (titleToIndex.has(title)) continue
            pushWithCover(t)
          }
          for (const t of extra) {
            if (!t || !t.url) continue
            const title = t.title || ''
            if (!titleToIndex.has(title)) {
              pushWithCover(t)
            } else {
              const idx = titleToIndex.get(title)
              const prev = merged[idx] || {}
              const enriched = { ...prev }
              if (!enriched.mvUrl && t.mvUrl) enriched.mvUrl = t.mvUrl
              if (!enriched.cover && t.cover) enriched.cover = t.cover
              merged[idx] = enriched
            }
          }
          const patchedExtra = []
          let extraCoverIdx = 0
          for (const et of extra) {
            if (!et || !et.url) continue
            if (!et.cover) {
              patchedExtra.push({ ...et, cover: `/covers/${localPreferred[extraCoverIdx % localPreferred.length]}` })
              extraCoverIdx++
            } else {
              patchedExtra.push(et)
            }
          }
          if (patchedExtra.length === extra.length) {
            localStorage.setItem('extraTracks', JSON.stringify(patchedExtra))
          }
          const finalList = applyDeletionFilter(merged)
          setTracks(finalList)
          setLoading(false)
          ;(async () => { try { await preloadCoverImages(finalList) } catch {} })()
          ;(async () => { try { await preloadDefaultCovers() } catch {} })()
          return
        }
        
      } catch (e) {
        setError(e.message || '清单加载错误')
      } finally {
        setLoading(false)
      }
    }
  
  useEffect(() => { loadManifest() }, [])

  useEffect(() => {
    const t = setTimeout(() => setShowBadges(true), 1200)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    try {
      const ff = localStorage.getItem('ui.fontFamily') || ''
      let bg = ''
      const localBgData = localStorage.getItem('ui.localBgFile')
      if (localBgData) {
        try {
          const parsed = JSON.parse(localBgData)
          if (parsed.dataUrl) {
            bg = parsed.dataUrl
          }
        } catch {}
      }
      if (!bg) {
        bg = localStorage.getItem('ui.bgUrl') || ''
      }
      const root = document.documentElement
      const body = document.body
      if (root) {
        root.style.setProperty('--font-family', ff || 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, "Helvetica Neue", Arial')
      }
      if (body && bg) {
        const base = "linear-gradient(180deg, rgba(0, 0, 0, .3), rgba(0, 0, 0, .3))"
        body.style.backgroundImage = `${base}, url('${bg}')`
        if (!bg.startsWith('data:')) {
          preloadBackgroundImage(bg).catch(() => {})
        }
      }
    } catch {}
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
      if (e.key === 'Escape') {
        e.preventDefault()
        if (passwordOpen) {
          setPasswordOpen(false)
          setPendingDeleteUrl('')
          setPendingDeleteName('')
        } else if (settingsOpen) {
          setSettingsOpen(false)
        } else if (progressOpen) {
          setProgressOpen(false)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [passwordOpen, settingsOpen, progressOpen])

  const persistAdd = (items) => {
    const extraRaw = localStorage.getItem('extraTracks')
    let extra = []
    try { extra = JSON.parse(extraRaw || '[]') } catch {}
    const titleToIndex = new Map()
    for (let i = 0; i < extra.length; i++) {
      const t = extra[i]
      if (t && t.title) titleToIndex.set(t.title, i)
    }
    for (const it of items || []) {
      if (!it || !it.title) continue
      const idx = titleToIndex.get(it.title)
      if (typeof idx === 'number') {
        const prev = extra[idx] || {}
        const next = { ...prev }
        if (it.url && !next.url) next.url = it.url
        if (it.cover && !next.cover) next.cover = it.cover
        if (it.mvUrl) next.mvUrl = it.mvUrl
        if (!next.title) next.title = it.title
        extra[idx] = next
      } else {
        extra.push({ title: it.title || '', url: it.url, cover: it.cover, mvUrl: it.mvUrl })
        titleToIndex.set(it.title, extra.length - 1)
      }
    }
    localStorage.setItem('extraTracks', JSON.stringify(extra))
  }

  const persistRemoveByUrl = (url) => {
    const extraRaw = localStorage.getItem('extraTracks')
    let extra = []
    try { extra = JSON.parse(extraRaw || '[]') } catch {}
    let currentTitle = ''
    try {
      const found = (tracks || []).find(t => t && t.url === url)
      currentTitle = found?.title || ''
    } catch {}
    const filtered = extra.filter(x => x && x.url !== url && (!currentTitle || x.title !== currentTitle))
    localStorage.setItem('extraTracks', JSON.stringify(filtered))
    
    const overrideRaw = localStorage.getItem('overrideTracks')
    try {
      const o = JSON.parse(overrideRaw || '[]')
      const of = Array.isArray(o) ? o.filter(x => x && x.url !== url && (!currentTitle || x.title !== currentTitle)) : []
      localStorage.setItem('overrideTracks', JSON.stringify(of))
    } catch {}
    
    try {
      const delRaw = localStorage.getItem('deletedUrls')
      const del = Array.isArray(JSON.parse(delRaw || '[]')) ? JSON.parse(delRaw || '[]') : []
      if (!del.includes(url)) {
        const next = [...del, url]
        localStorage.setItem('deletedUrls', JSON.stringify(next))
      }
    } catch {}
    
  }

  const clearAudioCache = (audioUrl) => {
    try {
      const baseUrl = audioUrl.split('?')[0]
      if ('caches' in window) {
        caches.keys().then(cacheNames => {
          cacheNames.forEach(cacheName => {
            caches.open(cacheName).then(cache => {
              cache.delete(baseUrl)
              cache.delete(audioUrl)
            })
          })
        })
      }
      if (baseUrl.startsWith('http')) {
        fetch(baseUrl, { method: 'HEAD', cache: 'no-cache' }).catch(() => {})
      }
    } catch (e) {
      console.warn('清除缓存失败:', e)
    }
  }

  const executeDelete = async (passwordValue) => {
    const url = pendingDeleteUrl
    setPendingDeleteUrl('')
    setPendingDeleteName('')
    
    setTracks(prevTracks => prevTracks.filter(t => t.url !== url))
    persistRemoveByUrl(url)
    clearAudioCache(url)
    const computeFilePath = (u) => {
      if (!u) return ''
      if (u.startsWith('/public/music/')) return u.replace(/^\//, '')
      if (u.startsWith('/music/')) return `public${u}`.replace(/^\//, '')
      return ''
    }
    setProgressOpen(true)
    setProgressTitle('删除中')
    setProgressMessage('正在从仓库删除文件...')
    setProgressValue(10)
    try {
      const filePath = computeFilePath(url)
      const shouldServerDelete = (() => {
        if (filePath) return true
        try {
          const u = new URL(url)
          return u.hostname === 'raw.githubusercontent.com'
        } catch { return false }
      })()
      if (shouldServerDelete) {
        const res = await fetch('/api/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath, rawUrl: url, password: passwordValue || '' })
        })
        if (!res.ok) {
          const t = await res.text()
          throw new Error(`删除失败：${res.status} ${t}`)
        }
        setProgressValue(80)
        setProgressTitle('完成')
        setProgressMessage('已从仓库删除并同步到列表')
        setProgressValue(100)
        clearAudioCache(url)
      } else {
        setProgressValue(80)
        setProgressTitle('完成')
        setProgressMessage('已从列表移除（外链/本地临时资源无需仓库删除）')
        setProgressValue(100)
      }
    } catch (e) {
      setProgressTitle('失败')
      setProgressMessage(e.message || '删除失败')
      loadManifest()
    } finally {
      setTimeout(() => setProgressOpen(false), 800)
    }
  }

  const normalized = (s) => (s || '').toLowerCase()
  const filteredTracks = tracks.filter(t => {
    if (!query.trim()) return true
    const title = t.title || ''
    return normalized(title).includes(normalized(query))
  })

  useEffect(() => {
    if (currentIndex >= filteredTracks.length) {
      setCurrentIndex(0)
    }
  }, [query, filteredTracks.length])

  if (loading) return null
  if (error) return <div className="container error">{error}</div>
  if (!tracks.length) return <div className="container">未发现音乐文件，请将音频放入 public/music</div>

  return (
    <div className="container">
      <Suspense fallback={null}>
        <Player tracks={filteredTracks} currentIndex={currentIndex} onChangeIndex={setCurrentIndex} forcePlayKey={forcePlayKey} onOpenSettings={() => setSettingsOpen(true)} />
      </Suspense>
      <Suspense fallback={null}>
        <SearchBar value={query} onChange={setQuery} />
      </Suspense>
      <Suspense fallback={null}>
      <Playlist
        tracks={filteredTracks}
        currentIndex={currentIndex}
        onSelect={(i) => { setCurrentIndex(i); setForcePlayKey(Date.now()) }}
        onDelete={(url) => {
          setPendingDeleteUrl(url)
          const track = tracks.find(t => t.url === url) || filteredTracks.find(t => t.url === url)
          const title = track?.title || ''
          const match = title.match(/^(.+?)(?:\s{2,}|\s-\s)(.+)$/)
          const display = match ? `${match[1].trim()} - ${match[2].trim()}` : title
          setPendingDeleteName(display)
          
          setPasswordOpen(true)
        }}
      />
      </Suspense>
      <Suspense fallback={null}>
      <Password
        open={passwordOpen}
        title="删除歌曲"
        message={pendingDeleteName ? `确认删除：${pendingDeleteName}？` : '确认删除该歌曲吗？'}
        onCancel={() => { 
          setPasswordOpen(false)
          setPendingDeleteUrl('')
          setPendingDeleteName('')
          setPasswordErrorCount(0)
        }}
        onConfirm={(pwd) => {
          setPasswordOpen(false)
          executeDelete(pwd)
        }}
        onPasswordError={() => {
          setPasswordErrorCount(prev => prev + 1)
        }}
      />
      </Suspense>
      <Suspense fallback={null}>
      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onAddSong={async ({ songUrl, songTitle, fileName, mvUrl, base64, contentType, suppressClose }) => {
          setProgressOpen(true)
          setProgressTitle('下载中')
          setProgressMessage(base64 ? '使用本地音频数据...' : '正在通过代理下载音频...')
          setProgressValue(5)

          const tryUploadAndAdd = async () => {
            try {
              setProgressTitle('检查中')
              setProgressMessage('正在检查同名歌曲（按标题）...')
              const normalizeTitle = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase()
              const existsByTitle = (tracks || []).some(t => normalizeTitle(t?.title) === normalizeTitle(songTitle))
              if (existsByTitle) {
                setProgressTitle('失败')
                setProgressMessage('已存在同名歌曲')
                setProgressValue(100)
                return
              }
            } catch {}

            let upRes
            if (base64 && typeof Blob !== 'undefined') {
              setProgressTitle('上传中')
              setProgressMessage('正在上传到 GitHub 仓库...')
              setProgressValue(60)
              const byteChars = atob(base64)
              const byteNums = new Array(byteChars.length)
              for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i)
              const byteArray = new Uint8Array(byteNums)
              const blob = new Blob([byteArray], { type: contentType || 'application/octet-stream' })
              const form = new FormData()
              form.append('fileName', fileName)
              form.append('file', blob, fileName)
              upRes = await fetch('/api/upload', { method: 'POST', body: form })
            } else {
              setProgressTitle('命名中')
              setProgressMessage(`生成文件名：${fileName}`)
              setProgressValue(40)
              setProgressTitle('上传中')
              setProgressMessage('正在上传到 GitHub 仓库...')
              setProgressValue(60)
              upRes = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(base64 ? { fileName, base64 } : { fileName, sourceUrl: songUrl }) })
            }
            
            if (!upRes.ok) {
              const text = await upRes.text()
              try {
                const j = JSON.parse(text)
                if ((upRes.status === 409 || upRes.status === 422) && (j?.exists || /exists/i.test(text))) {
                  throw new Error('该文件已存在')
                }
              } catch {}
              throw new Error(`上传失败: ${upRes.status} ${text}`)
            }
            const up = await upRes.json()
            const rawUrl = up.rawUrl
            const timestampedUrl = rawUrl + (rawUrl.includes('?') ? '&' : '?') + 't=' + Date.now()
            // 为新添加歌曲即时分配一个默认封面（与其他位置的本地封面集保持一致）
            const localPreferred = ['a.webp','b.webp','c.webp','d.webp','e.webp','f.webp','g.webp','h.webp','i.webp','j.webp','k.webp','l.webp','m.webp','n.webp','o.webp','p.webp','q.webp','r.webp','s.webp','t.webp','u.webp','v.webp','w.webp','x.webp','y.webp','z.webp']
            const coverIdx = (tracks.length) % localPreferred.length
            const assignedCover = `/covers/${localPreferred[coverIdx]}`
            const newItem = { title: songTitle, url: timestampedUrl, mvUrl, cover: assignedCover }
            try {
              const delRaw = localStorage.getItem('deletedUrls')
              const del = Array.isArray(JSON.parse(delRaw || '[]')) ? JSON.parse(delRaw || '[]') : []
              const nd = del.filter(x => x !== rawUrl)
              if (nd.length !== del.length) localStorage.setItem('deletedUrls', JSON.stringify(nd))
              const dtRaw = localStorage.getItem('deletedTitles')
              const dts = Array.isArray(JSON.parse(dtRaw || '[]')) ? JSON.parse(dtRaw || '[]') : []
              const ntd = dts.filter(x => x !== songTitle)
              if (ntd.length !== dts.length) localStorage.setItem('deletedTitles', JSON.stringify(ntd))
            } catch {}
            setTracks(prev => {
              const idx = prev.findIndex(x => (x.title || '') === newItem.title)
              if (idx >= 0) {
                const next = [...prev]
                const prevItem = next[idx]
                const merged = { ...prevItem }
                if (!merged.mvUrl && newItem.mvUrl) merged.mvUrl = newItem.mvUrl
                if (!merged.cover && newItem.cover) merged.cover = newItem.cover
                next[idx] = merged
                return next
              }
              return [...prev, newItem]
            })
            // 将带封面的新歌曲持久化，避免刷新后丢失封面
            try { persistAdd([{ title: newItem.title, url: newItem.url, cover: newItem.cover, mvUrl: newItem.mvUrl }]) } catch {}
            setQuery('')
            setProgressValue(100)
            setProgressTitle('完成')
            setProgressMessage('上传成功，已添加到歌单')
            setTimeout(() => { setProgressOpen(false); if (!suppressClose) setSettingsOpen(false) }, 800)
          }

          try {
            await tryUploadAndAdd()
            return
          } catch (e) {
            setProgressTitle('失败')
            setProgressMessage(e?.message || '上传失败')
            setProgressValue(100)
            return
          }
        }}
        onImportRepo={async ({ gitRepo, gitToken, gitBranch, gitPath }) => {
          if (!gitRepo || !gitToken) return
          try {
            setProgressOpen(true)
            setProgressTitle('导入中')
            setProgressMessage('正在读取仓库文件列表...')
            setProgressValue(10)
            const branch = gitBranch || 'main'
            const [owner, repo] = String(gitRepo).split('/')
            if (!owner || !repo) throw new Error('GIT_REPO 格式应为 owner/repo')
            const normPath = String(gitPath || 'public/music').replace(/^\/+|\/+$/g, '') || '.'
            const segs = normPath === '.' ? [] : normPath.split('/').filter(Boolean)
            const pathPart = segs.length ? '/' + segs.map(encodeURIComponent).join('/') : ''
            const listApi = `https://api.github.com/repos/${owner}/${repo}/contents${pathPart}?ref=${encodeURIComponent(branch)}`
            const listRes = await fetch(listApi, { headers: { 'Authorization': `Bearer ${gitToken}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'web-music-player/0.1' } })
            if (!listRes.ok) {
              const t = await listRes.text()
              throw new Error(`读取仓库失败: ${listRes.status} ${t}`)
            }
            const items = await listRes.json()
            const allFiles = Array.isArray(items) ? items.filter(it => it && it.type === 'file') : []
            const audioExts = ['.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg', '.opus', '.webm']
            const isExt = (name, exts) => exts.some(ext => name.toLowerCase().endsWith(ext))
            const audioFiles = allFiles.filter(it => isExt(it.name || '', audioExts))
            if (!audioFiles.length) {
              setProgressTitle('完成')
              setProgressMessage('未在该路径下发现音频文件')
              setProgressValue(100)
              setTimeout(() => setProgressOpen(false), 1200)
              return
            }
            setProgressMessage(`发现 ${audioFiles.length} 个音频文件，正在导入...`)
            setProgressValue(40)
            const added = []
            for (let i = 0; i < audioFiles.length; i++) {
              const it = audioFiles[i]
              const name = it.name || ''
              const base = name.replace(/\.[^.]+$/, '')
              const title = base.replace(/\s*-\s*/g, ' - ').replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim()
              const rawPathSegs = [...segs, name]
              const rawPath = rawPathSegs.map(encodeURIComponent).join('/')
              const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${rawPath}`
              const localPreferred = ['a.webp','b.webp','c.webp','d.webp','e.webp','f.webp','g.webp','h.webp','i.webp','j.webp','k.webp','l.webp','m.webp','n.webp','o.webp','p.webp','q.webp','r.webp','s.webp','t.webp','u.webp','v.webp','w.webp','x.webp','y.webp','z.webp']
              const cover = `/covers/${localPreferred[i % localPreferred.length]}`
              added.push({ title, url: rawUrl, cover })
              setProgressValue(40 + Math.floor(((i + 1) / audioFiles.length) * 50))
            }
            localStorage.setItem('overrideTracks', JSON.stringify(added))
            setTracks(added)
            setQuery('')
            setProgressTitle('完成')
            setProgressMessage('导入完成')
            setProgressValue(100)
          } catch (e) {
            setProgressTitle('失败')
            setProgressMessage(e.message || '导入失败')
          } finally {
            setTimeout(() => { setProgressOpen(false); setSettingsOpen(false) }, 1200)
          }
        }}
        onImportApi={async ({ apiUrl }) => {
          if (!apiUrl) return
          try {
            setProgressOpen(true)
            setProgressTitle('导入中')
            setProgressMessage('正在拉取 API 歌单...')
            setProgressValue(20)
            const base = String(apiUrl || '').trim()
            const normBase = base.replace(/\/$/, '')
            const candidates = [
              `${normBase}/api/music/list`
            ]
            let data = null
            let lastErr = null
            for (const url of candidates) {
              try {
                const resp = await fetch(url, { headers: { 'accept': 'application/json' } })
                if (!resp.ok) { lastErr = new Error(`HTTP ${resp.status}`); continue }
                const ct = resp.headers.get('content-type') || ''
                if (!/json/i.test(ct)) {
                  try { data = await resp.json() } catch (e) { lastErr = new Error('非 JSON 响应'); continue }
                } else {
                  data = await resp.json()
                }
                if (data != null) break
              } catch (e) {
                lastErr = e
              }
            }
            if (data == null) throw new Error(lastErr ? lastErr.message : '无法获取到歌单，请提供 player 实例地址（形如 https://host），程序会请求 /api/music/list')
            const isPlayerStyle = data && Array.isArray(data.data)
            if (!isPlayerStyle) {
              throw new Error('仅支持 player 风格 API：需返回 { total, data: [...] }')
            }
            const items = data.data
            const sanitized = []
            const localPreferred = ['a.webp','b.webp','c.webp','d.webp','e.webp','f.webp','g.webp','h.webp','i.webp','j.webp','k.webp','l.webp','m.webp','n.webp','o.webp','p.webp','q.webp','r.webp','s.webp','t.webp','u.webp','v.webp','w.webp','x.webp','y.webp','z.webp']
            for (let i = 0; i < items.length; i++) {
              const it = items[i] || {}
              if (!it.url) continue
              let title = it.title || it.name || ''
              if (!title && it.filename) {
                const base = String(it.filename).replace(/\.[^.]+$/, '')
                title = base.replace(/\s*-\s*/g, ' - ').replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim()
              }
              if (!title) {
                title = `Track ${i + 1}`
              }
              const cover = `/covers/${localPreferred[i % localPreferred.length]}`
              sanitized.push({ title, url: it.url, cover })
            }
            if (!sanitized.length) throw new Error('API 未返回可用的歌曲项')
            localStorage.setItem('overrideTracks', JSON.stringify(sanitized))
            setTracks(sanitized)
            setQuery('')
            setProgressTitle('完成')
            setProgressMessage('API 歌单导入完成')
            setProgressValue(100)
          } catch (e) {
            setProgressTitle('失败')
            setProgressMessage(e.message || '导入失败')
          } finally {
            setTimeout(() => { setProgressOpen(false); setSettingsOpen(false) }, 1200)
          }
        }}
        onResetPlaylist={async () => {
          try {
            localStorage.removeItem('overrideTracks')
            localStorage.removeItem('extraTracks')
            localStorage.removeItem('deletedUrls')
            localStorage.removeItem('deletedTitles')
          } catch {}
          setQuery('')
          await loadManifest()
          setCurrentIndex(0)
          setSettingsOpen(false)
        }}
        onWebDavUpload={async () => {
          try {
            setProgressOpen(true)
            setProgressTitle('上传中')
            setProgressMessage('正在通过 WebDAV 分批上传...')
            setProgressValue(10)
            let cursor = 0
            let total = 0
            let uploaded = 0
          let skipped = 0
            const step = 3
            while (true) {
              const res = await fetch('/api/webdav', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'upload', cursor, limit: step }) })
              const ok = res.status === 200 || res.status === 207
              if (!ok) {
                const t = await res.text()
                throw new Error(`WebDAV 上传失败: ${t}`)
              }
              const data = await res.json()
              total = data.total || total
              uploaded += data.uploaded || 0
            skipped += data.skipped || 0
              cursor = data.nextCursor
              const prog = total ? Math.min(95, Math.floor((uploaded / total) * 90) + 5) : 50
            setProgressValue(prog)
            setProgressMessage(`已上传 ${uploaded}/${total || '?'}，已跳过 ${skipped} ...`)
              if (cursor == null) break
            }
            setProgressValue(100)
            setProgressTitle('完成')
          setProgressMessage(`已上传 ${uploaded}/${total}，已跳过 ${skipped}`)
          } catch (e) {
            setProgressTitle('失败')
            setProgressMessage(e.message || 'WebDAV 上传失败')
          } finally {
            setTimeout(() => { setProgressOpen(false) }, 1200)
          }
        }}
        onWebDavRestore={async () => {
          try {
            setProgressOpen(true)
            setProgressTitle('恢复中')
            setProgressMessage('正在从 WebDAV 分批恢复到仓库...')
            setProgressValue(10)
            let cursor = 0
            let total = 0
            let restored = 0
          let skipped = 0
            const step = 3
            while (true) {
              const res = await fetch('/api/webdav', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', cursor, limit: step }) })
              const ok = res.status === 200 || res.status === 207
              if (!ok) {
                const t = await res.text()
                throw new Error(`WebDAV 恢复失败: ${t}`)
              }
              const data = await res.json()
              total = data.total || total
              restored += data.restored || 0
            skipped += data.skipped || 0
              cursor = data.nextCursor
              const prog = total ? Math.min(95, Math.floor((restored / total) * 90) + 5) : 50
            setProgressValue(prog)
            setProgressMessage(`已恢复 ${restored}/${total || '?'}，已跳过 ${skipped} ...`)
              if (cursor == null) break
            }
            setProgressValue(100)
            setProgressTitle('完成')
          setProgressMessage(`已恢复 ${restored}/${total}，已跳过 ${skipped}`)
            await loadManifest()
          } catch (e) {
            setProgressTitle('失败')
            setProgressMessage(e.message || 'WebDAV 恢复失败')
          } finally {
            setTimeout(() => { setProgressOpen(false) }, 1200)
          }
        }}
      />
      </Suspense>
      <Suspense fallback={null}>
      <Progress
        open={progressOpen}
        title={progressTitle}
        message={progressMessage}
        progress={progressValue}
        onCancel={() => setProgressOpen(false)}
      />
      </Suspense>
      <footer>
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          {showBadges ? (
            [
              { href: 'https://blog.wedp.dpdns.org/jpg/wx.webp', src: 'https://img.shields.io/badge/微信-zxlwq-07C160.svg?logo=wechat', alt: '微信' },
              { href: 'https://t.me/zxlwq', src: 'https://img.shields.io/badge/Telegram-zxlwq-0088CC.svg?logo=telegram&logoColor=0088CC', alt: 'Telegram' },
              { href: 'https://github.com/zxlwq/music', src: 'https://img.shields.io/badge/GitHub-Repo-black.svg?logo=github&logoColor=white', alt: 'GitHub Repo' },
              { href: 'https://pages.cloudflare.com/', src: 'https://img.shields.io/badge/Cloudflare-Pages-orange.svg?logo=cloudflare&logoColor=F38020', alt: 'Cloudflare Pages' },
              { href: 'https://www.bilibili.com/', src: 'https://img.shields.io/badge/Bilibili-zxlwq-FF69B4.svg?logo=bilibili&logoColor=FF69B4', alt: 'Bilibili' },
              { href: 'https://www.youtube.com/@zxlwq', src: 'https://img.shields.io/badge/YouTube-zxlwq-FF0000.svg?logo=youtube&logoColor=FF0000', alt: 'YouTube' },
              { href: 'https://www.instagram.com/zxlwq', src: 'https://img.shields.io/badge/Instagram-zxlwq-E4405F.svg?logo=instagram&logoColor=E4405F', alt: 'Instagram' }
            ].map((badge, index) => (
              <a key={index} href={badge.href} target="_blank" rel="noopener noreferrer">
                <img loading="lazy" referrerPolicy="no-referrer" src={badge.src} alt={badge.alt} />
              </a>
            ))
          ) : null}
        </div>
      </footer>
    </div>
  )
}


