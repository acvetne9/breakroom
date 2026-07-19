// Shared NYC geography constants — single source of truth for the map's
// max-bounds, the businesses fetch box, and the map-data chunk grid.

export type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

// Canonical NYC bounding box: the widest union of the previously-divergent
// copies, so nothing near the edges is excluded from the fetch/pan area.
export const NYC_BOUNDS: MapBounds = {
  north: 40.92,
  south: 40.4774,
  east: -73.7,
  west: -74.26,
};

// [lng, lat] — maplibre center format.
export const NYC_CENTER: [number, number] = [-73.986104, 40.715245];
