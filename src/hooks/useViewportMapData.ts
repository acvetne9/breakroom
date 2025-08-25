import { useState, useCallback, useRef } from 'react';
import type { FeatureCollection, Feature } from 'geojson';
import * as turf from '@turf/turf';
import { ungzip } from 'pako';

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
  // Caches to avoid refetching and reduce memory duplication
  const mainDataRef = useRef<FeatureCollection | null>(null);
  const landDataRef = useRef<FeatureCollection | null>(null);
  const chunkIndexRef = useRef<Map<string, Feature[]>>(new Map());

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

  // Load and cache main/land data once, and pre-index features by chunk
  const ensureDataLoaded = useCallback(async () => {
    if (!mainDataRef.current) {
      // Try loading compressed first for mobile reliability
      try {
        const gzRes = await fetch('/data/example-points.geojson.gz');
        if (!gzRes.ok) throw new Error('Failed to fetch gz main data');
        const buf = await gzRes.arrayBuffer();
        const text = ungzip(new Uint8Array(buf), { to: 'string' }) as string;
        mainDataRef.current = JSON.parse(text);
        console.log(`📍 Main data loaded once (gz): ${mainDataRef.current.features?.length || 0} features`);
      } catch (gzErr) {
        console.warn('gz main data load failed, falling back to uncompressed:', gzErr);
        const res = await fetch('/data/example-points.geojson');
        if (!res.ok) throw new Error('Failed to fetch main data');
        mainDataRef.current = await res.json();
        console.log(`📍 Main data loaded once (json): ${mainDataRef.current.features?.length || 0} features`);
      }
    }
    if (!landDataRef.current) {
      const res = await fetch('/data/nyc_land.geojson');
      if (!res.ok) throw new Error('Failed to fetch land data');
      landDataRef.current = await res.json();
      console.log(`🏞️ Land data loaded once: ${landDataRef.current.features?.length || 0} features`);
    }
    // Build chunk index once
    if (chunkIndexRef.current.size === 0 && mainDataRef.current) {
      console.log('🧩 Building chunk index for features...');
      const index = new Map<string, Feature[]>();
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
          index.set(`${x}-${y}`, []);
        }
      }
      for (const feature of mainDataRef.current.features) {
        try {
          if (feature.geometry?.type === 'Point') {
            const [lng, lat] = feature.geometry.coordinates as [number, number];
            const x = Math.min(Math.max(Math.floor((lng - NYC_BOUNDS.west) / CHUNK_WIDTH), 0), GRID_SIZE - 1);
            const y = Math.min(Math.max(Math.floor((lat - NYC_BOUNDS.south) / CHUNK_HEIGHT), 0), GRID_SIZE - 1);
            const id = `${x}-${y}`;
            index.get(id)!.push(feature);
          } else {
            // Skip non-point features here; land polygons are handled separately
          }
        } catch (e) {
          // Skip problematic feature
        }
      }
      chunkIndexRef.current = index;
      console.log('✅ Chunk index built');
    }
  }, []);

  const loadChunkData = useCallback(async (chunkId: string): Promise<Feature[]> => {
    console.log(`🗺️ Loading chunk ${chunkId} (from cache)`);
    await ensureDataLoaded();
    const features = chunkIndexRef.current.get(chunkId) || [];
    console.log(`✅ Chunk ${chunkId} loaded with ${features.length} features (cached, no refetch)`);
    return features;
  }, [ensureDataLoaded]);

  const loadAllDataCenterOut = useCallback(async () => {
    if (allDataLoaded || isProcessing) {
      await ensureDataLoaded();
      const cached = currentFeatures.length ? currentFeatures : (mainDataRef.current?.features as Feature[] | undefined) || [];
      return { features: cached, landData: landDataRef.current };
    }
    
    setIsProcessing(true);
    
    try {
      // Load full dataset once (cached) and return
      await ensureDataLoaded();
      const features = (mainDataRef.current?.features as Feature[]) || [];
      setCurrentFeatures(features);
      setAllDataLoaded(true);
      console.log(`Loaded full dataset once: ${features.length} features`);
      return { features, landData: landDataRef.current };
      
    } catch (error) {
      console.error('Error loading all map data:', error);
      return { features: [], landData: null };
    } finally {
      setIsProcessing(false);
    }
  }, [allDataLoaded, isProcessing, getAllChunksInCenterOutOrder, loadedChunks, loadChunkData, getChunkBounds]);

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