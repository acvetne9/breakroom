// Every city the app can show. One config drives the map (tiles, bounds,
// landmarks), the database (which business tables to read) and search
// (neighborhood names, stop words). The current city is remembered per device
// in localStorage and read synchronously, so services can pick the right
// tables without React plumbing; `CityContext` wraps it for components.

import { NYC_BOUNDS, NYC_CENTER, type MapBounds } from "./geo";
import { nycNeighborhoodBoundaries, type NeighborhoodBounds } from "./nyc_neighborhoods";
import { chicagoNeighborhoodBoundaries } from "./chicago_neighborhoods";

export type CityId = "nyc" | "chicago";

export interface Landmark {
  lat: number;
  lng: number;
  emoji: string;
}

export interface CityConfig {
  id: CityId;
  /** Full name for prose: "New York City". */
  name: string;
  /** Short label for the toggle: "NYC". */
  shortName: string;
  bounds: MapBounds;
  /** [lng, lat] — maplibre center format. */
  center: [number, number];
  zoom: number;
  /** Directory under /data/ holding {z}/{x}/{y}.pbf. */
  tilesDir: string;
  /** Vector layer name inside those tiles. */
  sourceLayer: string;
  /** Optional point layer of OSM place names (town / suburb / neighbourhood) for light area labels. */
  placesLayer?: string;
  tables: {
    businesses: "businesses" | "businesses_chicago";
    roles: "business_roles" | "business_roles_chicago";
  };
  landmarks: Landmark[];
  /** group (borough / side) -> neighborhood name -> polygon. */
  neighborhoods: Record<string, Record<string, { lat: number; lon: number }[]>>;
  /** Short forms people type, mapped to a name in `neighborhoods`. */
  neighborhoodAliases: Record<string, string>;
  /** Words that only say "this city" and carry no search intent. */
  stopWords: string[];
  /** Multi-word city names to strip from a query before splitting into terms. */
  stripPatterns: RegExp[];
  /** Shown in the welcome toast. */
  businessCountLabel: string;
}

// City plus the inner ring of suburbs: Evanston and Skokie north, Des Plaines, Elmhurst and
// Oak Park west, Oak Lawn, Blue Island, Calumet City and Harvey south.
export const CHICAGO_BOUNDS: MapBounds = { north: 42.1, south: 41.58, east: -87.5, west: -88.0 };
export const CHICAGO_CENTER: [number, number] = [-87.6298, 41.8781];

