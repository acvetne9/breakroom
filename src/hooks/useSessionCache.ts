import { useState, useCallback, useEffect } from 'react';

interface CacheOptions<T> {
  key: string;
  version: string;
  deserialize?: (data: any) => T;
  serialize?: (data: T) => any;
}

/**
 * Reusable hook for sessionStorage caching with version control
 * Handles cache invalidation when version changes
 */
export function useSessionCache<T>(options: CacheOptions<T>) {
  const { key, version, deserialize, serialize } = options;

  const versionKey = `${key}_version`;

  // Helper to get cached data
  const getCached = useCallback((): T | null => {
    try {
      const cachedVersion = sessionStorage.getItem(versionKey);
      if (cachedVersion !== version) {
        // Version mismatch, clear cache
        sessionStorage.removeItem(key);
        sessionStorage.setItem(versionKey, version);
        return null;
      }

      const cached = sessionStorage.getItem(key);
      if (!cached) return null;

      const parsed = JSON.parse(cached);
      return deserialize ? deserialize(parsed) : parsed;
    } catch (error) {
      console.warn(`Failed to read cache for ${key}:`, error);
      return null;
    }
  }, [key, version, versionKey, deserialize]);

  // Helper to save to cache
  const saveToCache = useCallback((data: T) => {
    try {
      const toSave = serialize ? serialize(data) : data;
      sessionStorage.setItem(key, JSON.stringify(toSave));
      sessionStorage.setItem(versionKey, version);
    } catch (error) {
      console.warn(`Failed to save cache for ${key}:`, error);
    }
  }, [key, version, versionKey, serialize]);

  // Helper to clear cache
  const clearCache = useCallback(() => {
    try {
      sessionStorage.removeItem(key);
      sessionStorage.removeItem(versionKey);
    } catch (error) {
      console.warn(`Failed to clear cache for ${key}:`, error);
    }
  }, [key, versionKey]);

  // Initialize with cached data
  const [cachedData, setCachedData] = useState<T | null>(() => getCached());

  // Update cache when data changes
  const updateCache = useCallback((data: T) => {
    saveToCache(data);
    setCachedData(data);
  }, [saveToCache]);

  return {
    cachedData,
    getCached,
    saveToCache,
    updateCache,
    clearCache
  };
}
