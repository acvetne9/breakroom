/**
 * Business search: one parser for the query box and one call to the
 * `search_businesses` Postgres function. Used by the dropdown (global, small
 * limit) and by the map (viewport-bounded, larger limit).
 */

import { supabase } from "@/integrations/supabase/client";
import type { Business } from "@/types/business";
import { mapBusinessRow } from "@/utils/businessMapper";
import { retryWithBackoff, isRetryableError } from "@/utils/retryWithBackoff";
import { findNeighborhoodBoundaryByName, getAllNeighborhoodNames, type NeighborhoodBounds } from "@/utils/nyc_neighborhoods";

export interface SalaryRange {
  /** Hourly, inclusive. */
  min?: number;
  max?: number;
}

export interface NeighborhoodMatch extends NeighborhoodBounds {
  center: { lat: number; lon: number };
}

/** What the user asked for, derived from the raw query. */
export interface SearchFilters {
  raw: string;
  /** Cleaned words with stop words removed; what the database matches on. */
  terms: string[];
  /** `terms` joined with spaces, for exact / prefix / fuzzy name matching. */
  phrase: string;
  salary?: SalaryRange;
  neighborhood?: NeighborhoodMatch;
}

export interface SearchResult extends Business {
  score: number;
  /** Why this row matched: "name", "role", "type", "address", "similar name", "neighborhood", "pay". */
  matchReasons: string[];
}

export const HOURS_PER_MONTH = 173;
export const HOURS_PER_YEAR = 2080;

// ---------------------------------------------------------------- parsing

const STOP_WORDS = new Set([
  "a", "an", "the", "in", "at", "on", "near", "around", "of", "for", "to", "with", "and", "or",
  "job", "jobs", "work", "working", "hiring", "gig", "gigs", "position", "positions",
  "nyc", "ny", "me", "my", "find", "show", "all", "any", "that", "this", "is", "are",
]);

// Short forms people actually type. Only used when the full name exists in the list.
const NEIGHBORHOOD_ALIASES: Record<string, string> = {
  ues: "Upper East Side",
  uws: "Upper West Side",
  les: "Lower East Side",
  fidi: "Financial District",
  "bed-stuy": "Bed Stuy",
  bedstuy: "Bed Stuy",
  "hells kitchen": "Hell's Kitchen",
  dtbk: "Downtown Brooklyn",
};

export const normalizeText = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9$/.+\-\s]/g, " ")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();

const stripSymbols = (text: string) => text.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const UNIT = "(hr|hour|hourly|hours|mo|month|monthly|yr|year|yearly|annual|annually)";
const NUM = "(\\d[\\d,]*(?:\\.\\d+)?)";
const SEP = "(?:\\s*\\/\\s*|\\s+per\\s+|\\s+an?\\s+)";

// "$20", "$20/hr", "$20-30/hr", "$60,000 a year", "20/hr", "20 per hour", "3000/mo"
const SALARY_WITH_DOLLAR = new RegExp(`\\$\\s*${NUM}(?:\\s*[-–]\\s*\\$?\\s*${NUM})?\\s*\\+?(?:${SEP}?${UNIT}\\b)?`, "i");
const SALARY_WITH_UNIT = new RegExp(`\\b${NUM}(?:\\s*[-–]\\s*${NUM})?\\s*\\+?${SEP}${UNIT}\\b`, "i");

