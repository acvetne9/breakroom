import type { FeatureCollection } from 'geojson';
import * as turf from '@turf/turf';

export const extractParkFeatures = (geoData: FeatureCollection) => {
  return geoData.features.filter(feature => {
    if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
    const props = feature.properties || {};
    const name = (props.name || '').toLowerCase();
    
    // NEVER color Jamaica Bay Unit as park - check all possible identifiers first
    if (props.id === 1232494364 || props.id === '1232494364') return false;
    if (name.includes('jamaica bay unit')) return false;
    if (name.includes('jamaica bay reserve')) return false;
    if (name.includes('jamaica bay wildlife refuge')) return false;
    
    return (
      props.leisure === 'park' || 
      props.leisure === 'garden' ||
      props.leisure === 'cemetery' ||
      props.leisure === 'nature_reserve' ||
      props.landuse === 'meadow' ||
      props.wetland === 'wet_meadow' ||
      name.includes('park') ||
      name.includes('cemetery')
    );
  });
};

export const extractWaterFeatures = (geoData: FeatureCollection, parkFeatureIds: Set<any>) => {
  const waterFeatures = geoData.features.filter(feature => {
    if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
    const props = feature.properties || {} as any;
    const name = (props.name || '').toLowerCase();
    const id = (props.id ?? feature.id ?? props.osm_id) as any;

    // Explicit exclusions
    if (id === 146402114 || id === '146402114') return false; // Do not color this way as water
    if (props.landuse === 'residential') return false; // Never treat residential landuse as water
    
    // Exclude if already classified as park
    if (parkFeatureIds.has(props?.id) || parkFeatureIds.has(feature.id)) return false;
    
    // Exclude parks, Jamaica Bay areas, waterways, and park-like features from being classified as water
    if (name.includes('park') || name.includes('jamaica bay unit') || name.includes('jamaica bay wildlife refuge') || props.waterway) return false;
    if (props.leisure === 'park' || props.leisure === 'garden' || props.leisure === 'cemetery' || props.leisure === 'nature_reserve') return false;
    if (props.landuse === 'meadow' || props.wetland === 'wet_meadow') return false;
    if (name.includes('cemetery')) return false;
    
    return (
      props.natural === 'water' || 
      props.natural === 'bay' || 
      // Named water bodies (but not waterways)
      ['river', 'bay', 'harbor', 'sound', 'creek', 'canal'].some(waterType => 
        name.includes(waterType)
      )
    );
  });

  // Remove duplicate water features by location
  const uniqueWaterFeatures = [] as any[];
  const seenLocations = new Set<string>();
  
  for (const feature of waterFeatures) {
    try {
      const centroid = turf.centroid(feature);
      const [lng, lat] = centroid.geometry.coordinates as [number, number];
      const locationKey = `${Math.round(lng * 10000)}-${Math.round(lat * 10000)}`;
      
      if (!seenLocations.has(locationKey)) {
        seenLocations.add(locationKey);
        uniqueWaterFeatures.push(feature);
      }
    } catch (err) {
      // If centroid fails, keep the feature anyway
      uniqueWaterFeatures.push(feature);
    }
  }

  return uniqueWaterFeatures;
};

export const extractRoadFeatures = (geoData: FeatureCollection) => {
  return geoData.features.filter(feature => {
    if (feature.geometry.type !== 'LineString') return false;
    const props = feature.properties || {};
    const name = (props.name || '').toLowerCase();
    
    // Only include features with highway property
    if (!props.highway) return false;
    
    // Exclude coastlines and waterways
    if (props.natural === 'coastline' || props.waterway) return false;
    
    // Exclude bikeways/cycleways from being styled as roads
    if (props.highway === 'cycleway' || props.highway === 'path' || props.bicycle === 'yes') return false;
    
    // Exclude New Jersey roads explicitly
    if (name.includes('new jersey') || 
        name.includes('nj ') || 
        name.includes('jersey') ||
        name.includes('hoboken') ||
        name.includes('weehawken') ||
        name.includes('union city') ||
        name.includes('palisades')) return false;
    
    return true;
  });
};

export const extractWaterwayFeatures = (geoData: FeatureCollection) => {
  return geoData.features.filter(feature => {
    if (feature.geometry.type !== 'LineString') return false;
    const props = feature.properties || {};
    return props.waterway && props.natural !== 'coastline';
  });
};
