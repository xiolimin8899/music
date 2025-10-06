import express from 'express'
import compression from 'compression'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import multer from 'multer'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(compression({
  threshold: 1024,
  level: 6
}))
app.use(express.json({ limit: '50mb' }))
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } })

const distDir = path.join(__dirname, 'dist')
const publicDir = path.join(__dirname, 'public')
app.use('/public', express.static(publicDir, { maxAge: '1d', etag: true }))
app.use(express.static(distDir, {
  setHeaders(res, filePath) {
    try {
      const rel = path.relative(distDir, filePath).replace(/\\/g, '/')
      const isHashed = /\.[a-f0-9]{8,}\.[a-z0-9]+$/i.test(rel)
      if (isHashed) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        return
      }
      if (/^(images|covers)\//.test(rel)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        return
      } else if (/^assets\//.test(rel)) {
        res.setHeader('Cache-Control', 'public, max-age=86400')
      }
    } catch {}
  }
}))

const toBase64 = (buf) => Buffer.from(buf).toString('base64')
app.get('/manifest.json', (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=60')
    const fsPathDist = path.join(distDir, 'manifest.json')
    const fsPathPub = path.join(publicDir, 'manifest.json')
    const target = fs.existsSync(fsPathDist) ? fsPathDist : fsPathPub
    return res.sendFile(target)
  } catch (e) {
    return res.status(404).end()
  }
})

const AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg', '.opus', '.webm']
const isAudio = (name) => AUDIO_EXTS.some(ext => String(name || '').toLowerCase().endsWith(ext))

app.post('/api/fetch', async (req, res) => {
  try {
    const { url, action } = req.body || {}

    if (action === 'getConfig') {
      const customProxyUrl = process.env.GIT_URL || ''
      const hasCustomProxy = !!customProxyUrl
      return res.json({ customProxyUrl, hasCustomProxy })
    }

    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Missing url' })
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari' }
    const upstream = await fetch(url, { redirect: 'follow', headers })
    if (!upstream.ok) return res.status(upstream.status).json({ error: `Upstream ${upstream.status}` })
    const arrayBuf = await upstream.arrayBuffer()
    const base64 = toBase64(Buffer.from(arrayBuf))
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    res.json({ base64, contentType })
  } catch (e) {
    res.status(500).json({ error: e.message || 'proxy error' })
  }
})

app.get('/api/audio', async (req, res) => {
  try {
    const { url } = req.query
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Missing url parameter' })
    
    const headers = { 
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/aac,audio/m4a,audio/webm,audio/*,*/*;q=0.9',
      'Accept-Encoding': 'identity',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
      'Referer': 'https://github.com/',
      'Origin': 'https://github.com'
    }
    
    if (req.headers.range) {
      headers['Range'] = req.headers.range
    }
    
    console.log(`Audio proxy request: ${url}`)
    
    let upstream
    let retryCount = 0
    const maxRetries = 2
    
    while (retryCount <= maxRetries) {
      try {
        upstream = await fetch(url, { 
          redirect: 'follow', 
          headers,
          signal: AbortSignal.timeout(30000)
        })
        break
      } catch (error) {
        retryCount++
        if (retryCount > maxRetries) {
          throw error
        }
        console.log(`Retry ${retryCount}/${maxRetries} for ${url}`)
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    if (!upstream.ok) {
      console.error(`Upstream failed: ${upstream.status} ${upstream.statusText}`)
      return res.status(upstream.status).json({ error: `Upstream ${upstream.status}` })
    }
    
    const contentType = upstream.headers.get('content-type') || 'audio/mpeg'
    const contentLength = upstream.headers.get('content-length')
    const acceptRanges = upstream.headers.get('accept-ranges') || 'bytes'
    const contentRange = upstream.headers.get('content-range')
    
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=7200, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Range, If-Range',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
      'Accept-Ranges': acceptRanges,
      'X-Content-Type-Options': 'nosniff'
    })
    
    if (contentLength) res.set('Content-Length', contentLength)
    if (contentRange) res.set('Content-Range', contentRange)
    
    if (upstream.body) {
      const reader = upstream.body.getReader()
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(value)
          }
          res.end()
        } catch (error) {
          console.error('Stream error:', error)
          if (!res.headersSent) {
            res.status(500).json({ error: 'Stream error' })
          } else {
            res.end()
          }
        }
      }
      pump()
    } else {
      res.status(500).json({ error: 'No response body' })
    }
    
  } catch (e) {
    console.error('Audio proxy error:', e)
    if (!res.headersSent) {
      res.status(500).json({ error: e.message || 'audio proxy error' })
    }
  }
})

