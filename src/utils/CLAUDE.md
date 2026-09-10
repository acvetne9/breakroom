# src/utils/

Pure helpers, no React.

- `deviceId.ts` — creates/reads the anonymous device UUID. Imported by the Supabase client, so it must stay dependency-free.
- `tileProtocol.ts` — registers the `gzpbf://` MapLibre protocol that inflates gzip-on-disk tiles (native `DecompressionStream`, pako fallback). Pass-through when the host already sets `Content-Encoding: gzip`.
- `platform.ts` — `isCapacitor`, `isAndroid`.
- `deckGLLayers.ts` — scatterplot + emoji layers.
- `tiles.ts`, `geo.ts`, `nyc_neighborhoods.ts` — web-mercator tile math, NYC bounds, neighborhood polygons (`findNeighborhoodBoundaryByName`, `getAllNeighborhoodNames`; point-in-polygon now happens in Postgres).
- `jobForm.ts` — `JobFormState` and pure transitions for the job editors (validation, address fallback, salary formatting).
- `businessMapper.ts`, `voteCalculations.ts`, `salaryFormat.ts`, `timeAgo.ts`, `addressValidation.ts`, `commenterIdentity.ts`, `profanityFilter.ts`, `retryWithBackoff.ts`.

Tests live in `__tests__/` and run with vitest.
