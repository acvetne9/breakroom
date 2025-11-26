import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Business } from '@/types/business';

export const useBusinessSearch = () => {
  const [searching, setSearching] = useState(false);

  const searchBusinesses = async (query: string, limit: number = 5): Promise<Business[]> => {
    if (query.length < 3) return [];
    
    setSearching(true);
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
    } finally {
      setSearching(false);
    }
  };

  return { searchBusinesses, searching };
};
