import { decompressTile, isCapacitor } from './tileDecompression';
import pako from "pako";

let originalFetch: typeof fetch;
let isPatched = false;

/**
 * Patch fetch to handle tile decompression in Capacitor environments
 * ONLY runs on Capacitor/Android - web uses service worker instead
 */
export function patchTileLoading() {
  // CRITICAL: Only patch fetch on Capacitor, not on web
  if (!isCapacitor()) {
    console.log('🌐 Running on web - skipping fetch patch, using service worker instead');
    isPatched = false;
    return;
  }

  console.log('📱 Running on Capacitor - patching fetch for tile decompression');
  originalFetch = window.fetch;
  isPatched = true;
  
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Only handle tile requests to minimize telemetry interference
    if (!url.includes("/data/tiles/")) {
      return originalFetch(input, init);
    }

    // 🔍 Log every tile request
    console.log("🟦 Tile request:", url);

    try {
      // Use URL string to avoid Request object cloning issues
      const response = await originalFetch(url, init);
      const buf = await response.arrayBuffer();
      const u8 = new Uint8Array(buf);

      // Detect gzip (magic bytes 0x1f8b at start)
      const isGzipped = u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b;
      console.log(`📦 Tile fetch: ${url} | size=${u8.length} | gzipped=${isGzipped}`);

      if (isGzipped) {
        try {
          const decompressed = pako.inflate(u8);
          console.log(`✅ Decompressed tile: ${url} | new size=${decompressed.length}`);
          return new Response(decompressed.buffer as ArrayBuffer, {
            status: response.status,
            statusText: response.statusText,
            headers: {
              "Content-Type": "application/x-protobuf",
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch (e) {
          console.error("❌ Gzip decompression failed:", url, e);
        }
      }

      // Not gzipped → return as-is
      return new Response(buf, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "Content-Type": "application/x-protobuf",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch (err) {
      console.error("🚨 Tile fetch failed:", url, err);
      throw err;
    }
  };
}

/**
 * Restore original fetch behavior
 */
export function unpatchTileLoading() {
  if (!isPatched || !originalFetch) return;
  
  console.log('🔧 Restoring original fetch behavior');
  window.fetch = originalFetch;
  isPatched = false;
}