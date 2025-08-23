import { useState, useCallback, useRef } from 'react';
import type { FeatureCollection, Feature } from 'geojson';
import * as turf from '@turf/turf';

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

  const getRequiredChunks = useCallback((viewportBounds: ViewportBounds): string[] => {
    const chunks: string[] = [];
    
    // Expand viewport slightly for preloading adjacent chunks
    const buffer = 0.01; // ~1km buffer
    const expandedBounds = {
      north: Math.min(viewportBounds.north + buffer, NYC_BOUNDS.north),
      south: Math.max(viewportBounds.south - buffer, NYC_BOUNDS.south),
      east: Math.min(viewportBounds.east + buffer, NYC_BOUNDS.east),
      west: Math.max(viewportBounds.west - buffer, NYC_BOUNDS.west)
    };

    // Find all chunks that intersect with the expanded viewport
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        const chunkBounds = {
          west: NYC_BOUNDS.west + (x * CHUNK_WIDTH),
          east: NYC_BOUNDS.west + ((x + 1) * CHUNK_WIDTH),
          south: NYC_BOUNDS.south + (y * CHUNK_HEIGHT),
          north: NYC_BOUNDS.south + ((y + 1) * CHUNK_HEIGHT)
        };

        // Check if chunk intersects with expanded viewport
        if (chunkBounds.east >= expandedBounds.west &&
            chunkBounds.west <= expandedBounds.east &&
            chunkBounds.north >= expandedBounds.south &&
            chunkBounds.south <= expandedBounds.north) {
          chunks.push(`${x}-${y}`);
        }
      }
    }

    return chunks;
  }, []);

  const loadChunkData = useCallback(async (chunkId: string): Promise<Feature[]> => {
    const chunkBounds = getChunkBounds(chunkId);
    
    try {
      console.log(`Loading chunk ${chunkId} with bounds:`, chunkBounds);
      
      // Load full dataset (in production, this would be chunk-specific endpoints)
      const [mainResponse, landResponse] = await Promise.all([
        fetch('/data/example-points.geojson'),
        fetch('/data/nyc_land.geojson')
      ]);

      if (!mainResponse.ok || !landResponse.ok) {
        throw new Error('Failed to fetch data');
      }

      const [mainData, landData]: [FeatureCollection, FeatureCollection] = await Promise.all([
        mainResponse.json(),
        landResponse.json()
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

  const loadViewportData = useCallback(async (viewportBounds: ViewportBounds) => {
    const requiredChunks = getRequiredChunks(viewportBounds);
    const chunksToLoad = requiredChunks.filter(chunkId => 
      !loadedChunks.has(chunkId) && !loadingChunksRef.current.has(chunkId)
    );

    if (chunksToLoad.length === 0) {
      // All required chunks are already loaded, just update current features
      const allFeatures: Feature[] = [];
      requiredChunks.forEach(chunkId => {
        const chunk = loadedChunks.get(chunkId);
        if (chunk?.loaded) {
          allFeatures.push(...chunk.features);
        }
      });
      setCurrentFeatures(allFeatures);
      return { features: allFeatures, landData: null };
    }

    setIsProcessing(true);

    // Mark chunks as loading
    chunksToLoad.forEach(chunkId => loadingChunksRef.current.add(chunkId));

    try {
      // Load chunks in parallel
      const chunkDataPromises = chunksToLoad.map(async (chunkId) => {
        const features = await loadChunkData(chunkId);
        return { chunkId, features };
      });

      const chunkResults = await Promise.all(chunkDataPromises);

      // Update loaded chunks
      setLoadedChunks(prev => {
        const newChunks = new Map(prev);
        
        chunkResults.forEach(({ chunkId, features }) => {
          newChunks.set(chunkId, {
            id: chunkId,
            bounds: getChunkBounds(chunkId),
            features,
            loaded: true
          });
          loadingChunksRef.current.delete(chunkId);
        });

        return newChunks;
      });

      // Compile all features for current viewport
      const allFeatures: Feature[] = [];
      requiredChunks.forEach(chunkId => {
        const chunkResult = chunkResults.find(r => r.chunkId === chunkId);
        if (chunkResult) {
          allFeatures.push(...chunkResult.features);
        } else {
          const existingChunk = loadedChunks.get(chunkId);
          if (existingChunk?.loaded) {
            allFeatures.push(...existingChunk.features);
          }
        }
      });

      setCurrentFeatures(allFeatures);
      
      // Return in expected format (mainData contains all features, landData separate)
      const landFeatures = allFeatures.filter(f => f.properties?.name === 'New York City Land');
      const mainFeatures = allFeatures.filter(f => f.properties?.name !== 'New York City Land');
      
      return {
        features: mainFeatures,
        landData: landFeatures.length > 0 ? { type: 'FeatureCollection', features: landFeatures } : null
      };

    } catch (error) {
      console.error('Error loading viewport data:', error);
      return { features: [], landData: null };
    } finally {
      setIsProcessing(false);
      // Clean up loading markers
      chunksToLoad.forEach(chunkId => loadingChunksRef.current.delete(chunkId));
    }
  }, [getRequiredChunks, loadedChunks, loadChunkData, getChunkBounds]);

  return {
    isProcessing,
    setIsProcessing,
    loadViewportData,
    currentFeatures,
    loadedChunks: Array.from(loadedChunks.values())
  };
};