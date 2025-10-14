import { useState, useEffect } from 'react'

export const useBadges = () => {
  const [showBadges, setShowBadges] = useState(false)
  const [badgeCache, setBadgeCache] = useState(null)

  useEffect(() => {
    // 检查是否有缓存的徽章数据
    const cachedBadges = localStorage.getItem('badgeCache')
    const cacheTime = localStorage.getItem('badgeCacheTime')
    const now = Date.now()
    const cacheExpiry = 24 * 60 * 60 * 1000 // 24小时缓存

    if (cachedBadges && cacheTime && (now - parseInt(cacheTime)) < cacheExpiry) {
      try {
        const badges = JSON.parse(cachedBadges)
        setBadgeCache(badges)
        setShowBadges(true)
        return
      } catch (e) {
        console.warn('徽章缓存解析失败:', e)
      }
    }

    // 如果没有缓存或缓存过期，延迟显示并预加载
    const t = setTimeout(async () => {
      setShowBadges(true)
      
      // 预加载徽章图片
      const badgeUrls = [
        'https://img.shields.io/badge/微信-zxlwq-07C160.svg?logo=wechat',
        'https://img.shields.io/badge/Telegram-zxlwq-0088CC.svg?logo=telegram&logoColor=0088CC',
        'https://img.shields.io/badge/GitHub-Repo-black.svg?logo=github&logoColor=white',
        'https://img.shields.io/badge/Cloudflare-Pages-orange.svg?logo=cloudflare&logoColor=F38020',
        'https://img.shields.io/badge/Bilibili-zxlwq-FF69B4.svg?logo=bilibili&logoColor=FF69B4',
        'https://img.shields.io/badge/YouTube-zxlwq-FF0000.svg?logo=youtube&logoColor=FF0000',
        'https://img.shields.io/badge/Instagram-zxlwq-E4405F.svg?logo=instagram&logoColor=E4405F'
      ]

      // 预加载图片并缓存
      try {
        const badgeData = await Promise.all(
          badgeUrls.map(async (url) => {
            try {
              const response = await fetch(url, { 
                mode: 'cors',
                cache: 'force-cache'
              })
              if (response.ok) {
                const blob = await response.blob()
                return {
                  url,
                  blob: URL.createObjectURL(blob)
                }
              }
            } catch (e) {
              console.warn(`预加载徽章失败: ${url}`, e)
            }
            return { url, blob: null }
          })
        )

        // 缓存徽章数据
        const badges = [
          { href: 'https://blog.wedp.dpdns.org/jpg/wx.webp', src: badgeUrls[0], alt: '微信' },
          { href: 'https://t.me/zxlwq', src: badgeUrls[1], alt: 'Telegram' },
          { href: 'https://github.com/zxlwq/music', src: badgeUrls[2], alt: 'GitHub Repo' },
          { href: 'https://pages.cloudflare.com/', src: badgeUrls[3], alt: 'Cloudflare Pages' },
          { href: 'https://www.bilibili.com/', src: badgeUrls[4], alt: 'Bilibili' },
          { href: 'https://www.youtube.com/@zxlwq', src: badgeUrls[5], alt: 'YouTube' },
          { href: 'https://www.instagram.com/zxlwq', src: badgeUrls[6], alt: 'Instagram' }
        ]

        setBadgeCache(badges)
        localStorage.setItem('badgeCache', JSON.stringify(badges))
        localStorage.setItem('badgeCacheTime', now.toString())
      } catch (e) {
        console.warn('徽章预加载失败:', e)
      }
    }, 1200)

    return () => clearTimeout(t)
  }, [])

  return { showBadges, badgeCache }
}
