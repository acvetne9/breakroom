#!/usr/bin/env bash
# Reproducible OpenStreetMap pipeline for one city's map.
#
#   bash scripts/osm/build-city.sh <nyc|chicago> [--force] [--skip-download]
#
# Produces (per city):
#   public/data/tiles-<city>/{z}/{x}/{y}.pbf  basemap vector tiles: layer "osm"
#                                             (roads, parks, water) + layer "places"
#                                             (town / neighbourhood name points)
#   .osm-cache/<city>-businesses.csv          POIs for the city's businesses table
#                                             (Chicago only; NYC's businesses come
#                                             from elsewhere)
#   src/utils/<city>_neighborhoods.ts         neighborhood polygons (Chicago only)
#
# Every step is skipped when its output already exists; pass --force to rebuild.
# After a rebuild bump `tilesVersion` for the city in src/utils/cities.ts.
# See scripts/osm/CLAUDE.md for details.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

CACHE=".osm-cache"
SCRIPTS="scripts/osm"
GEOFABRIK="https://download.geofabrik.de/north-america/us"

CITY="${1:-}"
[[ -n "$CITY" ]] || { sed -n '2,17p' "$0"; exit 2; }
shift

# ------------------------------------------------------------------ city config
#
# TILE_BBOX  W,S,E,N clipped from the extracts; generous so water and suburbs
#            render at the edges. Must not exceed where the shoreline data ends.
# MAP_BBOX   what the app shows; businesses are limited to it.
# SOURCES    Geofabrik extracts merged for the basemap (state files overlap at
#            borders; `osmium merge` writes each object once).
# WATER_MODE how open water that OSM does not store as a polygon is closed:
#            relation  — a lake multipolygon too big for the extract (Lake
#                        Michigan); its member ways come from SHORE_SRC_URL,
#                        an extract that has the whole in-box shoreline.
#            coastline — the sea: every natural=coastline way in the box.
#            lake-polygon.mjs closes the shoreline along the bbox either way.
# WATER_POINT a lng,lat that is certainly open water (fixes the parity).
case "$CITY" in
  chicago)
    TILE_BBOX="-88.04,41.54,-87.45,42.11"  # N must stay below 42.12: the BBBike shoreline ways end there
    MAP_BBOX="-88.00,41.58,-87.50,42.10"
    SOURCES=(illinois)
    WATER_MODE=relation
    WATER_RELATION="1205149"               # Lake Michigan
    WATER_POINT="-87.50,41.90"
    SHORE_SRC_URL="https://download.bbbike.org/osm/bbbike/Chicago/Chicago.osm.pbf"
    SHORE_SRC_PBF="$CACHE/Chicago.osm.pbf"  # has the Indiana shore; the Illinois extract does not
    BUILD_POIS=1
    BUILD_NEIGHBORHOODS=1
    ;;
  nyc)
    TILE_BBOX="-74.30,40.45,-73.65,40.95"
    MAP_BBOX="-74.26,40.4774,-73.70,40.92"  # = NYC_BOUNDS in src/utils/geo.ts
    SOURCES=(new-york new-jersey)           # NJ supplies the Hudson's west bank
    WATER_MODE=coastline
    WATER_POINT="-74.03,40.66"              # Upper New York Bay
    BUILD_POIS=0
    BUILD_NEIGHBORHOODS=0
    ;;
  *) echo "unknown city: $CITY (nyc | chicago)" >&2; exit 2 ;;
esac

TILES_OUT="public/data/tiles-$CITY"
BBOX_PBF="$CACHE/$CITY-bbox.osm.pbf"

FORCE=0
SKIP_DOWNLOAD=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --skip-download) SKIP_DOWNLOAD=1 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '\n==> %s\n' "$*" >&2; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "missing tool: $1" >&2; exit 1; }; }
for t in osmium tippecanoe tile-join tippecanoe-decode node curl jq; do need "$t"; done

