# supabase/

Project ref `hyygpxhwkvyxtbjnnpqk`. Postgres 15 + PostGIS + pg_trgm.

- `migrations/` — one baseline migration plus anything newer; see its CLAUDE.md.
- `migrations_archive/` — the pre-baseline history, reference only.
- `functions/` — Deno edge functions (`geocode-address`).
- `config.toml` — local CLI config.

Tables the app uses: `profiles`, `posts`, `votes`, `role_votes`, `businesses`, `business_roles`, `current_jobs`, `past_jobs`. Vote totals on `posts` and `business_roles` are maintained by SECURITY DEFINER triggers, so clients never write totals.

RPCs called from the client: `get_businesses_in_viewport_slim` (map dots: id, name, lat, lng, type; capped at 5,000 rows), `search_businesses_global`. The older `get_businesses_in_viewport_*` functions still exist but are unused.

Apply migrations with `supabase db push -p "$(security find-generic-password -a workaround -s supabase-db-url -w)"`.