export const CITIES: Record<CityId, CityConfig> = {
  nyc: {
    id: "nyc",
    name: "New York City",
    shortName: "NYC",
    bounds: NYC_BOUNDS,
    center: NYC_CENTER,
    zoom: 12.77,
    tilesDir: "tiles",
    sourceLayer: "examplepoints",
    tables: { businesses: "businesses", roles: "business_roles" },
    landmarks: [
      { lat: 40.690331, lng: -74.045414, emoji: "🗽" },
      { lat: 40.75266, lng: -73.97729, emoji: "🚃" },
      { lat: 40.75058, lng: -73.99358, emoji: "🚃" },
      { lat: 40.548575, lng: -74.0321778, emoji: "🐬" },
      { lat: 40.547303, lng: -73.794261, emoji: "🦈" },
      { lat: 40.86918, lng: -73.755437, emoji: "🐠" },
      { lat: 40.781713, lng: -73.966566, emoji: "🪁" },
      { lat: 40.64154, lng: -73.772358, emoji: "✈️" },
      { lat: 40.777721, lng: -73.875939, emoji: "✈️" },
      { lat: 40.756317, lng: -73.847403, emoji: "🏟️" },
      { lat: 40.83, lng: -73.926208, emoji: "🏟️" },
      { lat: 40.45022, lng: -73.59364, emoji: "🏟️" },
      { lat: 40.683047, lng: -73.975912, emoji: "🏟️" },
      { lat: 40.759111, lng: -73.985294, emoji: "🎼" },
      { lat: 40.669823, lng: -73.965892, emoji: "🌼" },
      { lat: 40.572445, lng: -73.983244, emoji: "🎡" },
      { lat: 40.577249, lng: -73.837034, emoji: "🏖️" },
      { lat: 40.574829, lng: -73.95953, emoji: "🏖️" },
      { lat: 40.573527, lng: -74.082761, emoji: "🏖️" },
      { lat: 40.70889, lng: -74.008396, emoji: "🏦" },
      { lat: 40.850103, lng: -73.876716, emoji: "🐾" },
      { lat: 40.625569, lng: -74.115425, emoji: "🐾" },
    ],
    neighborhoods: nycNeighborhoodBoundaries,
    neighborhoodAliases: {
      ues: "Upper East Side",
      uws: "Upper West Side",
      les: "Lower East Side",
      fidi: "Financial District",
      "bed-stuy": "Bed Stuy",
      bedstuy: "Bed Stuy",
      "hells kitchen": "Hell's Kitchen",
      dtbk: "Downtown Brooklyn",
    },
    stopWords: ["nyc", "ny"],
    stripPatterns: [/\bnew york( city)?\b/g],
    businessCountLabel: "54k",
  },
  chicago: {
    id: "chicago",
    name: "Chicago",
    shortName: "Chicago",
    bounds: CHICAGO_BOUNDS,
    center: CHICAGO_CENTER,
    zoom: 12.5,
    tilesDir: "tiles-chicago",
    sourceLayer: "osm",
    placesLayer: "places",
    tables: { businesses: "businesses_chicago", roles: "business_roles_chicago" },
    landmarks: [
      { lat: 41.8789, lng: -87.6359, emoji: "🏢" }, // Willis Tower
      { lat: 41.8827, lng: -87.6233, emoji: "🫘" }, // Cloud Gate
      { lat: 41.8917, lng: -87.605, emoji: "🎡" }, // Navy Pier
      { lat: 41.9484, lng: -87.6553, emoji: "⚾" }, // Wrigley Field
      { lat: 41.8299, lng: -87.6338, emoji: "⚾" }, // Guaranteed Rate Field
      { lat: 41.8623, lng: -87.6167, emoji: "🏈" }, // Soldier Field
      { lat: 41.8807, lng: -87.6742, emoji: "🏀" }, // United Center
      { lat: 41.8676, lng: -87.614, emoji: "🐬" }, // Shedd Aquarium
      { lat: 41.8663, lng: -87.617, emoji: "🦖" }, // Field Museum
      { lat: 41.8796, lng: -87.6237, emoji: "🎨" }, // Art Institute
      { lat: 41.9211, lng: -87.634, emoji: "🦁" }, // Lincoln Park Zoo
      { lat: 41.7906, lng: -87.583, emoji: "🔬" }, // Museum of Science and Industry
      { lat: 41.9742, lng: -87.9073, emoji: "✈️" }, // O'Hare
      { lat: 41.7868, lng: -87.7522, emoji: "✈️" }, // Midway
      { lat: 41.9137, lng: -87.6253, emoji: "🏖️" }, // North Avenue Beach
      { lat: 41.9032, lng: -87.6244, emoji: "🏖️" }, // Oak Street Beach
      { lat: 41.8864, lng: -87.7172, emoji: "🌿" }, // Garfield Park Conservatory
      { lat: 41.8853, lng: -87.6273, emoji: "🎭" }, // Chicago Theatre
      { lat: 41.8787, lng: -87.6403, emoji: "🚃" }, // Union Station
      { lat: 41.8663, lng: -87.6069, emoji: "🔭" }, // Adler Planetarium
    ],
    neighborhoods: chicagoNeighborhoodBoundaries,
    neighborhoodAliases: {
      "the loop": "Loop",
      downtown: "Loop",
      "river north": "Near North Side",
      "gold coast": "Near North Side",
      "wicker park": "West Town",
      bucktown: "Logan Square",
      "boystown": "Lake View",
      lakeview: "Lake View",
      "ukrainian village": "West Town",
      pilsen: "Lower West Side",
      "little italy": "Near West Side",
      "west loop": "Near West Side",
      "south loop": "Near South Side",
      "old town": "Near North Side",
      "wrigleyville": "Lake View",
      "andersonville": "Edgewater",
      "chinatown": "Armour Square",
      "bronzeville": "Douglas",
      "hyde park": "Hyde Park",
      "ohare": "O'Hare",
    },
    stopWords: ["chicago", "chi", "il", "illinois"],
    stripPatterns: [/\bchicagoland\b/g],
    businessCountLabel: "29k",
  },
};

export const CITY_LIST: CityConfig[] = [CITIES.nyc, CITIES.chicago];

export const DEFAULT_CITY_ID: CityId = "nyc";
const CITY_STORAGE_KEY = "map_city";

export const isCityId = (value: unknown): value is CityId => value === "nyc" || value === "chicago";

let currentCityId: CityId | null = null;

/** The city the device last chose; NYC until a choice is made. */
export function getCurrentCityId(): CityId {
  if (currentCityId) return currentCityId;
  try {
    const stored = localStorage.getItem(CITY_STORAGE_KEY);
    currentCityId = isCityId(stored) ? stored : DEFAULT_CITY_ID;
  } catch {
    currentCityId = DEFAULT_CITY_ID;
  }
  return currentCityId;
}

export function setCurrentCityId(id: CityId): void {
  currentCityId = id;
  try {
    localStorage.setItem(CITY_STORAGE_KEY, id);
  } catch {
    /* private mode: the choice lasts for the session only */
  }
}

export const getCurrentCity = (): CityConfig => CITIES[getCurrentCityId()];

/** Table names for a city (defaults to the current one). */
export const cityTables = (cityId: CityId = getCurrentCityId()) => CITIES[cityId].tables;

// ------------------------------------------------------------ neighborhoods

export function findNeighborhoodBoundaryByName(name: string, city: CityConfig = getCurrentCity()): NeighborhoodBounds | null {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  for (const [group, areas] of Object.entries(city.neighborhoods)) {
    for (const [areaName, boundary] of Object.entries(areas)) {
      if (areaName.toLowerCase() === normalized) return { borough: group, name: areaName, boundary };
    }
  }
  return null;
}

export function getAllNeighborhoodNames(city: CityConfig = getCurrentCity()): string[] {
  return Object.values(city.neighborhoods)
    .flatMap((areas) => Object.keys(areas))
    .sort();
}
