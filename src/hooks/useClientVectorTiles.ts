import { useState, useCallback, useRef } from 'react';
import type { FeatureCollection } from 'geojson';

interface TileCache {
  [key: string]: any;
}

export const useClientVectorTiles = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [tilesReady, setTilesReady] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const tileCacheRef = useRef<TileCache>({});

  const initializeWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    const workerCode = `
import geojsonvt from 'geojson-vt';

let tileIndex = null;

self.onmessage = function(e) {
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
      console.error(\`❌ Error getting tile \${z}/\${x}/\${y}:\`, error);
      self.postMessage({
        type: 'tileData',
        z, x, y,
        tile: null
      });
    }
  }
};
`;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob), { type: 'module' });
    
    worker.onmessage = (e) => {
      const { type } = e.data;
      
      if (type === 'tilesReady') {
        setIsGenerating(false);
        setTilesReady(e.data.success);
        if (!e.data.success) {
          console.error('Tile generation failed:', e.data.error);
        }
      }
      
      if (type === 'tileData') {
        const { z, x, y, tile } = e.data;
        const cacheKey = `${z}/${x}/${y}`;
        tileCacheRef.current[cacheKey] = tile;
      }
    };
    
    workerRef.current = worker;
    return worker;
  }, []);

  const generateTilesFromGeoJSON = useCallback(async (geojson: FeatureCollection) => {
    const worker = initializeWorker();
    setIsGenerating(true);
    setTilesReady(false);
    
    console.log('🚀 Starting client-side tile generation...');
    
    worker.postMessage({
      type: 'generateTiles',
      data: {
        geojson,
        options: {
          maxZoom: 16,
          tolerance: 3,
          extent: 4096,
          buffer: 64
        }
      }
    });
  }, [initializeWorker]);

  const getTile = useCallback((z: number, x: number, y: number) => {
    const cacheKey = `${z}/${x}/${y}`;
    
    // Return cached tile if available
    if (tileCacheRef.current[cacheKey] !== undefined) {
      return tileCacheRef.current[cacheKey];
    }
    
    // Request tile from worker
    if (workerRef.current && tilesReady) {
      workerRef.current.postMessage({
        type: 'getTile',
        z, x, y
      });
    }
    
    return null;
  }, [tilesReady]);

  const addClientTileSource = useCallback((map: any, sourceId: string) => {
    if (!map || !tilesReady) return false;

    try {
      if (!map.getSource(sourceId)) {
        // Create custom tile source that uses our generated tiles
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });
      }
      return true;
    } catch (error) {
      console.error('Error adding client tile source:', error);
      return false;
    }
  }, [tilesReady]);

  const cleanup = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    tileCacheRef.current = {};
    setTilesReady(false);
    setIsGenerating(false);
  }, []);

  return {
    isGenerating,
    tilesReady,
    generateTilesFromGeoJSON,
    getTile,
    addClientTileSource,
    cleanup
  };
};