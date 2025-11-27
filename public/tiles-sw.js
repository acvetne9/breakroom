/* tiles-sw.js - Service Worker with gzip decompression AND caching for performance */
/* global self */

// Load pako for gzip decompression
self.importScripts('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');

const log = (...args) => console.log('\uD83D\uDD27 [tiles-sw]', ...args);

// PERFORMANCE: Cache configuration
const TILE_CACHE_NAME = 'map-tiles-v1';
const FONT_CACHE_NAME = 'map-fonts-v1';
const TILE_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

self.addEventListener('install', (event) => {
  log('Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  log('Activating...');
  event.waitUntil(
    // Clean up old caches on activation
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== TILE_CACHE_NAME && cacheName !== FONT_CACHE_NAME) {
            log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Allow immediate activation when a new SW is installed
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    log('Skipping waiting on message...');
    self.skipWaiting();
  }
  
  // PERFORMANCE: Cache management messages
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            log('Clearing cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }).then(() => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ success: true });
        }
      })
    );
  }
  
  if (event.data && event.data.type === 'GET_CACHE_SIZE') {
    event.waitUntil(
      getCacheSize().then((size) => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ size });
        }
      })
    );
  }
});

// PERFORMANCE: Helper to calculate cache size
async function getCacheSize() {
  const cacheNames = await caches.keys();
  let totalSize = 0;
  let totalItems = 0;

  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    totalItems += requests.length;
    
    for (const request of requests) {
      const response = await cache.match(request);
      if (response) {
        const blob = await response.blob();
        totalSize += blob.size;
      }
    }
  }

  return {
    bytes: totalSize,
    mb: (totalSize / (1024 * 1024)).toFixed(2),
    items: totalItems
  };
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isTile = url.pathname.startsWith('/data/tiles/') && url.pathname.endsWith('.pbf');
  const isFont = url.pathname.includes('/data/') && url.pathname.match(/\d+-\d+\.pbf$/);
  
  if (!isTile && !isFont) return;

  event.respondWith((async () => {
    const cacheName = isTile ? TILE_CACHE_NAME : FONT_CACHE_NAME;
    
    try {
      // PERFORMANCE: Check cache first (cache-first strategy)
      const cache = await caches.open(cacheName);
      const cachedResponse = await cache.match(event.request);
      
      if (cachedResponse) {
        // Check if cache is still fresh
        const cacheDate = cachedResponse.headers.get('sw-cached-date');
        if (cacheDate) {
          const age = Date.now() - parseInt(cacheDate, 10);
          if (age < TILE_CACHE_DURATION) {
            log('✅ Cache hit:', url.pathname, `(age: ${(age / 1000 / 60 / 60).toFixed(1)}h)`);
            return cachedResponse;
          } else {
            log('⏰ Cache expired:', url.pathname);
            await cache.delete(event.request);
          }
        } else {
          // Old cache without date, use it but refresh
          log('📦 Using cached (no date):', url.pathname);
          return cachedResponse;
        }
      }
      
      // PERFORMANCE: Fetch from network
      log('🌐 Fetching from network:', url.pathname);
      const resp = await fetch(event.request, { cache: 'no-store' });
      const enc = resp.headers.get('content-encoding') || '';
      const type = resp.headers.get('content-type') || '';

      const buf = await resp.arrayBuffer();
      let bytes = new Uint8Array(buf);

      // Decompress if gzipped
      const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
      if (isGzip) {
        try {
          log('📦 Decompressing gzipped:', url.pathname);
          bytes = self.pako.ungzip(bytes);
        } catch (e) {
          log('⚠️ Decompression failed, using original:', e);
        }
      }

      // Create response with proper headers
      const response = new Response(bytes, {
        headers: {
          'Content-Type': 'application/x-protobuf',
          'Cache-Control': 'public, max-age=3600',
          'sw-cached-date': Date.now().toString() // PERFORMANCE: Add cache timestamp
        }
      });

      // PERFORMANCE: Cache the response asynchronously (don't block)
      cache.put(event.request, response.clone()).then(() => {
        log('💾 Cached:', url.pathname);
      }).catch((err) => {
        log('⚠️ Cache put failed:', err);
      });

      return response;
      
    } catch (err) {
      log('❌ Fetch handler error:', err);
      
      // PERFORMANCE: Try to return stale cache as fallback
      try {
        const cache = await caches.open(cacheName);
        const staleCache = await cache.match(event.request);
        if (staleCache) {
          log('⚠️ Returning stale cache due to error:', url.pathname);
          return staleCache;
        }
      } catch (cacheErr) {
        log('❌ Stale cache also failed:', cacheErr);
      }
      
      // Always return a valid Response to avoid DataCloneError
      try {
        return await fetch(event.request);
      } catch (err2) {
        return new Response('', { status: 500 });
      }
    }
  })());
});

// PERFORMANCE: Log cache stats periodically (every 5 minutes in dev, disable in prod)
if (self.location.hostname === 'localhost' || self.location.hostname.includes('preview')) {
  setInterval(async () => {
    try {
      const size = await getCacheSize();
      log(`📊 Cache stats: ${size.mb}MB, ${size.items} items`);
    } catch (err) {
      log('Failed to get cache stats:', err);
    }
  }, 5 * 60 * 1000);
}

log('✅ Service Worker loaded with caching enabled');
