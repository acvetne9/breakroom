import { useState, useCallback, useRef } from 'react';
import type { Business } from '@/types/business';
import { TILE_ZOOM_LEVEL, getTilesForBounds, getTileBounds, getTileKey } from '@/utils/tiles';

// Tile-based caching system for optimal cache hit rates
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