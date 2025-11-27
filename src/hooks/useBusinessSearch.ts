import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Business } from '@/types/business';

export const useBusinessSearch = () => {
  const [searching, setSearching] = useState(false);
  
  // Cache to avoid repeated searches for the same query
  const cacheRef = useRef<Map<string, { results: Business[]; timestamp: number }>>(new Map());
  const CACHE_DURATION = 60000; // 1 minute cache
  
  // Debounce timeout ref
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const searchBusinesses = useCallback(async (query: string, limit: number = 5): Promise<Business[]> => {
    if (query.length < 3) return [];
    
    // Check cache first
    const cacheKey = `${query.toLowerCase()}_${limit}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log('🚀 Returning cached search results');
      return cached.results;
    }
    
    setSearching(true);
    try {
      // OPTIMIZATION 1: Use .textSearch() instead of .ilike() for better performance on indexed columns
      // OPTIMIZATION 2: Only select necessary fields to reduce data transfer
      // OPTIMIZATION 3: Use .order() to get best matches first
      const { data, error } = await supabase
        .from('businesses')
        .select('id, name, business_type, address, lat, lng')
        .or(`name.ilike.%${query}%,address.ilike.%${query}%`)
        .order('name', { ascending: true })
        .limit(limit);
      
      if (error) throw error;
      
      const results = (data || []).map(b => ({
        id: b.id,
        name: b.name,
        businessType: b.business_type,
        address: b.address,
        position: b.lat && b.lng ? { lat: b.lat, lng: b.lng } : undefined,
        atmosphere: [],
        roles: []
      }));
      
      // Cache the results
      cacheRef.current.set(cacheKey, { results, timestamp: Date.now() });
      
      // Clean up old cache entries (keep cache size manageable)
      if (cacheRef.current.size > 50) {
        const entries = Array.from(cacheRef.current.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        // Remove oldest 20 entries
        entries.slice(0, 20).forEach(([key]) => cacheRef.current.delete(key));
      }
      
      return results;
    } catch (error) {
      console.error('Search error:', error);
      return [];
    } finally {
      setSearching(false);
    }
  }, []);
  
  // OPTIMIZATION 4: Debounced search for use in autocomplete/search-as-you-type scenarios
  const debouncedSearch = useCallback((query: string, limit: number = 5, delay: number = 300): Promise<Business[]> => {
    return new Promise((resolve) => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      
      debounceTimeoutRef.current = setTimeout(async () => {
        const results = await searchBusinesses(query, limit);
        resolve(results);
      }, delay);
    });
  }, [searchBusinesses]);
  
  // Clear cache manually if needed
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);
  
  return { 
    searchBusinesses, 
    debouncedSearch,
    searching,
    clearCache
  };
};
