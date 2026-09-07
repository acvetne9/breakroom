# Workaround

Location-based community app: real salaries, roles, and stories pinned to ~54k businesses on a map of New York City. Branded **Workaround**; the Supabase project and Android package id still say `breakroom`.

## Stack

- React 18 + TypeScript + Vite 5 (SWC). Tailwind + shadcn/ui. Framer Motion for the 3-card swipe shell.
- Map: MapLibre GL with self-hosted vector tiles in `public/data/tiles`, business dots drawn by deck.gl.
- Backend: Supabase (Postgres + PostGIS, RLS, one Deno edge function for geocoding). No Supabase Auth sign-in. Translation runs on-device in the browser.
- Mobile: Capacitor 7 wraps the same web build (`android/`, `ios/`).
- Hosting: Vercel static (`vercel.json`). Not live at the moment.

## Identity model (read this before touching data code)

Every visitor gets an anonymous UUID from `src/utils/deviceId.ts`. It is the `profiles.id` primary key and is sent on every request as the `x-device-id` header via the fetch wrapper in `src/integrations/supabase/client.ts`. Row-level security policies (`supabase/migrations/20260907000000_device_id_row_level_security.sql`) compare that header to `user_id` / `profile_id`. There is no account, so the id is spoofable by design; do not build anything that assumes otherwise.

## Commands

```sh
npm run dev        # http://localhost:8080
npm run build      # dist/
npm run typecheck  # tsc, must stay clean
npm run lint       # eslint, 0 errors (remaining warnings are shadcn fast-refresh notes and a few effect deps)
npm test           # vitest
npm run test:e2e   # Playwright smoke test against a running dev server
```

## Conventions

- One shared `Post` type in `src/services/posts.ts` and one `Business` type in `src/types/business.ts`. Do not redeclare them in components.
- Cross-page actions go through props/refs (e.g. `MapHandle` for fly-to), never `window.dispatchEvent`.
- Business details are cached once in `src/services/businesses.ts` (`getFullBusinessDetailsCached`). Use it instead of adding another store.
- Production builds strip `console.*` (see `vite.config.ts`), so logging is fine for dev but not a substitute for error handling.
- Secrets never go in git: signing keys live in `android/keystore.properties` (gitignored), env in `.env` (gitignored, see `.env.example`).

## Known gaps

- `supabase/migrations` was re-baselined on 2026-09-07 from a dump of the live database; older files are in `supabase/migrations_archive/`. Keep `src/integrations/supabase/types.ts` regenerated after schema changes.
- TypeScript runs with `strict: false`. Enabling it produces ~90 errors, mostly in the search pipeline.
- The Android keystore that was in git history is compromised. A fresh one lives in `secrets/upload-key.jks` (gitignored) with its credentials in `android/keystore.properties`; back both up outside the repo. If the app was ever published with the old key, request an upload-key reset in Play Console.
