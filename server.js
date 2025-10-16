import express from 'express'
import compression from 'compression'
import multer from 'multer'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000

app.use(compression())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
  } else {
    next()
  }
})

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024
  }
})

function arrayBufferToBase64(buf) {
  try {
    const bytes = new Uint8Array(buf)
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const sub = bytes.subarray(i, i + chunkSize)
      binary += String.fromCharCode.apply(null, sub)
    }
    return btoa(binary)
  } catch (e) {
    let binary = ''
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  }
}

function createProxyFetch(proxyUrl) {
  if (!proxyUrl) return fetch
  
  return async (url, options = {}) => {
    if (url.includes('api.github.com') || url.includes('raw.githubusercontent.com')) {
      try {
        const directResponse = await fetch(url, options)
        if (directResponse.ok) {
          return directResponse
        }
        console.log(`Direct request failed (${directResponse.status}), trying proxy...`)
      } catch (error) {
        console.log(`Direct request error: ${error.message}, trying proxy...`)
      }
      
      const targetUrl = encodeURIComponent(url)
      const proxiedUrl = `${proxyUrl}?target=${targetUrl}`
      
      const proxyOptions = {
        ...options,
        headers: {
          ...options.headers,
          'X-Target-URL': url,
          'X-Proxy-Type': 'github-api'
        }
      }
      
      console.log(`Using proxy: ${proxiedUrl}`)
      return fetch(proxiedUrl, proxyOptions)
    }
    
    return fetch(url, options)
  }
}

const AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg', '.opus', '.webm']
const isAudio = (name) => AUDIO_EXTS.some(ext => String(name || '').toLowerCase().endsWith(ext))

