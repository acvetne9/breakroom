// High-performance Web Worker for map processing
import { simplify } from '@turf/turf';
import Supercluster from 'supercluster';
import type { Business } from '@/types/business';

// Worker-specific caches
const simplificationCache = new Map<string, any>();
const clusterCache = new Map<string, any>();
const CACHE_SIZE_LIMIT = 200;

interface WorkerMessage {
  id: string;
  type: 'cluster' | 'simplify' | 'process-shapes';
  data: any;
}

interface ClusterRequest {
  businesses: Business[];
  zoom: number;
  bounds: [number, number, number, number];
}

interface SimplifyRequest {
  features: any[];
  zoom: number;
  tolerance?: number;
}

// Initialize supercluster instance
const supercluster = new Supercluster({
  radius: 60, // cluster radius in pixels
  maxZoom: 16, // max zoom to cluster points on
  minZoom: 0, // min zoom to generate clusters
  minPoints: 2, // minimum points to form a cluster
  map: (props: any) => ({ 
    business: props.business,
    id: props.id 
  }),
  reduce: (accumulated: any, props: any) => {
    // Keep track of all businesses in cluster
    if (!accumulated.businesses) accumulated.businesses = [];
    accumulated.businesses.push(props.business);
  }
});

// Efficient geometry simplification with zoom-based tolerance
function simplifyGeometry(feature: any, zoom: number): any {
  const cacheKey = `${feature.id || 'noId'}-${zoom}`;
  
  if (simplificationCache.has(cacheKey)) {
    return simplificationCache.get(cacheKey);
  }
  
  // Zoom-based tolerance for optimal detail vs performance
  let tolerance: number;
  if (zoom < 10) tolerance = 0.008; // ~800m at equator
  else if (zoom < 12) tolerance = 0.004; // ~400m
  else if (zoom < 14) tolerance = 0.002; // ~200m
  else if (zoom < 16) tolerance = 0.001; // ~100m
  else tolerance = 0.0005; // ~50m for high zoom
  
  try {
    let simplified = feature;
    
    // Only simplify polygons and linestrings
    if (feature.geometry && 
        (feature.geometry.type === 'Polygon' || 
         feature.geometry.type === 'MultiPolygon' ||
         feature.geometry.type === 'LineString' ||
         feature.geometry.type === 'MultiLineString')) {
      
      simplified = simplify(feature, {
        tolerance, 
        highQuality: false, // Use fast simplification
        mutate: false 
      });
    }
    
    // Cache with size limit
    if (simplificationCache.size >= CACHE_SIZE_LIMIT) {
      const firstKey = simplificationCache.keys().next().value;
      simplificationCache.delete(firstKey);
    }
    simplificationCache.set(cacheKey, simplified);
    
    return simplified;
  } catch (error) {
    console.warn('Simplification failed for feature:', feature.id, error);
    return feature; // Return original on error
  }
}

// High-performance business clustering
function clusterBusinesses(businesses: Business[], zoom: number, bounds: [number, number, number, number]) {
  const cacheKey = `${businesses.length}-${zoom}-${bounds.join(',')}`;
  
  if (clusterCache.has(cacheKey)) {
    return clusterCache.get(cacheKey);
  }
  
  // Convert businesses to supercluster format
  const points = businesses.map(business => ({
    type: 'Feature' as const,
    properties: {
      business,
      id: business.id
    },
    geometry: {
      type: 'Point' as const,
      coordinates: [business.position.lng, business.position.lat]
    }
  }));
  
  try {
    // Load points into supercluster
    supercluster.load(points);
    
    // Get clusters for current zoom and bounds
    const clusters = supercluster.getClusters(bounds, Math.floor(zoom));
    
    // Process clusters into format expected by DeckGL
    const processedClusters = clusters.map(cluster => {
      if (cluster.properties?.cluster) {
        // This is a cluster
        const clusterBusinesses = supercluster
          .getLeaves(cluster.properties.cluster_id, Infinity)
          .map((leaf: any) => leaf.properties.business);
        
        return {
          type: 'cluster',
          id: `cluster-${cluster.properties.cluster_id}`,
          position: {
            lng: cluster.geometry.coordinates[0],
            lat: cluster.geometry.coordinates[1]
          },
          count: cluster.properties.point_count,
          businesses: clusterBusinesses
        };
      } else {
        // This is an individual point
        return {
          type: 'point',
          ...cluster.properties.business
        };
      }
    });
    
    // Cache result
    if (clusterCache.size >= CACHE_SIZE_LIMIT) {
      const firstKey = clusterCache.keys().next().value;
      clusterCache.delete(firstKey);
    }
    clusterCache.set(cacheKey, processedClusters);
    
    return processedClusters;
  } catch (error) {
    console.error('Clustering failed:', error);
    return businesses.map(business => ({ type: 'point', ...business }));
  }
}

// Process shapes with simplification
function processShapes(features: any[], zoom: number) {
  return features.map(feature => simplifyGeometry(feature, zoom));
}

// Worker message handler
self.onmessage = function(e: MessageEvent<WorkerMessage>) {
  const { id, type, data } = e.data;
  
  try {
    let result: any;
    
    switch (type) {
      case 'cluster':
        const { businesses, zoom, bounds } = data as ClusterRequest;
        result = clusterBusinesses(businesses, zoom, bounds);
        break;
        
      case 'simplify':
        const { features, zoom: simZoom } = data as SimplifyRequest;
        result = processShapes(features, simZoom);
        break;
        
      case 'process-shapes':
        // Combined shape processing for efficiency
        result = {
          parks: processShapes(data.parks || [], data.zoom),
          water: processShapes(data.water || [], data.zoom),
          roads: processShapes(data.roads || [], data.zoom),
          waterways: processShapes(data.waterways || [], data.zoom)
        };
        break;
        
      default:
        throw new Error(`Unknown worker message type: ${type}`);
    }
    
    // Send result back
    self.postMessage({
      id,
      success: true,
      result
    });
    
  } catch (error) {
    // Send error back
    self.postMessage({
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Cleanup caches periodically
setInterval(() => {
  if (simplificationCache.size > CACHE_SIZE_LIMIT / 2) {
    const keysToDelete = Array.from(simplificationCache.keys()).slice(0, 20);
    keysToDelete.forEach(key => simplificationCache.delete(key));
  }
  
  if (clusterCache.size > CACHE_SIZE_LIMIT / 2) {
    const keysToDelete = Array.from(clusterCache.keys()).slice(0, 20);
    keysToDelete.forEach(key => clusterCache.delete(key));
  }
}, 30000); // Clean every 30 seconds
