import geojsonvt from 'geojson-vt';

interface TileGenerationMessage {
  type: 'generateTiles';
  data: {
    geojson: any;
    options: {
      maxZoom: number;
      tolerance: number;
      extent: number;
      buffer: number;
    };
  };
}

interface TileRequest {
  type: 'getTile';
  z: number;
  x: number;
  y: number;
}

let tileIndex: any = null;

self.onmessage = function(e: MessageEvent<TileGenerationMessage | TileRequest>) {
  const { type } = e.data;

  if (type === 'generateTiles') {
    const { geojson, options } = e.data.data;
    
    console.log('🔄 Generating vector tiles from GeoJSON...');
    
    try {
      // Generate tile index from GeoJSON
      tileIndex = geojsonvt(geojson, {
        maxZoom: options.maxZoom,
        tolerance: options.tolerance,
        extent: options.extent,
        buffer: options.buffer,
        debug: 0
      });
      
      console.log('✅ Vector tile index generated successfully');
      
      self.postMessage({
        type: 'tilesReady',
        success: true
      });
      
    } catch (error) {
      console.error('❌ Error generating tiles:', error);
      self.postMessage({
        type: 'tilesReady',
        success: false,
        error: error.message
      });
    }
  }
  
  if (type === 'getTile') {
    const { z, x, y } = e.data;
    
    if (!tileIndex) {
      self.postMessage({
        type: 'tileData',
        z, x, y,
        tile: null
      });
      return;
    }
    
    try {
      const tile = tileIndex.getTile(z, x, y);
      
      self.postMessage({
        type: 'tileData',
        z, x, y,
        tile: tile
      });
      
    } catch (error) {
      console.error(`❌ Error getting tile ${z}/${x}/${y}:`, error);
      self.postMessage({
        type: 'tileData',
        z, x, y,
        tile: null
      });
    }
  }
};