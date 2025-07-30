
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Business {
  id: string;
  name: string;
  position: { lat: number; lng: number };
  atmosphere: string[];
  salary?: string;
  roles?: Array<{ 
    role: string; 
    salary: string; 
    upvotes: number; 
    downvotes: number; 
    userVote?: 'up' | 'down' | null; 
  }>;
  businessType?: string;
  place_id?: string;
  website?: string;
  url?: string;
}

export const useBusinessesData = () => {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBasicBusinesses = async () => {
      try {
        // Only fetch basic info needed for markers
        const { data: businessesData, error: businessesError } = await supabase
          .from('businesses')
          .select('id, name, lat, lng');

        if (businessesError) {
          throw businessesError;
        }

        // Transform to basic business objects for markers
        const basicBusinesses: Business[] = (businessesData || []).map(business => ({
          id: business.id,
          name: business.name,
          position: { lat: business.lat, lng: business.lng },
          atmosphere: [],
          salary: '0',
          roles: []
        }));

        setBusinesses(basicBusinesses);
      } catch (error) {
        console.error('Error fetching basic businesses:', error);
        setBusinesses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBasicBusinesses();
  }, []);

  const fetchFullBusinessDetails = async (businessId: string) => {
    try {
      // Fetch full business data
      const { data: businessData, error: businessError } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', businessId)
        .single();

      if (businessError) {
        throw businessError;
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id;

      // Fetch business roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('business_roles')
        .select('*')
        .eq('business_id', businessId);

      if (rolesError) {
        throw rolesError;
      }

      // Fetch user votes for roles if user is authenticated
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

      // Transform the full business data
      const businessRoles = (rolesData || []).map(role => {
        const userVote = userVotesData.find(vote => vote.business_role_id === role.id)?.vote_type;
        
        return {
          role: role.role,
          salary: role.salary,
          upvotes: role.upvotes || 0,
          downvotes: role.downvotes || 0,
          userVote: userVote === 'upvote' ? 'up' as const : userVote === 'downvote' ? 'down' as const : null
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
        url: businessData.url
      };

      // Update the businesses array with full details
      setBusinesses(prev => prev.map(business => 
        business.id === businessId ? fullBusiness : business
      ));

      return fullBusiness;
    } catch (error) {
      console.error('Error fetching full business details:', error);
      return null;
    }
  };

  return { businesses, loading, setBusinesses, fetchFullBusinessDetails };
};
