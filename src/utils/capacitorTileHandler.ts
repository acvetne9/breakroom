import { decompressTile, isCapacitor } from './tileDecompression';

let originalFetch: typeof fetch;
let isPatched = false;

/**
 * Patch fetch to handle tile decompression in Capacitor environments
 */
export function patchTileLoading() {
  if (!isCapacitor() || isPatched) return;
  
  console.log('🔧 Patching fetch for Capacitor tile decompression');
  
  originalFetch = window.fetch;
  
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    
    // More comprehensive URL matching for Capacitor environments
    const isTileRequest = (
      (url.includes('/data/tiles/') || url.includes('data/tiles/')) && 
      url.endsWith('.pbf')
    );
    
    if (isTileRequest) {
      try {
        console.log('🔧 Intercepting tile request:', url);
        
        // Use original fetch to get the data
        const response = await originalFetch(input, init);
        
        if (!response.ok) {
          return response;
        }
        
        // Get the tile data and decompress if needed
        const arrayBuffer = await response.arrayBuffer();
        const decompressed = await decompressTile(arrayBuffer, url);
        
        // Return a new response with the decompressed data and proper headers
        return new Response(decompressed, {
          status: response.status,
          statusText: response.statusText,
          headers: {
            'Content-Type': 'application/x-protobuf',
            'Cache-Control': 'public, max-age=3600'
          }
        });
      } catch (error) {
        console.error('🔧 Error processing tile:', url, error);
        // Fall back to original fetch
        return originalFetch(input, init);
      }
    }
    
    // For all other requests, use original fetch
    return originalFetch(input, init);
  };
  
  isPatched = true;
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