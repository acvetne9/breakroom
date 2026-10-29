# Workaround

Location-based community app: real salaries, roles, and stories pinned to businesses on a map. Two cities: New York City (~54k businesses) and Chicago (OpenStreetMap businesses). Branded **Workaround**; the Supabase project and Android package id still say `breakroom`.

## Stack

- React 18 + TypeScript (`strict`) + Vite 5 (SWC). Tailwind + five shadcn/ui primitives. Framer Motion for the 3-card swipe shell.
- Map: MapLibre GL with self-hosted vector tiles (`public/data/tiles-nyc` and `public/data/tiles-chicago`, both built from OpenStreetMap by `scripts/osm/build-city.sh`), business dots drawn by deck.gl.
- Backend: Supabase (Postgres + PostGIS, RLS, one Deno edge function for geocoding). No Supabase Auth sign-in. Translation runs on-device in the browser.
- Mobile: Capacitor 7 wraps the same web build (`android/`, `ios/`).
- Hosting: Vercel static (`vercel.json`). Not live at the moment.

## Identity model (read this before touching data code)

Every visitor gets an anonymous UUID from `src/utils/deviceId.ts`. It is the `profiles.id` primary key and is sent on every request as the `x-device-id` header via the fetch wrapper in `src/integrations/supabase/client.ts`. Row-level security policies (`supabase/migrations/20260907000000_device_id_row_level_security.sql`) compare that header to `user_id` / `profile_id`. There is no account, so the id is spoofable by design; do not build anything that assumes otherwise.

## City model

`src/utils/cities.ts` is the single config for every city: bounds, center, tile directory, minimum zoom and version, which business tables to read, landmarks, neighborhoods, stop words. The chosen city is stored in localStorage (`map_city`) and read synchronously by services through `getCurrentCityId()`; `CityContext` exposes it to components and clears the business caches on a switch. The map remounts per city (`key={city.id}`).

Database: `businesses` / `business_roles` are NYC only; `businesses_chicago` / `business_roles_chicago` are the Chicago pair. User tables (`posts`, `current_jobs`, `past_jobs`, `role_votes`, `business_reports`) are shared and carry a `city` column saying which table their `business_id` / `business_role_id` points into. The map RPCs take `city`. See `supabase/CLAUDE.md`.

## Commands

```sh
npm run dev        # http://localhost:8080
npm run build      # dist/
npm run typecheck  # tsc, must stay clean
npm run lint       # eslint, 0 errors (remaining warnings are shadcn fast-refresh notes and a few effect deps)
npm test           # vitest
npm run test:e2e   # Playwright smoke test against a running dev server (NYC flows, then the Chicago switch)
node scripts/e2e-deploy.mjs <url>   # read-only Playwright check of a Vercel preview / production
bash scripts/osm/build-city.sh <nyc|chicago>   # rebuild a city's tiles (+ Chicago businesses CSV) from OpenStreetMap
bash scripts/osm/import-businesses.sh    # upsert that CSV into businesses_chicago
```

## Conventions

- One shared `Post` type in `src/services/posts.ts` and one `Business` type in `src/types/business.ts`. Do not redeclare them in components.
- Cross-page actions go through props/refs (e.g. `MapHandle` for fly-to), never `window.dispatchEvent`.
- Business details are cached once in `src/services/businesses.ts` (`getFullBusinessDetailsCached`). Use it instead of adding another store.
- Anything that reads or writes a business table goes through `cityTables()` / `getCurrentCityId()` from `src/utils/cities.ts`; never hardcode `businesses` or `business_roles`.
- Production builds strip `console.*` (see `vite.config.ts`), so logging is fine for dev but not a substitute for error handling.
- Secrets never go in git: signing keys live in `android/keystore.properties` (gitignored), env in `.env` (gitignored, see `.env.example`).

## Known gaps

- `supabase/migrations` was re-baselined on 2026-09-07 from a dump of the live database; older files are in `supabase/migrations_archive/`. Keep `src/integrations/supabase/types.ts` regenerated after schema changes.
- The Android keystore that was in git history is compromised. A fresh one lives in `secrets/upload-key.jks` (gitignored) with its credentials in `android/keystore.properties`; back both up outside the repo. If the app was ever published with the old key, request an upload-key reset in Play Console.
