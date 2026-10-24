# src/services/

Every Supabase call lives here. Functions return plain data or `{ data, error }`; they do not touch React state.

City rule: business tables are per city (`cityTables()` from `utils/cities.ts` picks `businesses` / `business_roles` or the `_chicago` pair) and every row written to a shared user table carries `city: getCurrentCityId()`. Reads of the current city need no argument; pass a `city` only when acting on another city's data (e.g. flying to a post from the other city).

- `posts.ts` — `Post` type (with `city`), `getPosts` (top-level, current city only), `getCommentsForPosts`, `getMyPosts` (the device's own, all cities), `getPostById`, `createPost`, `getUserVotes`, `deletePost` (soft delete). The business join is the `post_business(...)` computed relationship, not an FK embed. `SYSTEM_USER_ID` marks seed posts.
- `businesses.ts` — viewport RPC, `getFullBusinessDetails`, and the app-wide details cache (`getFullBusinessDetailsCached`, `setCachedBusiness`, `clearDetailsCache`). `createOrUpdateBusinessRole` (by business name) and `addBusinessRole` (by id, from the details card) add a role/salary row attributed to the device via `created_by`.
- `voting.ts` — `persistVote` for `votes` and `role_votes` (upsert or delete); role votes record the city.
- `reports.ts` — `submitBusinessReport` into `business_reports` (closed / wrong details / duplicate / other), reviewed by hand in the dashboard.
- `errors.ts` — `describeDbError` / `isRateLimited`: the database raises SQLSTATE `P0429` with a user-facing message when a posting limit is hit; everything else maps to a generic message.
- `currentJobs.ts` — the profile's single current job (upsert) and `moveCurrentJobToPast` (RPC, atomic copy + clear).
- `pastJobs.ts` — visible past jobs (`deleted_at is null`), `hidePastJob` (soft delete), `wipePastJobs` (hard delete, drafts only), `isCompletePastJob`.
- `businessLookup.ts` — business id by name.
- `search.ts` — the whole search feature: `parseSearchQuery` (pay range, neighborhood by phrase or alias from the city config, stop words, punctuation) and `searchBusinesses`, which calls the `search_businesses` Postgres function with the current city. Results carry a `score` and `matchReasons` (name, role, type, address, similar name, neighborhood, pay). Cached 30 s per (city, filters, bounds, limit).

The `x-device-id` header is added automatically by the client wrapper; never pass the device id as a query filter for security, only for convenience.
