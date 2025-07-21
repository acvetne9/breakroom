
interface Business {
  id: string;
  name: string;
  businessType?: string;
  roles?: Array<{ role: string; salary: string }>;
}

export const searchBusinesses = (businesses: Business[], searchTerm: string) => {
  if (!searchTerm.trim()) {
    return { filteredBusinesses: businesses, exactMatch: null };
  }

  const term = searchTerm.toLowerCase().trim();
  
  // Check for exact business name match first
  const exactMatch = businesses.find(business => 
    business.name.toLowerCase() === term
  );
  
  if (exactMatch) {
    return { filteredBusinesses: [exactMatch], exactMatch };
  }
  
  // Filter businesses based on multiple criteria
  const filteredBusinesses = businesses.filter(business => {
    // Check business name
    if (business.name.toLowerCase().includes(term)) {
      return true;
    }
    
    // Check business type
    if (business.businessType?.toLowerCase().includes(term)) {
      return true;
    }
    
    // Check job roles
    if (business.roles?.some(role => 
      role.role.toLowerCase().includes(term)
    )) {
      return true;
    }
    
    return false;
  });
  
  return { filteredBusinesses, exactMatch: null };
};
