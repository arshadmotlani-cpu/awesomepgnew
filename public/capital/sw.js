const CACHE = 'capital-shell-v3-offline';
const SHELL = ['/login', '/dashboard'];

function shouldBypassServiceWorker(url: URL, request: Request): boolean {
  if (url.pathname.startsWith('/_next/')) return true;
  if (url.pathname.startsWith('/api/')) return true;
  if (request.headers.get('rsc') === '1') return true;
  if (request.headers.get('next-router-prefetch') === '1') return true;
  if (request.headers.get('next-router-state-tree')) return true;
  return false;
}

function isShellNavigation(url: URL, request: Request): boolean {
  if (request.mode !== 'navigate') return false;
  return SHELL.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (shouldBypassServiceWorker(url, event.request)) return;
  if (!isShellNavigation(url, event.request)) return;

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((cached) => cached ?? caches.match('/login')),
    ),
  );
});
