import { supabase } from '@/integrations/supabase/client';
import type { Business, BusinessRole } from '@/types/business';
import { parseSearchFilters, applyBusinessFilters } from './businessFiltering';
import { progressiveSearch } from './progressiveSearch';

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
  searchFilters?: any,
  onProgress?: (businesses: Business[], isComplete: boolean) => void
): Promise<Business[]> => {
  try {
    console.log(`🗺️ [getBusinessesInViewport] Starting search with bounds:`, bounds);
    console.log(`🗺️ [getBusinessesInViewport] Received searchFilters:`, searchFilters);

    // Parse filters once
    let parsedFilters = null;
    if (searchFilters) {
      if (typeof searchFilters === 'string') {
        parsedFilters = parseSearchFilters(searchFilters);
      } else if (searchFilters.textTerms || searchFilters.salaryQuery || searchFilters.roleFilter || searchFilters.businessTypeFilter) {
        parsedFilters = { ...searchFilters };
        if (Array.isArray(parsedFilters.textTerms) && parsedFilters.textTerms.length > 0) {
          const derived = parseSearchFilters(parsedFilters.textTerms.join(' '));
          if (derived) {
            parsedFilters.roleFilter = parsedFilters.roleFilter ?? derived.roleFilter;
            parsedFilters.businessTypeFilter = parsedFilters.businessTypeFilter ?? derived.businessTypeFilter;
            parsedFilters.salaryQuery = parsedFilters.salaryQuery ?? derived.salaryQuery;
          }
        }
      }
    }

    console.log('🗺️ [getBusinessesInViewport] Parsed filters:', parsedFilters);
    
    // Check if we need role data for filtering
    const needsRoleData = parsedFilters && (
      parsedFilters.roleFilter || 
      parsedFilters.salaryQuery || 
      (parsedFilters.textTerms && parsedFilters.textTerms.some((term: string) => 
        ['barista','manager','cashier','server','cook','chef','waiter','waitress','host','hostess',
         'bartender','barback','line cook','dishwasher','assistant','supervisor','lead','team'].includes(term.toLowerCase())
      ))
    );
    
    console.log('🗺️ [getBusinessesInViewport] Needs role data for filtering:', needsRoleData);

    if (needsRoleData) {
      // Try optimized role-based search with timeout handling
      console.log('🗺️ [getBusinessesInViewport] Loading businesses WITH roles for filtering (timeout-resistant)');
      
      try {
        // Use smaller limit to avoid timeouts and add abortable query
        const roleLimit = Math.min(limit, 3000); // Reduced limit for complex queries
        
        const { data: businessesWithRoles, error: businessError } = await supabase
          .from('businesses')
          .select(`
            id, name, lat, lng, atmosphere, business_type, website, salary,
            business_roles!inner (
              id, role, salary, upvotes, downvotes
            )
          `)
          .gte('lat', bounds.south)
          .lte('lat', bounds.north)
          .gte('lng', bounds.west)
          .lte('lng', bounds.east)
          .limit(roleLimit);

        if (businessError) {
          console.warn('⚠️ JOIN query failed, trying fallback approach:', businessError);
          throw businessError; // Will trigger fallback
        }

        console.log(`🗺️ [getBusinessesInViewport] Loaded ${businessesWithRoles?.length || 0} businesses with roles`);

        const businesses: Business[] = (businessesWithRoles || []).map((business) => ({
          id: business.id,
          name: business.name,
          position: { lat: business.lat, lng: business.lng },
          atmosphere: business.atmosphere || [],
          salary: business.salary,
          businessType: business.business_type,
          website: business.website,
          roles: (business.business_roles || []).map((role: any) => ({
            role: role.role,
            salary: role.salary,
            upvotes: role.upvotes || 0,
            downvotes: role.downvotes || 0,
            userVote: null
          })),
        }));

        console.log('🔍 [getBusinessesInViewment] Applying filters to businesses WITH roles:', businesses.length);
        const filteredBusinesses = applyBusinessFilters(businesses, parsedFilters);
        console.log(`🔍 [getBusinessesInViewport] ROLE FILTERING RESULT: ${businesses.length} -> ${filteredBusinesses.length} businesses`);
        
        // Call progress callback if provided
        if (onProgress) {
          onProgress(filteredBusinesses, true);
        }
        
        return filteredBusinesses;
        
      } catch (joinError) {
        // Fallback: Separate queries to avoid timeout
        console.log('🚨 [getBusinessesInViewport] JOIN timed out, using separate queries fallback');
        
        // Step 1: Get businesses without roles first
        const { data: basicBusinesses, error: basicError } = await supabase
          .from('businesses')
          .select('id, name, lat, lng, atmosphere, business_type, website, salary')
          .gte('lat', bounds.south)
          .lte('lat', bounds.north)
          .gte('lng', bounds.west)
          .lte('lng', bounds.east)
          .limit(Math.min(limit, 5000));

        if (basicError) {
          console.error('❌ Even basic business query failed:', basicError);
          return [];
        }

        console.log(`🔄 [getBusinessesInViewport] Fallback: loaded ${basicBusinesses?.length || 0} basic businesses`);

        // Step 2: Get roles for these businesses
        const businessIds = (basicBusinesses || []).map(b => b.id);
        let allRoles: any[] = [];
        
        if (businessIds.length > 0) {
          const { data: rolesData, error: rolesError } = await supabase
            .from('business_roles')
            .select('business_id, id, role, salary, upvotes, downvotes')
            .in('business_id', businessIds);
            
          if (!rolesError && rolesData) {
            allRoles = rolesData;
            console.log(`🔄 [getBusinessesInViewport] Fallback: loaded ${allRoles.length} roles`);
          } else {
            console.warn('⚠️ Could not load roles in fallback:', rolesError);
          }
        }

        // Step 3: Combine data
        const businesses: Business[] = (basicBusinesses || []).map((business) => {
          const businessRoles = allRoles
            .filter(role => role.business_id === business.id)
            .map(role => ({
              role: role.role,
              salary: role.salary,
              upvotes: role.upvotes || 0,
              downvotes: role.downvotes || 0,
              userVote: null
            }));

          return {
            id: business.id,
            name: business.name,
            position: { lat: business.lat, lng: business.lng },
            atmosphere: business.atmosphere || [],
            salary: business.salary,
            businessType: business.business_type,
            website: business.website,
            roles: businessRoles,
          };
        });

        console.log('🔍 [getBusinessesInViewport] Fallback: Applying filters to combined data:', businesses.length);
        const filteredBusinesses = applyBusinessFilters(businesses, parsedFilters);
        console.log(`🔍 [getBusinessesInViewport] Fallback ROLE FILTERING RESULT: ${businesses.length} -> ${filteredBusinesses.length} businesses`);
        
        // Call progress callback if provided
        if (onProgress) {
          onProgress(filteredBusinesses, true);
        }
        
        return filteredBusinesses;
      }
    }
    
    // Use spatial query for basic viewport loading (no role filtering needed)
    console.log('🗺️ [getBusinessesInViewport] Using spatial query (no role filtering needed)');
    const { data: spatialData, error: spatialError } = await supabase
      .rpc('businesses_in_bbox', {
        west: bounds.west,
        south: bounds.south,
        east: bounds.east,
        north: bounds.north,
        query_limit: limit
      });

    if (!spatialError && spatialData) {
      console.log(`🚀 [getBusinessesInViewport] Spatial query successful: ${spatialData.length} businesses found in viewport`);
      
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
      
      // Apply search filters if provided (should only be non-role filters at this point)
      if (parsedFilters) {
        console.log('🔍 [getBusinessesInViewport] Applying NON-ROLE filters to viewport results:', businesses.length, 'businesses');
        const filteredBusinesses = applyBusinessFilters(businesses, parsedFilters);
        console.log(`🔍 [getBusinessesInViewport] Applied NON-ROLE filters: ${businesses.length} -> ${filteredBusinesses.length} businesses`);
        
        // Call progress callback if provided
        if (onProgress) {
          onProgress(filteredBusinesses, true);
        }
        
        return filteredBusinesses;
      }
      
      console.log('🔍 [getBusinessesInViewport] No filters to apply, returning all viewport businesses:', businesses.length);
      
      // Call progress callback if provided
      if (onProgress) {
        onProgress(businesses, true);
      }
      
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
    if (parsedFilters) {
      console.log('🔍 Applying filters to fallback results:', businesses.length, 'businesses');
      const filteredBusinesses = applyBusinessFilters(businesses, parsedFilters);
      console.log(`🔍 Applied filters: ${businesses.length} -> ${filteredBusinesses.length} businesses`);
      
      // Call progress callback if provided
      if (onProgress) {
        onProgress(filteredBusinesses, true);
      }
      
      return filteredBusinesses;
    }
    
    // Call progress callback if provided
    if (onProgress) {
      onProgress(businesses, true);
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