app.get('/api/music/list', async (req, res) => {
  try {
    const repoFull = process.env.GIT_REPO
    const token = process.env.GIT_TOKEN
    const branch = process.env.GIT_BRANCH || 'main'
    const proxyUrl = process.env.GIT_URL
    const proxyFetch = createProxyFetch(proxyUrl)
    
    if (!repoFull) {
      return res.status(500).json({ 
        error: 'GIT_REPO environment variable not configured',
        details: 'Please set GIT_REPO in environment variables'
      })
    }
    
    if (!token) {
      return res.status(500).json({ 
        error: 'GIT_TOKEN environment variable not configured',
        details: 'Please set GIT_TOKEN in environment variables'
      })
    }
    
    const [owner, repo] = String(repoFull).split('/')
    
    if (!owner || !repo) {
      return res.status(400).json({ 
        error: 'Invalid GIT_REPO format',
        details: 'GIT_REPO should be in format "owner/repo"',
        provided: repoFull
      })
    }
    
    const api = `https://api.github.com/repos/${owner}/${repo}/contents/public/music?ref=${encodeURIComponent(branch)}`
    const gh = await proxyFetch(api, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'web-music-player/0.1 (Express Server)'
      }
    })
    
    if (!gh.ok) {
      const errorText = await gh.text()
      let errorDetails = `GitHub API error: ${gh.status}`
      
      if (gh.status === 401) {
        errorDetails = 'GitHub token is invalid or expired'
      } else if (gh.status === 403) {
        errorDetails = 'GitHub token lacks repository access permissions'
      } else if (gh.status === 404) {
        errorDetails = 'Repository not found or public/music directory does not exist'
      }
      
      return res.status(gh.status).json({ 
        error: errorDetails,
        status: gh.status,
        details: errorText,
        api_url: api
      })
    }
    
    const items = await gh.json()
    const files = (Array.isArray(items) ? items : []).filter(it => it && it.type === 'file' && isAudio(it.name))
    const tracks = files.map((f) => ({
      title: (f.name || '').replace(/\.[^.]+$/, '').replace(/\s*-\s*/g, ' - ').replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim() || f.name,
      url: f.download_url || `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/public/music/${encodeURIComponent(f.name)}`
    }))
    
    res.json({ ok: true, tracks })
  } catch (e) {
    console.error('Music list error:', e)
    res.status(500).json({ error: e.message || 'list error' })
  }
})

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const ct = req.headers['content-type'] || ''
    let fileName = ''
    let base64 = ''
    let sourceUrl = ''
    
    const proxyUrl = process.env.GIT_URL
    const proxyFetch = createProxyFetch(proxyUrl)

    if (/multipart\/form-data/i.test(ct)) {
      fileName = String(req.body.fileName || '').trim()
      const file = req.file
      if (!fileName && file && file.originalname) fileName = file.originalname
      if (!fileName) {
        return res.status(400).json({ error: 'Missing fileName' })
      }
      if (file && file.buffer) {
        base64 = arrayBufferToBase64(file.buffer)
      } else {
        return res.status(400).json({ error: 'Missing file data' })
      }
    } else {
      const body = req.body
      fileName = body?.fileName || ''
      base64 = body?.base64 || ''
      sourceUrl = body?.sourceUrl || ''
      if (!fileName) {
        return res.status(400).json({ error: 'Missing fileName' })
      }
    }
    
    const repoFull = process.env.GIT_REPO
    const token = process.env.GIT_TOKEN
    const branch = process.env.GIT_BRANCH || 'main'
    
    if (!repoFull || !token) {
      return res.status(500).json({ error: 'Server not configured: GIT_REPO/GIT_TOKEN missing' })
    }
    
    const [owner, repo] = String(repoFull).split('/')
    const encodedName = encodeURIComponent(fileName)
    const metaApi = `https://api.github.com/repos/${owner}/${repo}/contents/public/music/${encodedName}?ref=${encodeURIComponent(branch)}`
    const meta = await proxyFetch(metaApi, { 
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Accept': 'application/vnd.github+json', 
        'User-Agent': 'web-music-player/0.1 (Express Server)' 
      } 
    })
    
    if (meta.status === 200) {
      return res.status(409).json({ error: 'File already exists', exists: true })
    }
    
    let contentB64 = base64
    if (!contentB64) {
      if (!sourceUrl) {
        return res.status(400).json({ error: 'Missing base64 or sourceUrl' })
      }
      try {
        const ac = new AbortController()
        const t = setTimeout(() => ac.abort(), 30000)
        const upstream = await proxyFetch(sourceUrl, { 
          redirect: 'follow', 
          signal: ac.signal, 
          headers: { 
            'User-Agent': 'web-music-player/0.1', 
            'Accept': 'application/octet-stream' 
          } 
        })
        clearTimeout(t)
        if (!upstream.ok) {
          const text = await upstream.text().catch(() => '')
          return res.status(502).json({ error: `Fetch source failed: ${upstream.status} ${text || ''}`.trim() })
        }
        const buf = await upstream.arrayBuffer()
        contentB64 = arrayBufferToBase64(buf)
      } catch (e) {
        return res.status(502).json({ error: e.message || 'Fetch source error' })
      }
    }
    
    const api = `https://api.github.com/repos/${owner}/${repo}/contents/public/music/${encodedName}`
    const putRes = await proxyFetch(api, { 
      method: 'PUT', 
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Accept': 'application/vnd.github+json', 
        'Content-Type': 'application/json', 
        'User-Agent': 'web-music-player/0.1 (Express Server)' 
      }, 
      body: JSON.stringify({ 
        message: `Add music: ${fileName}`, 
        content: contentB64, 
        branch 
      }) 
    })
    
    if (!putRes.ok) {
      const t = await putRes.text()
      return res.status(putRes.status).json({ error: t })
    }
    
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/public/music/${encodedName}`
    res.json({ ok: true, rawUrl })
  } catch (e) {
    console.error('Upload error:', e)
    res.status(500).json({ error: e.message || 'upload error' })
  }
})

app.post('/api/delete', async (req, res) => {
  try {
    const { filePath, rawUrl, password } = req.body
    const expectedPassword = process.env.PASSWORD || ''
    
    if (expectedPassword) {
      const ok = String(password || '') === String(expectedPassword)
      if (!ok) {
        return res.status(401).json({ 
          error: 'Unauthorized', 
          code: 'INVALID_PASSWORD' 
        })
      }
    }
    
    const repoFull = process.env.GIT_REPO
    const token = process.env.GIT_TOKEN
    const branch = process.env.GIT_BRANCH || 'main'
    const proxyUrl = process.env.GIT_URL
    const proxyFetch = createProxyFetch(proxyUrl)

    if (!repoFull || !token) {
      return res.status(500).json({ error: 'Server not configured: GIT_REPO/GIT_TOKEN missing' })
    }

    let pathInRepo = String(filePath || '').replace(/^\/+/, '')
    if (!pathInRepo && rawUrl) {
      try {
        const u = new URL(rawUrl)
        if (u.hostname === 'raw.githubusercontent.com') {
          const parts = u.pathname.split('/').filter(Boolean)
          if (parts.length >= 4) {
            const rest = parts.slice(3).join('/')
            pathInRepo = decodeURIComponent(rest)
          }
        }
      } catch {}
    }
    
    if (!pathInRepo) {
      return res.status(400).json({ error: 'Missing filePath or rawUrl' })
    }

    if (!/^public\/music\//.test(pathInRepo)) {
      return res.status(400).json({ error: 'Refusing to delete outside public/music' })
    }

    const [owner, repo] = String(repoFull).split('/')
    const metaApi = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(pathInRepo)}?ref=${encodeURIComponent(branch)}`

    const metaRes = await proxyFetch(metaApi, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'web-music-player/0.1 (Express Server)'
      }
    })
    
    if (metaRes.status === 404) {
      return res.json({ ok: true, skipped: true, message: 'File not found' })
    }
    
    if (!metaRes.ok) {
      const t = await metaRes.text()
      return res.status(metaRes.status).json({ error: `Meta fetch failed: ${metaRes.status} ${t}` })
    }
    
    const meta = await metaRes.json()
    const sha = meta.sha
    if (!sha) {
      return res.status(500).json({ error: 'File SHA not found' })
    }

    const delApi = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(pathInRepo)}`
    const body = {
      message: `Delete music: ${pathInRepo}`,
      sha,
      branch
    }
    
    const delRes = await proxyFetch(delApi, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'web-music-player/0.1 (Express Server)'
      },
      body: JSON.stringify(body)
    })
    
    if (!delRes.ok) {
      const t = await delRes.text()
      return res.status(delRes.status).json({ error: `Delete failed: ${delRes.status} ${t}` })
    }

    res.json({ ok: true })
  } catch (e) {
    console.error('Delete error:', e)
    res.status(500).json({ error: e.message || 'delete error' })
  }
})

app.get('/api/audio', async (req, res) => {
  try {
    const target = req.query.url

    if (!target) {
      return res.status(400).json({ error: 'Missing url parameter' })
    }

    const incomingRange = req.headers.range
    const isRangeRequest = !!incomingRange

    const reqHeaders = new Headers()
    
    // 检测是否为移动端Chrome请求
    const userAgent = req.headers['user-agent'] || ''
    const isMobileChrome = /Android.*Chrome/i.test(userAgent)
    
    if (isMobileChrome) {
      // 为移动端Chrome使用更兼容的User-Agent
      reqHeaders.set(
        'User-Agent',
        'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36'
      )
    } else {
      reqHeaders.set(
        'User-Agent',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      )
    }
    
    reqHeaders.set(
      'Accept',
      'audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/aac,audio/m4a,audio/webm,audio/*,*/*;q=0.9'
    )
    reqHeaders.set('Accept-Encoding', 'identity')
    reqHeaders.set('Connection', 'keep-alive')
    reqHeaders.set('Cache-Control', 'no-cache')
    reqHeaders.set('Accept-Ranges', 'bytes')
    reqHeaders.set('Range', 'bytes=0-')
    
    // 为移动端Chrome添加额外的请求头
    if (isMobileChrome) {
      reqHeaders.set('X-Requested-With', 'XMLHttpRequest')
      reqHeaders.set('Sec-Fetch-Dest', 'audio')
      reqHeaders.set('Sec-Fetch-Mode', 'cors')
      reqHeaders.set('Sec-Fetch-Site', 'cross-site')
    }

    if (incomingRange) {
      reqHeaders.set('Range', incomingRange)
      reqHeaders.set('X-Requested-With', 'Range')
    }

    try {
      const u = new URL(target)
      reqHeaders.set('Referer', `${u.origin}/`)
      reqHeaders.set('Origin', u.origin)
    } catch {}

    const maxRetries = isMobileChrome ? 2 : 1 // 移动端Chrome增加重试次数
    let lastError = null
    let upstream = null

    for (let i = 0; i <= maxRetries; i++) {
      try {
        const controller = new AbortController()
        // 为移动端Chrome增加超时时间
        const timeout = isMobileChrome ? 
          (isRangeRequest ? 15000 : 20000) : 
          (isRangeRequest ? 10000 : 15000)
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        upstream = await fetch(target, {
          redirect: 'follow',
          headers: reqHeaders,
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (upstream.ok || (upstream.status >= 200 && upstream.status < 400))
          break
        lastError = new Error(`Upstream ${upstream.status}`)
      } catch (e) {
        lastError = e
        console.warn(`Audio proxy attempt ${i + 1} failed:`, e.message)
      }
      if (i < maxRetries) {
        // 移动端Chrome需要更长的重试间隔
        const retryDelay = isMobileChrome ? 500 : 100
        await new Promise(r => setTimeout(r, retryDelay))
      }
    }

    if (!upstream || !upstream.body || upstream.status >= 400) {
      const status = upstream ? upstream.status : 502
      const msg = lastError?.message || `Upstream ${status}`
      return res.status(status).json({ error: msg })
    }

    const respHeaders = {}
    let ct = upstream.headers.get('content-type') || ''
    const cl = upstream.headers.get('content-length')
    const cr = upstream.headers.get('content-range')
    const ar = upstream.headers.get('accept-ranges') || 'bytes'

    const lowerUrl = target.toLowerCase()
    if (!ct.startsWith('audio/')) {
      if (lowerUrl.endsWith('.mp3')) ct = 'audio/mpeg'
      else if (lowerUrl.endsWith('.wav')) ct = 'audio/wav'
      else if (lowerUrl.endsWith('.ogg')) ct = 'audio/ogg'
      else if (lowerUrl.endsWith('.m4a')) ct = 'audio/mp4'
      else if (lowerUrl.endsWith('.flac')) ct = 'audio/flac'
      else ct = 'application/octet-stream'
    }

    respHeaders['Content-Type'] = ct
    if (cl) respHeaders['Content-Length'] = cl
    if (cr) respHeaders['Content-Range'] = cr
    respHeaders['Accept-Ranges'] = ar
    respHeaders['Cache-Control'] = 'public, max-age=7200, must-revalidate'
    respHeaders['Access-Control-Allow-Origin'] = '*'
    respHeaders['Access-Control-Expose-Headers'] = 'Content-Length, Content-Range, Accept-Ranges'
    respHeaders['X-Content-Type-Options'] = 'nosniff'

    const isPartial = !!incomingRange && (cr || upstream.status === 206)
    const statusCode = isPartial ? 206 : upstream.status || 200

    res.status(statusCode)
    Object.entries(respHeaders).forEach(([key, value]) => {
      res.set(key, value)
    })

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
        res.end()
      }
    }
    
    pump()
  } catch (e) {
    console.error('Audio proxy error:', e)
    res.status(500).json({ error: e.message || 'audio proxy error' })
  }
})

app.post('/api/exists', async (req, res) => {
  try {
    const { fileName } = req.body
    if (!fileName) {
      return res.status(400).json({ error: 'Missing fileName' })
    }
    
    const repoFull = process.env.GIT_REPO
    const token = process.env.GIT_TOKEN
    const branch = process.env.GIT_BRANCH || 'main'
    const proxyUrl = process.env.GIT_URL
    const proxyFetch = createProxyFetch(proxyUrl)
    
    if (!repoFull || !token) {
      return res.status(500).json({ error: 'Server not configured: GIT_REPO/GIT_TOKEN missing' })
    }
    
    const [owner, repo] = String(repoFull).split('/')
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/public/music/${encodeURIComponent(fileName)}`
    let exists
    
    try {
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), 2000)
      const head = await proxyFetch(rawUrl, { method: 'HEAD', signal: ac.signal })
      clearTimeout(t)
      if (head.status === 200) exists = true
      else if (head.status === 404) exists = false
    } catch {}
    
    if (exists === undefined) {
      const metaApi = `https://api.github.com/repos/${owner}/${repo}/contents/public/music/${encodeURIComponent(fileName)}?ref=${encodeURIComponent(branch)}`
      const meta = await proxyFetch(metaApi, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'web-music-player/0.1 (Express Server)'
        }
      })
      exists = (meta.status === 200)
    }
    
    res.json({ ok: true, exists })
  } catch (e) {
    console.error('Exists check error:', e)
    res.status(500).json({ error: e.message || 'exists check error' })
  }
})