# fresh <output> [inputs...] — true when the output must be (re)built.
fresh() {
  local out="$1"; shift
  [[ $FORCE -eq 1 ]] && return 0
  [[ -e "$out" ]] || return 0
  local dep
  for dep in "$@"; do
    [[ "$dep" -nt "$out" ]] && return 0
  done
  return 1
}

download() {
  local url="$1" out="$2"
  if [[ $SKIP_DOWNLOAD -eq 1 && -s "$out" ]]; then
    echo "   --skip-download: using existing $out"
  elif [[ -s "$out" && $FORCE -eq 0 ]]; then
    echo "   exists: $out ($(du -h "$out" | cut -f1)) — skipping"
  else
    curl -fL --retry 3 --progress-bar -o "$out.part" "$url"
    mv "$out.part" "$out"
    echo "   downloaded $(du -h "$out" | cut -f1)"
  fi
}

mkdir -p "$CACHE"

# ---------------------------------------------------------------- a. download
SOURCE_PBFS=()
for src in "${SOURCES[@]}"; do
  log "a. Download $GEOFABRIK/$src-latest.osm.pbf"
  download "$GEOFABRIK/$src-latest.osm.pbf" "$CACHE/$src-latest.osm.pbf"
  SOURCE_PBFS+=("$CACHE/$src-latest.osm.pbf")
done
if [[ $WATER_MODE == relation ]]; then
  log "a2. Download $SHORE_SRC_URL (shoreline source)"
  download "$SHORE_SRC_URL" "$SHORE_SRC_PBF"
fi

