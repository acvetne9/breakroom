import { useState, useEffect, useCallback, useRef } from "react";
import { Business } from "@/types/business";
import { getBusinessesInViewport, getFullBusinessDetailsCached } from "@/services/businesses";
import { searchBusinessesUnified } from "@/services/unifiedSearch";
import type { SearchFilters } from "@/services/businessFiltering";
import { isPointInPolygon } from "@/utils/nyc_neighborhoods";
import { useTileCache, getCachedTile, setCachedTile } from "./useTileCache";
import { getTilesForBounds, getTileBounds, getTileKey, sortTilesCenterOut, type TileKey } from "@/utils/tiles";

// Dedupe concurrent fetches of the same viewport / tile.
const inflightRequests = new Map<string, Promise<Business[]>>();
const inflightTiles = new Map<string, Promise<Business[]>>();

// Cap the accumulated browse-mode set so long panning sessions stay light to render.
const MAX_ACCUMULATED_BUSINESSES = 40000;

// Wide views cover too many z14 tiles to chunk efficiently; above this we do
// one viewport fetch instead and cache the result as partial tiles.
const MAX_CHUNK_TILES = 24;

// Neighbouring tiles to warm after the map settles.
const MAX_PRELOAD_TILES = 24;

// A single zoom-14 tile never holds more rows than this (densest is ~1,700),
// so a per-tile fetch at this limit is complete.
const TILE_ROW_LIMIT = 5000;

/** Concurrency limiter, tighter when zoomed out (bigger responses). */
class RequestQueue {
  private activeRequests = 0;
  private maxConcurrent = 3;

  setMaxConcurrent(zoom: number) {
    if (zoom <= 10) this.maxConcurrent = 1;
    else if (zoom <= 12) this.maxConcurrent = 2;
    else if (zoom <= 14) this.maxConcurrent = 3;
    else this.maxConcurrent = 4;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    while (this.activeRequests >= this.maxConcurrent) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    this.activeRequests++;
    try {
      return await fn();
    } finally {
      this.activeRequests--;
    }
  }

  get active() {
    return this.activeRequests;
  }
}

const requestQueue = new RequestQueue();

export type MapBounds = { north: number; south: number; east: number; west: number };
type MapPoint = { lat: number; lon: number };

const filtersKey = (f: SearchFilters | null | undefined) =>
  f
    ? [(f.textTerms ?? []).join(","), f.roleFilter ?? "", f.businessTypeFilter ?? "", f.neighborhoodFilter?.name ?? ""].join("|")
    : "";

/** Fetch one complete tile, de-duplicated across callers, and cache it. */
function fetchTile(tile: TileKey, zoom: number): Promise<Business[]> {
  const key = `${getTileKey(tile)}-${Math.round(zoom)}`;
  let p = inflightTiles.get(key);
  if (!p) {
    p = requestQueue
      .run(() => getBusinessesInViewport(getTileBounds(tile), TILE_ROW_LIMIT))
      .then((res) => {
        setCachedTile(tile, res, zoom);
        return res;
      })
      .finally(() => inflightTiles.delete(key));
    inflightTiles.set(key, p);
  }
  return p;
}

/** The ring of tiles one step outside the viewport, nearest first. */
function ringAround(viewport: MapBounds): TileKey[] {
  const inside = new Set(getTilesForBounds(viewport).map(getTileKey));
  const latPad = viewport.north - viewport.south;
  const lngPad = viewport.east - viewport.west;
  const outer = getTilesForBounds({
    north: viewport.north + latPad,
    south: viewport.south - latPad,
    east: viewport.east + lngPad,
    west: viewport.west - lngPad,
  });
  return sortTilesCenterOut(
    outer.filter((t) => !inside.has(getTileKey(t))),
    viewport,
  );
}