app.post('/api/fetch', async (req, res) => {
  try {
    const body = req.body
    
    if (body.action === 'getConfig') {
      const customProxyUrl = process.env.GIT_URL || ''
      const config = {
        customProxyUrl: customProxyUrl,
        hasCustomProxy: !!customProxyUrl
      }
      
      return res.json(config)
    }
    
    if (body.action === 'customProxy') {
      const { url } = body
      const customProxyUrl = process.env.GIT_URL || ''
      
      if (!customProxyUrl) {
        return res.status(400).json({ error: 'Custom proxy not configured' })
      }
      
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'Missing url' })
      }
      
      if (!/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: 'Only http/https allowed' })
      }
      
      try {
        const proxyUrl = `${customProxyUrl}?url=${encodeURIComponent(url)}`
        console.log('[api/fetch] Custom proxy request:', { proxyUrl })
        const headers = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          'Accept': 'audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/aac,audio/m4a,audio/webm,audio/*,*/*;q=0.9',
          'Accept-Encoding': 'identity',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 20000)
        
        const upstream = await fetch(proxyUrl, { 
          redirect: 'follow', 
          headers,
          signal: controller.signal
        })
        clearTimeout(timeoutId)
        console.log('[api/fetch] Custom proxy upstream status:', upstream.status)
        if (!upstream.ok) {
          return res.status(upstream.status).json({ error: `Custom proxy upstream ${upstream.status}` })
        }
        const arrayBuf = await upstream.arrayBuffer()
        const fileSize = arrayBuf.byteLength
        const isLargeFile = fileSize > 5 * 1024 * 1024
        
        const toBase64 = async (buffer) => {
          const bytes = new Uint8Array(buffer)
          const chunkSize = isLargeFile ? 0x4000 : 0x8000
          let binary = ''
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const sub = bytes.subarray(i, i + chunkSize)
            binary += String.fromCharCode.apply(null, sub)
            if (isLargeFile && i % (chunkSize * 10) === 0) {
              await new Promise(resolve => setTimeout(resolve, 0))
            }
          }
          return btoa(binary)
        }
        const base64 = await toBase64(arrayBuf)
        const mime = upstream.headers.get('content-type') || 'application/octet-stream'
        const resp = { base64, contentType: mime }
        console.log('[api/fetch] Custom proxy success:', { bytes: arrayBuf.byteLength, contentType: mime })
        return res.json(resp)
      } catch (error) {
        console.error('[api/fetch] Custom proxy error:', error)
        return res.status(500).json({ error: `Custom proxy error: ${error.message}` })
      }
    }
    
    const { url } = body
    console.log('[api/fetch] POST invoked', { url })
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing url' })
    }
    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'Only http/https allowed' })
    }
    
    const headers = {}
    try {
      const u = new URL(url)
      headers['Referer'] = `${u.origin}/`
    } catch {}
    headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
    
    const upstream = await fetch(url, { redirect: 'follow', headers })
    console.log('[api/fetch] upstream status', upstream.status)
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream ${upstream.status}` })
    }
    
    const arrayBuf = await upstream.arrayBuffer()
    const toBase64 = (buffer) => {
      const bytes = new Uint8Array(buffer)
      const chunkSize = 0x8000
      let binary = ''
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const sub = bytes.subarray(i, i + chunkSize)
        binary += String.fromCharCode.apply(null, sub)
      }
      return btoa(binary)
    }
    const base64 = toBase64(arrayBuf)
    const mime = upstream.headers.get('content-type') || 'application/octet-stream'
    const resp = { base64, contentType: mime }
    console.log('[api/fetch] success', { bytes: arrayBuf.byteLength, contentType: mime })
    return res.json(resp)
  } catch (e) {
    console.error('[api/fetch] error', e && e.stack ? e.stack : e)
    return res.status(500).json({ error: e.message || 'proxy error' })
  }
})

app.post('/api/webdav', async (req, res) => {
  try {
    const { action, cursor, limit } = req.body
    const repoFull = process.env.GIT_REPO
    const token = process.env.GIT_TOKEN
    const branch = process.env.GIT_BRANCH || 'main'
    const wUrl = process.env.WEBDAV_URL
    const wUser = process.env.WEBDAV_USER
    const wPass = process.env.WEBDAV_PASS
    const proxyUrl = process.env.GIT_URL
    const proxyFetch = createProxyFetch(proxyUrl)

    if (!repoFull || !token) {
      return res.status(500).json({ error: 'Server not configured: GIT_REPO/GIT_TOKEN missing' })
    }
    if (!wUrl || !wUser || !wPass) {
      return res.status(500).json({ error: 'Server not configured: WEBDAV_URL/WEBDAV_USER/WEBDAV_PASS missing' })
    }

    function buildBasicAuth(user, pass) {
      try {
        const bytes = new TextEncoder().encode(`${user}:${pass}`)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        return 'Basic ' + btoa(binary)
      } catch {
        return 'Basic ' + btoa(`${user}:${pass}`)
      }
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

    async function ensureWebdavDir({ baseUrl, user, pass }) {
      const url = resolveMusicBase(baseUrl) + '/'
      const res = await fetch(url, {
        method: 'MKCOL',
        headers: {
          'Authorization': buildBasicAuth(user, pass),
          'Content-Length': '0'
        }
      })

      if (!(res.status === 201 || res.status === 405 || res.status === 409 || res.status === 301 || res.status === 302)) {
        if (!res.ok) throw new Error(`WebDAV MKCOL failed: ${res.status} ${await res.text()}`)
      }
    }

    async function listGithubMusic({ repoFull, token, branch, path = 'public/music', proxyFetch = fetch }) {
      const [owner, repo] = String(repoFull).split('/')
      const segs = String(path || 'public/music').replace(/^\/+|\/+$/g, '')
      const part = segs ? '/' + segs.split('/').map(encodeURIComponent).join('/') : ''
      const api = `https://api.github.com/repos/${owner}/${repo}/contents${part}?ref=${encodeURIComponent(branch)}`
      const res = await proxyFetch(api, { 
        headers: { 
          'Authorization': `Bearer ${token}`, 
          'Accept': 'application/vnd.github+json', 
          'User-Agent': 'web-music-player/0.1' 
        } 
      })
      if (!res.ok) throw new Error(`GitHub list failed: ${res.status} ${await res.text()}`)
      const items = await res.json()
      return (Array.isArray(items) ? items : []).filter(it => it && it.type === 'file' && isAudio(it.name))
    }

    if (action === 'upload') {
      await ensureWebdavDir({ baseUrl: wUrl, user: wUser, pass: wPass })
      const files = await listGithubMusic({ repoFull, token, branch, proxyFetch })
      if (!files.length) {
        return res.json({ ok: true, total: 0, uploaded: 0, message: 'No audio files in repo' })
      }

      let existingNames = []
      try {
        const url = resolveMusicBase(wUrl).replace(/\/+$/g, '') + '/'
        const res = await fetch(url, {
          method: 'PROPFIND',
          headers: {
            'Depth': '1',
            'Authorization': buildBasicAuth(wUser, wPass)
          }
        })
        if (res.ok) {
          const text = await res.text()
          const hrefs = Array.from(text.matchAll(/<\s*[^:>]*:?href\s*>\s*([^<]+)\s*<\s*\/\s*[^:>]*:?href\s*>/ig)).map(m => m[1])
          try {
            const base = new URL(url)
            for (const h of hrefs) {
              try {
                const u = new URL(h, base)
                const pathname = decodeURIComponent(u.pathname)
                const segs = pathname.split('/').filter(Boolean)
                const last = segs.pop() || ''
                if (last && isAudio(last)) existingNames.push(last)
              } catch {}
            }
          } catch {}
        }
      } catch {}
      
      const existingSet = new Set(existingNames || [])
      const start = Math.max(0, Number(cursor) || 0)
      const step = Math.max(1, Math.min(Number(limit) || 3, 10))
      const slice = files.slice(start, start + step)
      let done = 0
      let skipped = 0
      const errors = []
      
      for (const f of slice) {
        const name = f.name
        try {
          if (existingSet.has(name)) {
            skipped++
            continue
          }
          const downloadUrl = f.download_url || `https://raw.githubusercontent.com/${repoFull}/${encodeURIComponent(branch)}/public/music/${encodeURIComponent(name)}`
          const rawRes = await proxyFetch(downloadUrl, { 
            headers: { 
              'User-Agent': 'web-music-player/0.1', 
              'Accept': 'application/octet-stream' 
            } 
          })
          if (!rawRes.ok) {
            const t = await rawRes.text().catch(() => '')
            throw new Error(`Fetch file failed: ${rawRes.status} ${t}`)
          }
          const buf = new Uint8Array(await rawRes.arrayBuffer())

          const url = joinUrl(wUrl, name)
          const putRes = await fetch(url, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/octet-stream',
              'Authorization': buildBasicAuth(wUser, wPass),
              'Overwrite': 'T'
            },
            body: buf
          })
          if (!putRes.ok) throw new Error(`WebDAV PUT failed: ${putRes.status} ${await putRes.text()}`)
          done++
        } catch (e) {
          errors.push({ file: name, error: e && e.message ? e.message : String(e) })
        }
      }
      
      const nextCursor = (start + step) < files.length ? (start + step) : null
      const processed = slice.length
      const status = errors.length === processed ? 500 : (errors.length ? 207 : 200)
      res.status(status).json({ 
        ok: errors.length === 0, 
        total: files.length, 
        processed, 
        uploaded: done, 
        skipped, 
        nextCursor, 
        errors 
      })
    } else if (action === 'restore') {
      // 实现WebDAV恢复功能：从WebDAV下载文件并上传到GitHub
      await ensureWebdavDir({ baseUrl: wUrl, user: wUser, pass: wPass })
      
      // 获取WebDAV中的文件列表
      let webdavFiles = []
      try {
        const url = resolveMusicBase(wUrl).replace(/\/+$/g, '') + '/'
        const res = await fetch(url, {
          method: 'PROPFIND',
          headers: {
            'Depth': '1',
            'Authorization': buildBasicAuth(wUser, wPass)
          }
        })
        if (res.ok) {
          const text = await res.text()
          const hrefs = Array.from(text.matchAll(/<\s*[^:>]*:?href\s*>\s*([^<]+)\s*<\s*\/\s*[^:>]*:?href\s*>/ig)).map(m => m[1])
          try {
            const base = new URL(url)
            for (const h of hrefs) {
              try {
                const u = new URL(h, base)
                const pathname = decodeURIComponent(u.pathname)
                const segs = pathname.split('/').filter(Boolean)
                const last = segs.pop() || ''
                if (last && isAudio(last)) {
                  webdavFiles.push({ name: last, download_url: u.toString() })
                }
              } catch {}
            }
          } catch {}
        }
      } catch {}
      
      if (!webdavFiles.length) {
        return res.json({ ok: true, total: 0, restored: 0, message: 'No audio files in WebDAV' })
      }
      
      // 获取GitHub仓库中现有的文件列表
      let existingNames = []
      try {
        const files = await listGithubMusic({ repoFull, token, branch, proxyFetch })
        existingNames = files.map(f => f.name)
      } catch {}
      
      const existingSet = new Set(existingNames || [])
      const start = Math.max(0, Number(cursor) || 0)
      const step = Math.max(1, Math.min(Number(limit) || 3, 10))
      const slice = webdavFiles.slice(start, start + step)
      let done = 0
      let skipped = 0
      const errors = []
      
      for (const f of slice) {
        const name = f.name
        try {
          if (existingSet.has(name)) {
            skipped++
            continue
          }
          
          // 从WebDAV下载文件
          const downloadRes = await fetch(f.download_url, {
            headers: {
              'Authorization': buildBasicAuth(wUser, wPass),
              'User-Agent': 'web-music-player/0.1'
            }
          })
          if (!downloadRes.ok) {
            throw new Error(`WebDAV download failed: ${downloadRes.status}`)
          }
          const buf = new Uint8Array(await downloadRes.arrayBuffer())
          
          // 上传到GitHub
          const content = Buffer.from(buf).toString('base64')
          const uploadUrl = `https://api.github.com/repos/${repoFull}/contents/public/music/${encodeURIComponent(name)}`
          const uploadRes = await proxyFetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github+json',
              'User-Agent': 'web-music-player/0.1',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: `Add ${name} via WebDAV restore`,
              content: content,
              branch: branch
            })
          })
          
          if (!uploadRes.ok) {
            const errorText = await uploadRes.text()
            throw new Error(`GitHub upload failed: ${uploadRes.status} ${errorText}`)
          }
          
          done++
        } catch (e) {
          errors.push({ file: name, error: e && e.message ? e.message : String(e) })
        }
      }
      
      const nextCursor = (start + step) < webdavFiles.length ? (start + step) : null
      const processed = slice.length
      const status = errors.length === processed ? 500 : (errors.length ? 207 : 200)
      res.status(status).json({ 
        ok: errors.length === 0, 
        total: webdavFiles.length, 
        processed, 
        restored: done, 
        skipped, 
        nextCursor, 
        errors 
      })
    } else {
      res.status(400).json({ error: 'Unknown action' })
    }
  } catch (e) {
    console.error('WebDAV error:', e)
    res.status(500).json({ error: e.message || 'webdav error' })
  }
})

app.use(express.static(join(__dirname, 'dist')))
app.use('/public', express.static(join(__dirname, 'public')))

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  })
})

app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.use((err, req, res, next) => {
  console.error('Server error:', err)
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎵 Music server running on port ${PORT}`)
  console.log(`📁 Serving static files from: ${join(__dirname, 'dist')}`)
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`)
  
  // 检查必要的环境变量
  const requiredEnvVars = ['GIT_REPO', 'GIT_TOKEN', 'PASSWORD']
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName])
  
  if (missingVars.length > 0) {
    console.warn(`⚠️  Missing required environment variables: ${missingVars.join(', ')}`)
    console.warn('   Some features may not work properly')
  } else {
    console.log('✅ All required environment variables are set')
  }
})

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully')
  process.exit(0)
})
