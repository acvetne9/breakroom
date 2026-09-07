# src/hooks/

Data hooks:

- `usePosts.ts` — the feed. Pages of top-level posts, then comments for those posts, then the device's votes. Realtime inserts fetch the single row (with its business join) and prepend it. Uses refs for offset/loading so the realtime handler never reads stale state.
- `useViewportBusinesses.tsx` — browse mode covers the viewport with complete z14 tiles, center-out, via the slim viewport RPC; when zoomed out past 24 tiles it does one row-limited fetch instead. After the map settles it preloads the ring of tiles around the viewport, one tile at a time. Search mode re-queries for the current viewport as the user pans. `fetchFullBusinessDetails` merges the cached full record back into the list.
- `useTileCache.ts` — in-memory per-tile cache keyed by tile + zoom. Tiles filled by a wide, row-limited fetch are flagged `partial` and never satisfy the per-tile loader; only whole-tile fetches count as complete.
- `useOptimisticVote.ts` — `applyOptimisticVote` primitive shared by post votes and role votes.
- `useTranslation.ts` — on-device translation through the browser's built-in `Translator` / `LanguageDetector` APIs (Chromium). No network, no quota; other browsers show the original text.
- `useSessionCache.ts`, `useReconnectionHandler.ts`, `useDropdown.ts`.

UI hooks: `use-mobile.tsx`, `use-toast.ts`.

Guideline: a hook owns one concern. If two hooks start caching the same entity, move the cache into `services/`.
