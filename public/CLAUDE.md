# public/

Static assets copied verbatim into `dist/`.

- `data/tiles-nyc/` and `data/tiles-chicago/` — self-hosted vector tiles, `{z}/{x}/{y}.pbf`, z8–z16, built from OpenStreetMap by `scripts/osm/build-city.sh <city>`. One layer `osm` (fields highway/name/leisure/natural/water/landuse; ways and relations only, no point features) plus a `places` point layer (name/place) for the light area labels. They are **gzip-compressed on disk** despite the `.pbf` name; `vercel.json` and the Vite dev plugin serve every `data/tiles*/` directory with `Content-Encoding: gzip`, and the `gzpbf://` MapLibre protocol in `src/utils/tileProtocol.ts` inflates them wherever a host doesn't. Rebuild with the script rather than editing files here, then bump `tilesVersion` in `src/utils/cities.ts`: tile URLs carry `?v=N` because the files are served as immutable for a year. The native shells reference `assets/<tilesDir>/`; their `assets/tiles` copy is the pre-rebuild NYC set and needs replacing with both directories.
- `data/OpenSansArialUnicode/` — glyph PBFs for road labels (not compressed).
- `favicon.*`, `robots.txt`, `placeholder.svg`.

No service worker: it was removed in favour of the protocol handler above.
