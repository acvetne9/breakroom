# src/services/

Every Supabase call lives here. Functions return plain data or `{ data, error }`; they do not touch React state.

- `posts.ts` — `Post` type, `getPosts` (top-level only), `getCommentsForPosts`, `getPostById`, `createPost`, `getUserVotes`, `deletePost` (soft delete). `SYSTEM_USER_ID` marks seed posts.
- `businesses.ts` — viewport RPC, `getFullBusinessDetails`, and the app-wide details cache (`getFullBusinessDetailsCached`, `setCachedBusiness`). `createOrUpdateBusinessRole` adds a role/salary row when a user records a job.
- `voting.ts` — `persistVote` for `votes` and `role_votes` (upsert or delete).
- `currentJobs.ts`, `pastJobs.ts`, `businessLookup.ts` — job history keyed by `profile_id` = device id.
- `search.ts` — the whole search feature: `parseSearchQuery` (pay range, neighborhood by phrase or alias, stop words, punctuation) and `searchBusinesses`, which calls the `search_businesses` Postgres function. Results carry a `score` and `matchReasons` (name, role, type, address, similar name, neighborhood, pay). Cached 30 s per (filters, bounds, limit).

The `x-device-id` header is added automatically by the client wrapper; never pass the device id as a query filter for security, only for convenience.
