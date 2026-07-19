import { Business } from '@/types/business';
import { getFullBusinessDetails as getFullBusinessDetailsService } from '@/services/businesses';

type SetBusinesses = (updater: (prev: Business[]) => Business[]) => void;

interface FetchAndMergeOptions {
  /** Return a cached full business for this id, or null/undefined on a miss. */
  getCached?: (businessId: string) => Business | null | undefined;
  /** Store the freshly fetched full business in a cache. */
  setCached?: (business: Business) => void;
  /** Extra side-effects to run with the freshly fetched full business (e.g. coordinate cache). */
  onFull?: (business: Business) => void;
  /** Optional error logger to preserve each hook's exact logging. */
  onError?: (error: unknown) => void;
}

/**
 * Shared fetch-and-merge core for the near-duplicate `fetchFullBusinessDetails`
 * implementations. On a cache hit it merges the cached business into local state
 * and returns it; otherwise it fetches the full details, caches them, runs any
 * extra side-effects, merges into state, and returns the result. Returns null
 * when the business is not found or an error occurs.
 */
export async function fetchAndMergeBusinessDetails(
  businessId: string,
  setBusinesses: SetBusinesses,
  opts: FetchAndMergeOptions = {}
): Promise<Business | null> {
  try {
    const cached = opts.getCached?.(businessId);
    if (cached) {
      setBusinesses(prev => prev.map(b => (b.id === businessId ? cached : b)));
      return cached;
    }

    const fullBusiness = await getFullBusinessDetailsService(businessId);
    if (!fullBusiness) return null;

    opts.setCached?.(fullBusiness);
    opts.onFull?.(fullBusiness);

    setBusinesses(prev => prev.map(b => (b.id === businessId ? fullBusiness : b)));

    return fullBusiness;
  } catch (error) {
    opts.onError?.(error);
    return null;
  }
}