# ---------------------------------------------------------------- b. clip
log "b. Clip to tile bbox $TILE_BBOX (smart strategy keeps multipolygons whole)"
if fresh "$BBOX_PBF" "${SOURCE_PBFS[@]}"; then
  CLIPPED=()
  for src in "${SOURCES[@]}"; do
    osmium extract --overwrite -s smart -b "$TILE_BBOX" -o "$CACHE/$CITY-bbox-$src.osm.pbf" "$CACHE/$src-latest.osm.pbf"
    CLIPPED+=("$CACHE/$CITY-bbox-$src.osm.pbf")
  done
  if [[ ${#CLIPPED[@]} -eq 1 ]]; then
    mv "${CLIPPED[0]}" "$BBOX_PBF"
  else
    osmium merge --overwrite -o "$BBOX_PBF" "${CLIPPED[@]}"
    rm -f "${CLIPPED[@]}"
  fi
  echo "   wrote $BBOX_PBF ($(du -h "$BBOX_PBF" | cut -f1))"
else
  echo "   exists: $BBOX_PBF — skipping"
fi
if [[ $WATER_MODE == relation ]]; then
  SHORE_BBOX_PBF="$CACHE/$CITY-shore-bbox.osm.pbf"
  log "b2. Clip the shoreline source to the same bbox"
  if fresh "$SHORE_BBOX_PBF" "$SHORE_SRC_PBF"; then
    osmium extract --overwrite -s smart -b "$TILE_BBOX" -o "$SHORE_BBOX_PBF" "$SHORE_SRC_PBF"
    echo "   wrote $SHORE_BBOX_PBF ($(du -h "$SHORE_BBOX_PBF" | cut -f1))"
  else
    echo "   exists: $SHORE_BBOX_PBF — skipping"
  fi
fi

# ---------------------------------------------------------------- c. basemap tiles
BASEMAP_PBF="$CACHE/$CITY-basemap.osm.pbf"
BASEMAP_GEOJSON="$CACHE/$CITY-basemap.geojsonseq"
MBTILES="$CACHE/$CITY.mbtiles"

log "c1. Filter basemap ways/relations (highway, leisure, natural, water, landuse)"
if fresh "$BASEMAP_PBF" "$BBOX_PBF"; then
  # Ways and relations only — no nodes, so bus stops, crossings and other
  # point features never reach the tiles.
  osmium tags-filter --overwrite -o "$CACHE/$CITY-basemap-all.osm.pbf" "$BBOX_PBF" \
    w/highway \
    wr/leisure wr/natural wr/water \
    wr/landuse=grass,meadow,cemetery,forest,recreation_ground,village_green,grave_yard
  # Second pass drops roads that do not exist (yet / any more).
  osmium tags-filter --overwrite -i -o "$BASEMAP_PBF" "$CACHE/$CITY-basemap-all.osm.pbf" \
    w/highway=proposed,construction,razed,abandoned,demolished,planned
  rm -f "$CACHE/$CITY-basemap-all.osm.pbf"
  echo "   wrote $BASEMAP_PBF ($(du -h "$BASEMAP_PBF" | cut -f1))"
else
  echo "   exists: $BASEMAP_PBF — skipping"
fi

log "c2. Export basemap to GeoJSONSeq"
if fresh "$BASEMAP_GEOJSON" "$BASEMAP_PBF" "$SCRIPTS/export-basemap.json"; then
  osmium export --overwrite -f geojsonseq -c "$SCRIPTS/export-basemap.json" \
    --geometry-types=linestring,polygon -o "$BASEMAP_GEOJSON" "$BASEMAP_PBF"
  echo "   wrote $BASEMAP_GEOJSON ($(du -h "$BASEMAP_GEOJSON" | cut -f1), $(wc -l < "$BASEMAP_GEOJSON" | tr -d ' ') features)"
else
  echo "   exists: $BASEMAP_GEOJSON — skipping"
fi

WATER_WAYS="$CACHE/$CITY-shore-ways.geojsonseq"
WATER_GEOJSON="$CACHE/$CITY-water.geojsonseq"

if [[ $WATER_MODE == relation ]]; then
  WATER_REL_OSM="$CACHE/$CITY-water-relation.osm"
  log "c2b. Open water from relation $WATER_RELATION (closed along the bbox)"
  if fresh "$WATER_GEOJSON" "$SHORE_BBOX_PBF" "$SCRIPTS/lake-polygon.mjs" "$SCRIPTS/export-lake.json"; then
    osmium getid "$SHORE_BBOX_PBF" "r$WATER_RELATION" -f osm > "$WATER_REL_OSM"
    # getid -r exits 1 when some members are missing — expected, the relation is
    # incomplete by construction. Any other failure still aborts.
    osmium getid -r "$SHORE_BBOX_PBF" "r$WATER_RELATION" -o "$CACHE/$CITY-water-members.osm.pbf" --overwrite || [[ $? -eq 1 ]]
    osmium export --overwrite --keep-untagged -c "$SCRIPTS/export-lake.json" --geometry-types=linestring \
      -f geojsonseq -o "$WATER_WAYS" "$CACHE/$CITY-water-members.osm.pbf"
    node "$SCRIPTS/lake-polygon.mjs" --bbox "$TILE_BBOX" --water-point "$WATER_POINT" \
      --relation "$WATER_REL_OSM" --ways "$WATER_WAYS" --out "$WATER_GEOJSON"
  else
    echo "   exists: $WATER_GEOJSON — skipping"
  fi
else
  log "c2b. Open water from natural=coastline ways (closed along the bbox)"
  if fresh "$WATER_GEOJSON" "$BBOX_PBF" "$SCRIPTS/lake-polygon.mjs" "$SCRIPTS/export-lake.json"; then
    osmium tags-filter --overwrite -o "$CACHE/$CITY-coastline.osm.pbf" "$BBOX_PBF" w/natural=coastline
    osmium export --overwrite -c "$SCRIPTS/export-lake.json" --geometry-types=linestring \
      -f geojsonseq -o "$WATER_WAYS" "$CACHE/$CITY-coastline.osm.pbf"
    node "$SCRIPTS/lake-polygon.mjs" --bbox "$TILE_BBOX" --water-point "$WATER_POINT" \
      --tags "natural=water" --ways "$WATER_WAYS" --out "$WATER_GEOJSON"
  else
    echo "   exists: $WATER_GEOJSON — skipping"
  fi
fi

log "c3. tippecanoe → $MBTILES (layer: osm, z8–z16)"
if fresh "$MBTILES" "$BASEMAP_GEOJSON" "$WATER_GEOJSON"; then
  tippecanoe -o "$MBTILES" -l osm \
    --minimum-zoom=8 --maximum-zoom=16 \
    --drop-densest-as-needed --simplify-only-low-zooms \
    --maximum-tile-bytes=450000 \
    --clip-bounding-box="$TILE_BBOX" \
    --force --quiet "$BASEMAP_GEOJSON" "$WATER_GEOJSON"
  echo "   wrote $MBTILES ($(du -h "$MBTILES" | cut -f1))"
else
  echo "   exists: $MBTILES — skipping"
fi

# Place names (towns, boroughs, suburbs, neighbourhoods) as a second vector
# layer so the map can label areas lightly when zoomed out. Points only;
# -r1 keeps every point at every zoom (the default thins points below maxzoom).
PLACES_PBF="$CACHE/$CITY-places.osm.pbf"
PLACES_GEOJSON="$CACHE/$CITY-places.geojsonseq"
PLACES_MBTILES="$CACHE/$CITY-places.mbtiles"
log "c3b. Place names → $PLACES_MBTILES (layer: places)"
if fresh "$PLACES_MBTILES" "$BBOX_PBF" "$SCRIPTS/export-places.json"; then
  osmium tags-filter --overwrite -o "$PLACES_PBF" "$BBOX_PBF" \
    n/place=city,borough,town,village,suburb,neighbourhood,quarter
  osmium export --overwrite -f geojsonseq -c "$SCRIPTS/export-places.json" \
    --geometry-types=point -o "$PLACES_GEOJSON" "$PLACES_PBF"
  tippecanoe -o "$PLACES_MBTILES" -l places \
    --minimum-zoom=8 --maximum-zoom=16 -r1 \
    --clip-bounding-box="$TILE_BBOX" \
    --force --quiet "$PLACES_GEOJSON"
  echo "   $(grep -c '"place"' "$PLACES_GEOJSON") place nodes → $PLACES_MBTILES"
else
  echo "   exists: $PLACES_MBTILES — skipping"
fi

log "c4. tile-join → $TILES_OUT"
if fresh "$TILES_OUT/metadata.json" "$MBTILES" "$PLACES_MBTILES"; then
  rm -rf "$TILES_OUT"
  # -pk: never skip a merged tile for size (the base layer is capped at 450 KB
  # above; the places layer adds a few KB, which once pushed a z10 tile past
  # tile-join's 500 KB default and left a hole in the map).
  tile-join -e "$TILES_OUT" --force -pk "$MBTILES" "$PLACES_MBTILES"
  find "$TILES_OUT" -name .DS_Store -delete
  echo "   wrote $TILES_OUT"
else
  echo "   exists: $TILES_OUT — skipping"
fi

log "c5. Tile sanity checks"
SAMPLE_TILE="$(find "$TILES_OUT/12" -name '*.pbf' | head -1)"
MAGIC="$(head -c 2 "$SAMPLE_TILE" | od -An -tx1 | tr -d ' ')"
if [[ "$MAGIC" == "1f8b" ]]; then
  echo "   tiles are gzip on disk (1f 8b)"
else
  echo "   WARNING: tile magic is $MAGIC, expected 1f8b (gzip)" >&2
fi
TILE_BYTES="$(find "$TILES_OUT" -type f -name '*.pbf' -exec stat -f %z {} + | awk '{s+=$1} END {print s}')"
echo "   size: $(du -sh "$TILES_OUT" | cut -f1) on disk, $((TILE_BYTES / 1024 / 1024)) MB of tile bytes, files: $(find "$TILES_OUT" -type f -name '*.pbf' | wc -l | tr -d ' ')"
echo "   files per zoom:"
for z in "$TILES_OUT"/[0-9]*; do
  printf '     z%-3s %s\n' "$(basename "$z")" "$(find "$z" -type f -name '*.pbf' | wc -l | tr -d ' ')"
done

# tile_xy <lng> <lat> <z>  → "x y"
tile_xy() {
  node -e '
    const [lng, lat, z] = process.argv.slice(1).map(Number);
    const n = 2 ** z;
    const x = Math.floor(((lng + 180) / 360) * n);
    const r = (lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
    console.log(x, y);
  ' -- "$1" "$2" "$3"
}
check_tile() {
  local label="$1" lng="$2" lat="$3" z="$4"
  read -r x y < <(tile_xy "$lng" "$lat" "$z")
  local f="$TILES_OUT/$z/$x/$y.pbf"
  if [[ ! -f "$f" ]]; then echo "   $label: tile $z/$x/$y MISSING" >&2; return; fi
  local json; json="$(tippecanoe-decode "$f" "$z" "$x" "$y")"
  local osm='.features[] | select(.properties.layer=="osm") | .features[]'
  local n_hw n_water n_park n_pts n_places fields
  n_hw="$(jq "[$osm | select(.geometry.type==\"LineString\" and .properties.highway!=null)] | length" <<<"$json")"
  n_water="$(jq "[$osm | select((.geometry.type==\"Polygon\" or .geometry.type==\"MultiPolygon\") and .properties.natural==\"water\")] | length" <<<"$json")"
  n_park="$(jq "[$osm | select((.geometry.type==\"Polygon\" or .geometry.type==\"MultiPolygon\") and .properties.leisure==\"park\")] | length" <<<"$json")"
  n_pts="$(jq "[$osm | select(.geometry.type==\"Point\")] | length" <<<"$json")"
  n_places="$(jq '[.features[] | select(.properties.layer=="places") | .features[]] | length' <<<"$json")"
  fields="$(jq -r "[$osm | .properties | keys[]] | unique | join(\",\")" <<<"$json")"
  echo "   $label (z$z/$x/$y): highway_lines=$n_hw water_polygons=$n_water park_polygons=$n_park points=$n_pts place_names=$n_places fields=[$fields]"
  if [[ "$n_pts" -gt 0 ]]; then echo "   ERROR: point features in the osm layer (bus stops etc. should never be in the tiles)" >&2; exit 1; fi
}
WATER_LNG="${WATER_POINT%,*}"; WATER_LAT="${WATER_POINT#*,}"
case "$CITY" in
  chicago)
    check_tile "Loop         " -87.63 41.88 12
    check_tile "Lake shore   " -87.55 41.90 12
    check_tile "Lincoln Park " -87.635 41.925 14
    ;;
  nyc)
    check_tile "Midtown      " -73.985 40.755 12
    check_tile "Harbor       " -74.04 40.66 12
    check_tile "Central Park " -73.965 40.78 14
    check_tile "Rockaway sea " -73.85 40.55 12
    ;;
esac
check_tile "Open water z12" "$WATER_LNG" "$WATER_LAT" 12
check_tile "Open water z16" "$WATER_LNG" "$WATER_LAT" 16
# Hard requirement: the open-water tiles must contain a natural=water polygon.
for z in 8 10 12 14 16; do
  read -r x y < <(tile_xy "$WATER_LNG" "$WATER_LAT" "$z")
  f="$TILES_OUT/$z/$x/$y.pbf"
  if [[ ! -f "$f" ]] || [[ "$(tippecanoe-decode "$f" "$z" "$x" "$y" | jq '[.features[] | select(.properties.layer=="osm") | .features[] | select(.properties.natural=="water")] | length')" -eq 0 ]]; then
    echo "   ERROR: no natural=water polygon in open-water tile $z/$x/$y — the shoreline did not close" >&2
    exit 1
  fi
done
echo "   open water: natural=water polygon present at z8/10/12/14/16"

if [[ $BUILD_POIS -eq 1 ]]; then
# ---------------------------------------------------------------- d. businesses
POI_PBF="$CACHE/$CITY-pois.osm.pbf"
POI_GEOJSON="$CACHE/$CITY-pois.geojsonseq"
POI_CSV="$CACHE/$CITY-businesses.csv"

log "d1. Filter POIs (shop, amenity, office, craft, healthcare, tourism, leisure, club)"
if fresh "$POI_PBF" "$BBOX_PBF"; then
  osmium tags-filter --overwrite -o "$POI_PBF" "$BBOX_PBF" \
    nwr/shop nwr/amenity nwr/office nwr/craft nwr/healthcare nwr/tourism nwr/leisure nwr/club
  echo "   wrote $POI_PBF ($(du -h "$POI_PBF" | cut -f1))"
else
  echo "   exists: $POI_PBF — skipping"
fi

log "d2. Export POIs to GeoJSONSeq (with @type/@id)"
if fresh "$POI_GEOJSON" "$POI_PBF" "$SCRIPTS/export-pois.json"; then
  osmium export --overwrite -f geojsonseq -c "$SCRIPTS/export-pois.json" -o "$POI_GEOJSON" "$POI_PBF"
  echo "   wrote $POI_GEOJSON ($(du -h "$POI_GEOJSON" | cut -f1), $(wc -l < "$POI_GEOJSON" | tr -d ' ') features)"
else
  echo "   exists: $POI_GEOJSON — skipping"
fi

# ---------------------------------------------------------------- e. CSV
log "e. POIs → $POI_CSV (map bbox $MAP_BBOX)"
if fresh "$POI_CSV" "$POI_GEOJSON" "$SCRIPTS/pois-to-csv.mjs"; then
  node "$SCRIPTS/pois-to-csv.mjs" --bbox "$MAP_BBOX" "$POI_GEOJSON" "$POI_CSV"
else
  echo "   exists: $POI_CSV — skipping ($(($(wc -l < "$POI_CSV") - 1)) rows)"
fi
fi

if [[ $BUILD_NEIGHBORHOODS -eq 1 ]]; then
# ---------------------------------------------------------------- f. neighborhoods (Chicago community areas)
NEIGHBORHOODS_TS="src/utils/${CITY}_neighborhoods.ts"
COMMUNITY_AREAS_URL="https://data.cityofchicago.org/api/geospatial/cauq-8yn6?method=export&format=GeoJSON"
COMMUNITY_AREAS_FALLBACK_URL='https://data.cityofchicago.org/resource/igwz-8jzy.geojson?$limit=100'
COMMUNITY_AREAS="$CACHE/$CITY-community-areas.geojson"

log "f1. Download community areas"
if [[ ! -s "$COMMUNITY_AREAS" || $FORCE -eq 1 ]]; then
  if ! curl -fsSL --retry 2 -o "$COMMUNITY_AREAS.part" "$COMMUNITY_AREAS_URL" \
      || ! jq -e '.features | length > 50' "$COMMUNITY_AREAS.part" >/dev/null 2>&1; then
    echo "   primary URL failed, trying fallback"
    curl -fsSL --retry 2 -o "$COMMUNITY_AREAS.part" "$COMMUNITY_AREAS_FALLBACK_URL"
  fi
  mv "$COMMUNITY_AREAS.part" "$COMMUNITY_AREAS"
  echo "   wrote $COMMUNITY_AREAS ($(jq '.features | length' "$COMMUNITY_AREAS") features)"
else
  echo "   exists: $COMMUNITY_AREAS — skipping"
fi

log "f2. Community areas → $NEIGHBORHOODS_TS"
if fresh "$NEIGHBORHOODS_TS" "$COMMUNITY_AREAS" "$SCRIPTS/community-areas-to-ts.mjs"; then
  node "$SCRIPTS/community-areas-to-ts.mjs" "$COMMUNITY_AREAS" "$NEIGHBORHOODS_TS"
else
  echo "   exists: $NEIGHBORHOODS_TS — skipping"
fi
fi

log "Done."
echo "   tiles: $ROOT/$TILES_OUT   (now bump tilesVersion for '$CITY' in src/utils/cities.ts)"
[[ $BUILD_POIS -eq 1 ]] && echo "   businesses: $ROOT/$CACHE/$CITY-businesses.csv   (import with scripts/osm/import-businesses.sh)"
true
