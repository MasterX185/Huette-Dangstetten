// Minimaler Service Worker für PWA-Installation
const CACHE_NAME = 'huetten-manager-v2';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Standard Network-First Strategie
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
