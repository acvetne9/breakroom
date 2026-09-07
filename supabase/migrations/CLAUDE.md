# supabase/migrations/

Timestamped SQL applied in order by the Supabase CLI (`supabase db push`).

The history was re-baselined on 2026-09-07: `20260907120000_baseline.sql` is a
cleaned `pg_dump` of the live public schema (tables, functions, triggers,
indexes, and the device-id RLS policies) and the remote
`supabase_migrations.schema_migrations` table was repaired to list only that
version. Everything older lives in `../migrations_archive/` for reference and
is never applied.

Rules for new migrations:

- Name them `<YYYYMMDDHHMMSS>_<snake_case>.sql`; the CLI skips anything else (including this file, which is why `migration list` prints a "Skipping migration CLAUDE.md" line — harmless).
- Idempotent where practical (`if not exists`, `drop ... if exists`), one concern per file, comment the why.
- After applying, regenerate `src/integrations/supabase/types.ts` with `supabase gen types typescript --linked > src/integrations/supabase/types.ts`.
- Do not edit the baseline; add a new file on top of it.

The CLI is linked to project `hyygpxhwkvyxtbjnnpqk`; link state is in the gitignored `supabase/.temp/`. The database password is kept in the macOS keychain (`security find-generic-password -a workaround -s supabase-db-url -w`), never in the repo.
