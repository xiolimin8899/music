export default {
  async fetch(request, env, ctx) {
    const startTime = Date.now();

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Content-Range, If-Range, If-Modified-Since',
          'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, X-Processing-Time, X-Cache-Status',
          'Access-Control-Max-Age': '86400',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const url = new URL(request.url);
      const targetUrl = url.searchParams.get('url');
      
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        return new Response('Invalid URL', { status: 400 });
      }

      const cache = caches.default;
      const incomingRange = request.headers.get('Range');
      const isRangeRequest = !!incomingRange;

      if (isRangeRequest) {
        const preloadCacheKey = new Request(`${targetUrl}?preload=1mb`, request);
        const preloadCached = await cache.match(preloadCacheKey);
        if (preloadCached) {
          const response = new Response(preloadCached.body, {
            status: preloadCached.status,
            statusText: preloadCached.statusText,
            headers: {
              ...Object.fromEntries(preloadCached.headers),
              'X-Cache-Status': 'HIT',
              'X-Processing-Time': `${Date.now() - startTime}ms`,
              'X-Cache-Source': 'Preload',
              'X-Proxy-Platform': 'Cloudflare Workers'
            }
          });
          return response;
        }
      } else {
        const fullCacheKey = new Request(targetUrl, request);
        const cachedResponse = await cache.match(fullCacheKey);
        if (cachedResponse) {
          const response = new Response(cachedResponse.body, {
            status: cachedResponse.status,
            statusText: cachedResponse.statusText,
            headers: {
              ...Object.fromEntries(cachedResponse.headers),
              'X-Cache-Status': 'HIT',
              'X-Processing-Time': `${Date.now() - startTime}ms`,
              'X-Cache-Source': 'Edge',
              'X-Proxy-Platform': 'Cloudflare Workers'
            }
          });
          return response;
        }
      }

      const reqHeaders = new Headers();

      const getUserAgent = (targetUrl) => {
        const userAgents = [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'Mozilla/5.0 (Linux; Android 14; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        ];
        const hash = targetUrl.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0);
          return a & a;
        }, 0);
        const index = Math.abs(hash) % userAgents.length;
        return userAgents[index];
      };

      reqHeaders.set('User-Agent', getUserAgent(targetUrl));
      reqHeaders.set('Accept', 'audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/aac,audio/m4a,audio/webm,audio/*,*/*;q=0.9');
      reqHeaders.set('Accept-Encoding', 'identity');
      reqHeaders.set('Connection', 'keep-alive');
      reqHeaders.set('Cache-Control', 'no-cache');
      if (incomingRange) reqHeaders.set('Range', incomingRange);

      const isGitHubRaw = targetUrl.includes('raw.githubusercontent.com');
      if (isGitHubRaw) {
        reqHeaders.set('Accept', '*/*');
        reqHeaders.set('Cache-Control', 'no-cache');
        reqHeaders.set('Pragma', 'no-cache');
      }

      try {
        const u = new URL(targetUrl);
        reqHeaders.set('Referer', `${u.origin}/`);
        reqHeaders.set('Origin', u.origin);
      } catch {}

      const maxRetries = 1;
      let lastError = null;
      let upstream = null;
      
      for (let i = 0; i <= maxRetries; i++) {
        try {
          const controller = new AbortController();

          const timeout = isGitHubRaw ? (isRangeRequest ? 10000 : 15000) : (isRangeRequest ? 5000 : 8000);
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          
          upstream = await fetch(targetUrl, { 
            headers: reqHeaders, 
            signal: controller.signal, 
            redirect: 'follow' 
          });
          
          clearTimeout(timeoutId);
          if (upstream.ok || (upstream.status >= 200 && upstream.status < 400)) break;
          lastError = new Error(`Upstream ${upstream.status}`);
        } catch (e) {
          lastError = e;
        }
        if (i < maxRetries) await new Promise(r => setTimeout(r, 100));
      }

      if (!upstream || !upstream.body || upstream.status >= 400) {
        const status = upstream ? upstream.status : 502;
        const msg = lastError ? lastError.message || String(lastError) : `Upstream ${status}`;
        return new Response(JSON.stringify({ error: msg }), {
          status,
          headers: { 
            'content-type': 'application/json', 
            'access-control-allow-origin': '*', 
            'cache-control': 'no-store',
            'X-Proxy-Platform': 'Cloudflare Workers'
          }
        });
      }

      const mimeMap = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.aac': 'audio/aac',
        '.m4a': 'audio/mp4',
        '.webm': 'audio/webm'
      };
      
      let contentType = upstream.headers.get('content-type') || '';
      if (!/^audio\//.test(contentType)) {
        try {
          const ext = targetUrl.split('.').pop()?.toLowerCase();
          if (ext && mimeMap['.' + ext]) {
            contentType = mimeMap['.' + ext];
          } else {
            contentType = 'audio/mpeg';
          }
        } catch {
          contentType = 'audio/mpeg';
        }
      }

      const respHeaders = new Headers();
      respHeaders.set('Content-Type', contentType);
      ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'].forEach(h => {
        const val = upstream.headers.get(h);
        if (val) respHeaders.set(h, val);
      });
      respHeaders.set('Cache-Control', 'public, max-age=7200, must-revalidate');
      respHeaders.set('Access-Control-Allow-Origin', '*');
      respHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      respHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Range, If-Range, If-Modified-Since');
      respHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, X-Processing-Time, X-Cache-Status');
      respHeaders.set('X-Content-Type-Options', 'nosniff');
      respHeaders.set('X-Processing-Time', `${Date.now() - startTime}ms`);
      respHeaders.set('X-Request-Type', isRangeRequest ? 'Range' : 'Full');
      respHeaders.set('X-Retries', `${maxRetries}`);
      respHeaders.set('X-Cache-Status', 'MISS');
      respHeaders.set('X-Cache-Source', 'Origin');
      respHeaders.set('X-Proxy-Platform', 'Cloudflare Workers');

      const statusCode = isRangeRequest && (upstream.status === 206 || upstream.headers.get('content-range')) ? 206 : upstream.status;
      const response = new Response(upstream.body, { status: statusCode, headers: respHeaders });

      if (!isRangeRequest && statusCode === 200) {
        ctx.waitUntil((async () => {
          try {
            const cacheResponse = response.clone();
            cacheResponse.headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');
            cacheResponse.headers.set('X-Cache-TTL', '86400');
            await cache.put(new Request(targetUrl, request), cacheResponse);

            try {
              const preloadHeaders = new Headers(reqHeaders);
              preloadHeaders.set('Range', 'bytes=0-1048575');
              const preloadResp = await fetch(targetUrl, { headers: preloadHeaders, signal: AbortSignal.timeout(5000) });
              if (preloadResp.ok && preloadResp.status === 206) {
                const preloadCacheKey = new Request(`${targetUrl}?preload=1mb`, request);
                const preloadCacheResp = preloadResp.clone();
                preloadCacheResp.headers.set('Cache-Control', 'public, max-age=3600');
                preloadCacheResp.headers.set('X-Cache-TTL', '3600');
                preloadCacheResp.headers.set('X-Preload', '2MB');
                await cache.put(preloadCacheKey, preloadCacheResp);
              }
            } catch {}
          } catch {}
        })());
      }

      return response;

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message || 'audio proxy error' }), {
        status: 500,
        headers: { 
          'content-type': 'application/json', 
          'access-control-allow-origin': '*', 
          'cache-control': 'no-store',
          'X-Proxy-Platform': 'Cloudflare Workers'
        }
      });
    }
  }
};
