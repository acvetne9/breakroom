# src/integrations/supabase/

- `client.ts` — the single Supabase client. Wraps `fetch` to add `x-device-id` on every request (REST, Realtime auth, Edge Functions). Reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` with the project defaults as fallback.
- `types.ts` — generated with `supabase gen types typescript`. Regenerate after any schema change; it is the most accurate description of the live database in this repo.
