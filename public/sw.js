/* 教研组工作台 Service Worker
 * 缓存策略：
 *  1) /api/ 请求直接放行，不缓存（配合后端 Cache-Control: no-store，杜绝响应缓存）
 *  2) 跨域请求（Tailwind CDN、混元 API 等）直接放行
 *  3) 同域静态资源缓存优先；导航请求离线回退 index.html
 *  4) CACHE_NAME 带版本号，升级后旧缓存自动清理（每次内容变更请升版，确保旧缓存失效）
 */
const CACHE_NAME = 'teacher-workbench-v2'

// 应用外壳：首次安装即预缓存，保证离线也能打开 SPA 入口
const PRECACHE_URLS = ['/', '/index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  // 升级：删除非当前版本的缓存
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // 1) API 请求：直接放行，绝不缓存（失败即失败，交给前端处理）
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request))
    return
  }

  // 2) 跨域请求（Tailwind CDN、混元 API 等）：直接放行，不缓存
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(request))
    return
  }

  // 同域 GET —— 区分导航与静态资源
  // 3a) 导航请求：网络优先；离线回退到缓存的 index.html（SPA 外壳）
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then((r) => r || caches.match('/'))
      )
    )
    return
  }

  // 3b) 静态资源：缓存优先；未命中则网络拉取并写入缓存（仅缓存同源 200 响应）
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return res
      })
    })
  )
})
