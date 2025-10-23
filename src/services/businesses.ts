import { supabase } from '@/integrations/supabase/client';
import type { Business, BusinessRole } from '@/types/business';
import type { NeighborhoodBounds } from '@/utils/nyc_neighborhoods';
import { searchBusinessesUnified, parseUnifiedSearchFilters } from './unifiedSearch';
import { expandTerm } from '@/utils/smartSearch';

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

export const getBusinessesInViewport = async (
  bounds: { north: number; south: number; east: number; west: number },
  limit: number = 5000,
  searchFilters?: any,
  onProgress?: (businesses: Business[], isComplete: boolean) => void,
  zoom: number = 12
): Promise<Business[]> => {
  console.log(`🗺️ [getBusinessesInViewport] Called with bounds:`, bounds);
  console.log(`🗺️ [getBusinessesInViewport] Search filters:`, searchFilters);

  try {
    // Use unified search if filters provided
    if (searchFilters) {
      console.log(`🔍 [getBusinessesInViewport] Using unified search with filters`);
      
      let unifiedFilters: any;
      
      // If filters are already parsed as an object, expand the terms
      if (typeof searchFilters === 'object' && searchFilters !== null) {
        // Expand textTerms if they exist
        if (searchFilters.textTerms && Array.isArray(searchFilters.textTerms)) {
          const expandedTerms = await Promise.all(
            searchFilters.textTerms.map((term: string) => expandTerm(term))
          );
          // Flatten and deduplicate
          const allExpandedTerms = [...new Set(expandedTerms.flat())];
          unifiedFilters = {
            ...searchFilters,
            textTerms: allExpandedTerms
          };
          console.log(`🔍 [getBusinessesInViewport] Expanded ${searchFilters.textTerms.length} terms to ${allExpandedTerms.length} terms`);
        } else {
          unifiedFilters = searchFilters;
        }
      } else if (typeof searchFilters === 'string') {
        // Parse string filters with semantic expansion
        unifiedFilters = await parseUnifiedSearchFilters(searchFilters);
      }
      
      if (!unifiedFilters) {
        console.log('🔍 No valid filters parsed');
        return [];
      }
      
      const results = await searchBusinessesUnified(unifiedFilters, bounds, limit);
      console.log(`🔍 [getBusinessesInViewport] Unified search returned ${results.length} businesses`);
      
      if (onProgress) {
        onProgress(results, true);
      }
      
      return results;
    }

    // Regular viewport load without search - simple database query
    const { data: businesses, error } = await supabase
      .from('businesses')
      .select('id, name, lat, lng, business_type, atmosphere')
      .gte('lat', bounds.south)
      .lte('lat', bounds.north)
      .gte('lng', bounds.west)
      .lte('lng', bounds.east)
      .limit(limit);
    
    if (error) {
      console.error('Error loading businesses:', error);
      return [];
    }

    // Transform to Business type with position object
    const transformedBusinesses: Business[] = (businesses || []).map(b => ({
      ...b,
      position: { lat: b.lat, lng: b.lng },
      businessType: b.business_type
    }));

    console.log(`✅ Viewport load completed with ${transformedBusinesses.length} businesses`);
    return transformedBusinesses;

  } catch (error) {
    console.error('❌ Critical error in getBusinessesInViewport:', error);
    return [];
  }
};

export async function getFullBusinessDetails(businessId: string): Promise<Business | null> {
  console.log('🔍 Fetching full business details for:', businessId);
  const startTime = performance.now();
  
  // Fetch base business
  const { data: businessData, error: businessError } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .maybeSingle();

  if (businessError) throw businessError;
  if (!businessData) return null;

  console.log(`✅ Fetched business data in ${performance.now() - startTime}ms`);

  // Get current user profile ID
  const { getUserProfile } = await import('./posts');
  const { profileId: currentUserId } = await getUserProfile();

  console.log(`✅ Got user profile in ${performance.now() - startTime}ms`);

  // Fetch roles with consistent ordering
  const rolesStartTime = performance.now();
  const { data: rolesData, error: rolesError } = await supabase
    .from('business_roles')
    .select('*')
    .eq('business_id', businessId)
    .order('votes_total', { ascending: false })
    .order('created_at', { ascending: true });

  if (rolesError) throw rolesError;
  console.log(`✅ Fetched ${rolesData?.length || 0} roles in ${performance.now() - rolesStartTime}ms`);

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
      votesTotal: Number(role.votes_total) || 0,
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