app.get('/api/music/list', async (req, res) => {
  try {
    const repoFull = process.env.GIT_REPO
    const token = process.env.GIT_TOKEN
    const branch = process.env.GIT_BRANCH || 'main'
    if (!repoFull || !token) return res.status(500).json({ error: 'Server not configured: GIT_REPO/GIT_TOKEN missing' })
    const [owner, repo] = String(repoFull).split('/')
    const api = `https://api.github.com/repos/${owner}/${repo}/contents/public/music?ref=${encodeURIComponent(branch)}`
    const gh = await fetch(api, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'web-music-player/0.1' } })
    if (!gh.ok) return res.status(gh.status).json({ error: `GitHub list failed: ${gh.status} ${await gh.text()}` })
    const items = await gh.json()
    const files = (Array.isArray(items) ? items : []).filter(it => it && it.type === 'file' && isAudio(it.name))
    const tracks = files.map((f) => ({
      title: (f.name || '').replace(/\.[^.]+$/, '').replace(/\s*-\s*/g, ' - ').replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim() || f.name,
      url: f.download_url || `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/public/music/${encodeURIComponent(f.name)}`
    }))
    res.set('Cache-Control', 'no-store')
    res.json({ ok: true, tracks })
  } catch (e) {
    res.status(500).json({ error: e.message || 'list error' })
  }
})

