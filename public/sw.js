/* Awesome PG Admin — service worker for Web Push + Badge API */

const CACHE_VERSION = 'apg-admin-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function setBadge(count) {
  if (typeof count === 'number' && 'setAppBadge' in self.navigator) {
    if (count <= 0) {
      return self.navigator.clearAppBadge().catch(() => undefined);
    }
    return self.navigator.setAppBadge(count).catch(() => undefined);
  }
  return Promise.resolve();
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Awesome PG', body: event.data?.text() ?? 'New update' };
  }

  const unreadCount = typeof data.unreadCount === 'number' ? data.unreadCount : 0;
  const silent = data.silent === true || !data.title;

  event.waitUntil(
    (async () => {
      await setBadge(unreadCount);
      if (silent) return;
      await self.registration.showNotification(data.title || 'Awesome PG', {
        body: data.body || '',
        icon: '/icons/apg-admin-192.png',
        badge: '/icons/apg-admin-192.png',
        tag: data.dedupeKey || data.notificationId || 'apg-notification',
        renotify: true,
        data: {
          url: data.deepLink || '/admin/notifications',
          notificationId: data.notificationId || null,
        },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/admin/notifications';
  const absolute = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            await client.navigate(absolute);
          }
          return;
        }
      }
      await self.clients.openWindow(absolute);
    })(),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        client.postMessage({ type: 'PUSH_SUBSCRIPTION_EXPIRED' });
      }
    }),
  );
});
