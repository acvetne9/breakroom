import { supabase } from '@/integrations/supabase/client';
import type { Business, BusinessRole } from '@/types/business';
import { sanitizeVoteTotal } from '@/utils/voteCalculations';
import { retryWithBackoff, isRetryableError } from '@/utils/retryWithBackoff';
import { mapBusinessRow, mapRoleRow } from '@/utils/businessMapper';

type MapBounds = { north: number; south: number; east: number; west: number };

/**
 * Fetches businesses within viewport bounds using grid-sampled distribution
 * FIXED: No longer creates circular pattern - evenly distributes across viewport
 */
export const getBusinessesInViewport = async (
  bounds: MapBounds,
  limit: number = 1000,
  searchFilters?: any,
  userId?: string,
  zoom: number = 12
): Promise<Business[]> => {
  try {
    // Get current user if not provided
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id;
    }

    console.log('🔍 Fetching businesses from Supabase:', {
      bounds,
      limit,
      hasFilters: !!searchFilters,
      zoom
    });

    // FIXED: Use grid-sampled function for even distribution
    // Wrap with retry logic for connection resilience
    const { data, error } = await retryWithBackoff(
      () => supabase.rpc(
        'get_businesses_in_viewport_grid_sampled',
        {
          min_lat: bounds.south,
          max_lat: bounds.north,
          min_lng: bounds.west,
          max_lng: bounds.east,
          result_limit: limit,
          user_profile_id: userId || null
        }
      ),
      { shouldRetry: isRetryableError }
    );

    if (error) {
      console.error('❌ Supabase RPC error:', error);
      throw error;
    }

    const rawData = data as Array<{
      id: string;
      name: string;
      business_type: string;
      address: string;
      lat: number;
      lng: number;
      atmosphere: string[];
      website: string;
      roles: any[];
    }> | null;

    if (!rawData || rawData.length === 0) {
      console.log('⚠️ No businesses returned from query');
      return [];
    }

    console.log(`✅ Raw data from Supabase: ${rawData.length} businesses`);

    // Transform to Business type
    const businesses: Business[] = rawData
      .filter((b) => b.lat && b.lng) // Filter out invalid coordinates
      .map((b) => mapBusinessRow(b, Array.isArray(b.roles) ? b.roles : []));

    return businesses;

  } catch (error) {
    console.error('❌ Error in getBusinessesInViewport:', error);
    return [];
  }
};

export async function getFullBusinessDetails(businessId: string): Promise<Business | null> {
  console.log('🔍 FETCHING FULL BUSINESS DETAILS FOR:', businessId);
  const startTime = performance.now();

  // Fetch business data, user profile, and roles in PARALLEL with retry logic
  const [businessResult, userProfileResult, rolesResult] = await retryWithBackoff(
    () => Promise.all([
      // Business data
      supabase
        .from('businesses')
        .select('*')
        .eq('id', businessId)
        .maybeSingle(),

      // User profile (for votes)
      (async () => {
        const { getUserProfile } = await import('./posts');
        return getUserProfile();
      })(),

      // Roles data
      supabase
        .from('business_roles')
        .select('*')
        .eq('business_id', businessId)
        .order('votes_total', { ascending: false })
        .order('created_at', { ascending: true })
    ]),
    { shouldRetry: isRetryableError }
  );

  const { data: businessData, error: businessError } = businessResult;
  if (businessError) throw businessError;
  if (!businessData) return null;

  const { profileId: currentUserId } = userProfileResult;
  const { data: rolesData, error: rolesError } = rolesResult;
  if (rolesError) throw rolesError;

  console.log(`✅ Fetched business + roles in ${performance.now() - startTime}ms (parallel)`);

  // Fetch user role votes ONLY for this business's roles
  let userVotesData: any[] = [];
  if (currentUserId && rolesData && rolesData.length > 0) {
    const votesStartTime = performance.now();
    const roleIds = rolesData.map(r => r.id);
    
    const { data: votesData, error: votesError } = await supabase
      .from('role_votes')
      .select('business_role_id, vote_type')
      .eq('user_id', currentUserId)
      .in('business_role_id', roleIds);

    console.log(`✅ Fetched votes for ${roleIds.length} roles in ${performance.now() - votesStartTime}ms`);

    if (votesError) {
      console.warn('Error fetching user votes:', votesError);
    } else {
      userVotesData = votesData || [];
    }
  }

  const businessRoles: BusinessRole[] = (rolesData || []).map((role: any) => {
    const vote = userVotesData.find(v => v.business_role_id === role.id)?.vote_type;
    const userVote = vote === 'upvote' ? 'up' : vote === 'downvote' ? 'down' : null;
    return mapRoleRow(role, userVote);
  });

  const fullBusiness: Business = mapBusinessRow(businessData, businessRoles);

  console.log(`✅ getFullBusinessDetails completed in ${performance.now() - startTime}ms`);
  console.log(`✅ Returning ${businessRoles.length} roles for business:`, businessData.name);
  return fullBusiness;
}

export async function geocodeAndCreateBusiness(name: string, address?: string): Promise<{ id: string; lat: number; lng: number }> {
  if (!address) {
    throw new Error('Address is required for creating a new business');
  }

  console.log(`🌍 Geocoding business: ${name} at ${address}`);

  const { data: geocodeResult, error: geocodeError } = await supabase.functions.invoke('geocode-address', {
    body: { address }
  });

  if (geocodeError || !geocodeResult) {
    console.error('❌ Geocoding failed:', geocodeError);
    throw new Error(`Failed to geocode address: ${address}`);
  }

  console.log(`✅ Geocoded coordinates: ${geocodeResult.latitude}, ${geocodeResult.longitude}`);

  const { data: newBusiness, error: createError } = await supabase
    .from('businesses')
    .insert({
      name,
      address: geocodeResult.display_name || address,
      lat: geocodeResult.latitude,
      lng: geocodeResult.longitude,
      atmosphere: [],
    })
    .select('id, lat, lng')
    .single();

  if (createError) {
    console.error('❌ Failed to create business:', createError);
    throw createError;
  }

  console.log(`✅ Created business with ID: ${newBusiness.id}`);
  return newBusiness;
}

export async function createOrUpdateBusinessRole(businessLocation: string, role: string, salary: string): Promise<void> {
  let businessId: string;
  
  const { data: existingBusiness, error: findError } = await supabase
    .from('businesses')
    .select('id')
    .ilike('name', businessLocation)
    .maybeSingle();

  if (findError) {
    throw findError;
  }

  if (existingBusiness) {
    businessId = existingBusiness.id;
  } else {
    throw new Error(`Business "${businessLocation}" not found. Use geocodeAndCreateBusiness() to create it with coordinates first.`);
  }

  const { data: existingRole, error: roleCheckError } = await supabase
    .from('business_roles')
    .select('id')
    .eq('business_id', businessId)
    .eq('role', role)
    .eq('salary', salary)
    .maybeSingle();

  if (roleCheckError) {
    throw roleCheckError;
  }

  if (!existingRole) {
    const { error: createRoleError } = await supabase
      .from('business_roles')
      .insert({
        business_id: businessId,
        role: role,
        salary: salary,
        votes_total: 0
      });

    if (createRoleError) throw createRoleError;
  }
}
