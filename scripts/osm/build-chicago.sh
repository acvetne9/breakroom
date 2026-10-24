#!/usr/bin/env bash
# Reproducible OpenStreetMap pipeline for Chicago.
#
#   bash scripts/osm/build-chicago.sh [--force] [--skip-download]
#
# Produces:
#   public/data/tiles-chicago/{z}/{x}/{y}.pbf   basemap vector tiles, one layer "osm"
#   .osm-cache/chicago-businesses.csv           POIs for public.businesses_chicago
#   src/utils/chicago_neighborhoods.ts          community-area polygons
#
# Every step is skipped when its output already exists; pass --force to rebuild.
# See scripts/osm/CLAUDE.md for details.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

CACHE=".osm-cache"
SCRIPTS="scripts/osm"
TILES_OUT="public/data/tiles-chicago"
NEIGHBORHOODS_TS="src/utils/chicago_neighborhoods.ts"

PBF_URL="https://download.bbbike.org/osm/bbbike/Chicago/Chicago.osm.pbf"
PBF="$CACHE/Chicago.osm.pbf"
BBOX_PBF="$CACHE/chicago-bbox.osm.pbf"

# Tile bbox (W,S,E,N) — generous so Lake Michigan and the suburbs render at the edges.
TILE_BBOX="-87.98,41.60,-87.45,42.10"
# Map bbox for businesses — tighter, matches what the app actually shows.
MAP_BBOX="-87.94,41.64,-87.50,42.07"

# Lake Michigan. Its multipolygon relation spans four states, so the city extract
# only has the shoreline ways; lake-polygon.mjs closes them along the tile bbox.
LAKE_RELATION="1205149"
LAKE_WATER_POINT="-87.50,41.90"   # a point that is certainly open water

COMMUNITY_AREAS_URL="https://data.cityofchicago.org/api/geospatial/cauq-8yn6?method=export&format=GeoJSON"
COMMUNITY_AREAS_FALLBACK_URL='https://data.cityofchicago.org/resource/igwz-8jzy.geojson?$limit=100'
COMMUNITY_AREAS="$CACHE/chicago-community-areas.geojson"

FORCE=0
SKIP_DOWNLOAD=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --skip-download) SKIP_DOWNLOAD=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
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

mkdir -p "$CACHE"

# ---------------------------------------------------------------- a. download
log "a. Download $PBF_URL"
if [[ $SKIP_DOWNLOAD -eq 1 && -s "$PBF" ]]; then
  echo "   --skip-download: using existing $PBF"
elif [[ -s "$PBF" && $FORCE -eq 0 ]]; then
  echo "   exists: $PBF ($(du -h "$PBF" | cut -f1)) — skipping"
else
  curl -fL --retry 3 --progress-bar -o "$PBF.part" "$PBF_URL"
  mv "$PBF.part" "$PBF"
  echo "   downloaded $(du -h "$PBF" | cut -f1)"
fi

# ---------------------------------------------------------------- b. clip
log "b. Clip to tile bbox $TILE_BBOX (smart strategy keeps multipolygons whole)"
if fresh "$BBOX_PBF" "$PBF"; then
  osmium extract --overwrite -s smart -b "$TILE_BBOX" -o "$BBOX_PBF" "$PBF"
  echo "   wrote $BBOX_PBF ($(du -h "$BBOX_PBF" | cut -f1))"
else
  echo "   exists: $BBOX_PBF — skipping"
fi

# ---------------------------------------------------------------- c. basemap tiles
BASEMAP_PBF="$CACHE/chicago-basemap.osm.pbf"
BASEMAP_GEOJSON="$CACHE/chicago-basemap.geojsonseq"
MBTILES="$CACHE/chicago.mbtiles"

log "c1. Filter basemap ways/relations (highway, leisure, natural, water, landuse)"
if fresh "$BASEMAP_PBF" "$BBOX_PBF"; then
  # Ways and relations only — no nodes, so no point features reach the tiles.
  osmium tags-filter --overwrite -o "$CACHE/chicago-basemap-all.osm.pbf" "$BBOX_PBF" \
    w/highway \
    wr/leisure wr/natural wr/water \
    wr/landuse=grass,meadow,cemetery,forest,recreation_ground,village_green,grave_yard
  # Second pass drops roads that do not exist (yet / any more).
  osmium tags-filter --overwrite -i -o "$BASEMAP_PBF" "$CACHE/chicago-basemap-all.osm.pbf" \
    w/highway=proposed,construction,razed,abandoned,demolished,planned
  rm -f "$CACHE/chicago-basemap-all.osm.pbf"
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

LAKE_REL_OSM="$CACHE/chicago-lake-relation.osm"
LAKE_WAYS="$CACHE/chicago-lake-ways.geojsonseq"
LAKE_GEOJSON="$CACHE/chicago-lake.geojsonseq"

