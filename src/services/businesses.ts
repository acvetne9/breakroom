import { supabase } from "@/integrations/supabase/client";
import type { Business, BusinessRole } from "@/types/business";
import { retryWithBackoff, isRetryableError } from "@/utils/retryWithBackoff";
import { mapBusinessRow, mapRoleRow } from "@/utils/businessMapper";
import { getDeviceId } from "@/utils/deviceId";
import { cityTables, getCurrentCityId, type CityId } from "@/utils/cities";

type MapBounds = { north: number; south: number; east: number; west: number };

/**
 * Businesses inside a bounding box, as map dots: id, name, coordinates, type.
 * Roles and the rest are loaded on click via getFullBusinessDetails. The RPC
 * caps a response at 5,000 rows; a single zoom-14 tile never reaches that, so
 * per-tile fetches are complete while whole-viewport fetches are a sample.
 */
export const getBusinessesInViewport = async (
  bounds: MapBounds,
  limit: number = 2000,
  city: CityId = getCurrentCityId(),
): Promise<Business[]> => {
  try {
    const { data, error } = await retryWithBackoff(
      () =>
        supabase.rpc("get_businesses_in_viewport_slim", {
          min_lat: bounds.south,
          max_lat: bounds.north,
          min_lng: bounds.west,
          max_lng: bounds.east,
          result_limit: limit,
          city,
        }),
      { shouldRetry: isRetryableError },
    );

    if (error) throw error;
    if (!data || data.length === 0) return [];

    return data.filter((b) => b.lat && b.lng).map((b) => mapBusinessRow(b));
  } catch (error) {
    console.error("Error in getBusinessesInViewport:", error);
    return [];
  }
};

/** Business row, its roles, and the current device's votes on those roles. */
export async function getFullBusinessDetails(businessId: string, city: CityId = getCurrentCityId()): Promise<Business | null> {
  const tables = cityTables(city);
  const [businessResult, rolesResult] = await retryWithBackoff(
    () =>
      Promise.all([
        supabase.from(tables.businesses).select("*").eq("id", businessId).maybeSingle(),
        supabase
          .from(tables.roles)
          .select("*")
          .eq("business_id", businessId)
          .order("votes_total", { ascending: false })
          .order("created_at", { ascending: true }),
      ]),
    { shouldRetry: isRetryableError },
  );

  if (businessResult.error) throw businessResult.error;
  if (!businessResult.data) return null;
  if (rolesResult.error) throw rolesResult.error;

  const rolesData = rolesResult.data ?? [];
  const userVotes = new Map<string, string>();
  if (rolesData.length > 0) {
    const { data: votesData, error: votesError } = await supabase
      .from("role_votes")
      .select("business_role_id, vote_type")
      .eq("user_id", getDeviceId())
      .eq("city", city)
      .in(
        "business_role_id",
        rolesData.map((r) => r.id),
      );
    if (votesError) console.warn("Error fetching user role votes:", votesError);
    for (const v of votesData ?? []) userVotes.set(v.business_role_id, v.vote_type);
  }

  const roles: BusinessRole[] = rolesData.map((role) => {
    const vote = userVotes.get(role.id);
    return mapRoleRow(role, vote === "upvote" ? "up" : vote === "downvote" ? "down" : null);
  });

  return { ...mapBusinessRow(businessResult.data, roles), detailsLoaded: true };
}

// ---------------------------------------------------------------------------
// Details cache. One app-wide store so the map, the shell, and the details
// card all agree on a business's roles and votes. Ids are UUIDs, so entries
// from different cities never collide; the cache is still cleared on a city
// switch to keep memory honest.
// ---------------------------------------------------------------------------

const MAX_CACHED_DETAILS = 500;
const detailsCache = new Map<string, Business>();
const inflightDetails = new Map<string, Promise<Business | null>>();

export function getCachedBusiness(businessId: string): Business | undefined {
  return detailsCache.get(businessId);
}

export function setCachedBusiness(business: Business): void {
  if (detailsCache.size >= MAX_CACHED_DETAILS) {
    const oldest = detailsCache.keys().next().value;
    if (oldest) detailsCache.delete(oldest);
  }
  detailsCache.set(business.id, business);
}

export function clearDetailsCache(): void {
  detailsCache.clear();
  inflightDetails.clear();
}

/** Cached, de-duplicated fetch of full business details. Returns null on error or miss. */
export async function getFullBusinessDetailsCached(businessId: string, city: CityId = getCurrentCityId()): Promise<Business | null> {
  const cached = detailsCache.get(businessId);
  if (cached) return cached;

  const inflight = inflightDetails.get(businessId);
  if (inflight) return inflight;

  const request = getFullBusinessDetails(businessId, city)
    .then((business) => {
      if (business) setCachedBusiness(business);
      return business;
    })
    .catch((error) => {
      console.error("Error fetching business details:", error);
      return null;
    })
    .finally(() => inflightDetails.delete(businessId));

  inflightDetails.set(businessId, request);
  return request;
}

/** Insert a role/salary pair for a business in the current city unless it is already listed. */
async function insertRoleIfMissing(businessId: string, role: string, salary: string, payPeriod: string): Promise<void> {
  const tables = cityTables();
  const { data: existingRole, error: roleCheckError } = await supabase
    .from(tables.roles)
    .select("id")
    .eq("business_id", businessId)
    .eq("role", role)
    .eq("salary", salary)
    .maybeSingle();
  if (roleCheckError) throw roleCheckError;
  if (existingRole) return;

  const { error } = await supabase
    .from(tables.roles)
    .insert({ business_id: businessId, role, salary, pay_period: payPeriod, votes_total: 0, created_by: getDeviceId() });
  if (error) throw error;
  detailsCache.delete(businessId);
}

/** Add a role/salary pair to a business by id if it isn't already listed. */
export async function addBusinessRole(businessId: string, role: string, salary: string, payPeriod: string = "HR"): Promise<void> {
  await insertRoleIfMissing(businessId, role, salary, payPeriod);
}

/** Add a role/salary pair to an existing business (looked up by name) if it isn't already listed. */
export async function createOrUpdateBusinessRole(
  businessLocation: string,
  role: string,
  salary: string,
  payPeriod: string = "HR",
): Promise<void> {
  const { data: existingBusiness, error: findError } = await supabase
    .from(cityTables().businesses)
    .select("id")
    .ilike("name", businessLocation)
    .maybeSingle();

  if (findError) throw findError;
  if (!existingBusiness) throw new Error(`Business "${businessLocation}" not found`);

  await insertRoleIfMissing(existingBusiness.id, role, salary, payPeriod);
}
