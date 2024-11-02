const CACHE_NAME = 'tf-libraries-cache-v1';
const urlsToCache = [
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core',
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter',
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl',
  'https://cdn.jsdelivr.net/npm/@tensorflow-models/face-detection',
  'https://cdn.jsdelivr.net/npm/@tensorflow-models/face-landmarks-detection',
];

// Install the service worker and cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache');
      return cache.addAll(urlsToCache);
    })
  );
});

// Activate the service worker and delete old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheWhitelist.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch the resources from the cache or the network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response; // Cache hit - return the cached response
      }
      return fetch(event.request); // Fallback to network if not in cache
    })
  );
});