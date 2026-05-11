const CACHE = 'eventnotifier-v1';
const POLL_INTERVAL = 5 * 60 * 1000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => {
  clients.claim();
  poll();
});

async function poll() {
  try {
    const subs = await self.registration.pushManager.getSubscription();
    if (subs) return;

    const res = await fetch(`/api/events/new?since=${new Date(0).toISOString()}`);
    const { data: events, count } = await res.json();
    if (count > 0) {
      const cache = await caches.open(CACHE);
      await cache.put('/api/cached-count', new Response(JSON.stringify({ count, events })));
      await self.registration.showNotification(`⚡ ${count} new tech events`, {
        body: events.slice(0, 3).map(e => e.title).join('\n'),
        icon: '/icons/icon192.png',
        badge: '/icons/icon192.png',
        tag: 'new-events',
        data: { url: '/' },
      });
    }
  } catch (_) {}

  setTimeout(poll, POLL_INTERVAL);
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
