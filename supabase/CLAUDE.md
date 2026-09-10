# supabase/

Project ref `hyygpxhwkvyxtbjnnpqk`. Postgres 15 + PostGIS + pg_trgm.

- `migrations/` — one baseline migration plus anything newer; see its CLAUDE.md.
- `migrations_archive/` — the pre-baseline history, reference only.
- `functions/` — Deno edge functions (`geocode-address`).
- `config.toml` — local CLI config.

Tables the app uses: `profiles`, `posts`, `votes`, `role_votes`, `businesses`, `business_roles`, `current_jobs`, `past_jobs`. Vote totals on `posts` and `business_roles` are maintained by SECURITY DEFINER triggers, so clients never write totals.

RPCs called from the client: `get_businesses_in_viewport_slim` (map dots; capped at 5,000 rows), `move_current_job_to_past` (atomic retire; carries `current_jobs.created_at` into `past_jobs.started_at`; `past_jobs.deleted_at` hides rows). Job dates are database-only: `created_at` is when a row was first added and is never edited by the client., and `search_businesses` (terms, phrase, hourly pay range, neighborhood polygon as GeoJSON, optional box; ranked with match reasons). Supporting columns: `businesses.name_norm` (generated, trigram-indexed) and `business_roles.hourly_rate` (generated from salary + pay_period via `role_hourly_rate`). The older `get_businesses_in_viewport_*` and `search_businesses_global` functions still exist but are unused.

Apply migrations with `supabase db push -p "$(security find-generic-password -a workaround -s supabase-db-url -w)"`.
