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

// ---------------- Utilities ----------------
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(lat1, lon1, lat2, lon2) {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function destinationPoint(lat, lon, bearingDeg, distanceKm) {
  const R = 6371;
  const δ = distanceKm / R;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) +
    Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );

  return { lat: (φ2 * 180) / Math.PI, lon: (λ2 * 180) / Math.PI };
}

// ---------------- Core logic ----------------
export function findNearbyNeighborhoods(allBoroughs, target, maxDistanceKm = 3) {
  const neighbors = [];
  for (const borough in allBoroughs) {
    for (const n of allBoroughs[borough]) {
      if (n.name !== target.name) {
        const d = haversine(target.lat, target.lon, n.lat, n.lon);
        if (d <= maxDistanceKm) neighbors.push(n);
      }
    }
  }
  return neighbors;
}

// ---------------- Improved boundary generation ----------------
function convexHull(points) {
  // Graham scan (lat/lon as Cartesian for small area)
  points.sort((a, b) => (a.lon === b.lon ? a.lat - b.lat : a.lon - b.lon));
  const cross = (o, a, b) =>
    (a.lon - o.lon) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lon - o.lon);

  const lower = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function generateNeighborhoodBoundary(
  neighborhood,
  neighbors,
  bufferKm = 0.5,
  radialCount = 8
) {
  const boundaryCandidates = [];

  // Points toward real neighbors
  neighbors.forEach(n => {
    const dist = haversine(neighborhood.lat, neighborhood.lon, n.lat, n.lon);
    const θ = bearing(neighborhood.lat, neighborhood.lon, n.lat, n.lon);

    const point = destinationPoint(
      neighborhood.lat,
      neighborhood.lon,
      θ,
      dist * 0.7 + bufferKm
    );
    boundaryCandidates.push(point);
  });

  // Add evenly spaced radial buffer points
  for (let i = 0; i < radialCount; i++) {
    const θ = (360 / radialCount) * i;
    const point = destinationPoint(neighborhood.lat, neighborhood.lon, θ, bufferKm * 2);
    boundaryCandidates.push(point);
  }

  // Use convex hull for consistent polygon
  const hull = convexHull(boundaryCandidates);

  return hull;
}


// ---------------- Public helper ----------------
export function getNeighborhoodBoundary(name, maxNeighborDistanceKm = 3) {
  // Find neighborhood object
  let neighborhood = null;
  for (const borough in nycNeighborhoods) {
    for (const n of nycNeighborhoods[borough]) {
      if (n.name.toLowerCase() === name.toLowerCase()) {
        neighborhood = n;
        break;
      }
    }
    if (neighborhood) break;
  }
  if (!neighborhood) throw new Error(`Neighborhood "${name}" not found.`);

  // Find neighbors across boroughs
  const neighbors = findNearbyNeighborhoods(
    nycNeighborhoods,
    neighborhood,
    maxNeighborDistanceKm
  );

  // Generate polygon-like boundary
  return generateNeighborhoodBoundary(neighborhood, neighbors);
}
