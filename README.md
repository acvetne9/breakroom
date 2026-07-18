# Workaround

A location-based community platform for sharing real workplace info — salaries, roles, and stories — pinned to businesses on an interactive map of New York City. Users explore businesses on a map, contribute salary and role data, post stories, vote on contributions, and discover neighborhood-level insights about where people actually work.

> The product is branded **Workaround**. The repository, package id (`com.acvetne.breakroom`), and Supabase project are still named `breakroom` from the original build.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      Mobile / Web App                     │
│              Capacitor v7  (iOS · Android · Web)          │
├──────────────────────────────────────────────────────────┤
│  React 18 + TypeScript + Vite (SWC)                       │
│                                                           │
│  MobileApp — 3-slide swipeable carousel                   │
│    ├── SettingsPage  — current/past job history           │
│    ├── HomePage      — interactive map + unified search    │
│    └── ExplorePage   — community feed (posts + voting)     │
│                                                           │
│  Map        MapLibre GL + Deck.GL                          │
│    ├── Self-hosted .pbf vector tiles (in /public/data)    │
│    ├── Web Worker for tile/geometry processing            │
│    ├── Supercluster + Turf.js for clustering & geometry   │
│    └── Viewport-based business loading                     │
│                                                           │
│  Search     Unified search pipeline                        │
│    ├── DataMuse API — query term expansion                 │
│    ├── Fuse.js + string-similarity — fuzzy matching        │
│    ├── Salary / neighborhood / synonym parsing             │
│    └── Supabase RPC — trigram + PostGIS spatial            │
│                                                           │
│  UI         shadcn/ui (Radix) + Tailwind + Framer Motion   │
│  State      TanStack Query + React Context + session cache │
├──────────────────────────────────────────────────────────┤
│                        Supabase                           │
│    ├── Postgres + PostGIS (spatial queries, indexes)      │
│    ├── Auth — anonymous, device-based identity            │
│    ├── Row Level Security policies per table              │
│    ├── RPC — spatial search, global text search           │
│    └── Edge Functions (Deno) — geocode-address, translate │
└──────────────────────────────────────────────────────────┘
```

## Tech Stack & Why

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Build** | Vite + `@vitejs/plugin-react-swc` | Fast HMR and SWC-based transforms; a custom Vite plugin serves `.pbf` tiles with correct protobuf headers in dev. |
| **Language** | TypeScript (relaxed config) | Type safety without friction — `strictNullChecks`, `noImplicitAny`, and unused-checks are intentionally **off** to keep iteration fast. |
| **UI framework** | React 18 | Concurrent rendering; `React.StrictMode` enabled. |
| **Components** | shadcn/ui (Radix primitives) | Accessible, unstyled primitives owned in-repo (`src/components/ui`) rather than a black-box library. |
| **Styling** | Tailwind CSS + `tailwindcss-animate` + typography plugin | Utility-first styling; `next-themes` for theming. |
| **Animation** | Framer Motion | Page transitions and the swipeable carousel shell. |
| **Maps** | MapLibre GL + Deck.GL | Open-source (no Mapbox token); **self-hosted vector tiles** in `public/data/tiles` keep the map free and offline-capable. Fonts shipped as `.pbf` glyphs. |
| **Geo / clustering** | Turf.js, Supercluster, geojson-vt | Client-side neighborhood boundaries, point clustering, and tiling. |
| **Search** | DataMuse API, Fuse.js, string-similarity | Term expansion + fuzzy matching layered over Postgres trigram/spatial RPC; custom hospitality/job synonym indexes (`src/data`, `src/utils/jobSynonyms.json`). |
| **Backend** | Supabase (Postgres + PostGIS) | Single managed backend: database, auth, RLS, and Deno edge functions in one place. |
| **Auth / identity** | Supabase Auth with **device-based** identity | A UUID `device_id` is generated client-side and sent via the `x-device-id` header, so users can contribute without creating an account. |
| **Server state** | TanStack Query | Caching, optimistic updates (e.g. `useOptimisticVote`), and reconnection handling. |
| **Mobile shell** | Capacitor v7 (iOS + Android) | Wraps the same web build into native apps; dev mode points the native shell at the local dev server. |
| **Forms / validation** | React Hook Form + Zod | Schema-validated forms (e.g. address entry on the initiation card). |
| **i18n** | LibreTranslate via a Supabase edge function | On-the-fly translation with multi-instance fallbacks; client `useTranslation` hook + `TranslatedText` component. |

### Notable design choices

- **No map vendor lock-in.** MapLibre + locally-hosted `.pbf` tiles avoid Mapbox/Google billing and work offline. On the web a service worker (`public/tiles-sw.js`) decompresses tiles; on Capacitor that's replaced by fetch-patching (`src/utils/capacitorTileHandler.ts`) since service workers aren't available there.
- **Web Worker offload.** Heavy tile decompression and geometry work run in `src/workers/mapWorker.ts` (driven by `useMapWorker`) to keep the UI thread responsive.
- **Account-optional contributions.** Device-based identity lowers the barrier to posting salary/role data while RLS policies still scope what each device can read/write.
- **Layered search.** Cheap client-side parsing (salary patterns, neighborhood names, synonyms) narrows intent before hitting Postgres trigram + PostGIS RPCs, with a short-lived in-memory result cache.
- **Content safety.** A block-list `profanityFilter` guards user-generated posts.
- **Performance-tuned DB.** Index strategy is documented in `INDEX_OPTIMIZATION_GUIDE.md` / `DATABASE_OPTIMIZATION_GUIDE.md`, with paired apply/rollback migrations.

## Project Layout

```
src/
  components/        Feature components + shadcn/ui primitives (ui/)
  pages/             Index, Auth, NotFound
  contexts/          Auth, Device (identity), Connection
  hooks/             Data, map, search, voting, translation hooks
  services/          Supabase data access (businesses, posts, jobs, search, voting)
  utils/             Search, geo, tiles, profanity, fingerprint helpers
  workers/           mapWorker — off-thread tile/geometry processing
  integrations/      Generated Supabase client + types
supabase/
  functions/         Deno edge functions: geocode-address, translate
  migrations/        Schema + index migrations
public/data/         Self-hosted vector tiles (.pbf) and glyph fonts
android/ · ios/      Capacitor native projects
```

## Getting Started

Requires Node.js (install with [nvm](https://github.com/nvm-sh/nvm#installing-and-updating)). The lockfiles support both `npm` and `bun`.

```sh
git clone https://github.com/acvetne9/breakroom.git workaround
cd workaround
npm i
npm run dev
```

The dev server runs on `http://localhost:8080`.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite dev server (port 8080). |
| `npm run build` | Production build to `dist/`. |
| `npm run build:dev` | Development-mode build. |
| `npm run lint` | Run ESLint. |
| `npm run preview` | Preview the production build. |

### Mobile Builds

```sh
npm run build
npx cap sync
npx cap open ios       # or: npx cap open android
```

In development the Capacitor config points the native shell at the host dev server (`http://10.0.2.2:8080` for the Android emulator).

## Backend

Supabase project `hyygpxhwkvyxtbjnnpqk`. The client (`src/integrations/supabase/client.ts`) uses the public anon key and attaches the device id on every request. Edge functions live under `supabase/functions/`:

- **`geocode-address`** — forward geocoding (OpenStreetMap/Nominatim) for address entry.
- **`translate`** — LibreTranslate proxy with multi-instance fallback and timeouts; `verify_jwt = false`.

Schema and performance work are tracked in the migration files and the optimization guides in the repo root.
