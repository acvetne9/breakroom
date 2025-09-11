import { nycNeighborhoods, generateNeighborhoodBoundary, haversine } from '@/utils/nyc_neighborhoods';
import { Business } from '@/types/business';

export interface NeighborhoodBounds {
  name: string;
  borough: string;
  center: { lat: number; lon: number };
  boundary: { lat: number; lon: number }[];
}

// Find neighborhood by name (case insensitive)
export function findNeighborhood(searchTerm: string): NeighborhoodBounds | null {
  const term = searchTerm.toLowerCase().trim();
  
  for (const [borough, neighborhoods] of Object.entries(nycNeighborhoods)) {
    for (const neighborhood of neighborhoods) {
      if (neighborhood.name.toLowerCase().includes(term) || term.includes(neighborhood.name.toLowerCase())) {
        // Get other neighborhoods in the same borough as neighbors
        const neighbors = neighborhoods.filter(n => n.name !== neighborhood.name);
        
        // Generate boundary using the existing function
        const boundary = generateNeighborhoodBoundary(neighborhood, neighbors);
        
        return {
          name: neighborhood.name,
          borough,
          center: { lat: neighborhood.lat, lon: neighborhood.lon },
          boundary
        };
      }
    }
  }
  
  return null;
}

// Filter businesses within neighborhood rectangular bounds
export function filterBusinessesByNeighborhood(
  businesses: Business[], 
  neighborhoodBounds: NeighborhoodBounds
): Business[] {
  // Create rectangular bounds from the neighborhood boundary points
  const lats = neighborhoodBounds.boundary.map(p => p.lat);
  const lons = neighborhoodBounds.boundary.map(p => p.lon);
  
  // Add generous padding to ensure we capture all businesses in the area
  const latPadding = 0.020; // ~2km padding
  const lonPadding = 0.025; // ~2km padding (adjusted for longitude)
  
  const rectBounds = {
    north: Math.max(...lats) + latPadding,
    south: Math.min(...lats) - latPadding,
    east: Math.max(...lons) + lonPadding,
    west: Math.min(...lons) - lonPadding
  };
  
  console.log('🏙️ [filterBusinessesByNeighborhood] Using rectangular bounds:', rectBounds);
  
  return businesses.filter(business => {
    if (!business.position?.lat || !business.position?.lng) return false;
    
    const lat = business.position.lat;
    const lng = business.position.lng;
    
    // Simple rectangular bounds check - capture all businesses within the rectangle
    return lat <= rectBounds.north && 
           lat >= rectBounds.south && 
           lng <= rectBounds.east && 
           lng >= rectBounds.west;
  });
}

// Get all neighborhood names for autocomplete/matching
export function getAllNeighborhoodNames(): string[] {
  const names: string[] = [];
  
  for (const neighborhoods of Object.values(nycNeighborhoods)) {
    for (const neighborhood of neighborhoods) {
      names.push(neighborhood.name);
    }
  }
  
  return names.sort();
}