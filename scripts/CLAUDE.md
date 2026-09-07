# scripts/

Manual helpers.

- `e2e-smoke.mjs` — Playwright smoke test (`npm run test:e2e` with `npm run dev` running). Loads the map, searches, opens a business, votes and reverts, posts/comments/deletes in the feed, and types into settings. Screenshots land in `.e2e-shots/`. Uses the live Supabase project with a throwaway device id.

- `apply-index-optimization.sh` — applies `supabase/migrations/20260106000000_optimize_indexes.sql` (paired with a rollback migration).
- `verify_indexes.sql` — checks the expected indexes exist and reports sizes/usage.

Background in the root `DATABASE_OPTIMIZATION_GUIDE.md` and `INDEX_OPTIMIZATION_GUIDE.md`.