log "c2b. Lake Michigan polygon from relation $LAKE_RELATION (closed along the bbox)"
if fresh "$LAKE_GEOJSON" "$BBOX_PBF" "$SCRIPTS/lake-polygon.mjs" "$SCRIPTS/export-lake.json"; then
  osmium getid "$BBOX_PBF" "r$LAKE_RELATION" -f osm > "$LAKE_REL_OSM"
  # getid -r exits 1 when some members are missing — expected, the relation is
  # incomplete by construction. Any other failure still aborts.
  osmium getid -r "$BBOX_PBF" "r$LAKE_RELATION" -o "$CACHE/chicago-lake-members.osm.pbf" --overwrite || [[ $? -eq 1 ]]
  osmium export --overwrite --keep-untagged -c "$SCRIPTS/export-lake.json" --geometry-types=linestring \
    -f geojsonseq -o "$LAKE_WAYS" "$CACHE/chicago-lake-members.osm.pbf"
  node "$SCRIPTS/lake-polygon.mjs" --bbox "$TILE_BBOX" --water-point "$LAKE_WATER_POINT" \
    --relation "$LAKE_REL_OSM" --ways "$LAKE_WAYS" --out "$LAKE_GEOJSON"
else
  echo "   exists: $LAKE_GEOJSON — skipping"
fi

log "c3. tippecanoe → $MBTILES (layer: osm, z10–z16)"
if fresh "$MBTILES" "$BASEMAP_GEOJSON" "$LAKE_GEOJSON"; then
  tippecanoe -o "$MBTILES" -l osm \
    --minimum-zoom=10 --maximum-zoom=16 \
    --drop-densest-as-needed --simplify-only-low-zooms \
    --clip-bounding-box="$TILE_BBOX" \
    --force --quiet "$BASEMAP_GEOJSON" "$LAKE_GEOJSON"
  echo "   wrote $MBTILES ($(du -h "$MBTILES" | cut -f1))"
else
  echo "   exists: $MBTILES — skipping"
fi

log "c4. tile-join → $TILES_OUT"
if fresh "$TILES_OUT/metadata.json" "$MBTILES"; then
  rm -rf "$TILES_OUT"
  tile-join -e "$TILES_OUT" --force "$MBTILES"
  find "$TILES_OUT" -name .DS_Store -delete
  echo "   wrote $TILES_OUT"
else
  echo "   exists: $TILES_OUT — skipping"
fi

log "c5. Tile sanity checks"
SAMPLE_TILE="$(find "$TILES_OUT/12" -name '*.pbf' | head -1)"
MAGIC="$(head -c 2 "$SAMPLE_TILE" | od -An -tx1 | tr -d ' ')"
if [[ "$MAGIC" == "1f8b" ]]; then
  echo "   tiles are gzip on disk (1f 8b) — matches NYC"
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
  local n_hw n_water n_park fields
  n_hw="$(jq '[.features[0].features[] | select(.geometry.type=="LineString" and .properties.highway!=null)] | length' <<<"$json")"
  n_water="$(jq '[.features[0].features[] | select((.geometry.type=="Polygon" or .geometry.type=="MultiPolygon") and .properties.natural=="water")] | length' <<<"$json")"
  n_park="$(jq '[.features[0].features[] | select((.geometry.type=="Polygon" or .geometry.type=="MultiPolygon") and .properties.leisure=="park")] | length' <<<"$json")"
  fields="$(jq -r '[.features[0].features[].properties | keys[]] | unique | join(",")' <<<"$json")"
  echo "   $label (z$z/$x/$y): layer=$(jq -r '.features[0].properties.layer' <<<"$json") highway_lines=$n_hw water_polygons=$n_water park_polygons=$n_park fields=[$fields]"
}
check_tile "Loop         " -87.63 41.88 12
check_tile "Lake shore   " -87.55 41.90 12
check_tile "Lincoln Park " -87.635 41.925 14
check_tile "Open lake z12" -87.50 41.80 12
check_tile "Open lake z16" -87.50 41.80 16
# Hard requirement: the open-lake tiles must contain a natural=water polygon.
for z in 10 12 14 16; do
  read -r x y < <(tile_xy -87.50 41.80 "$z")
  f="$TILES_OUT/$z/$x/$y.pbf"
  if [[ ! -f "$f" ]] || [[ "$(tippecanoe-decode "$f" "$z" "$x" "$y" | jq '[.features[0].features[] | select(.properties.natural=="water")] | length')" -eq 0 ]]; then
    echo "   ERROR: no natural=water polygon in open-lake tile $z/$x/$y — Lake Michigan did not come through" >&2
    exit 1
  fi
done
echo "   Lake Michigan: natural=water polygon present in open-lake tiles at z10/12/14/16"

# ---------------------------------------------------------------- d. businesses
POI_PBF="$CACHE/chicago-pois.osm.pbf"
POI_GEOJSON="$CACHE/chicago-pois.geojsonseq"
POI_CSV="$CACHE/chicago-businesses.csv"

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

# ---------------------------------------------------------------- f. neighborhoods
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

log "Done."
echo "   tiles:         $ROOT/$TILES_OUT"
echo "   businesses:    $ROOT/$POI_CSV"
echo "   neighborhoods: $ROOT/$NEIGHBORHOODS_TS"
