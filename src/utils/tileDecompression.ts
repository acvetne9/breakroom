import * as pako from 'pako';

/**
 * Utility to handle tile decompression for Capacitor environments
 * where service workers don't work
 */

// Check if we're running in Capacitor
export const isCapacitor = () => {
  return !!(window as any).Capacitor || window.location.protocol === 'capacitor:';
};

/**
 * Decompress a gzipped tile if needed
 */
export const decompressTile = async (url: string): Promise<ArrayBuffer> => {
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/x-protobuf',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch tile: ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    // Check if it's gzipped (starts with 0x1f 0x8b)
    const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
    
    if (isGzip) {
      console.log('🔧 Decompressing gzipped tile:', url);
      try {
        const decompressed = pako.ungzip(bytes);
        return decompressed.buffer;
      } catch (e) {
        console.warn('Decompression failed, returning original bytes:', e);
        return buffer;
      }
    }
    
    return buffer;
  } catch (error) {
    console.error('Error loading tile:', error);
    throw error;
  }
};

/**
 * Create a blob URL for a tile that can be used by MapLibre
 */
// export const createTileBlobUrl = async (url: string): Promise<string> => {
//   const buffer = await decompressTile(url);
//   const blob = new Blob([buffer], { type: 'application/x-protobuf' });
//   return URL.createObjectURL(blob);
// };
export const createTileBlobUrl = (buffer: ArrayBuffer): string => {
  const blob = new Blob([buffer], { type: 'application/x-protobuf' });
  return URL.createObjectURL(blob);
};