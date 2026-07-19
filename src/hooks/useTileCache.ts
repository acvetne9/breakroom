import { useState, useCallback, useRef } from 'react';
import type { Business } from '@/types/business';

// Tile-based caching system for optimal cache hit rates
interface TileKey {
  z: number;
  x: number;
  y: number;
}

interface CachedTileData {
  businesses: Business[];
  timestamp: number;
  // Map zoom this tile was fetched at. Higher zoom = denser/more complete data,
  // so a tile is only served for a request whose zoom is <= the cached zoom.
  zoom: number;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

// Cache configuration - INFINITE CACHE
const MAX_CACHE_SIZE = 5000; // increased tiles limit
const TILE_ZOOM_LEVEL = 14; // Fixed zoom for tiling (higher = smaller tiles)

// In-memory tile cache - much faster than localStorage (Phase 4)
class InMemoryTileCache {
  private static cache = new Map<string, CachedTileData>();
  private static accessTimes = new Map<string, number>();

  static get(key: string): CachedTileData | undefined {
    const data = this.cache.get(key);
    if (data) {
      this.accessTimes.set(key, Date.now()); // Update access time
    }
    return data;
  }

  static set(key: string, data: CachedTileData): void {
    this.cache.set(key, data);
    this.accessTimes.set(key, Date.now());
  }

  static has(key: string): boolean {
    return this.cache.has(key);
  }

  static delete(key: string): void {
    this.cache.delete(key);
    this.accessTimes.delete(key);
  }

  static clear(): void {
    this.cache.clear();
    this.accessTimes.clear();
  }

  static size(): number {
    return this.cache.size;
  }

  static getAccessTimes(): Map<string, number> {
    return this.accessTimes;
  }

  static forEach(callback: (data: CachedTileData, key: string) => void): void {
    this.cache.forEach((data, key) => callback(data, key));
  }
}

// Utility functions for tile calculations
function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

function latLng2Tile(lat: number, lng: number, zoom: number): TileKey {
  const x = Math.floor((lng + 180) / 360 * Math.pow(2, zoom));
  const y = Math.floor((1 - Math.log(Math.tan(deg2rad(lat)) + 1 / Math.cos(deg2rad(lat))) / Math.PI) / 2 * Math.pow(2, zoom));
  return { z: zoom, x, y };
}

function tile2LatLng(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const lng = x / Math.pow(2, zoom) * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, zoom);
  const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

function getTileBounds(tileKey: TileKey): { north: number; south: number; east: number; west: number } {
  const nw = tile2LatLng(tileKey.x, tileKey.y, tileKey.z);
  const se = tile2LatLng(tileKey.x + 1, tileKey.y + 1, tileKey.z);
  
  return {
    north: nw.lat,
    south: se.lat,
    east: se.lng,
    west: nw.lng
  };
}

function getTileKey(tileKey: TileKey): string {
  return `${tileKey.z}/${tileKey.x}/${tileKey.y}`;
}

function getTilesForBounds(bounds: {
  north: number;
  south: number;
  east: number;
  west: number;
}, zoom: number = TILE_ZOOM_LEVEL): TileKey[] {
  const nw = latLng2Tile(bounds.north, bounds.west, zoom);
  const se = latLng2Tile(bounds.south, bounds.east, zoom);
  
  const tiles: TileKey[] = [];
  
  for (let x = nw.x; x <= se.x; x++) {
    for (let y = nw.y; y <= se.y; y++) {
      tiles.push({ z: zoom, x, y });
    }
  }
  
  return tiles;
}

// Cache cleanup - only remove excess entries if over limit (Phase 4 - optimized for in-memory)
function cleanupCache(): void {
  // Only clean up if we're over the size limit
  if (InMemoryTileCache.size() > MAX_CACHE_SIZE) {
    const accessTimes = InMemoryTileCache.getAccessTimes();
    const sortedByAccess = Array.from(accessTimes.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, InMemoryTileCache.size() - MAX_CACHE_SIZE + 100); // Remove extra for buffer
    
    sortedByAccess.forEach(([key]) => {
      InMemoryTileCache.delete(key);
    });
  }
}

export const useTileCache = () => {
  const cleanupTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Periodic cache cleanup only for size management
  if (!cleanupTimerRef.current) {
    cleanupTimerRef.current = setInterval(cleanupCache, 300000); // Clean every 5 minutes
  }
  
  const getCachedBusinesses = useCallback((bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  }, minZoom: number = 0): Business[] | null => {
    const tiles = getTilesForBounds(bounds);
    const cachedBusinesses: Business[] = [];

    // Check if all required tiles are cached at sufficient detail
    for (const tile of tiles) {
      const key = getTileKey(tile);
      const cached = InMemoryTileCache.get(key);

      if (!cached || cached.zoom < minZoom) {
        // Missing tile, or cached at a lower (sparser) zoom than needed → cache miss
        return null;
      }

      // Add businesses from this tile
      cachedBusinesses.push(...cached.businesses);
    }
    
    // Filter businesses to exact bounds (tiles might overlap)
    const filteredBusinesses = cachedBusinesses.filter(business => 
      business.position.lat >= bounds.south &&
      business.position.lat <= bounds.north &&
      business.position.lng >= bounds.west &&
      business.position.lng <= bounds.east
    );
    
    // Remove duplicates using Set for O(n) performance
    const seenIds = new Set<string>();
    const uniqueBusinesses = filteredBusinesses.filter(business => {
      if (seenIds.has(business.id)) return false;
      seenIds.add(business.id);
      return true;
    });
    
    console.log(`🎯 Tile cache HIT! ${tiles.length} tiles, ${uniqueBusinesses.length} unique businesses`);
    return uniqueBusinesses; // Return empty array if no businesses - this is still a valid cache hit
  }, []);
  
