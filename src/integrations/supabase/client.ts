import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { getDeviceId } from "@/utils/deviceId";

// The anon/publishable key is safe to ship to browsers; row-level security is
// what protects data. Values come from .env (see .env.example) with the project
// defaults as a fallback so a fresh clone runs without setup.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://hyygpxhwkvyxtbjnnpqk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5eWdweGh3a3Z5eHRiam5ucHFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1NDM2ODMsImV4cCI6MjA2OTExOTY4M30.if9FMeGAPS4ke3H8orSwli-3dkHx7dE2QifGDCNTPzU";

/**
 * Inject the device id on every request at call time. Supabase copies the
 * `global.headers` object when the client is constructed, so a header set there
 * cannot change later; wrapping fetch is the supported way to add a dynamic one.
 * This wrapper also covers Edge Function calls made through `supabase.functions`.
 */
const fetchWithDeviceId: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set("x-device-id", getDeviceId());
  return fetch(input, { ...init, headers });
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    fetch: fetchWithDeviceId,
  },
});
