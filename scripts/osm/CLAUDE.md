# scripts/osm/ — Chicago OpenStreetMap pipeline

Rebuilds every Chicago data asset from a single OSM extract. Run from the repo root:

```sh
bash scripts/osm/build-chicago.sh            # skips steps whose outputs exist
bash scripts/osm/build-chicago.sh --force    # rebuild everything (re-downloads too)
```

Needs `osmium`, `tippecanoe`, `tile-join`, `tippecanoe-decode`, `node` (22), `curl`, `jq`.
Takes a few minutes on first run; the ~103 MB extract is cached.

## Files

| File | Role |
| --- | --- |
| `build-chicago.sh` | Orchestrator. `set -euo pipefail`, idempotent (a step reruns only when its output is missing, older than its inputs, or `--force`). |
| `export-basemap.json` | `osmium export` config for the basemap: no OSM attributes, tags limited to `highway, name, leisure, natural, water, landuse`. |
| `export-lake.json` | `osmium export` config for Lake Michigan's member ways (everything as LineString, `@id` on). |
| `lake-polygon.mjs` | Closes the Lake Michigan shoreline along the tile bbox into water polygons. Needed because relation 1205149 spans four states and is incomplete in any city extract, so `osmium export` cannot assemble it. Direction/role agnostic: water and land alternate at each shoreline endpoint around the bbox perimeter; the parity is picked so that `--water-point` ends up inside, and interior loops become islands. |
| `export-places.json` | `osmium export` config for `place=*` nodes (name + place only); they become the `places` tile layer that labels towns, suburbs and neighbourhoods. |
| `export-pois.json` | `osmium export` config for POIs: `@type`/`@id` attributes on, name/category/address/website tags. |
| `pois-to-csv.mjs` | GeoJSONSeq POIs → `chicago-businesses.csv`. Categorises, filters out non-workplaces, dedupes (same normalised name within 40 m), writes RFC 4180 CSV, prints a summary. |
| `community-areas-to-ts.mjs` | City of Chicago community areas GeoJSON → `src/utils/chicago_neighborhoods.ts` (largest ring per area, Douglas–Peucker to ≤ 40 vertices, 4-decimal coords, title-cased names). |

## Pipeline

1. Download Geofabrik Illinois (`illinois-latest.osm.pbf`, ~360 MB) for the basemap and businesses, and BBBike Chicago (`Chicago.osm.pbf`, ~110 MB) for the Lake Michigan shoreline only. The BBBike extract stops at latitude 41.63 (no Harvey / Calumet City); the Illinois extract has no Indiana shore, which the lake polygon needs to reach the box's east edge.
2. `osmium extract -s smart` of both files to the **tile bbox** W -88.04, S 41.54, E -87.45, N 42.11 → `.osm-cache/chicago-bbox.osm.pbf`. The smart strategy keeps multipolygon relations (Lake Michigan, relation 1205151) complete.
3. Basemap: `osmium tags-filter` keeps ways/relations only (`w/highway`, `wr/leisure`, `wr/natural`, `wr/water`, `wr/landuse=grass,meadow,cemetery,forest,recreation_ground,village_green,grave_yard`), then drops `highway=proposed,construction,razed,abandoned,demolished,planned`. `osmium export -f geojsonseq` (linestrings + polygons only; osmium's default linear/area tag lists decide which closed ways are areas). Lake Michigan is added separately: `osmium getid -r` pulls relation 1205149's ways that exist in the extract, `lake-polygon.mjs` clips and closes them along the tile bbox → `.osm-cache/chicago-lake.geojsonseq` (natural=water, water=lake, name=Lake Michigan). Both files → tippecanoe z10–z16, layer **`osm`**, `--drop-densest-as-needed --simplify-only-low-zooms --maximum-tile-bytes=450000` (headroom for the places layer; `tile-join -pk` then never skips a merged tile for size, which once left a z10 hole) → `tile-join -e public/data/tiles-chicago`. Tiles are gzip on disk and named `.pbf`, same as `public/data/tiles` (NYC). The script decodes Loop, lake-shore, Lincoln Park and open-lake tiles, prints highway-line / water-polygon / park-polygon counts, and **fails if the open-lake tiles (z10–z16 at -87.50, 41.80) have no natural=water polygon**.
3b. Place names: `osmium tags-filter n/place=city,town,village,suburb,neighbourhood,quarter` → `export-places.json` → tippecanoe `-l places -r1` (keep every point at every zoom) → merged into the same tile tree by `tile-join`. The style draws towns from z10 and suburbs/neighbourhoods from z10.5 as light uppercase labels.
4. Businesses: `osmium tags-filter nwr/shop nwr/amenity nwr/office nwr/craft nwr/healthcare nwr/tourism nwr/leisure nwr/club` → geojsonseq → `pois-to-csv.mjs --bbox` with the **map bbox** W -88.00, S 41.58, E -87.50, N 42.10 → `.osm-cache/chicago-businesses.csv`.
5. Neighborhoods: download `https://data.cityofchicago.org/api/geospatial/cauq-8yn6?method=export&format=GeoJSON` (fallback `.../resource/igwz-8jzy.geojson?$limit=100`) → `community-areas-to-ts.mjs` → `src/utils/chicago_neighborhoods.ts`.

## Outputs

- `public/data/tiles-chicago/{z}/{x}/{y}.pbf` + `metadata.json` — committed; the MapLibre style should use `"source-layer": "osm"` (fields: `highway, name, leisure, natural, water, landuse`).
- `.osm-cache/chicago-businesses.csv` — **not committed** (`.osm-cache/` is gitignored). Header: `source_id,name,business_type,lat,lng,address,website`. `source_id` is `node/123`, `way/123` or `relation/123` and is unique. `business_type` uses the NYC vocabulary (Restaurant, Cafe, Bar, Retail, Grocery Store, Healthcare, Education, Financial, Legal, Hospitality, Automotive, Fitness, Recreation, Cultural, Tourist Attraction, Religious, Transportation, Government, Wellness, Business, Other). Imported by the migration/import step owned elsewhere:
  ```sql
  \copy public.businesses_chicago(source_id,name,business_type,lat,lng,address,website) from '.osm-cache/chicago-businesses.csv' with (format csv, header true)
  ```
- `src/utils/chicago_neighborhoods.ts` — committed, generated; exports `chicagoNeighborhoodBoundaries` and `chicagoNeighborhoods: NeighborhoodBounds[]`.

## Tuning

- Tile size: if `public/data/tiles-chicago` grows far beyond NYC's 47 MB, add `--maximum-tile-bytes` or raise the minimum zoom for `highway=footway/path/steps/service` in step 3.
- Harbors (Monroe, Belmont, DuSable, …) are separate `natural=water` polygons in OSM and come through the normal basemap export; they are not part of the lake relation.
- Categories / exclusions live in `RULES` and `EXCLUDE` at the top of `pois-to-csv.mjs`; first matching rule wins.

## After a rebuild

Bump `tilesVersion` for Chicago in `src/utils/cities.ts`. Tile URLs end in `?v=N`; without the bump, browsers (and the Vercel CDN, which marks tiles immutable for a year) keep serving the previous tiles from cache. Then run `import-businesses.sh` if the CSV changed.
