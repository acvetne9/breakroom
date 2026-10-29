# public/

Static assets copied verbatim into `dist/`.

- `data/tiles/{z}/{x}/{y}.pbf` — self-hosted NYC vector tiles (~47 MB, ~11k files, layer `examplepoints`). They are **gzip-compressed on disk** despite the `.pbf` name. `vercel.json` and the Vite dev plugin serve every `data/tiles*/` directory with `Content-Encoding: gzip`; the `gzpbf://` MapLibre protocol in `src/utils/tileProtocol.ts` inflates them wherever a host doesn't.
- `data/tiles-chicago/{z}/{x}/{y}.pbf` — the same for Chicago (layer `osm`, fields highway/name/leisure/natural/water/landuse, plus a `places` point layer with name/place for the light area labels). Built from OpenStreetMap by `scripts/osm/build-chicago.sh`; rebuild there rather than editing files here, and bump `tilesVersion` in `src/utils/cities.ts` afterwards: tile URLs carry `?v=N` because the files are served as immutable for a year. The native shells reference `assets/<tilesDir>/`, so copy this directory alongside `assets/tiles` when shipping Chicago on Android.
- `data/OpenSansArialUnicode/` — glyph PBFs for road labels (not compressed).
- `favicon.*`, `robots.txt`, `placeholder.svg`.

No service worker: it was removed in favour of the protocol handler above.
