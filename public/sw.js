// ============================================================
// drive-memo — Service Worker
// ネットワーク優先 + 古いキャッシュ自動削除
// ============================================================

const CACHE_NAME = 'drive-v4';
const STATIC_ASSETS = ['/'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  // 新しいSWを即座にアクティブにする
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names
          .filter(n => n !== CACHE_NAME)
          .map(n => caches.delete(n))
      )
    )
  );
  // 既存タブも即座に新しいSWで制御
  self.clients.claim();
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ネットワーク優先、失敗時にキャッシュ
self.addEventListener('fetch', event => {
  // API・POST リクエストはキャッシュしない
  if (event.request.url.includes('/api/') || event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 正常レスポンスのみキャッシュ
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