app.post('/api/password', async (req, res) => {
  try {
    const { password } = req.body || {}
    const expected = process.env.PASSWORD || ''
    if (!expected) return res.status(500).json({ error: 'PASSWORD not configured on server' })
    const ok = String(password || '') === String(expected)
    return res.json({ ok })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'password verify error' })
  }
})

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const { fileName, base64, sourceUrl } = req.body || {}
    if (!fileName) return res.status(400).json({ error: 'Missing fileName' })
    const repoFull = process.env.GIT_REPO
    const token = process.env.GIT_TOKEN
    const branch = process.env.GIT_BRANCH || 'main'
    if (!repoFull || !token) return res.status(500).json({ error: 'Server not configured: GIT_REPO/GIT_TOKEN missing' })
    const [owner, repo] = String(repoFull).split('/')
    const encodedName = encodeURIComponent(fileName)
    const metaApi = `https://api.github.com/repos/${owner}/${repo}/contents/public/music/${encodedName}?ref=${encodeURIComponent(branch)}`
    const meta = await fetch(metaApi, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'web-music-player/0.1' } })
    if (meta.status === 200) {
      return res.status(409).json({ error: 'File already exists', exists: true })
    }
    let contentB64 = base64
    if (!contentB64 && req.file && req.file.buffer) {
      contentB64 = Buffer.from(req.file.buffer).toString('base64')
    }
    if (!contentB64) {
      if (!sourceUrl) return res.status(400).json({ error: 'Missing base64 or sourceUrl' })
      try {
        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(), 15000)
        const upstream = await fetch(sourceUrl, { redirect: 'follow', signal: ac.signal, headers: { 'User-Agent': 'web-music-player/0.1', 'Accept': 'application/octet-stream' } })
        clearTimeout(timer)
        if (!upstream.ok) return res.status(502).json({ error: `Fetch source failed: ${upstream.status}` })
        const arrayBuf = await upstream.arrayBuffer()
        contentB64 = Buffer.from(arrayBuf).toString('base64')
      } catch (e) {
        return res.status(502).json({ error: e.message || 'Fetch source error' })
      }
    }
    const api = `https://api.github.com/repos/${owner}/${repo}/contents/public/music/${encodedName}`
    const putRes = await fetch(api, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'web-music-player/0.1'
      },
      body: JSON.stringify({ message: `Add music: ${fileName}`, content: contentB64, branch })
    })
    if (!putRes.ok) return res.status(putRes.status).json({ error: await putRes.text() })
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/public/music/${encodedName}`
    return res.json({ ok: true, rawUrl })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'upload error' })
  }
})

app.post('/api/exists', async (req, res) => {
  try {
    const { fileName } = req.body || {}
    if (!fileName) return res.status(400).json({ error: 'Missing fileName' })
    const repoFull = process.env.GIT_REPO
    const token = process.env.GIT_TOKEN
    const branch = process.env.GIT_BRANCH || 'main'
    if (!repoFull || !token) return res.status(500).json({ error: 'Server not configured: GIT_REPO/GIT_TOKEN missing' })
    const [owner, repo] = String(repoFull).split('/')
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/public/music/${encodeURIComponent(fileName)}`
    let exists = false
    try {
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), 2000)
      const head = await fetch(rawUrl, { method: 'HEAD', signal: ac.signal })
      clearTimeout(t)
      if (head.status === 200) exists = true
      if (head.status === 404) exists = false
    } catch {}
    if (exists === false) {
    } else if (exists === true) {
    } else {
      const metaApi = `https://api.github.com/repos/${owner}/${repo}/contents/public/music/${encodeURIComponent(fileName)}?ref=${encodeURIComponent(branch)}`
      const meta = await fetch(metaApi, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'web-music-player/0.1' } })
      exists = (meta.status === 200)
    }
    res.set('Cache-Control', 'no-store')
    return res.json({ ok: true, exists })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'exists check error' })
  }
})

function extractPathFromRawUrl(url) {
  try {
    const u = new URL(url)
    if (u.hostname === 'raw.githubusercontent.com') {
      const parts = u.pathname.split('/').filter(Boolean)
      if (parts.length >= 4) return decodeURIComponent(parts.slice(3).join('/'))
    }
  } catch {}
  return null
}

app.post('/api/delete', async (req, res) => {
  try {
    const { filePath, rawUrl } = req.body || {}
    const repoFull = process.env.GIT_REPO
    const token = process.env.GIT_TOKEN
    const branch = process.env.GIT_BRANCH || 'main'
    if (!repoFull || !token) return res.status(500).json({ error: 'Server not configured: GIT_REPO/GIT_TOKEN missing' })

    let pathInRepo = String(filePath || '').replace(/^\/+/, '')
    if (!pathInRepo && rawUrl) {
      const extracted = extractPathFromRawUrl(rawUrl)
      if (extracted) pathInRepo = extracted
    }
    if (!pathInRepo) return res.status(400).json({ error: 'Missing filePath or rawUrl' })
    if (!/^public\/music\//.test(pathInRepo)) return res.status(400).json({ error: 'Refusing to delete outside public/music' })

    const [owner, repo] = String(repoFull).split('/')
    const metaApi = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(pathInRepo)}?ref=${encodeURIComponent(branch)}`
    const metaRes = await fetch(metaApi, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'web-music-player/0.1' } })
    if (metaRes.status === 404) return res.json({ ok: true, skipped: true, message: 'File not found' })
    if (!metaRes.ok) return res.status(metaRes.status).json({ error: `Meta fetch failed: ${metaRes.status} ${await metaRes.text()}` })
    const meta = await metaRes.json()
    const sha = meta.sha
    if (!sha) return res.status(500).json({ error: 'File SHA not found' })

    const delApi = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(pathInRepo)}`
    const body = { message: `Delete music: ${pathInRepo}`, sha, branch }
    const delRes = await fetch(delApi, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'web-music-player/0.1' }, body: JSON.stringify(body) })
    if (!delRes.ok) return res.status(delRes.status).json({ error: `Delete failed: ${delRes.status} ${await delRes.text()}` })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message || 'delete error' })
  }
})