  const setCachedBusinesses = useCallback((
    bounds: {
      north: number;
      south: number;
      east: number;
      west: number;
    },
    businesses: Business[],
    zoom: number = TILE_ZOOM_LEVEL
  ): void => {
    const tiles = getTilesForBounds(bounds);
    const now = Date.now();

    // Distribute businesses across tiles
    for (const tile of tiles) {
      const key = getTileKey(tile);

      // Don't overwrite a tile already cached at a higher (denser) zoom with
      // sparser data from a lower zoom.
      const existing = InMemoryTileCache.get(key);
      if (existing && existing.zoom > zoom) continue;

      const tileBounds = getTileBounds(tile);

      // Find businesses that fall within this tile
      const tileBusinesses = businesses.filter(business =>
        business.position.lat >= tileBounds.south &&
        business.position.lat <= tileBounds.north &&
        business.position.lng >= tileBounds.west &&
        business.position.lng <= tileBounds.east
      );

      // Cache tile data
      InMemoryTileCache.set(key, {
        businesses: tileBusinesses,
        timestamp: now,
        zoom,
        bounds: tileBounds
      });
    }
    
    console.log(`💾 Cached ${businesses.length} businesses across ${tiles.length} tiles`);
    
    // Trigger cleanup if cache is getting full (use requestIdleCallback - Phase 5)
    if (InMemoryTileCache.size() > MAX_CACHE_SIZE * 0.8) {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(cleanupCache, { timeout: 5000 });
      } else {
        setTimeout(cleanupCache, 100);
      }
    }
  }, []);
  
  const clearCache = useCallback(() => {
    InMemoryTileCache.clear();
    console.log('🧹 Cleared tile cache');
  }, []);
  
  const getCacheStats = useCallback(() => {
    return {
      size: InMemoryTileCache.size(),
      maxSize: MAX_CACHE_SIZE,
      ttl: 'infinite',
      tileZoom: TILE_ZOOM_LEVEL
    };
  }, []);
  
  return {
    getCachedBusinesses,
    setCachedBusinesses,
    clearCache,
    getCacheStats
  };
};