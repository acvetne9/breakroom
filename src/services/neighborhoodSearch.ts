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

// Check if a point is inside a polygon using ray casting algorithm
function isPointInPolygon(point: { lat: number; lon: number }, polygon: { lat: number; lon: number }[]): boolean {
  let inside = false;
  const x = point.lon;
  const y = point.lat;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lon;
    const yi = polygon[i].lat;
    const xj = polygon[j].lon;
    const yj = polygon[j].lat;
    
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

// Filter businesses within neighborhood bounds
export function filterBusinessesByNeighborhood(
  businesses: Business[], 
  neighborhoodBounds: NeighborhoodBounds
): Business[] {
  return businesses.filter(business => {
    if (!business.position?.lat || !business.position?.lng) return false;
    
    const businessPoint = { lat: business.position.lat, lon: business.position.lng };
    
    // Strict boundary check - only businesses within the actual neighborhood polygon
    return isPointInPolygon(businessPoint, neighborhoodBounds.boundary);
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