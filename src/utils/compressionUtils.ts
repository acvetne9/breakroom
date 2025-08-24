/**
 * Utility functions for handling compressed data
 */

/**
 * Decompresses gzip data using browser's DecompressionStream API
 */
export async function decompressGzip(compressedData: ArrayBuffer): Promise<string> {
  try {
    // Create a readable stream from the compressed data
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(compressedData));
        controller.close();
      }
    });

    // Create decompression stream
    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
    
    // Read the decompressed data
    const reader = decompressedStream.getReader();
    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    // Combine chunks into a single Uint8Array
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    
    // Convert to string
    return new TextDecoder().decode(combined);
  } catch (error) {
    console.error('Failed to decompress gzip data:', error);
    throw error;
  }
}

/**
 * Fetches and decompresses a gzipped file
 */
export async function fetchAndDecompressGzip(url: string): Promise<any> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    
    const compressedData = await response.arrayBuffer();
    const decompressedText = await decompressGzip(compressedData);
    
    return JSON.parse(decompressedText);
  } catch (error) {
    console.error(`Error fetching and decompressing ${url}:`, error);
    throw error;
  }
}