# src/

Entry: `main.tsx` → `App.tsx` (providers) → `components/MobileApp.tsx` (the whole UI).

| Folder | Purpose |
|---|---|
| `components/` | Feature components; `components/ui/` is shadcn primitives |
| `contexts/` | Device identity and online/offline state |
| `hooks/` | Data hooks (posts feed, viewport businesses, tile cache) and UI helpers |
| `services/` | All Supabase reads/writes. Components never call `supabase` for data directly except the profile bootstrap in `MobileApp` |
| `utils/` | Pure helpers: geo/tile math, search parsing, formatting, device id, tile protocol |
| `types/` | Domain types shared across layers |
| `integrations/supabase/` | Generated types + the configured client |
| `data/` | Static synonym JSON used by search |

Path alias `@/` → `src/`.

Data flow: `MobileApp` owns selection/slide state → `HomePage` renders the map and cards → `MapLibreMap` loads businesses per viewport via `useViewportBusinesses` → clicking a dot fetches full details through `services/businesses.ts` and hands them back up. Posts come from `PostsProvider` (one `usePosts` instance for the app).
