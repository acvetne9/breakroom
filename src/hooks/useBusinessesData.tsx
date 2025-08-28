
import { useState, useEffect } from 'react';
import { Business } from '@/types/business';
import { getBusinessesBasic, getFullBusinessDetails as getFullBusinessDetailsService } from '@/services/businesses';

export const useBusinessesData = () => {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBasicBusinesses = async () => {
      try {
        console.log('🏢 Starting to fetch businesses...');
        const basicBusinesses = await getBusinessesBasic();
        console.log(`🏢 Successfully loaded ${basicBusinesses.length} businesses`);
        setBusinesses(basicBusinesses);
      } catch (error) {
        console.error('❌ Error fetching basic businesses:', error);
        setBusinesses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBasicBusinesses();
  }, []);

  const fetchFullBusinessDetails = async (businessId: string) => {
    try {
    const fullBusiness = await getFullBusinessDetailsService(businessId);
    if (!fullBusiness) {
      return null;
    }

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
