# src/types/

- `business.ts` — `Business` and `BusinessRole`, the shapes every map/card component consumes. Roles from the viewport RPC may lack `id`; roles from `getFullBusinessDetails` always have it (that is how `MobileApp.hasFullDetails` tells them apart).
- `search.ts` — `EnhancedBusiness`, the search-result superset of `Business` with raw column aliases.

`Post` lives in `services/posts.ts` next to its transformer.
