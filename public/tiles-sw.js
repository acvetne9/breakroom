/* tiles-sw.js - Service Worker to ensure MapLibre gets un-gzipped .pbf tiles with correct headers */
/* Phase 4: Added Cache API for decompressed tiles */
/* global self */

// Load pako for gzip decompression
self.importScripts('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');

const log = (...args) => console.log('🔧 [tiles-sw]', ...args);

// Phase 4: Cache name for decompressed tiles
const TILE_CACHE_NAME = 'tiles-decompressed-v1';

self.addEventListener('install', (event) => {
  log('Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  log('Activating...');
  // Clean up old caches
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name.startsWith('tiles-') && name !== TILE_CACHE_NAME)
          .map(name => {
            log('Deleting old cache:', name);
            return caches.delete(name);
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
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isTile = url.pathname.startsWith('/data/tiles/') && url.pathname.endsWith('.pbf');
  if (!isTile) return;

  event.respondWith((async () => {
    try {
      // Phase 4: Check cache first
      const cache = await caches.open(TILE_CACHE_NAME);
      const cachedResponse = await cache.match(event.request);
      
      if (cachedResponse) {
        log('Cache HIT:', url.pathname);
        return cachedResponse;
      }
      
      log('Cache MISS, fetching:', url.pathname);
      const resp = await fetch(event.request);
      const enc = resp.headers.get('content-encoding') || '';
      const type = resp.headers.get('content-type') || '';
      log('Fetch tile:', url.pathname, '| encoding:', enc || 'none', '| type:', type || 'unknown');

      const buf = await resp.arrayBuffer();
      let bytes = new Uint8Array(buf);

      const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
      if (isGzip) {
        try {
          log('Decompressing gzipped tile:', url.pathname);
          bytes = self.pako.ungzip(bytes);
        } catch (e) {
          log('Decompression failed, returning original bytes:', e);
        }
      }

      const response = new Response(bytes, {
        headers: {
          'Content-Type': 'application/x-protobuf',
          'Cache-Control': 'public, max-age=86400' // 24 hours
        }
      });
      
      // Phase 4: Cache the decompressed tile
      try {
        await cache.put(event.request, response.clone());
      } catch (cacheError) {
        log('Failed to cache tile:', cacheError);
      }

      return response;
    } catch (err) {
      log('Fetch handler error (falling back):', err);
      // Always return a valid Response to avoid DataCloneError
      try {
        return await fetch(event.request);
      } catch (err2) {
        return new Response('', { status: 500 });
      }
    }
  })());
});
