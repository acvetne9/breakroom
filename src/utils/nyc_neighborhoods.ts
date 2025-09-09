// ---------------- NYC neighborhoods ----------------
export const nycNeighborhoods = {
  Manhattan: [
    { name: "Harlem", lat: 40.8116, lon: -73.9465 },
    { name: "Upper East Side", lat: 40.7736, lon: -73.9566 },
    { name: "Upper West Side", lat: 40.787, lon: -73.9754 },
    { name: "Midtown", lat: 40.7549, lon: -73.984 },
    { name: "Lower East Side", lat: 40.717, lon: -73.987 },
    { name: "Greenwich Village", lat: 40.7336, lon: -74.0027 },
    { name: "Financial District", lat: 40.7075, lon: -74.0113 }
  ],
  Brooklyn: [
    { name: "Williamsburg", lat: 40.7081, lon: -73.9571 },
    { name: "Greenpoint", lat: 40.7307, lon: -73.954 },
    { name: "Bushwick", lat: 40.6958, lon: -73.9171 },
    { name: "Bedford–Stuyvesant", lat: 40.6872, lon: -73.9418 },
    { name: "Crown Heights", lat: 40.669, lon: -73.9448 },
    { name: "Park Slope", lat: 40.672, lon: -73.978 },
    { name: "Brooklyn Heights", lat: 40.6959, lon: -73.9956 },
    { name: "Coney Island", lat: 40.5755, lon: -73.9707 },
    { name: "Brownsville", lat: 40.6629, lon: -73.9133 },
    { name: "Bensonhurst", lat: 40.6113, lon: -73.997 },
    { name: "Canarsie", lat: 40.63859, lon: -73.897079 }
  ],
  Queens: [
    { name: "Astoria", lat: 40.7644, lon: -73.9235 },
    { name: "Long Island City", lat: 40.744, lon: -73.9488 },
    { name: "Jackson Heights", lat: 40.7557, lon: -73.885 },
    { name: "Flushing", lat: 40.7675, lon: -73.8331 },
    { name: "Forest Hills", lat: 40.718, lon: -73.8448 },
    { name: "Jamaica", lat: 40.7027, lon: -73.789 },
    { name: "Rockaway Beach", lat: 40.583, lon: -73.8203 },
    { name: "Ozone Park", lat: 40.678, lon: -73.8507 },
    { name: "Ridgewood", lat: 40.7101, lon: -73.896 },
    { name: "Whitestone", lat: 40.7921, lon: -73.8101 }
  ],
  Bronx: [
    { name: "Mott Haven", lat: 40.809, lon: -73.922 },
    { name: "Fordham", lat: 40.862, lon: -73.891 },
    { name: "Riverdale", lat: 40.8969, lon: -73.9154 },
    { name: "Belmont", lat: 40.8555, lon: -73.886 },
    { name: "Hunts Point", lat: 40.8121, lon: -73.8801 }
  ],
  "Staten Island": [
    { name: "St. George", lat: 40.6437, lon: -74.0732 },
    { name: "Stapleton", lat: 40.6276, lon: -74.0776 },
    { name: "Tottenville", lat: 40.5093, lon: -74.2519 },
    { name: "Great Kills", lat: 40.5537, lon: -74.151 },
    { name: "New Dorp", lat: 40.5732, lon: -74.1165 }
  ]
};

import concaveman from "concaveman";

// ---------------- Helper: radial buffer cloud ----------------
function jitteredBufferPoints(lat: number, lon: number, radiusKm = 0.5, radialCount = 16) {
  const pts: [number, number][] = [];
  for (let i = 0; i < radialCount; i++) {
    const θ = (360 / radialCount) * i;
    const p = destinationPoint(lat, lon, θ, radiusKm);
    pts.push([p.lon, p.lat]); // concaveman expects [x, y] = [lon, lat]
  }
  return pts;
}

// ---------------- Neighborhood boundary ----------------
export function generateNeighborhoodBoundary(
  neighborhood: { name: string; lat: number; lon: number },
  neighbors: { name: string; lat: number; lon: number }[],
  bufferKm = 0.6,
  radialCount = 16,
  concavity = 2
) {
  let cloud: [number, number][] = [];

  // Include the center
  cloud.push([neighborhood.lon, neighborhood.lat]);

  // Neighbor-driven points (weighted)
  neighbors.forEach(n => {
    const dist = haversine(neighborhood.lat, neighborhood.lon, n.lat, n.lon);
    const θ = bearing(neighborhood.lat, neighborhood.lon, n.lat, n.lon);
    const weight = Math.min(1, 3 / Math.max(dist, 0.01));
    const adjustedDist = dist * weight + bufferKm;
    const p = destinationPoint(neighborhood.lat, neighborhood.lon, θ, adjustedDist);
    cloud.push([p.lon, p.lat]);
  });

  // Radial buffer around the centroid
  cloud.push(...jitteredBufferPoints(neighborhood.lat, neighborhood.lon, bufferKm, radialCount));

  // Concave hull for smooth blob
  const hull = concaveman(cloud, concavity);
  return hull.map(([lon, lat]) => ({ lat, lon }));
}

// ---------------- Borough boundary ----------------
export function generateBoroughBoundary(
  neighborhoods: { name: string; lat: number; lon: number }[],
  bufferKm = 0.8,
  radialCount = 20,
  concavity = 2.5
) {
  let cloud: [number, number][] = [];

  neighborhoods.forEach(n => {
    cloud.push([n.lon, n.lat]);
    cloud.push(...jitteredBufferPoints(n.lat, n.lon, bufferKm, radialCount));
  });

  const hull = concaveman(cloud, concavity);
  return hull.map(([lon, lat]) => ({ lat, lon }));
}

// ---------------- Public helper ----------------
// ---------------- Unified public helper ----------------
export function getNeighborhoodBoundary(
  name: string,
  maxNeighborDistanceKm = 3
) {
  // Check if input is a borough first
  if (nycNeighborhoods[name]) {
    const neighborhoods = nycNeighborhoods[name];
    return generateBoroughBoundary(neighborhoods);
  }

  // Otherwise, treat as a single neighborhood
  let neighborhood: { name: string; lat: number; lon: number } | null = null;
  for (const borough in nycNeighborhoods) {
    for (const n of nycNeighborhoods[borough]) {
      if (n.name.toLowerCase() === name.toLowerCase()) {
        neighborhood = n;
        break;
      }
    }
    if (neighborhood) break;
  }

  if (!neighborhood) {
    throw new Error(`Neighborhood or borough "${name}" not found.`);
  }

  // Find neighbors across boroughs (for neighborhood mode only)
  const neighbors = findNearbyNeighborhoods(
    nycNeighborhoods,
    neighborhood,
    maxNeighborDistanceKm
  );

  // Generate blob-like boundary
  return generateNeighborhoodBoundary(neighborhood, neighbors);
}