async function listGithubMusic({ repoFull, token, branch, pathInRepo = 'public/music' }) {
  const [owner, repo] = String(repoFull).split('/')
  const segs = String(pathInRepo || 'public/music').replace(/^\/+|\/+$/g, '')
  const part = segs ? '/' + segs.split('/').map(encodeURIComponent).join('/') : ''
  const api = `https://api.github.com/repos/${owner}/${repo}/contents${part}?ref=${encodeURIComponent(branch)}`
  const res = await fetch(api, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'web-music-player/0.1' } })
  if (!res.ok) throw new Error(`GitHub list failed: ${res.status} ${await res.text()}`)
  const items = await res.json()
  return (Array.isArray(items) ? items : []).filter(it => it && it.type === 'file' && isAudio(it.name))
}

function resolveMusicBase(base) {
  const b = String(base || '').replace(/\/+$/g, '')
  return `${b}/music`
}
function joinUrl(base, name) {
  const b = resolveMusicBase(base).replace(/\/+$/g, '')
  const n = encodeURIComponent(name)
  return `${b}/${n}`
}
function buildBasicAuth(user, pass) {
  try {
    const bytes = new TextEncoder().encode(`${user}:${pass}`)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return 'Basic ' + Buffer.from(binary, 'binary').toString('base64')
  } catch {
    return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
  }
}
async function webdavPropfind({ baseUrl, user, pass }) {
  const url = resolveMusicBase(baseUrl).replace(/\/+$/g, '') + '/'
  const resp = await fetch(url, { method: 'PROPFIND', headers: { 'Depth': '1', 'Authorization': buildBasicAuth(user, pass) } })
  if (!resp.ok) throw new Error(`WebDAV PROPFIND failed: ${resp.status} ${await resp.text()}`)
  const text = await resp.text()
  const hrefs = Array.from(text.matchAll(/<\s*[^:>]*:?href\s*>\s*([^<]+)\s*<\s*\/\s*[^:>]*:?href\s*>/ig)).map(m => m[1])
  const names = []
  try {
    const base = new URL(url)
    for (const h of hrefs) {
      try {
        const u = new URL(h, base)
        const pathname = decodeURIComponent(u.pathname)
        const segs = pathname.split('/').filter(Boolean)
        const last = segs.pop() || ''
        if (last && isAudio(last)) names.push(last)
      } catch {}
    }
  } catch {}
  return Array.from(new Set(names))
}

