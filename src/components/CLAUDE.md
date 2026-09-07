# src/components/

## Shell

- `MobileApp.tsx` — three swipeable cards (Settings 0, Home 1, Explore 2). Owns `selectedBusiness`, filters for the feed, role-vote state, and the `MapHandle` ref. First-run flow: `InitiationPage` shows on return visits with no saved job.
- `PostsProvider.tsx` — single `usePosts` instance shared by every page.

## Home (map)

- `HomePage.tsx` — search bar, welcome toast, `BusinessPreview` / `BusinessDetails` cards. Forwards `mapRef` to the map.
- `MapLibreMap.tsx` — creates the MapLibre map + deck.gl overlay, throttles viewport loads, thins dots by zoom with a deterministic (id-hash) grid sample so the picked subset is stable across rebuilds, exposes `flyTo` via `forwardRef`. Tile URLs use the `gzpbf://` protocol from `utils/tileProtocol.ts`.
- `UnifiedBusinessSearch.tsx` — dropdown search with neighborhood + synonym expansion.
- `WorkaroundLoading.tsx` — loading overlay until map tiles and businesses arrive.

## Explore (feed)

- `ExplorePage.tsx` — paginated feed with comments. Scroll listener is on its own scroll container (not `window`, which never scrolls). Comments are posts whose `isComment` is the parent id.
- `VotingComponent.tsx`, `CommenterBadge.tsx`, `TranslatedText.tsx`.

## Settings

- `SettingsPage.tsx` — current job + past jobs with per-job debounced auto-save, plus "My Stories". Both kinds use the same `JobFormState`.
- `JobEditor.tsx` — the three fields for one job; state transitions come from `utils/jobForm.ts`.
- `JobEntryForm.tsx` — low-level presentational fields shared with `InitiationPage`.

Props conventions: pass `Post` from `services/posts` and `Business` from `types/business`; no local copies.
