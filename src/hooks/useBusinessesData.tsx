
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
    const fetchBusinesses = async () => {
      try {
        // Fetch businesses from Supabase
        const { data: businessesData, error: businessesError } = await supabase
          .from('businesses')
          .select('*');

        if (businessesError) {
          throw businessesError;
        }

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        const currentUserId = user?.id;

        // Fetch business roles
        const { data: rolesData, error: rolesError } = await supabase
          .from('business_roles')
          .select('*');

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

        // Transform the data to match the Business interface
        const transformedBusinesses: Business[] = (businessesData || []).map(business => {
          // Get roles for this business
          const businessRoles = (rolesData || [])
            .filter(role => role.business_id === business.id)
            .map(role => {
              // Get user's vote for this role
              const userVote = userVotesData.find(vote => vote.business_role_id === role.id)?.vote_type;
              
              return {
                role: role.role,
                salary: role.salary,
                upvotes: role.upvotes || 0,
                downvotes: role.downvotes || 0,
                userVote: userVote === 'upvote' ? 'up' as const : userVote === 'downvote' ? 'down' as const : null
              };
            });

          return {
            id: business.id,
            name: business.name,
            businessType: business.business_type,
            position: { lat: business.lat, lng: business.lng },
            atmosphere: business.atmosphere || [],
            salary: business.salary,
            roles: businessRoles,
            place_id: business.place_id,
            website: business.website,
            url: business.url
          };
        });

        setBusinesses(transformedBusinesses);
      } catch (error) {
        console.error('Error fetching businesses:', error);
        setBusinesses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBusinesses();
  }, []);

  return { businesses, loading, setBusinesses };
};
