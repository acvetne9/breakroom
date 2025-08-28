import { supabase } from '@/integrations/supabase/client';
import type { Business, BusinessRole } from '@/types/business';

export async function getBusinessesBasic(): Promise<Business[]> {
  console.log('🔄 Fetching businesses from center outward...');
  
  // NYC center coordinates (approximately Manhattan center)
  const centerLat = 40.7589; // Times Square area
  const centerLng = -73.9851;
  
  const { data: businessesData, error } = await supabase
    .from('businesses')
    .select('id, name, lat, lng')
    .order('lat'); // Load all businesses for yellow dots

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
    place_id: businessData.place_id,
    website: businessData.website,
    url: businessData.url,
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
    // Create new business if it doesn't exist - NO AUTH REQUIRED
    // For now, we'll create a placeholder business with default coordinates
    const { data: newBusiness, error: createBusinessError } = await supabase
      .from('businesses')
      .insert({
        name: businessLocation,
        business_type: 'Unknown',
        lat: 40.7128, // Default NYC coordinates
        lng: -74.0060,
        atmosphere: [],
        salary: salary
      })
      .select('id')
      .single();

    if (createBusinessError) {
      // If it's a duplicate key error, try to get the existing business again
      if (createBusinessError.code === '23505') { // unique_violation
        const { data: retryBusiness } = await supabase
          .from('businesses')
          .select('id')
          .eq('name', businessLocation)
          .maybeSingle();
        
        if (retryBusiness) {
          businessId = retryBusiness.id;
        } else {
          throw createBusinessError;
        }
      } else {
        throw createBusinessError;
      }
    } else {
      businessId = newBusiness.id;
    }
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
