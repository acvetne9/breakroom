import { supabase } from '@/integrations/supabase/client';
import type { Business, BusinessRole } from '@/types/business';

// Enhanced function using PostGIS spatial queries
export async function getBusinessesNearPoint(
  centerLat: number, 
  centerLng: number, 
  radiusMeters: number = 5000,
  limit: number = 2000
): Promise<Business[]> {
  console.log(`🌍 Fetching businesses near ${centerLat}, ${centerLng} within ${radiusMeters}m`);

  const { data: businessesData, error } = await supabase
    .rpc('get_businesses_near_point', {
      center_lat: centerLat,
      center_lng: centerLng,
      radius_meters: radiusMeters,
      limit_count: limit
    });

  if (error) {
    console.error('❌ Spatial query error:', error);
    throw error;
  }

  console.log(`📊 Spatial query returned: ${businessesData?.length || 0} records`);

  if (!businessesData) return [];

  const businesses: Business[] = businessesData.map((business: any) => ({
    id: business.id,
    name: business.name,
    address: business.address,
    position: { lat: business.lat, lng: business.lng },
    atmosphere: [],
    salary: '0',
    roles: [],
  }));

  console.log(`✅ Processed spatial businesses: ${businesses.length}`);
  return businesses;
}

export async function getBusinessesBasic(limit: number = 2000): Promise<Business[]> {
  console.log(`🔄 Fetching ${limit} businesses from center outward...`);
  
  // NYC center coordinates - use spatial query for better performance
  const centerLat = 40.7589; // Times Square area
  const centerLng = -73.9851;
  
  // Use the new spatial function for better performance
  return getBusinessesNearPoint(centerLat, centerLng, 10000, limit);
}

export const getBusinessesInViewport = async (
  bounds: { north: number; south: number; east: number; west: number },
  limit: number = 2000,
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
      const { searchBusinessesUnified, parseUnifiedSearchFilters } = await import('./unifiedSearch');
      
      let unifiedFilters;
      if (typeof searchFilters === 'string') {
        unifiedFilters = parseUnifiedSearchFilters(searchFilters);
      } else {
        unifiedFilters = searchFilters;
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

    // Regular viewport load without search - use enhanced progressive search
    const { progressiveSearch } = await import('./progressiveSearch');
    
    const onProgressWrapper = onProgress ? (businesses: Business[], isComplete: boolean) => {
      console.log(`📍 Progressive load progress: ${businesses.length} businesses loaded`);
      onProgress(businesses, isComplete);
    } : undefined;
    
    const businesses = await progressiveSearch.searchBusinesses(
      bounds,
      null, // No search filters
      onProgressWrapper || (() => {}),
      limit,
      zoom
    );

    console.log(`✅ Enhanced viewport load completed with ${businesses.length} businesses`);
    return businesses;

  } catch (error) {
    console.error('❌ Critical error in getBusinessesInViewport:', error);
    return [];
  }
};

export async function getFullBusinessDetails(businessId: string): Promise<Business | null> {
  // Fetch base business
  const { data: businessData, error: businessError } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .maybeSingle();

  if (businessError) throw businessError;
  if (!businessData) return null;

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id;

  // Fetch roles
  const { data: rolesData, error: rolesError } = await supabase
    .from('business_roles')
    .select('*')
    .eq('business_id', businessId);

  if (rolesError) throw rolesError;

  // Fetch user role votes
  let userVotesData: any[] = [];
  if (currentUserId) {
    const { data: votesData, error: votesError } = await supabase
      .from('role_votes')
      .select('business_role_id, vote_type')
      .eq('user_id', currentUserId);

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
      upvotes: role.upvotes || 0,
      downvotes: role.downvotes || 0,
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
    salary: businessData.salary,
    roles: businessRoles,
    website: businessData.website,
  };

  return fullBusiness;
}

// Add geocoding and business creation functionality
export async function geocodeAndCreateBusiness(name: string, address?: string): Promise<{ id: string; lat: number; lng: number }> {
  if (!address) {
    throw new Error('Address is required for creating a new business');
  }

  console.log(`🌍 Geocoding business: ${name} at ${address}`);

  // Call the geocode edge function
  const { data: geocodeResult, error: geocodeError } = await supabase.functions.invoke('geocode-address', {
    body: { address }
  });

  if (geocodeError || !geocodeResult) {
    console.error('❌ Geocoding failed:', geocodeError);
    throw new Error(`Failed to geocode address: ${address}`);
  }

  console.log(`✅ Geocoded coordinates: ${geocodeResult.latitude}, ${geocodeResult.longitude}`);

  // Create the business with geocoded coordinates
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
  // First, try to find an existing business by name (location)
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
    // Suggest using geocodeAndCreateBusiness instead
    throw new Error(`Business "${businessLocation}" not found. Use geocodeAndCreateBusiness() to create it with coordinates first.`);
  }

  // Check if this exact role already exists for this business
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
    // Create new role if it doesn't exist - NO AUTH REQUIRED
    const { error: createRoleError } = await supabase
      .from('business_roles')
      .insert({
        business_id: businessId,
        role: role,
        salary: salary,
        upvotes: 0,
        downvotes: 0
      });

    if (createRoleError) throw createRoleError;
  }
}