# public/

Static assets copied verbatim into `dist/`.

- `data/tiles/{z}/{x}/{y}.pbf` — self-hosted NYC vector tiles (~47 MB, ~11k files). They are **gzip-compressed on disk** despite the `.pbf` name. `vercel.json` and the Vite dev plugin serve them with `Content-Encoding: gzip`; the `gzpbf://` MapLibre protocol in `src/utils/tileProtocol.ts` inflates them wherever a host doesn't. Regenerate with tippecanoe from OSM data if the base map needs changes.
- `data/OpenSansArialUnicode/` — glyph PBFs for road labels (not compressed).
- `favicon.*`, `robots.txt`, `placeholder.svg`.

No service worker: it was removed in favour of the protocol handler above.
