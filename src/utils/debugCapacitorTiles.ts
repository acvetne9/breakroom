/**
 * Debug utilities for Capacitor tile loading
 */

export function addTileDebugLogs() {
  if (typeof window === 'undefined') return;
  
  // Monitor fetch calls (even if not patched)
  const originalFetch = window.fetch;
  let fetchCallCount = 0;
  
window.fetch = async function(input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    
    if (url.includes('.pbf')) {
      fetchCallCount++;
      console.log(`🔍 Fetch call #${fetchCallCount} for tile:`, url);
      console.log('🔍 Request details:', { url, init });
    }
    
    try {
      // Use URL string for tile requests to avoid Request object cloning issues
      const result = await originalFetch(url.includes('.pbf') ? url : input, init);
      if (url.includes('.pbf')) {
        console.log(`🔍 Fetch result for ${url}:`, {
          ok: result.ok,
          status: result.status,
          contentType: result.headers.get('content-type'),
          contentEncoding: result.headers.get('content-encoding')
        });
      }
      return result;
    } catch (error) {
      if (url.includes('.pbf')) {
        console.error(`🔍 Fetch error for ${url}:`, error);
      }
      throw error;
    }
  };
}

export function logCapacitorEnvironment() {
  console.log('🔍 Capacitor Environment Check:', {
    hasCapacitor: !!(window as any).Capacitor,
    protocol: window.location.protocol,
    origin: window.location.origin,
    userAgent: navigator.userAgent,
    isCapacitorDetected: !!(window as any).Capacitor || window.location.protocol === 'capacitor:'
  });
}