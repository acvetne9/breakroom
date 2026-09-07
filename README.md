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
│    ├── gzpbf:// protocol inflates gzip tiles client-side  │
│    ├── Turf.js for neighborhood geometry                   │
│    └── Tile-chunked, viewport-based business loading       │
│                                                           │
│  Search     One parser + one Postgres function            │
│    ├── Pay range, neighborhood, stop-word parsing (client) │
│    └── search_businesses — trigram + PostGIS, ranked       │
│                                                           │
│  i18n       Browser on-device Translator API (no server)  │
│  UI         shadcn/ui (Radix) + Tailwind + Framer Motion   │
│  State      React Context + session cache                  │
├──────────────────────────────────────────────────────────┤
│                        Supabase                           │
│    ├── Postgres + PostGIS (spatial queries, indexes)      │
│    ├── Anonymous device-id identity (x-device-id header)  │
│    ├── Row Level Security keyed on that header            │
│    ├── RPC — spatial search, global text search           │
│    └── Edge Functions (Deno) — geocode-address            │
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
| **Geo** | Turf.js | Client-side neighborhood boundary tests. |
| **Search** | Postgres function `search_businesses` | Client parses pay, neighborhood and terms; the database matches name (punctuation-insensitive, fuzzy), type, address and roles with trigram indexes, filters by neighborhood polygon and hourly pay, and returns ranked results with match reasons. |
| **Backend** | Supabase (Postgres + PostGIS) | Single managed backend: database, auth, RLS, and Deno edge functions in one place. |
| **Identity** | Anonymous **device id** | A UUID is generated client-side (`src/utils/deviceId.ts`), stored as `profiles.id`, and sent on every request as the `x-device-id` header. RLS policies compare against it; there is no account. |
| **Server state** | Custom hooks | `usePosts` (feed + realtime), `useViewportBusinesses` (tile cache), `useOptimisticVote`, reconnection handling. |
| **Mobile shell** | Capacitor v7 (iOS + Android) | Wraps the same web build into native apps; dev mode points the native shell at the local dev server. |
| **Forms / validation** | React Hook Form + Zod | Schema-validated forms (e.g. address entry on the initiation card). |
| **i18n** | Browser built-in Translator API | On-device translation in Chromium browsers, cached per device; other browsers show the original text. No server or quota. |

### Notable design choices

- **No map vendor lock-in.** MapLibre + locally-hosted `.pbf` tiles avoid Mapbox/Google billing. The tiles are gzip on disk; `vercel.json` serves them with `Content-Encoding: gzip` and the `gzpbf://` MapLibre protocol (`src/utils/tileProtocol.ts`) inflates them anywhere a host doesn't, including the Capacitor shell.
- **Account-less contributions.** Device-based identity lowers the barrier to posting salary/role data while RLS policies scope writes to the posting device.
- **Search lives in the database.** The client only parses intent (pay, neighborhood, words); one SQL function does matching, geography and ranking, so the dropdown and the map always agree and there is no third-party API in the path.
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

The dev server runs on `http://localhost:8080`. Copy `.env.example` to `.env` if you want to point at a different Supabase project.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite dev server (port 8080). |
| `npm run build` | Production build to `dist/`. |
| `npm run build:dev` | Development-mode build. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Type-check without emitting. |
| `npm test` | Run unit tests (vitest). |
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

Schema and performance work are tracked in the migration files and the optimization guides in the repo root. Note that the migration history drifted from the live database; `src/integrations/supabase/types.ts` is the accurate schema and `supabase/migrations/CLAUDE.md` explains how to re-baseline.

### Secrets

Nothing secret is committed. Android release signing reads `android/keystore.properties` (see the `.example`); Supabase keys come from `.env`. Each directory has a `CLAUDE.md` describing its contents for AI-assisted work.