export const useViewportBusinesses = (searchFilters?: SearchFilters | null) => {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preloadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentZoomRef = useRef<number>(12);
  const lastFiltersKeyRef = useRef<string>("");
  const loadingRef = useRef(false);
  const hasBusinessesRef = useRef(false);
  hasBusinessesRef.current = businesses.length > 0;

  const { getCachedBusinesses, setCachedBusinesses } = useTileCache();

  /**
   * Warm the tiles just outside the viewport once the user settles. Each tile
   * is fetched whole, so the cache only ever holds complete tiles from here.
   */
  const schedulePreload = useCallback(
    (bounds: MapBounds) => {
      if (preloadTimeoutRef.current) clearTimeout(preloadTimeoutRef.current);
      if (searchFilters) return;
      if (getTilesForBounds(bounds).length > MAX_CHUNK_TILES) return; // zoomed out: not worth it

      preloadTimeoutRef.current = setTimeout(async () => {
        const zoom = currentZoomRef.current;
        if (zoom <= 12 && requestQueue.active > 0) return;
        const missing = ringAround(bounds)
          .filter((tile) => !getCachedTile(tile, zoom))
          .slice(0, MAX_PRELOAD_TILES);
        for (const tile of missing) {
          try {
            await fetchTile(tile, zoom);
          } catch (err) {
            console.warn("Preload failed:", err);
          }
        }
      }, 1000);
    },
    [searchFilters],
  );

  const loadBusinessesInViewport = useCallback(
    async (viewportBounds: MapBounds, limit = 8000, isMoving = false, viewZoom?: number) => {
      if (viewZoom != null) currentZoomRef.current = viewZoom;
      const effZoom = currentZoomRef.current;

      const searchPolygon: MapPoint[] | null = searchFilters?.neighborhoodFilter?.boundary?.length
        ? (searchFilters.neighborhoodFilter.boundary as MapPoint[])
        : null;

      const key = filtersKey(searchFilters);
      const isNewSearch = key !== lastFiltersKeyRef.current;

      if (isNewSearch) {
        lastFiltersKeyRef.current = key;
        setBusinesses([]);
      }

      if (loadingRef.current && !isNewSearch && !isMoving) return;

      setIsSearching(!!searchFilters);

      const requestKey = `${viewportBounds.north}-${viewportBounds.south}-${viewportBounds.east}-${viewportBounds.west}-${limit}-${key}`;
      const inflight = inflightRequests.get(requestKey);
      if (inflight) {
        try {
          const result = await inflight;
          setBusinesses(result);
          return result;
        } catch (err) {
          console.error("In-flight request failed", err);
        }
      }

      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
      const delay = hasBusinessesRef.current ? (isMoving ? 400 : 150) : 0;

      const setLoadingState = (value: boolean) => {
        loadingRef.current = value;
        setLoading(value);
      };

      loadTimeoutRef.current = setTimeout(async () => {
        requestQueue.setMaxConcurrent(effZoom);

        // ---------- SEARCH MODE: query the current viewport, replace results ----------
        // The search service caches by (filters, bounds) for 30 s, so panning back
        // and forth is cheap; new ground triggers a new query.
        if (searchFilters) {
          setLoadingState(true);
          const requestPromise = requestQueue.run(() => searchBusinessesUnified(searchFilters, viewportBounds, limit));
          inflightRequests.set(requestKey, requestPromise);
          try {
            let results = await requestPromise;
            if (searchPolygon) {
              results = results.filter((b) => isPointInPolygon({ lat: b.position.lat, lon: b.position.lng }, searchPolygon));
            }
            setBusinesses(results);
            return results;
          } catch (err) {
            console.error("Error loading search results:", err);
            return [];
          } finally {
            inflightRequests.delete(requestKey);
            setLoadingState(false);
          }
        }

        // ---------- BROWSE MODE: tile-chunked, progressive, center-out ----------
        const mergeTile = (incoming: Business[]) => {
          if (!incoming.length) return;
          setBusinesses((prev) => {
            const seen = new Set(prev.map((b) => b.id));
            const fresh = incoming.filter((b) => !seen.has(b.id));
            if (!fresh.length) return prev;
            const merged = [...prev, ...fresh];
            return merged.length > MAX_ACCUMULATED_BUSINESSES ? merged.slice(merged.length - MAX_ACCUMULATED_BUSINESSES) : merged;
          });
        };

        const allTiles = getTilesForBounds(viewportBounds);

        // Zoomed out: one row-limited fetch for the whole viewport. The rows are a
        // sample, so they are cached as *partial* tiles that only satisfy other
        // wide fetches, never the per-tile loader below.
        if (allTiles.length > MAX_CHUNK_TILES) {
          const cached = getCachedBusinesses(viewportBounds, effZoom, true);
          if (cached) {
            mergeTile(cached);
            return;
          }
          setLoadingState(true);
          try {
            const res = await requestQueue.run(() => getBusinessesInViewport(viewportBounds, limit));
            setCachedBusinesses(viewportBounds, res, effZoom, true);
            mergeTile(res);
          } catch (err) {
            console.error("Error loading businesses:", err);
          } finally {
            setLoadingState(false);
          }
          return;
        }

        // Zoomed in: cover the viewport with complete tiles, center-out.
        const tiles = sortTilesCenterOut(allTiles, viewportBounds);
        const missing = tiles.filter((tile) => {
          const cached = getCachedTile(tile, effZoom);
          if (cached) {
            mergeTile(cached);
            return false;
          }
          return true;
        });

        if (missing.length === 0) {
          schedulePreload(viewportBounds);
          return;
        }

        setLoadingState(true);
        try {
          await Promise.all(missing.map((tile) => fetchTile(tile, effZoom).then(mergeTile).catch((e) => console.warn("Tile fetch failed", e))));
        } finally {
          setLoadingState(false);
          schedulePreload(viewportBounds);
        }
      }, delay);
    },
    [searchFilters, getCachedBusinesses, setCachedBusinesses, schedulePreload],
  );

  /** Full details (roles + votes) for one business, merged into the viewport list. */
  const fetchFullBusinessDetails = useCallback(async (businessId: string) => {
    const full = await getFullBusinessDetailsCached(businessId);
    if (full) setBusinesses((prev) => prev.map((b) => (b.id === businessId ? full : b)));
    return full;
  }, []);

  useEffect(() => {
    return () => {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
      if (preloadTimeoutRef.current) clearTimeout(preloadTimeoutRef.current);
    };
  }, [searchFilters]);

  return { businesses, loading, isSearching, loadBusinessesInViewport, fetchFullBusinessDetails };
};
