// Web-mercator tile math shared by the tile cache and the tile-chunked loader.

export const TILE_ZOOM_LEVEL = 14; // Fixed zoom for tiling (higher = smaller tiles)

export interface TileKey {
  z: number;
  x: number;
  y: number;
}

export interface TileBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

const deg2rad = (deg: number): number => deg * (Math.PI / 180);

export function latLng2Tile(lat: number, lng: number, zoom: number = TILE_ZOOM_LEVEL): TileKey {
  const x = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
  const y = Math.floor(
    ((1 - Math.log(Math.tan(deg2rad(lat)) + 1 / Math.cos(deg2rad(lat))) / Math.PI) / 2) *
      Math.pow(2, zoom),
  );
  return { z: zoom, x, y };
}

export function tile2LatLng(x: number, y: number, zoom: number = TILE_ZOOM_LEVEL): { lat: number; lng: number } {
  const lng = (x / Math.pow(2, zoom)) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

export function getTileBounds(tile: TileKey): TileBounds {
  const nw = tile2LatLng(tile.x, tile.y, tile.z);
  const se = tile2LatLng(tile.x + 1, tile.y + 1, tile.z);
  return { north: nw.lat, south: se.lat, east: se.lng, west: nw.lng };
}

export function getTileKey(tile: TileKey): string {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

export function getTilesForBounds(bounds: TileBounds, zoom: number = TILE_ZOOM_LEVEL): TileKey[] {
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

// Order tiles nearest-to-center first so the map fills from the middle outward.
export function sortTilesCenterOut(tiles: TileKey[], bounds: TileBounds): TileKey[] {
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLng = (bounds.east + bounds.west) / 2;
  const dist = (t: TileKey): number => {
    const tb = getTileBounds(t);
    const tLat = (tb.north + tb.south) / 2;
    const tLng = (tb.east + tb.west) / 2;
    return Math.hypot(tLat - centerLat, tLng - centerLng);
  };
  return [...tiles].sort((a, b) => dist(a) - dist(b));
}
