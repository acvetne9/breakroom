# src/types/

- `business.ts` — `Business` and `BusinessRole`, the shapes every map/card component consumes. Roles from the viewport RPC may lack `id`; roles from `getFullBusinessDetails` always have it (that is how `MobileApp.hasFullDetails` tells them apart).
- `search.ts` — `EnhancedBusiness` = `Business` plus flat `lat`/`lng` (and optional match reasons), as the dropdown and job forms consume it.

`Post` lives in `services/posts.ts` next to its transformer.
