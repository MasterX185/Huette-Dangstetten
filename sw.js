// Firebase Messaging benötigt compat-Skripte im Service Worker.
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: 'AIzaSyCLhOlcwKeqtdNNF_HrFA0xavgOgZjHMPw',
    authDomain: 'huette-dangstetten-3a737.firebaseapp.com',
    projectId: 'huette-dangstetten-3a737',
    storageBucket: 'huette-dangstetten-3a737.firebasestorage.app',
    messagingSenderId: '700971650309',
    appId: '1:700971650309:web:0793b2667578bc8eea7b6c'
});

const CACHE_NAME = 'huetten-manager-v3';
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || 'HüttenPortal';
    self.registration.showNotification(title, {
        body: payload.notification?.body || 'Es gibt neue Aktivitäten.',
        icon: './icon.png',
        data: payload.data || {}
    });
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        const existing = clientList.find(client => 'focus' in client);
        if (existing) return existing.focus();
        return clients.openWindow('./index.html');
    }));
});

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
