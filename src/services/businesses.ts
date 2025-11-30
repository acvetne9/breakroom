import { supabase } from '@/integrations/supabase/client';
import type { Business, BusinessRole } from '@/types/business';
import type { NeighborhoodBounds } from '@/utils/nyc_neighborhoods';
import { searchBusinessesUnified, parseUnifiedSearchFilters } from './unifiedSearch';
import { expandTerm } from '@/utils/smartSearch';
import { sanitizeVoteTotal } from '@/utils/voteCalculations';

type MapBounds = { north: number; south: number; east: number; west: number };

// Enhanced function using PostGIS spatial queries with user votes preloaded
export async function getBusinessesNearPoint(
  centerLat: number, 
  centerLng: number, 
  radiusMeters: number = 5000,
  limit: number = 2000
): Promise<Business[]> {
  console.log(`🌍 Fetching businesses with user votes near ${centerLat}, ${centerLng}`);

  // Get current user ID for vote loading
  const { getUserProfile } = await import('./posts');
  const { profileId: userProfileId } = await getUserProfile();

  const { data: businessesData, error } = await supabase.rpc(
    'get_businesses_with_roles_and_votes_near_point',
    {
      center_lat: centerLat,
      center_lng: centerLng,
      radius_meters: radiusMeters,
      limit_count: limit,
      user_profile_id: userProfileId
    }
  );

  if (error) {
    console.error('❌ Spatial query error:', error);
    throw error;
  }

  console.log(`📊 Spatial query returned: ${businessesData?.length || 0} records`);

  if (!businessesData) return [];

  // Parse and return businesses with user votes already included
  const businesses: Business[] = businessesData.map((business: any) => {
    const roles: BusinessRole[] = business.roles 
      ? (typeof business.roles === 'string' 
          ? JSON.parse(business.roles) 
          : business.roles
        ).map((role: any) => ({
          id: role.id,
          role: role.role,
          salary: role.salary,
          payPeriod: role.pay_period,
          votesTotal: role.votes_total || 0,
          userVote: role.user_vote || null  // Already included from RPC!
        }))
      : [];

    return {
      id: business.id,
      name: business.name,
      address: business.address,
      position: { lat: business.lat, lng: business.lng },
      atmosphere: business.atmosphere || [],
      businessType: business.business_type,
      website: business.website,
      roles: roles,
    };
  });

  const totalRoles = businesses.reduce((sum, b) => sum + (b.roles?.length || 0), 0);
  console.log(`✅ Processed ${businesses.length} businesses with ${totalRoles} roles and user votes preloaded`);
  return businesses;
}

export async function getBusinessesBasic(limit: number = 5000): Promise<Business[]> {
  console.log(`🔄 Fetching ${limit} businesses from center outward...`);
  
  // NYC center coordinates - use spatial query for better performance
  const centerLat = 40.7589; // Times Square area
  const centerLng = -73.9851;
  
  // Expanded radius to 20km to cover all of NYC
  return getBusinessesNearPoint(centerLat, centerLng, 20000, limit);
}

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
    const { data, error } = await supabase.rpc(
      'get_businesses_in_viewport_no_ordering',
      {
        min_lat: bounds.south,
        max_lat: bounds.north,
        min_lng: bounds.west,
        max_lng: bounds.east,
        result_limit: limit,
        user_profile_id: userId || null
      }
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
      .map((b) => ({
        id: b.id,
        name: b.name,
        businessType: b.business_type,
        address: b.address,
        position: { lat: b.lat, lng: b.lng },
        atmosphere: b.atmosphere || [],
        website: b.website || undefined,
        roles: Array.isArray(b.roles) ? b.roles : []
      }));

    // Apply search filters if provided
    if (searchFilters?.keyword) {
      const keyword = searchFilters.keyword.toLowerCase();
      return businesses.filter(b => 
        b.name?.toLowerCase().includes(keyword) ||
        b.businessType?.toLowerCase().includes(keyword) ||
        b.address?.toLowerCase().includes(keyword)
      );
    }

    if (searchFilters?.role) {
      const roleFilter = searchFilters.role.toLowerCase();
      return businesses.filter(b =>
        b.roles?.some(r => r.role?.toLowerCase().includes(roleFilter))
      );
    }

    return businesses;

  } catch (error) {
    console.error('❌ Error in getBusinessesInViewport:', error);
    return [];
  }
};

export const searchBusinessesByName = async (
  query: string,
  limit: number = 5
): Promise<Business[]> => {
  if (query.length < 3) return [];

  try {
    const { data, error } = await supabase
      .from('businesses')
      .select('id, name, business_type, address, lat, lng')
      .ilike('name', `%${query}%`)
      .limit(limit);

    if (error) throw error;

    return (data || []).map(b => ({
      id: b.id,
      name: b.name,
      businessType: b.business_type,
      address: b.address,
      position: b.lat && b.lng ? { lat: b.lat, lng: b.lng } : undefined,
      atmosphere: [],
      roles: []
    }));
  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
};

export async function getFullBusinessDetails(businessId: string): Promise<Business | null> {
  console.log('🔍 FETCHING FULL BUSINESS DETAILS FOR:', businessId);
  const startTime = performance.now();
  
  // Fetch business data, user profile, and roles in PARALLEL
  const [businessResult, userProfileResult, rolesResult] = await Promise.all([
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
  ]);

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
    const userVote = userVotesData.find(vote => vote.business_role_id === role.id)?.vote_type;
    return {
      id: role.id,
      role: role.role,
      salary: role.salary,
      votesTotal: sanitizeVoteTotal(role.votes_total),
      userVote: userVote === 'upvote' ? 'up' : userVote === 'downvote' ? 'down' : null,
    };
  });

  const fullBusiness: Business = {
    id: businessData.id,
    name: businessData.name,
    address: (businessData as any).address,
    businessType: businessData.business_type,
    position: { lat: businessData.lat, lng: businessData.lng },
    atmosphere: businessData.atmosphere || [],
    roles: businessRoles,
    website: businessData.website,
  };

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
