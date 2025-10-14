export const deleteTrack = async (filePath, rawUrl, password) => {
  const res = await fetch('/api/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, rawUrl, password: password || '' })
  })
  
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`删除失败：${res.status} ${t}`)
  }
  
  return res
}

export const uploadTrack = async (formData) => {
  const res = await fetch('/api/upload', { 
    method: 'POST', 
    body: formData 
  })
  
  if (!res.ok) {
    const text = await res.text()
    try {
      const j = JSON.parse(text)
      if ((res.status === 409 || res.status === 422) && (j?.exists || /exists/i.test(text))) {
        throw new Error('该文件已存在')
      }
    } catch {}
    throw new Error(`上传失败: ${res.status} ${text}`)
  }
  
  return res.json()
}

export const uploadTrackJson = async (data) => {
  const res = await fetch('/api/upload', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify(data) 
  })
  
  if (!res.ok) {
    const text = await res.text()
    try {
      const j = JSON.parse(text)
      if ((res.status === 409 || res.status === 422) && (j?.exists || /exists/i.test(text))) {
        throw new Error('该文件已存在')
      }
    } catch {}
    throw new Error(`上传失败: ${res.status} ${text}`)
  }
  
  return res.json()
}

export const importFromRepo = async (gitRepo, gitToken, gitBranch, gitPath) => {
  const branch = gitBranch || 'main'
  const [owner, repo] = String(gitRepo).split('/')
  if (!owner || !repo) throw new Error('GIT_REPO 格式应为 owner/repo')
  
  const normPath = String(gitPath || 'public/music').replace(/^\/+|\/+$/g, '') || '.'
  const segs = normPath === '.' ? [] : normPath.split('/').filter(Boolean)
  const pathPart = segs.length ? '/' + segs.map(encodeURIComponent).join('/') : ''
  const listApi = `https://api.github.com/repos/${owner}/${repo}/contents${pathPart}?ref=${encodeURIComponent(branch)}`
  
  const listRes = await fetch(listApi, { 
    headers: { 
      'Authorization': `Bearer ${gitToken}`, 
      'Accept': 'application/vnd.github+json', 
      'User-Agent': 'web-music-player/0.1' 
    } 
  })
  
  if (!listRes.ok) {
    const t = await listRes.text()
    throw new Error(`读取仓库失败: ${listRes.status} ${t}`)
  }
  
  return listRes.json()
}

export const importFromApi = async (apiUrl) => {
  const base = String(apiUrl || '').trim()
  const normBase = base.replace(/\/$/, '')
  const candidates = [`${normBase}/api/music/list`]
  
  let data = null
  let lastErr = null
  
  for (const url of candidates) {
    try {
      const resp = await fetch(url, { headers: { 'accept': 'application/json' } })
      if (!resp.ok) { 
        lastErr = new Error(`HTTP ${resp.status}`)
        continue 
      }
      const ct = resp.headers.get('content-type') || ''
      if (!/json/i.test(ct)) {
        try { data = await resp.json() } catch (e) { 
          lastErr = new Error('非 JSON 响应')
          continue 
        }
      } else {
        data = await resp.json()
      }
      if (data != null) break
    } catch (e) {
      lastErr = e
    }
  }
  
  if (data == null) {
    throw new Error(lastErr ? lastErr.message : '无法获取到歌单，请提供 player 实例地址（形如 https://host），程序会请求 /api/music/list')
  }
  
  const isPlayerStyle = data && Array.isArray(data.data)
  if (!isPlayerStyle) {
    throw new Error('仅支持 player 风格 API：需返回 { total, data: [...] }')
  }
  
  return data
}

export const webdavUpload = async (cursor, limit) => {
  const res = await fetch('/api/webdav', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ action: 'upload', cursor, limit }) 
  })
  
  const ok = res.status === 200 || res.status === 207
  if (!ok) {
    const t = await res.text()
    throw new Error(`WebDAV 上传失败: ${t}`)
  }
  
  return res.json()
}

export const webdavRestore = async (cursor, limit) => {
  const res = await fetch('/api/webdav', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ action: 'restore', cursor, limit }) 
  })
  
  const ok = res.status === 200 || res.status === 207
  if (!ok) {
    const t = await res.text()
    throw new Error(`WebDAV 恢复失败: ${t}`)
  }
  
  return res.json()
}
