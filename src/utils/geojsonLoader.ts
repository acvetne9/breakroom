import type { FeatureCollection } from 'geojson';

/**
 * Utility functions for loading and processing GeoJSON data
 */

// Function to decompress gzipped GeoJSON
export const decompressGzip = async (response: Response): Promise<any> => {
  console.log('Decompressing GeoJSON data...');
  
  try {
    // First, try direct JSON parse (uncompressed)
    const text = await response.text();
    
    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      console.log('Data is uncompressed JSON');
      return JSON.parse(text);
    }
    
    // Try binary decompression for .gz files
    const bytes = new Uint8Array(await response.arrayBuffer());
    
    // Check for gzip magic number (1f 8b)
    if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
      console.log('Detected gzip compression');
      
      if ('DecompressionStream' in window) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          }
        });
        
        const decompressedStream = stream.pipeThrough(new (window as any).DecompressionStream('gzip'));
        const decompressedResponse = new Response(decompressedStream);
        const decompressedText = await decompressedResponse.text();
        return JSON.parse(decompressedText);
      }
    }
    
    // Fallback: try parsing as text
    const decoder = new TextDecoder();
    const decodedText = decoder.decode(bytes);
    return JSON.parse(decodedText);
    
  } catch (error) {
    console.error('Failed to decompress GeoJSON:', error);
    throw error;
  }
};

// Load GeoJSON from local file
export const loadLocalGeoJSON = async (filename: string): Promise<FeatureCollection | null> => {
  try {
    console.log(`Loading GeoJSON from: /data/${filename}`);
    
    const response = await fetch(`/data/${filename}`, {
      headers: {
        'Accept': 'application/json, application/gzip, */*',
        'Accept-Encoding': 'gzip, deflate'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to load ${filename}: ${response.statusText}`);
    }
    
    const data = filename.endsWith('.gz') 
      ? await decompressGzip(response)
      : await response.json();
    
    console.log(`Successfully loaded ${filename}:`, {
      type: data.type,
      featureCount: data.features?.length || 0
    });
    
    return data;
  } catch (error) {
    console.error(`Error loading ${filename}:`, error);
    return null;
  }
};

// Load GeoJSON from external URL
export const loadExternalGeoJSON = async (url: string): Promise<FeatureCollection | null> => {
  try {
    console.log(`Loading GeoJSON from external URL: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to load external GeoJSON: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log('Successfully loaded external GeoJSON:', {
      type: data.type,
      featureCount: data.features?.length || 0
    });
    
    return data;
  } catch (error) {
    console.error('Error loading external GeoJSON:', error);
    return null;
  }
};

// Load multiple GeoJSON files
export const loadMultipleGeoJSON = async (filenames: string[]): Promise<FeatureCollection[]> => {
  console.log(`Loading ${filenames.length} GeoJSON files...`);
  
  const promises = filenames.map(filename => loadLocalGeoJSON(filename));
  const results = await Promise.all(promises);
  
  return results.filter((data): data is FeatureCollection => data !== null);
};