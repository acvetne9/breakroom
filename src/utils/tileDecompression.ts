import * as pako from 'pako';

/**
 * Utility to handle tile decompression for Capacitor environments
 * where service workers don't work
 */

// Check if we're running in Capacitor native (not web)
export const isCapacitor = () => {
  try {
    return (window as any).Capacitor?.isNativePlatform?.() || window.location.protocol === 'capacitor:';
  } catch {
    return false;
  }
};

/**
 * Decompress a gzipped tile if needed
 */
export async function decompressTile(data: ArrayBuffer, url?: string): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(data);

  // Check if it's gzipped (starts with 0x1f 0x8b)
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

  if (isGzip) {
    if (url) console.log('🔧 Decompressing gzipped tile:', url);
    try {
      const decompressed = pako.ungzip(bytes);
      return decompressed.buffer;
    } catch (e) {
      console.warn('Decompression failed, returning original bytes:', e);
      return data;
    }
  }

  return data;
}


/**
 * Create a blob URL for a tile that can be used by MapLibre
 */
export const createTileBlobUrl = async (url: string): Promise<string> => {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = await decompressTile(arrayBuffer, url); // pass url for logging
  const blob = new Blob([buffer], { type: 'application/x-protobuf' });
  return URL.createObjectURL(blob);
};
