const AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg', '.opus', '.webm']
const isAudio = (name) => AUDIO_EXTS.some(ext => String(name || '').toLowerCase().endsWith(ext))

// 创建带备用代理的 fetch 函数
function createProxyFetch(proxyUrl) {
  if (!proxyUrl) return fetch
  
  return async (url, options = {}) => {
    // 如果 URL 是 GitHub API，先尝试直接请求，失败时使用代理
    if (url.includes('api.github.com') || url.includes('raw.githubusercontent.com')) {
      try {
        // 先尝试直接请求
        const directResponse = await fetch(url, options)
        if (directResponse.ok) {
          return directResponse
        }
        console.log(`[list] Direct request failed (${directResponse.status}), trying proxy...`)
      } catch (error) {
        console.log(`[list] Direct request error: ${error.message}, trying proxy...`)
      }
      
      // 直接请求失败，使用代理
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
      
      console.log(`[list] Using proxy: ${proxiedUrl}`)
      return fetch(proxiedUrl, proxyOptions)
    }
    
    // 非 GitHub 请求直接使用原始 fetch
    return fetch(url, options)
  }
}

export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const repoFull = process.env.GIT_REPO
    const token = process.env.GIT_TOKEN
    const branch = process.env.GIT_BRANCH || 'main'
    
    // 获取代理配置
    const proxyUrl = process.env.GIT_URL
    const proxyFetch = createProxyFetch(proxyUrl)
    
    // 详细的错误信息
    if (!repoFull) {
      return res.status(500).json({ 
        error: 'GIT_REPO environment variable not configured',
        details: 'Please set GIT_REPO in Vercel environment variables'
      })
    }
    
    if (!token) {
      return res.status(500).json({ 
        error: 'GIT_TOKEN environment variable not configured',
        details: 'Please set GIT_TOKEN in Vercel environment variables'
      })
    }
    
    const [owner, repo] = String(repoFull).split('/')
    
    // 验证仓库格式
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
        'User-Agent': 'web-music-player/0.1 (Vercel Function)'
      }
    })
    
    if (!gh.ok) {
      const errorText = await gh.text()
      let errorDetails = `GitHub API error: ${gh.status}`
      
      // 提供更友好的错误信息
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
    
    res.status(200).json({ ok: true, tracks })
  } catch (e) {
    console.error('Music list error:', e)
    res.status(500).json({ error: e.message || 'list error' })
  }
}
