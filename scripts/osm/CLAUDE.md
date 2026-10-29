# scripts/osm/ — OpenStreetMap pipeline (NYC and Chicago)

Rebuilds a city's map assets from Geofabrik OSM extracts. Run from the repo root:

```sh
bash scripts/osm/build-city.sh nyc              # skips steps whose outputs exist
bash scripts/osm/build-city.sh chicago --force  # rebuild everything (re-downloads too)
bash scripts/osm/import-businesses.sh           # Chicago CSV → public.businesses_chicago
```

Needs `osmium`, `tippecanoe`, `tile-join`, `tippecanoe-decode`, `node` (22), `curl`, `jq`.
First run downloads 500–700 MB of extracts into the gitignored `.osm-cache/`; later runs reuse them.

## Files

| File | Role |
| --- | --- |
| `build-city.sh` | Orchestrator; the per-city config (bboxes, extracts, water mode) is the `case` block at the top. `set -euo pipefail`, idempotent (a step reruns only when its output is missing, older than its inputs, or `--force`). |
| `export-basemap.json` | `osmium export` config for the basemap: no OSM attributes, tags limited to `highway, name, leisure, natural, water, landuse`. |
| `export-lake.json` | `osmium export` config for shoreline ways (everything as LineString, `@id` on). |
| `lake-polygon.mjs` | Closes shoreline ways along the tile bbox into water polygons. Used for water OSM has no polygon for: Lake Michigan (relation 1205149 spans four states, so no city extract can assemble it) and the sea around New York (`natural=coastline` is lines only). Direction/role agnostic: water and land alternate at each shoreline endpoint around the bbox perimeter; the parity is picked so that `--water-point` ends up inside; interior loops become islands. Fails if water would cover most of the box. |
| `export-places.json` | `osmium export` config for `place=*` nodes (name + place only); they become the `places` tile layer that labels towns, boroughs, suburbs and neighbourhoods. |
| `export-pois.json` | `osmium export` config for POIs: `@type`/`@id` attributes on, name/category/address/website tags. |
| `pois-to-csv.mjs` | GeoJSONSeq POIs → `chicago-businesses.csv`. Categorises, filters out non-workplaces, dedupes (same normalised name within 40 m), writes RFC 4180 CSV, prints a summary. |
| `community-areas-to-ts.mjs` | City of Chicago community areas GeoJSON → `src/utils/chicago_neighborhoods.ts` (largest ring per area, Douglas–Peucker to ≤ 40 vertices, 4-decimal coords, title-cased names). |
| `import-businesses.sh` | `psql \copy` the Chicago CSV into a temp table, upsert on `source_id`, delete rows that left OSM unless they carry roles / posts / jobs. |

## Per-city config

| | NYC | Chicago |
| --- | --- | --- |
| Tile bbox (W,S,E,N) | -74.30, 40.45, -73.65, 40.95 | -88.04, 41.54, -87.45, 42.11 (N must stay below 42.12, where the BBBike shoreline ends) |
| Map bbox | NYC_BOUNDS in `src/utils/geo.ts` | -88.00, 41.58, -87.50, 42.10 |
| Extracts | Geofabrik `new-york` + `new-jersey` (NJ supplies the Hudson's west bank), merged with `osmium merge` | Geofabrik `illinois`; BBBike `Chicago.osm.pbf` for the shoreline only (it has the Indiana shore, which Illinois lacks; but it stops at lat 41.63) |
| Water mode | `coastline`: every `natural=coastline` way in the box, closed along the bbox; water point Upper New York Bay | `relation`: Lake Michigan's member ways, closed along the bbox; water point -87.50, 41.90 |
| Businesses / neighborhoods | not built (NYC's come from elsewhere) | POIs CSV + community areas |

## Pipeline

1. Download the extracts (`a`), clip each to the tile bbox with `osmium extract -s smart` and merge (`b`).
2. Basemap (`c1`–`c2`): `osmium tags-filter` keeps **ways/relations only** (`w/highway`, `wr/leisure`, `wr/natural`, `wr/water`, `wr/landuse=grass,meadow,cemetery,forest,recreation_ground,village_green,grave_yard`) — no nodes, so bus stops, crossings and signals never reach the tiles — then drops `highway=proposed,construction,razed,abandoned,demolished,planned`; `osmium export -f geojsonseq` (linestrings + polygons).
3. Open water (`c2b`): see water mode above → `.osm-cache/<city>-water.geojsonseq`.
4. Tiles (`c3`–`c4`): tippecanoe z8–z16, layer **`osm`**, `--drop-densest-as-needed --simplify-only-low-zooms --maximum-tile-bytes=450000` (headroom for the places layer); place nodes (`c3b`: `n/place=city,borough,town,village,suburb,neighbourhood,quarter`) → layer **`places`** with `-r1`; `tile-join -pk` merges both into `public/data/tiles-<city>` (never skipping a tile for size, which once left a z10 hole). Tiles are gzip on disk and named `.pbf`.
5. Sanity (`c5`): decodes landmark tiles and prints line / water / park / place counts; **fails** if any point feature reached the `osm` layer or the open-water tiles (z8–z16 at the water point) have no `natural=water` polygon.
6. Chicago only: businesses (`d`–`e`, POIs → CSV within the map bbox) and community areas (`f`).

## Outputs

- `public/data/tiles-<city>/{z}/{x}/{y}.pbf` + `metadata.json` — committed. Style: `"source-layer": "osm"` (fields `highway, name, leisure, natural, water, landuse`) and `"places"` (`name, place`).
- `.osm-cache/chicago-businesses.csv` — **not committed**. Header: `source_id,name,business_type,lat,lng,address,website`; `source_id` is `node/123`, `way/123` or `relation/123` and unique. `business_type` uses the NYC vocabulary (Restaurant, Cafe, Bar, Retail, Grocery Store, Healthcare, Education, Financial, Legal, Hospitality, Automotive, Fitness, Recreation, Cultural, Tourist Attraction, Religious, Transportation, Government, Wellness, Business, Other).
- `src/utils/chicago_neighborhoods.ts` — committed, generated; exports `chicagoNeighborhoodBoundaries` and `chicagoNeighborhoods: NeighborhoodBounds[]`.

## Tuning

- Categories / exclusions live in `RULES` and `EXCLUDE` at the top of `pois-to-csv.mjs`; first matching rule wins.
- Harbors, rivers and park lakes are ordinary `natural=water` polygons in OSM and come through the basemap export; the closed shoreline polygon only adds the open sea / lake.

## After a rebuild

Bump `tilesVersion` for the city in `src/utils/cities.ts`. Tile URLs end in `?v=N`; without the bump, browsers (and the Vercel CDN, which marks tiles immutable for a year) keep serving the previous tiles from cache. For Chicago, run `import-businesses.sh` if the CSV changed.