// /api/webdav: upload/restore with pagination
app.post('/api/webdav', async (req, res) => {
  try {
    const { action, cursor, limit } = req.body || {}
    const repoFull = process.env.GIT_REPO
    const token = process.env.GIT_TOKEN
    const branch = process.env.GIT_BRANCH || 'main'
    const wUrl = process.env.WEBDAV_URL
    const wUser = process.env.WEBDAV_USER
    const wPass = process.env.WEBDAV_PASS
    if (!repoFull || !token) return res.status(500).json({ error: 'Server not configured: GIT_REPO/GIT_TOKEN missing' })
    if (!wUrl || !wUser || !wPass) return res.status(500).json({ error: 'Server not configured: WEBDAV_URL/WEBDAV_USER/WEBDAV_PASS missing' })

    if (action === 'upload') {
      const files = await listGithubMusic({ repoFull, token, branch })
      if (!files.length) return res.json({ ok: true, total: 0, processed: 0, uploaded: 0, nextCursor: null })
      // existing names on WebDAV to skip
      let existing = []
      try { existing = await webdavPropfind({ baseUrl: wUrl, user: wUser, pass: wPass }) } catch {}
      const existingSet = new Set(existing)
      const start = Math.max(0, Number(cursor) || 0)
      const step = Math.max(1, Math.min(Number(limit) || 3, 10))
      const slice = files.slice(start, start + step)
      let uploaded = 0
      let skipped = 0
      const errors = []
      for (const f of slice) {
        const name = f.name
        try {
          if (existingSet.has(name)) { skipped++; continue }
          const dl = f.download_url || `https://raw.githubusercontent.com/${repoFull}/${encodeURIComponent(branch)}/public/music/${encodeURIComponent(name)}`
          const r = await fetch(dl, { headers: { 'User-Agent': 'web-music-player/0.1', 'Accept': 'application/octet-stream' } })
          if (!r.ok) throw new Error(`Fetch file failed: ${r.status}`)
          const buf = Buffer.from(await r.arrayBuffer())
          const put = await fetch(joinUrl(wUrl, name), { method: 'PUT', headers: { 'Authorization': buildBasicAuth(wUser, wPass), 'Content-Type': 'application/octet-stream', 'Overwrite': 'T' }, body: buf })
          if (!put.ok) throw new Error(`WebDAV PUT failed: ${put.status}`)
          uploaded++
        } catch (e) {
          errors.push({ file: f.name, error: e?.message || String(e) })
        }
      }
      const nextCursor = (start + step) < files.length ? (start + step) : null
      const processed = slice.length
      const status = errors.length === processed ? 500 : (errors.length ? 207 : 200)
      return res.status(status).json({ ok: errors.length === 0, total: files.length, processed, uploaded, skipped, nextCursor, errors })
    }

    if (action === 'restore') {
      const names = await webdavPropfind({ baseUrl: wUrl, user: wUser, pass: wPass })
      if (!names.length) return res.json({ ok: true, total: 0, processed: 0, restored: 0, nextCursor: null })
      // existing in GitHub to skip
      let ghExisting = []
      try { ghExisting = (await listGithubMusic({ repoFull, token, branch }))?.map(f => f.name) || [] } catch {}
      const ghSet = new Set(ghExisting)
      const start = Math.max(0, Number(cursor) || 0)
      const step = Math.max(1, Math.min(Number(limit) || 3, 10))
      const slice = names.slice(start, start + step)
      let restored = 0
      let skipped = 0
      const errors = []
      for (const name of slice) {
        try {
          if (ghSet.has(name)) { skipped++; continue }
          const r = await fetch(joinUrl(wUrl, name), { headers: { 'Authorization': buildBasicAuth(wUser, wPass) } })
          if (!r.ok) throw new Error(`WebDAV GET failed: ${r.status}`)
          const buf = Buffer.from(await r.arrayBuffer())
          const base64 = toBase64(buf)
          const [owner, repo] = String(repoFull).split('/')
          const api = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent('public/music/' + name)}`
          const putRes = await fetch(api, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'web-music-player/0.1' }, body: JSON.stringify({ message: `Sync via WebDAV: public/music/${name}`, content: base64, branch }) })
          if (!putRes.ok) throw new Error(`GitHub PUT failed: ${putRes.status}`)
          restored++
        } catch (e) {
          errors.push({ file: name, error: e?.message || String(e) })
        }
      }
      const nextCursor = (start + step) < names.length ? (start + step) : null
      const processed = slice.length
      const status = errors.length === processed ? 500 : (errors.length ? 207 : 200)
      return res.status(status).json({ ok: errors.length === 0, total: names.length, processed, restored, skipped, nextCursor, errors })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (e) {
    res.status(500).json({ error: e.message || 'webdav error' })
  }
})

app.get('*', (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
})


