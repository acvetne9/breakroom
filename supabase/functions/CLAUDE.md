# supabase/functions/

Deno edge functions, deployed with `supabase functions deploy <name>`.

- Translation used to be an edge function here; it now runs on-device in the browser (`src/hooks/useTranslation.ts`), so there is no translate function to deploy. If a `translate` function still exists in the dashboard, delete it.
- `geocode-address/` — forward geocoding through Nominatim for manual address entry.

It sets permissive CORS and accepts `x-device-id`. Keep functions stateless.
