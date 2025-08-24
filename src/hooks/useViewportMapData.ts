import { useState, useCallback, useRef } from 'react';
import type { FeatureCollection, Feature } from 'geojson';
import * as turf from '@turf/turf';
import { fetchAndDecompressGzip } from '../utils/compressionUtils';

interface ViewportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface MapChunk {
  id: string;
  bounds: ViewportBounds;
  features: Feature[];
  loaded: boolean;
}

export const useViewportMapData = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadedChunks, setLoadedChunks] = useState<Map<string, MapChunk>>(new Map());
  const [currentFeatures, setCurrentFeatures] = useState<Feature[]>([]);
  const [allDataLoaded, setAllDataLoaded] = useState(false);
  const loadingChunksRef = useRef<Set<string>>(new Set());

  // NYC bounds for chunking
  const NYC_BOUNDS = {
    north: 40.917,
    south: 40.4774,
    east: -73.7003,
    west: -74.2591
  };

  // Create chunk grid (divide NYC into 4x4 grid = 16 chunks)
  const GRID_SIZE = 4;
  const CHUNK_WIDTH = (NYC_BOUNDS.east - NYC_BOUNDS.west) / GRID_SIZE;
  const CHUNK_HEIGHT = (NYC_BOUNDS.north - NYC_BOUNDS.south) / GRID_SIZE;

  const getChunkId = useCallback((bounds: ViewportBounds): string => {
    const centerLng = (bounds.east + bounds.west) / 2;
    const centerLat = (bounds.north + bounds.south) / 2;
    
    const chunkX = Math.floor((centerLng - NYC_BOUNDS.west) / CHUNK_WIDTH);
    const chunkY = Math.floor((centerLat - NYC_BOUNDS.south) / CHUNK_HEIGHT);
    
    return `${chunkX}-${chunkY}`;
  }, []);

  const getChunkBounds = useCallback((chunkId: string): ViewportBounds => {
    const [x, y] = chunkId.split('-').map(Number);
    
    return {
      west: NYC_BOUNDS.west + (x * CHUNK_WIDTH),
      east: NYC_BOUNDS.west + ((x + 1) * CHUNK_WIDTH),
      south: NYC_BOUNDS.south + (y * CHUNK_HEIGHT),
      north: NYC_BOUNDS.south + ((y + 1) * CHUNK_HEIGHT)
    };
  }, []);

  const getAllChunksInCenterOutOrder = useCallback((): string[] => {
    const chunks: string[] = [];
    const centerX = Math.floor(GRID_SIZE / 2);
    const centerY = Math.floor(GRID_SIZE / 2);
    
    // Add center chunks first, then spiral outward
    const addedChunks = new Set<string>();
    
    // Start with center chunk
    const centerChunk = `${centerX}-${centerY}`;
    chunks.push(centerChunk);
    addedChunks.add(centerChunk);
    
    // Add remaining chunks in concentric rings
    for (let ring = 1; ring < GRID_SIZE; ring++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
          const distance = Math.max(Math.abs(x - centerX), Math.abs(y - centerY));
          if (distance === ring) {
            const chunkId = `${x}-${y}`;
            if (!addedChunks.has(chunkId)) {
              chunks.push(chunkId);
              addedChunks.add(chunkId);
            }
          }
        }
      }
    }
    
    return chunks;
  }, []);

  const loadChunkData = useCallback(async (chunkId: string): Promise<Feature[]> => {
    const chunkBounds = getChunkBounds(chunkId);
    
    try {
      console.log(`Loading chunk ${chunkId} with bounds:`, chunkBounds);
      
      // Load full dataset (compressed version for better performance)
      const [mainData, landData]: [FeatureCollection, FeatureCollection] = await Promise.all([
        fetchAndDecompressGzip('/data/example-points.geojson.gz'),
        fetch('/data/nyc_land.geojson').then(res => {
          if (!res.ok) throw new Error('Failed to fetch land data');
          return res.json();
        })
      ]);

      // Filter features to only include those within chunk bounds
      const chunkFeatures: Feature[] = [];
      
      // Add land features (usually covers entire NYC, so include in every chunk)
      chunkFeatures.push(...landData.features);

      // Filter main data features by bounds
      for (const feature of mainData.features) {
        try {
          let includeFeature = false;

          if (feature.geometry.type === 'Point') {
            const [lng, lat] = feature.geometry.coordinates as [number, number];
            includeFeature = lng >= chunkBounds.west && lng <= chunkBounds.east &&
                           lat >= chunkBounds.south && lat <= chunkBounds.north;
          } else if (['Polygon', 'MultiPolygon', 'LineString'].includes(feature.geometry.type)) {
            // For complex geometries, check if they intersect with chunk bounds
            const chunkBoundingBox = turf.bboxPolygon([
              chunkBounds.west, chunkBounds.south, chunkBounds.east, chunkBounds.north
            ]);
            
            try {
              const intersects = turf.booleanIntersects(feature, chunkBoundingBox);
              includeFeature = intersects;
            } catch {
              // If intersection check fails, include the feature (better safe than sorry)
              includeFeature = true;
            }
          }

          if (includeFeature) {
            chunkFeatures.push(feature);
          }
        } catch (error) {
          console.warn('Error processing feature for chunk:', error);
          // Include feature if processing fails
          chunkFeatures.push(feature);
        }
      }

      console.log(`Chunk ${chunkId} loaded with ${chunkFeatures.length} features`);
      return chunkFeatures;
    } catch (error) {
      console.error(`Error loading chunk ${chunkId}:`, error);
      return [];
    }
  }, [getChunkBounds]);

  const loadAllDataCenterOut = useCallback(async () => {
    if (allDataLoaded || isProcessing) return { features: currentFeatures, landData: null };
    
    setIsProcessing(true);
    
    try {
      const allChunks = getAllChunksInCenterOutOrder();
      console.log('Loading all chunks center-out:', allChunks);
      
      // Load chunks one by one from center outward
      const allFeatures: Feature[] = [];
      let landData = null;
      
      for (const chunkId of allChunks) {
        if (!loadedChunks.has(chunkId)) {
          console.log(`Loading chunk ${chunkId}...`);
          const features = await loadChunkData(chunkId);
          
          // Update loaded chunks immediately
          setLoadedChunks(prev => {
            const newChunks = new Map(prev);
            newChunks.set(chunkId, {
              id: chunkId,
              bounds: getChunkBounds(chunkId),
              features,
              loaded: true
            });
            return newChunks;
          });
          
          allFeatures.push(...features);
        } else {
          // Chunk already loaded, add its features
          const existingChunk = loadedChunks.get(chunkId);
          if (existingChunk?.loaded) {
            allFeatures.push(...existingChunk.features);
          }
        }
      }
      
      // Separate land and main features
      const landFeatures = allFeatures.filter(f => f.properties?.name === 'New York City Land');
      const mainFeatures = allFeatures.filter(f => f.properties?.name !== 'New York City Land');
      
      if (landFeatures.length > 0) {
        landData = { type: 'FeatureCollection', features: landFeatures };
      }
      
      setCurrentFeatures(allFeatures);
      setAllDataLoaded(true);
      
      console.log(`Loaded all ${allChunks.length} chunks with ${allFeatures.length} total features`);
      
      return { features: mainFeatures, landData };
      
    } catch (error) {
      console.error('Error loading all map data:', error);
      return { features: [], landData: null };
    } finally {
      setIsProcessing(false);
    }
  }, [allDataLoaded, isProcessing, currentFeatures, getAllChunksInCenterOutOrder, loadedChunks, loadChunkData, getChunkBounds]);

  const loadViewportData = useCallback(async (viewportBounds: ViewportBounds) => {
    // Always load all data center-out instead of viewport-specific chunks
    return loadAllDataCenterOut();
  }, [loadAllDataCenterOut]);

  return {
    isProcessing,
    setIsProcessing,
    loadViewportData,
    loadAllDataCenterOut,
    currentFeatures,
    loadedChunks: Array.from(loadedChunks.values()),
    allDataLoaded
  };
};