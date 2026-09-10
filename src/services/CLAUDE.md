# src/services/

Every Supabase call lives here. Functions return plain data or `{ data, error }`; they do not touch React state.

- `posts.ts` — `Post` type, `getPosts` (top-level only), `getCommentsForPosts`, `getMyPosts` (the device's own, paged), `getPostById`, `createPost`, `getUserVotes`, `deletePost` (soft delete). `SYSTEM_USER_ID` marks seed posts.
- `businesses.ts` — viewport RPC, `getFullBusinessDetails`, and the app-wide details cache (`getFullBusinessDetailsCached`, `setCachedBusiness`). `createOrUpdateBusinessRole` (by business name) and `addBusinessRole` (by id, from the details card) add a role/salary row attributed to the device via `created_by`.
- `voting.ts` — `persistVote` for `votes` and `role_votes` (upsert or delete).
- `reports.ts` — `submitBusinessReport` into `business_reports` (closed / wrong details / duplicate / other), reviewed by hand in the dashboard.
- `errors.ts` — `describeDbError` / `isRateLimited`: the database raises SQLSTATE `P0429` with a user-facing message when a posting limit is hit; everything else maps to a generic message.
- `currentJobs.ts` — the profile's single current job (upsert) and `moveCurrentJobToPast` (RPC, atomic copy + clear).
- `pastJobs.ts` — visible past jobs (`deleted_at is null`), `hidePastJob` (soft delete), `wipePastJobs` (hard delete, drafts only), `isCompletePastJob`.
- `businessLookup.ts` — business id by name.
- `search.ts` — the whole search feature: `parseSearchQuery` (pay range, neighborhood by phrase or alias, stop words, punctuation) and `searchBusinesses`, which calls the `search_businesses` Postgres function. Results carry a `score` and `matchReasons` (name, role, type, address, similar name, neighborhood, pay). Cached 30 s per (filters, bounds, limit).

The `x-device-id` header is added automatically by the client wrapper; never pass the device id as a query filter for security, only for convenience.
