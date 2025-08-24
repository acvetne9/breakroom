import pako from 'pako';

export const decompressGeoJSON = async (url: string) => {
  try {
    console.log(`Loading compressed GeoJSON from: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    
    const compressedData = await response.arrayBuffer();
    console.log(`Compressed size: ${compressedData.byteLength} bytes`);
    
    // Decompress the data
    const decompressed = pako.inflate(compressedData, { to: 'string' });
    console.log(`Decompressed size: ${decompressed.length} characters`);
    
    // Parse the JSON
    const geoJSON = JSON.parse(decompressed);
    console.log(`Loaded ${geoJSON.features?.length || 0} features`);
    
    return geoJSON;
  } catch (error) {
    console.error(`Error loading compressed GeoJSON from ${url}:`, error);
    throw error;
  }
};

export const loadGeoJSON = async (url: string) => {
  // Try compressed version first (.geojson.gz), fallback to regular .geojson
  const compressedUrl = url.replace('.geojson', '.geojson.gz');
  
  try {
    return await decompressGeoJSON(compressedUrl);
  } catch (error) {
    console.log(`Compressed version not available, trying regular: ${url}`);
    
    // Fallback to regular JSON loading
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    
    const geoJSON = await response.json();
    console.log(`Loaded ${geoJSON.features?.length || 0} features from uncompressed file`);
    return geoJSON;
  }
};