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

// Cache configuration
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_SIZE = 500; // tiles
const TILE_ZOOM_LEVEL = 14; // Fixed zoom for tiling (higher = smaller tiles)

// Global tile cache (persists across component unmounts)
const tileCache = new Map<string, CachedTileData>();
const cacheAccessTimes = new Map<string, number>();

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

// Cache cleanup
function cleanupCache(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  
  // Find expired entries
  tileCache.forEach((data, key) => {
    if (now - data.timestamp > CACHE_TTL) {
      keysToDelete.push(key);
    }
  });
  
  // Delete expired entries
  keysToDelete.forEach(key => {
    tileCache.delete(key);
    cacheAccessTimes.delete(key);
  });
  
  // If still over limit, delete least recently accessed
  if (tileCache.size > MAX_CACHE_SIZE) {
    const sortedByAccess = Array.from(cacheAccessTimes.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, tileCache.size - MAX_CACHE_SIZE + 50); // Remove extra for buffer
    
    sortedByAccess.forEach(([key]) => {
      tileCache.delete(key);
      cacheAccessTimes.delete(key);
    });
  }
}

export const useTileCache = () => {
  const cleanupTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Periodic cache cleanup
  if (!cleanupTimerRef.current) {
    cleanupTimerRef.current = setInterval(cleanupCache, 60000); // Clean every minute
  }
  
  const getCachedBusinesses = useCallback((bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  }): Business[] | null => {
    const tiles = getTilesForBounds(bounds);
    const cachedBusinesses: Business[] = [];
    const now = Date.now();
    
    // Check if all required tiles are cached and valid
    for (const tile of tiles) {
      const key = getTileKey(tile);
      const cached = tileCache.get(key);
      
      if (!cached || (now - cached.timestamp > CACHE_TTL)) {
        // Missing or expired tile, cache miss
        return null;
      }
      
      // Update access time
      cacheAccessTimes.set(key, now);
      
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
      tileCache.set(key, {
        businesses: tileBusinesses,
        timestamp: now,
        bounds: tileBounds
      });
      
      cacheAccessTimes.set(key, now);
    }
    
    console.log(`💾 Cached ${businesses.length} businesses across ${tiles.length} tiles`);
    
    // Trigger cleanup if cache is getting full
    if (tileCache.size > MAX_CACHE_SIZE * 0.8) {
      setTimeout(cleanupCache, 0);
    }
  }, []);
  
  const clearCache = useCallback(() => {
    tileCache.clear();
    cacheAccessTimes.clear();
    console.log('🧹 Cleared tile cache');
  }, []);
  
  const getCacheStats = useCallback(() => {
    return {
      size: tileCache.size,
      maxSize: MAX_CACHE_SIZE,
      ttl: CACHE_TTL,
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