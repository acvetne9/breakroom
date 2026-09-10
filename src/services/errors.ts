/** Turn a Supabase/Postgres error into something a user can read. */

interface DbErrorLike {
  code?: string;
  message?: string;
}

/** SQLSTATE raised by the database rate-limit triggers. */
export const RATE_LIMIT_CODE = "P0429";

export const isRateLimited = (error: unknown): boolean =>
  !!error && typeof error === "object" && (error as DbErrorLike).code === RATE_LIMIT_CODE;

export function describeDbError(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const { code, message } = error as DbErrorLike;
  // Rate-limit messages are written for users; everything else is not.
  if (code === RATE_LIMIT_CODE && message) return message;
  return fallback;
}
