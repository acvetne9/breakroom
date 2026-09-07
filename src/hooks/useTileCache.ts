import { useCallback } from "react";
import type { Business } from "@/types/business";
import { TILE_ZOOM_LEVEL, getTilesForBounds, getTileBounds, getTileKey, type TileBounds, type TileKey } from "@/utils/tiles";

/**
 * In-memory cache of businesses keyed by zoom-14 tile.
 *
 * Each entry remembers the map zoom it was fetched at and whether it is
 * `partial`. A partial tile came from a row-limited fetch that covered many
 * tiles at once (a zoomed-out viewport), so it holds only a sample of the
 * businesses in that tile. Partial tiles are good enough to draw a zoomed-out
 * map but must never be served to the per-tile loader, which expects every
 * business in the tile.
 */
interface CachedTileData {
  businesses: Business[];
  timestamp: number;
  zoom: number;
  partial: boolean;
  bounds: TileBounds;
}

const MAX_CACHE_SIZE = 5000;

const cache = new Map<string, CachedTileData>();
const accessTimes = new Map<string, number>();

function readTile(key: string): CachedTileData | undefined {
  const data = cache.get(key);
  if (data) accessTimes.set(key, Date.now());
  return data;
}

function writeTile(key: string, data: CachedTileData): void {
  cache.set(key, data);
  accessTimes.set(key, Date.now());
  if (cache.size > MAX_CACHE_SIZE) evictOldest(cache.size - MAX_CACHE_SIZE + 100);
}

function evictOldest(count: number): void {
  Array.from(accessTimes.entries())
    .sort((a, b) => a[1] - b[1])
    .slice(0, count)
    .forEach(([key]) => {
      cache.delete(key);
      accessTimes.delete(key);
    });
}

const inTile = (b: Business, t: TileBounds) =>
  b.position.lat >= t.south && b.position.lat <= t.north && b.position.lng >= t.west && b.position.lng <= t.east;

/** Businesses for one tile, or null if it is missing, too sparse, or partial. */
export function getCachedTile(tile: TileKey, minZoom: number): Business[] | null {
  const cached = readTile(getTileKey(tile));
  if (!cached || cached.partial || cached.zoom < minZoom) return null;
  return cached.businesses;
}

export function isTileCached(tile: TileKey, minZoom: number): boolean {
  return getCachedTile(tile, minZoom) !== null;
}

/** Store one complete tile's businesses. */
export function setCachedTile(tile: TileKey, businesses: Business[], zoom: number): void {
  const key = getTileKey(tile);
  const existing = readTile(key);
  if (existing && !existing.partial && existing.zoom > zoom) return;
  writeTile(key, { businesses, timestamp: Date.now(), zoom, partial: false, bounds: getTileBounds(tile) });
}

export const useTileCache = () => {
  /**
   * Every tile under `bounds` from the cache, or null on any miss.
   * With `allowPartial`, tiles sampled by a wide fetch count as hits.
   */
  const getCachedBusinesses = useCallback(
    (bounds: TileBounds, minZoom: number = 0, allowPartial = false): Business[] | null => {
      const tiles = getTilesForBounds(bounds);
      const collected: Business[] = [];

      for (const tile of tiles) {
        const cached = readTile(getTileKey(tile));
        if (!cached || cached.zoom < minZoom || (cached.partial && !allowPartial)) return null;
        collected.push(...cached.businesses);
      }

      const seen = new Set<string>();
      return collected.filter((b) => inTile(b, bounds) && !seen.has(b.id) && seen.add(b.id));
    },
    [],
  );

  /**
   * Scatter a viewport-wide result into its tiles. Mark `partial` when the
   * fetch was row-limited across many tiles, so the per-tile loader refetches.
   */
  const setCachedBusinesses = useCallback(
    (bounds: TileBounds, businesses: Business[], zoom: number = TILE_ZOOM_LEVEL, partial = false): void => {
      const now = Date.now();
      for (const tile of getTilesForBounds(bounds)) {
        const key = getTileKey(tile);
        const existing = readTile(key);
        // Never downgrade a complete tile to a partial one, or a denser one to a sparser one.
        if (existing && !existing.partial && (partial || existing.zoom > zoom)) continue;
        const tileBounds = getTileBounds(tile);
        writeTile(key, { businesses: businesses.filter((b) => inTile(b, tileBounds)), timestamp: now, zoom, partial, bounds: tileBounds });
      }
    },
    [],
  );

  const clearCache = useCallback(() => {
    cache.clear();
    accessTimes.clear();
  }, []);

  return { getCachedBusinesses, setCachedBusinesses, getCachedTile, setCachedTile, isTileCached, clearCache };
};
