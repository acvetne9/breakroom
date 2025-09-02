import { supabase } from '@/integrations/supabase/client';
import type { Business, BusinessRole } from '@/types/business';
import { parseSearchFilters, applyBusinessFilters } from './businessFiltering';

export async function getBusinessesBasic(limit: number = 2000): Promise<Business[]> {
  console.log(`🔄 Fetching ${limit} businesses from center outward...`);
  
  // NYC center coordinates (approximately Manhattan center)
  const centerLat = 40.7589; // Times Square area
  const centerLng = -73.9851;
  
  const { data: businessesData, error } = await supabase
    .from('businesses')
    .select('id, name, lat, lng')
    .order('lat')
    .limit(limit); // Limit for performance - can increase gradually

  if (error) {
    console.error('❌ Supabase error:', error);
    throw error;
  }

  console.log(`📊 Raw data from Supabase: ${businessesData?.length || 0} records`);

  if (!businessesData) return [];

  // Calculate distance from center and sort by distance
  const businessesWithDistance = businessesData.map((business: any) => {
    const distance = Math.sqrt(
      Math.pow(business.lat - centerLat, 2) + 
      Math.pow(business.lng - centerLng, 2)
    );
    return { ...business, distance };
  });

  // Sort by distance from center (closest first)
  businessesWithDistance.sort((a, b) => a.distance - b.distance);

  const basicBusinesses: Business[] = businessesWithDistance.map((business: any) => ({
    id: business.id,
    name: business.name,
    position: { lat: business.lat, lng: business.lng },
    atmosphere: [],
    salary: '0',
    roles: [],
  }));

  console.log(`✅ Processed businesses from center out: ${basicBusinesses.length}`);
  return basicBusinesses;
}

export const getBusinessesInViewport = async (
  bounds: { north: number; south: number; east: number; west: number },
  limit: number = 2000,
  searchFilters?: any
): Promise<Business[]> => {
  try {
    console.log(`🎯 Starting optimized spatial query for bounds:`, bounds);

    // Parse filters once
    const parsedFilters = searchFilters
      ? (typeof searchFilters === 'string' ? parseSearchFilters(searchFilters) : searchFilters)
      : null;

    console.log('🎯 getBusinessesInViewport - searchFilters:', searchFilters);
    console.log('🎯 getBusinessesInViewport - parsedFilters:', parsedFilters);

    const needsRoleData = !!(parsedFilters?.roleFilter || parsedFilters?.salaryQuery);

    // If we need role/salary-aware filtering, fetch roles within the bbox directly
    if (needsRoleData) {
      const { data, error } = await supabase
        .from('businesses')
        .select(`
          id,
          name,
          lat,
          lng,
          atmosphere,
          salary,
          business_type,
          website,
          business_roles (
            id,
            role,
            salary,
            upvotes,
            downvotes
          )
        `)
        .gte('lat', bounds.south)
        .lte('lat', bounds.north)
        .gte('lng', bounds.west)
        .lte('lng', bounds.east)
        .limit(Math.min(limit, 5000));

      if (error) {
        console.error('❌ Error fetching businesses with roles for filtering:', error);
        throw error;
      }

      const businesses: Business[] = (data || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        position: { lat: b.lat, lng: b.lng },
        atmosphere: b.atmosphere || [],
        salary: b.salary,
        businessType: b.business_type,
        website: b.website,
        roles: Array.isArray(b.business_roles)
          ? b.business_roles.map((r: any) => ({
              role: r.role,
              salary: r.salary,
              upvotes: r.upvotes || 0,
              downvotes: r.downvotes || 0,
              userVote: null,
            }))
          : [],
      }));

      const filtered = parsedFilters ? applyBusinessFilters(businesses, parsedFilters) : businesses;
      console.log(`🔍 Role/salary filter active: ${businesses.length} -> ${filtered.length} businesses`);
      return filtered;
    }
    
    // Try the new spatial function first (PostGIS optimized)
    const { data: spatialData, error: spatialError } = await supabase
      .rpc('businesses_in_bbox', {
        west: bounds.west,
        south: bounds.south,
        east: bounds.east,
        north: bounds.north,
        query_limit: limit
      });

    if (!spatialError && spatialData) {
      console.log(`🚀 Spatial query successful: ${spatialData.length} businesses found`);
      
      const businesses: Business[] = spatialData.map((business) => ({
        id: business.id,
        name: business.name,
        position: { lat: business.lat, lng: business.lng },
        atmosphere: business.atmosphere || [],
        salary: business.salary,
        businessType: business.business_type,
        website: business.website,
        roles: [],
      }));
      
      // Apply search filters if provided
      if (parsedFilters) {
        console.log('🔍 About to apply filters to spatial query results:', businesses.length, 'businesses');
        const filteredBusinesses = applyBusinessFilters(businesses, parsedFilters);
        console.log(`🔍 Applied filters: ${businesses.length} -> ${filteredBusinesses.length} businesses`);
        return filteredBusinesses;
      }
      
      console.log('🔍 No filters to apply to spatial query, returning all businesses:', businesses.length);
      return businesses;
    }

    // Fallback to the old method if spatial query fails
    console.log(`⚠️ Spatial query failed, falling back to coordinate filtering:`, spatialError);
    
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .gte('lat', bounds.south)
      .lte('lat', bounds.north)
      .gte('lng', bounds.west)
      .lte('lng', bounds.east)
      .limit(limit);

    if (error) {
      console.error('❌ Error fetching businesses in viewport:', error);
      throw error;
    }

    const businesses: Business[] = (data || []).map((business) => ({
      id: business.id,
      name: business.name,
      position: { lat: business.lat, lng: business.lng },
      atmosphere: business.atmosphere || [],
      salary: business.salary,
      businessType: business.business_type,
      website: business.website,
      roles: [],
    }));

    console.log(`✅ Fallback query returned ${businesses.length} businesses`);
    
    // Apply search filters if provided  
    if (searchFilters) {
      const parsedFilters = typeof searchFilters === 'string' 
        ? parseSearchFilters(searchFilters)
        : searchFilters;
        
      console.log('🔍 About to apply filters to fallback query results:', businesses.length, 'businesses');
      console.log('🔍 Fallback parsedFilters:', parsedFilters);
        
      if (parsedFilters) {
        const filteredBusinesses = applyBusinessFilters(businesses, parsedFilters);
        console.log(`🔍 Applied filters: ${businesses.length} -> ${filteredBusinesses.length} businesses`);
        return filteredBusinesses;
      }
    }
    
    return businesses;
  } catch (error) {
    console.error('❌ Error in getBusinessesInViewport:', error);
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
    businessType: businessData.business_type,
    position: { lat: businessData.lat, lng: businessData.lng },
    atmosphere: businessData.atmosphere || [],
    salary: businessData.salary,
    roles: businessRoles,
    website: businessData.website,
  };

  return fullBusiness;
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
    // Don't create businesses without proper coordinates
    throw new Error(`Business "${businessLocation}" not found. Businesses must be created with proper coordinates first.`);

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
