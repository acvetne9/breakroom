/**
 * Anonymous device identity.
 *
 * Every visitor gets a stable UUID stored in localStorage. It doubles as the
 * `profiles.id` primary key and is sent on every Supabase request as the
 * `x-device-id` header, which the row-level-security policies compare against.
 *
 * This module has no React dependency so the Supabase client can read the id
 * at request time, before any provider has mounted.
 */

const STORAGE_KEY = "device_id";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let cachedId: string | null = null;
let createdThisSession = false;

function generateUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for very old WebViews.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readStored(): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && UUID_RE.test(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Returns the device id, creating and persisting one on first use. */
export function getDeviceId(): string {
  if (cachedId) return cachedId;

  const stored = readStored();
  if (stored) {
    cachedId = stored;
    return stored;
  }

  const fresh = generateUuid();
  try {
    localStorage.setItem(STORAGE_KEY, fresh);
  } catch {
    // Private mode or storage disabled: the id lives for this page load only.
  }
  cachedId = fresh;
  createdThisSession = true;
  return fresh;
}

/** True when the id was generated during this page load (first ever visit). */
export function isNewDevice(): boolean {
  getDeviceId();
  return createdThisSession;
}
