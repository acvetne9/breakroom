# supabase/

Project ref `hyygpxhwkvyxtbjnnpqk`. Postgres 15 + PostGIS + pg_trgm.

- `migrations/` — one baseline migration plus anything newer; see its CLAUDE.md.
- `migrations_archive/` — the pre-baseline history, reference only.
- `functions/` — Deno edge functions (`geocode-address`).
- `config.toml` — local CLI config.

Tables the app uses: `profiles`, `posts`, `votes`, `role_votes`, `businesses`, `business_roles`, `current_jobs`, `past_jobs`, `business_reports` (user reports about a listing; set `status` by hand in the dashboard).

Cities (`20261024000000_chicago_city.sql`): `businesses` / `business_roles` hold NYC only; `businesses_chicago` / `business_roles_chicago` are identical clones for Chicago (`source_id` = OSM id, filled by `scripts/osm/import-businesses.sh`). `posts`, `current_jobs`, `past_jobs`, `role_votes` and `business_reports` are shared and carry `city` (`nyc` | `chicago`). Because a foreign key cannot point at one of two tables, their old FKs to the NYC tables were dropped and replaced by `assert_city_business` / `assert_city_role` BEFORE triggers (raise `foreign_key_violation`) plus `cascade_business_delete` / `cascade_role_delete` AFTER DELETE triggers that emulate the old `set null` / `cascade`. The feed's business join is the PostgREST computed relationship `post_business(posts)` over the `businesses_all` union view (`select ..., post_business(id,name,lat,lng)`).

Posting limits are enforced by BEFORE INSERT triggers (`enforce_rate_limit`): posts 10 per 10 min and 60 per day per device, business_roles 20 per day (via `created_by`), business_reports 10 per day. They raise SQLSTATE `P0429` with a user-facing message. Vote totals on `posts` and `business_roles` are maintained by SECURITY DEFINER triggers, so clients never write totals.

RPCs called from the client: `get_businesses_in_viewport_slim(…, city)` (map dots; capped at 5,000 rows), `move_current_job_to_past` (atomic retire; carries `current_jobs.created_at` into `past_jobs.started_at` and keeps `city`; `past_jobs.deleted_at` hides rows), and `search_businesses(…, city)` (terms, phrase, hourly pay range, neighborhood polygon as GeoJSON, optional box; ranked with match reasons). Both city RPCs are plpgsql wrappers that pick the table pair with `city_business_table` / `city_role_table` and run the query through `execute format(...)`, so the search body exists once. Job dates are database-only: `created_at` is when a row was first added and is never edited by the client. Supporting columns: `businesses.name_norm` (generated, trigram-indexed) and `business_roles.hourly_rate` (generated from salary + pay_period via `role_hourly_rate`); the Chicago tables inherit both through `create table ... (like ... including all)`. The pre-baseline `get_businesses_in_viewport_*` and `search_businesses_global` functions were dropped in `20260909010000`.

Apply migrations with `supabase db push -p "$(security find-generic-password -a workaround -s supabase-db-url -w)"`.
