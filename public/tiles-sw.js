/* tiles-sw.js - Service Worker to ensure MapLibre gets un-gzipped .pbf tiles with correct headers */
/* global self */

// Load pako for gzip decompression
self.importScripts('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');

const log = (...args) => console.log('\uD83D\uDD27 [tiles-sw]', ...args);

self.addEventListener('install', (event) => {
  log('Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  log('Activating...');
  event.waitUntil(self.clients.claim());
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
  if (!isTile) return; // Only intercept vector tile requests

  event.respondWith((async () => {
    try {
      const resp = await fetch(event.request, { cache: 'no-store' });
      const enc = resp.headers.get('content-encoding') || '';
      const type = resp.headers.get('content-type') || '';
      log('Fetch tile:', url.pathname, '| encoding:', enc || 'none', '| type:', type || 'unknown');

      // Always read the body and normalize to raw (un-gzipped) protobuf bytes
      const buf = await resp.arrayBuffer();
      let bytes = new Uint8Array(buf);

      const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
      if (isGzip) {
        try {
          log('Decompressing gzipped tile:', url.pathname);
          bytes = self.pako.ungzip(bytes); // Uint8Array
        } catch (e) {
          log('Decompression failed, returning original bytes:', e);
        }
      }

      return new Response(bytes, {
        headers: {
          'Content-Type': 'application/x-protobuf',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    } catch (err) {
      log('Fetch handler error:', err);
      // Last resort: let the request go through
      return fetch(event.request);
    }
  })());
});
