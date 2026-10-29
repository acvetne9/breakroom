# scripts/

- `e2e-smoke.mjs` — Playwright smoke test (`npm run test:e2e` with `npm run dev` running). Loads the map, searches by name / role / neighborhood + pay, opens a business, votes and reverts, posts / comments / deletes in the feed, completes and retires a job in Settings, hides it, checks My Stories, then switches the map to Chicago (tiles from `/data/tiles-chicago/`, viewport RPC with `city=chicago`, search, community-area match, preview) and back to NYC. Screenshots land in `.e2e-shots/` (a `fail-N.png` is captured for any failed step). Uses the live Supabase project with a throwaway device id; delete that device's rows afterwards.
- `e2e-deploy.mjs` — read-only Playwright check for a deployed build: `node scripts/e2e-deploy.mjs https://<preview>.vercel.app`. Loads NYC, switches to Chicago, confirms versioned tiles and the city-scoped RPC, searches, opens a preview, reloads. Writes nothing to the database. Screenshots in `.e2e-shots/deploy/`.
- `osm/` — the Chicago OpenStreetMap pipeline: `build-chicago.sh` (download, clip, tiles into `public/data/tiles-chicago`, businesses CSV, community-area polygons) and `import-businesses.sh` (upsert the CSV into `businesses_chicago`). See `osm/CLAUDE.md`.

The old index-maintenance scripts moved to `supabase/migrations_archive/docs/` with the guides that explain them.
