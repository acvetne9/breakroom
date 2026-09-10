# scripts/

- `e2e-smoke.mjs` — Playwright smoke test (`npm run test:e2e` with `npm run dev` running). Loads the map, searches by name / role / neighborhood + pay, opens a business, votes and reverts, posts / comments / deletes in the feed, completes and retires a job in Settings, hides it, and checks My Stories. Screenshots land in `.e2e-shots/` (a `fail-N.png` is captured for any failed step). Uses the live Supabase project with a throwaway device id; delete that device's rows afterwards.

The old index-maintenance scripts moved to `supabase/migrations_archive/docs/` with the guides that explain them.