const toHourly = (value: number, unit: string | undefined): number => {
  const u = (unit ?? "hr").toLowerCase();
  if (u.startsWith("mo")) return value / HOURS_PER_MONTH;
  if (u.startsWith("yr") || u.startsWith("year") || u.startsWith("annual")) return value / HOURS_PER_YEAR;
  return value;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pull a pay range out of the query. Returns the range and the query without it. */
export function parseSalary(query: string): { salary?: SalaryRange; rest: string } {
  const match = SALARY_WITH_DOLLAR.exec(query) ?? SALARY_WITH_UNIT.exec(query);
  if (!match) return { rest: query };

  const [full, lowRaw, highRaw] = match;
  const unit = match[3];
  const low = parseFloat(lowRaw.replace(/,/g, ""));
  const high = highRaw ? parseFloat(highRaw.replace(/,/g, "")) : undefined;
  if (Number.isNaN(low)) return { rest: query };

  // Words just before the amount decide the direction: "under $20", "at least $20".
  const before = query.slice(0, match.index).toLowerCase();
  const isMax = /(under|below|less than|up to|max(imum)?|at most)\s*$/.test(before);
  const isMin = /(over|above|more than|at least|min(imum)?|from|starting at)\s*$/.test(before) || full.includes("+");

  let salary: SalaryRange;
  if (high !== undefined) {
    salary = { min: round2(toHourly(Math.min(low, high), unit)), max: round2(toHourly(Math.max(low, high), unit)) };
  } else if (isMax) {
    salary = { max: round2(toHourly(low, unit)) };
  } else {
    // A bare amount means "this much or better".
    salary = { min: round2(toHourly(low, unit)) };
  }

  const rest = (query.slice(0, match.index) + " " + query.slice(match.index + full.length))
    .replace(/\b(under|below|less than|up to|max(imum)?|at most|over|above|more than|at least|min(imum)?|from|starting at|paying|pays|pay|salary|wage|rate)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { salary, rest };
}

/** Find a neighborhood mentioned anywhere in the query. Returns it and the query without it. */
export function parseNeighborhood(query: string): { neighborhood?: NeighborhoodMatch; rest: string } {
  const normalized = ` ${stripSymbols(normalizeText(query))} `;

  const candidates: Array<{ key: string; name: string }> = [
    ...getAllNeighborhoodNames().map((name) => ({ key: stripSymbols(normalizeText(name)), name })),
    ...Object.entries(NEIGHBORHOOD_ALIASES).map(([alias, name]) => ({ key: stripSymbols(normalizeText(alias)), name })),
  ].sort((a, b) => b.key.length - a.key.length); // longest first so "upper east side" beats "east"

  for (const { key, name } of candidates) {
    if (!key || !normalized.includes(` ${key} `)) continue;
    const bounds = findNeighborhoodBoundaryByName(name);
    if (!bounds?.boundary?.length) continue;

    const lats = bounds.boundary.map((p) => p.lat);
    const lons = bounds.boundary.map((p) => p.lon);
    const neighborhood: NeighborhoodMatch = {
      ...bounds,
      center: { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: (Math.min(...lons) + Math.max(...lons)) / 2 },
    };
    const rest = normalized.replace(` ${key} `, " ").replace(/\s+/g, " ").trim();
    return { neighborhood, rest };
  }

  return { rest: stripSymbols(normalizeText(query)) };
}

/** Turn a raw query into filters. Returns null when there is nothing to search for. */
export function parseSearchQuery(raw: string): SearchFilters | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const { salary, rest: afterSalary } = parseSalary(trimmed);
  const { neighborhood, rest: afterNeighborhood } = parseNeighborhood(afterSalary);

  const terms = afterNeighborhood
    .replace(/\bnew york( city)?\b/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));

  if (terms.length === 0 && !salary && !neighborhood) return null;

  return { raw: trimmed, terms, phrase: terms.join(" "), salary, neighborhood };
}

/** Stable identity for a set of filters (cache keys, effect deps). */
export const searchFiltersKey = (f: SearchFilters | null | undefined): string =>
  f ? JSON.stringify({ t: f.terms, s: f.salary ?? null, n: f.neighborhood?.name ?? null }) : "";

// ---------------------------------------------------------------- querying

const searchCache = new Map<string, { results: SearchResult[]; timestamp: number }>();
const CACHE_DURATION = 30_000;
const MAX_CACHE_SIZE = 100;

export const clearSearchCache = () => searchCache.clear();

const polygonGeoJson = (n: NeighborhoodMatch | undefined): string | null => {
  if (!n?.boundary?.length) return null;
  const ring = n.boundary.map((p) => [p.lon, p.lat]);
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx !== lx || fy !== ly) ring.push(ring[0]);
  return JSON.stringify({ type: "Polygon", coordinates: [ring] });
};

export interface SearchOptions {
  bounds?: { north: number; south: number; east: number; west: number };
  limit?: number;
}

export async function searchBusinesses(filters: SearchFilters, options: SearchOptions = {}): Promise<SearchResult[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 5000);
  const cacheKey = JSON.stringify({ k: searchFiltersKey(filters), b: options.bounds ?? null, limit });

  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) return cached.results;

  const { data, error } = await retryWithBackoff(
    () =>
      supabase.rpc("search_businesses", {
        terms: filters.terms,
        phrase: filters.phrase || undefined,
        min_hourly: filters.salary?.min,
        max_hourly: filters.salary?.max,
        polygon_geojson: polygonGeoJson(filters.neighborhood) ?? undefined,
        min_lat: options.bounds?.south,
        max_lat: options.bounds?.north,
        min_lng: options.bounds?.west,
        max_lng: options.bounds?.east,
        result_limit: limit,
      }),
    { shouldRetry: isRetryableError },
  );

  if (error) {
    console.error("search_businesses failed:", error);
    return [];
  }

  const results: SearchResult[] = (data ?? []).map((row) => ({
    ...mapBusinessRow(row),
    score: Number(row.score),
    matchReasons: row.match_reasons ?? [],
  }));

  if (searchCache.size >= MAX_CACHE_SIZE) {
    const oldest = searchCache.keys().next().value;
    if (oldest) searchCache.delete(oldest);
  }
  searchCache.set(cacheKey, { results, timestamp: Date.now() });
  return results;
}

/** Parse + search in one call, for the typeahead. */
export async function searchBusinessesByQuery(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  const filters = parseSearchQuery(query);
  if (!filters) return [];
  return searchBusinesses(filters, options);
}
