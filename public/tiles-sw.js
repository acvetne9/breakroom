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

      // If server already sets proper gzip encoding, return as-is (browser will decompress)
      if (enc.toLowerCase().includes('gzip')) {
        log('Passing through (server provided gzip header).');
        return resp;
      }

      // Read body to sniff gzip header
      const buf = await resp.arrayBuffer();
      const bytes = new Uint8Array(buf);

      const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
      if (isGzip) {
        log('Decompressing gzipped tile without Content-Encoding header:', url.pathname);
        try {
          const decompressed = self.pako.ungzip(bytes); // Uint8Array
          return new Response(decompressed, {
            headers: {
              'Content-Type': 'application/x-protobuf',
              'Cache-Control': 'public, max-age=3600'
            }
          });
        } catch (e) {
          log('Decompression failed:', e);
          // Fall back to original bytes
          return new Response(buf, {
            headers: {
              'Content-Type': 'application/x-protobuf'
            }
          });
        }
      }

      // Not gzip; ensure correct content-type
      log('Tile not gzip-encoded; normalizing headers.');
      return new Response(buf, {
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
