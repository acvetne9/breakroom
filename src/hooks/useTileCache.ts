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

// Persistent tile cache using localStorage
class PersistentTileCache {
  private static TILE_CACHE_KEY = 'tile_cache';
  private static ACCESS_TIMES_KEY = 'tile_access_times';

  static get(key: string): CachedTileData | undefined {
    try {
      const cache = localStorage.getItem(this.TILE_CACHE_KEY);
      if (!cache) return undefined;
      const parsed = JSON.parse(cache);
      return parsed[key];
    } catch {
      return undefined;
    }
  }

  static set(key: string, data: CachedTileData): void {
    try {
      const cache = localStorage.getItem(this.TILE_CACHE_KEY);
      const parsed = cache ? JSON.parse(cache) : {};
      parsed[key] = data;
      localStorage.setItem(this.TILE_CACHE_KEY, JSON.stringify(parsed));

      // Update access time
      const accessTimes = localStorage.getItem(this.ACCESS_TIMES_KEY);
      const parsedTimes = accessTimes ? JSON.parse(accessTimes) : {};
      parsedTimes[key] = Date.now();
      localStorage.setItem(this.ACCESS_TIMES_KEY, JSON.stringify(parsedTimes));
    } catch (e) {
      console.warn('Failed to cache tile data:', e);
    }
  }

  static has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  static delete(key: string): void {
    try {
      const cache = localStorage.getItem(this.TILE_CACHE_KEY);
      if (!cache) return;
      const parsed = JSON.parse(cache);
      delete parsed[key];
      localStorage.setItem(this.TILE_CACHE_KEY, JSON.stringify(parsed));

      const accessTimes = localStorage.getItem(this.ACCESS_TIMES_KEY);
      if (accessTimes) {
        const parsedTimes = JSON.parse(accessTimes);
        delete parsedTimes[key];
        localStorage.setItem(this.ACCESS_TIMES_KEY, JSON.stringify(parsedTimes));
      }
    } catch (e) {
      console.warn('Failed to delete tile data:', e);
    }
  }

  static clear(): void {
    localStorage.removeItem(this.TILE_CACHE_KEY);
    localStorage.removeItem(this.ACCESS_TIMES_KEY);
  }

  static size(): number {
    try {
      const cache = localStorage.getItem(this.TILE_CACHE_KEY);
      return cache ? Object.keys(JSON.parse(cache)).length : 0;
    } catch {
      return 0;
    }
  }

  static getAccessTimes(): Record<string, number> {
    try {
      const accessTimes = localStorage.getItem(this.ACCESS_TIMES_KEY);
      return accessTimes ? JSON.parse(accessTimes) : {};
    } catch {
      return {};
    }
  }

  static forEach(callback: (data: CachedTileData, key: string) => void): void {
    try {
      const cache = localStorage.getItem(this.TILE_CACHE_KEY);
      if (!cache) return;
      const parsed = JSON.parse(cache);
      Object.entries(parsed).forEach(([key, data]) => callback(data as CachedTileData, key));
    } catch {
      // Ignore errors
    }
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

// Cache cleanup - only remove excess entries if over limit
function cleanupCache(): void {
  // Only clean up if we're over the size limit
  if (PersistentTileCache.size() > MAX_CACHE_SIZE) {
    const accessTimes = PersistentTileCache.getAccessTimes();
    const sortedByAccess = Object.entries(accessTimes)
      .sort((a, b) => a[1] - b[1])
      .slice(0, PersistentTileCache.size() - MAX_CACHE_SIZE + 100); // Remove extra for buffer
    
    sortedByAccess.forEach(([key]) => {
      PersistentTileCache.delete(key);
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
  }): Business[] | null => {
    const tiles = getTilesForBounds(bounds);
    const cachedBusinesses: Business[] = [];
    
    // Check if all required tiles are cached
    for (const tile of tiles) {
      const key = getTileKey(tile);
      const cached = PersistentTileCache.get(key);
      
      if (!cached) {
        // Missing tile, cache miss
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
    
    // Remove duplicates (same business might be in multiple tiles)
    const uniqueBusinesses = filteredBusinesses.filter((business, index, arr) => 
      arr.findIndex(b => b.id === business.id) === index
    );
    
    // If no businesses found, treat as cache miss to trigger fresh data fetch
    if (uniqueBusinesses.length === 0) {
      console.log(`🎯 Tile cache MISS! ${tiles.length} tiles found but 0 businesses - fetching fresh data`);
      return null;
    }
    
    console.log(`🎯 Tile cache HIT! ${tiles.length} tiles, ${uniqueBusinesses.length} unique businesses`);
    return uniqueBusinesses;
  }, []);
  
  const setCachedBusinesses = useCallback((
    bounds: {
      north: number;
      south: number;
      east: number;
      west: number;
    },
    businesses: Business[]
  ): void => {
    const tiles = getTilesForBounds(bounds);
    const now = Date.now();
    
    // Distribute businesses across tiles
    for (const tile of tiles) {
      const key = getTileKey(tile);
      const tileBounds = getTileBounds(tile);
      
      // Find businesses that fall within this tile
      const tileBusinesses = businesses.filter(business =>
        business.position.lat >= tileBounds.south &&
        business.position.lat <= tileBounds.north &&
        business.position.lng >= tileBounds.west &&
        business.position.lng <= tileBounds.east
      );
      
      // Cache tile data
      PersistentTileCache.set(key, {
        businesses: tileBusinesses,
        timestamp: now,
        bounds: tileBounds
      });
    }
    
    console.log(`💾 Cached ${businesses.length} businesses across ${tiles.length} tiles`);
    
    // Trigger cleanup if cache is getting full
    if (PersistentTileCache.size() > MAX_CACHE_SIZE * 0.8) {
      setTimeout(cleanupCache, 0);
    }
  }, []);
  
  const clearCache = useCallback(() => {
    PersistentTileCache.clear();
    console.log('🧹 Cleared tile cache');
  }, []);
  
  const getCacheStats = useCallback(() => {
    return {
      size: PersistentTileCache.size(),
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