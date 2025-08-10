import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Feature, FeatureCollection, Polygon, MultiPolygon, LineString } from 'geojson';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Turf imports
import * as turf from '@turf/turf';

// Props interface combining both functionalities
interface MapLibreMapProps {
  // Business data from first script
  businesses: {
    id: string;
    name: string;
    position: { lat: number; lng: number };
    atmosphere: string[];
    salary?: string;
    stories?: { id: string; text: string; author: string }[];
    businessType?: string;
    roles?: {
      role: string;
      salary: string;
      upvotes?: number;
      downvotes?: number;
      userVote?: 'up' | 'down';
    }[];
    place_id?: string;
  }[];
  onBusinessClick?: (business: any) => void;
  selectedBusiness?: any;
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({
  businesses,
  onBusinessClick,
  selectedBusiness
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [roadsData, setRoadsData] = useState<FeatureCollection<LineString> | null>(null);
  const [landData, setLandData] = useState<FeatureCollection<Polygon | MultiPolygon> | null>(null);
  const [waterData, setWaterData] = useState<FeatureCollection<Polygon | MultiPolygon> | null>(null);

  const loadGeoJSONData = useCallback(async (): Promise<FeatureCollection | null> => {
    try {
      const response = await fetch('/data/example-points.geojson');
      if (!response.ok) {
        console.error('Failed to load GeoJSON:', response.statusText);
        return null;
      }
      const data: FeatureCollection = await response.json();
      return data;
    } catch (error) {
      console.error('Error loading GeoJSON:', error);
      return null;
    }
  }, []);

  // CEMETERY DETECTION STRATEGIES
  
  // Strategy 1: Direct cemetery layer from main data
  const addDirectCemeteryLayer = useCallback((mainData: FeatureCollection) => {
    if (!map || !mapLoaded) return;
    
    try {
      // Remove existing layers if they exist
      if (map.getLayer('cemeteries-layer')) map.removeLayer('cemeteries-layer');
      if (map.getLayer('cemeteries-border')) map.removeLayer('cemeteries-border');
    
    // Add cemetery layer from main geojson data
    map.addLayer({
      id: 'cemeteries-layer',
      type: 'fill',
      source: 'geojson-data', // Using the main data source
      filter: [
        'any',
        // Check for cemetery in name (case insensitive)
        ['in', 'cemetery', ['downcase', ['coalesce', ['get', 'name'], '']]],
        ['in', 'calvary', ['downcase', ['coalesce', ['get', 'name'], '']]],
        ['in', 'green-wood', ['downcase', ['coalesce', ['get', 'name'], '']]],
        ['in', 'greenwood', ['downcase', ['coalesce', ['get', 'name'], '']]],
        ['in', 'woodlawn', ['downcase', ['coalesce', ['get', 'name'], '']]],
        ['in', 'evergreen', ['downcase', ['coalesce', ['get', 'name'], '']]],
        ['in', 'cypress', ['downcase', ['coalesce', ['get', 'name'], '']]],
        // Also check for common cemetery patterns
        ['in', 'memorial', ['downcase', ['coalesce', ['get', 'name'], '']]],
        ['in', 'rest', ['downcase', ['coalesce', ['get', 'name'], '']]], 
        ['in', 'mount', ['downcase', ['coalesce', ['get', 'name'], '']]], 
        ['in', 'saint', ['downcase', ['coalesce', ['get', 'name'], '']]], 
        ['in', 'holy', ['downcase', ['coalesce', ['get', 'name'], '']]]
      ],
      paint: {
        'fill-color': '#2E7D32', // Dark green
        'fill-opacity': 0.9
      }
    });
    
    // Add cemetery borders for better visibility
    map.addLayer({
      id: 'cemeteries-border',
      type: 'line',
      source: 'geojson-data',
      filter: [
        'any',
        ['in', 'cemetery', ['downcase', ['coalesce', ['get', 'name'], '']]],
        ['in', 'calvary', ['downcase', ['coalesce', ['get', 'name'], '']]],
        ['in', 'green-wood', ['downcase', ['coalesce', ['get', 'name'], '']]],
        ['in', 'greenwood', ['downcase', ['coalesce', ['get', 'name'], '']]],
        ['in', 'woodlawn', ['downcase', ['coalesce', ['get', 'name'], '']]],
        ['in', 'evergreen', ['downcase', ['coalesce', ['get', 'name'], '']]],
        ['in', 'cypress', ['downcase', ['coalesce', ['get', 'name'], '']]]
      ],
      paint: {
        'line-color': '#1B5E20', // Darker green border
        'line-width': 2
      }
    });

      console.log('Strategy 1: Direct cemetery layer added');
    } catch (error) {
      console.error('Error adding direct cemetery layer:', error);
    }
  }, [map, mapLoaded]);

  // Strategy 2: Comprehensive cemetery detection
  const findAndColorCemeteries = useCallback((mainData: FeatureCollection) => {
    if (!map || !mapLoaded) return;
    
    try {
      // Find ALL features that might be cemeteries using multiple criteria
    const potentialCemeteries = mainData.features.filter(feature => {
      const props = feature.properties;
      if (!props) return false;
      
      // Check geometry type - cemeteries can be points or polygons
      const isValidGeometry = ['Point', 'Polygon', 'MultiPolygon'].includes(feature.geometry.type);
      if (!isValidGeometry) return false;
      
      const name = props.name ? props.name.toLowerCase() : '';
      
      return (
        // Direct cemetery mentions
        name.includes('cemetery') ||
        name.includes('cemetary') || // Common misspelling
        name.includes('burial') ||
        name.includes('graveyard') ||
        
        // Famous NYC cemeteries by name
        name.includes('green-wood') ||
        name.includes('greenwood') ||
        name.includes('calvary') ||
        name.includes('woodlawn') ||
        name.includes('evergreens') ||
        name.includes('cypress hills') ||
        name.includes('mount hebron') ||
        name.includes('beth david') ||
        name.includes('mount richmond') ||
        name.includes('moravian') ||
        name.includes('fresh pond') ||
        name.includes('mount judah') ||
        
        // Religious/memorial keywords
        name.includes('memorial park') ||
        name.includes('rest') && (name.includes('park') || name.includes('land')) ||
        name.includes('mount ') && (name.includes('olivet') || name.includes('zion') || name.includes('carmel')) ||
        (name.includes('saint') || name.includes('st.') || name.includes('st ')) && name.includes('cemetery') ||
        name.includes('holy') && (name.includes('cross') || name.includes('sepulchre')) ||
        
        // Check if leisure property hints at cemetery
        props.leisure === 'cemetery' || // Just in case this exists
        
        // Check natural property
        props.natural === 'cemetery' || // Just in case this exists
        
        // Highway/area designations that might indicate cemeteries
        (props.highway && props.highway.includes('cemetery'))
      );
    });
    
    console.log(`Strategy 2: Found ${potentialCemeteries.length} potential cemetery features:`, 
                potentialCemeteries.map(f => ({ name: f.properties?.name, geometry: f.geometry.type })));
    
    if (potentialCemeteries.length > 0) {
      // Create a separate geojson source for cemeteries
      const cemeteryFC = {
        type: 'FeatureCollection' as const,
        features: potentialCemeteries
      };
      
      // Remove existing cemetery layers if they exist
      if (map.getLayer('dedicated-cemeteries')) map.removeLayer('dedicated-cemeteries');
      if (map.getLayer('dedicated-cemeteries-border')) map.removeLayer('dedicated-cemeteries-border');
      if (map.getLayer('dedicated-cemeteries-points')) map.removeLayer('dedicated-cemeteries-points');
      if (map.getSource('cemetery-data')) map.removeSource('cemetery-data');
      
      // Add cemetery source
      map.addSource('cemetery-data', {
        type: 'geojson',
        data: cemeteryFC
      });
      
      // Add fill layer for polygon cemeteries
      map.addLayer({
        id: 'dedicated-cemeteries',
        type: 'fill',
        source: 'cemetery-data',
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint: {
          'fill-color': '#2E7D32', // Dark green
          'fill-opacity': 0.9
        }
      });
      
      // Add border for polygon cemeteries
      map.addLayer({
        id: 'dedicated-cemeteries-border',
        type: 'line',
        source: 'cemetery-data',
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint: {
          'line-color': '#1B5E20', // Darker green
          'line-width': 2
        }
      });
      
      // Add circles for point cemeteries
      map.addLayer({
        id: 'dedicated-cemeteries-points',
        type: 'circle',
        source: 'cemetery-data',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-color': '#2E7D32',
          'circle-radius': 6,
          'circle-stroke-color': '#1B5E20',
          'circle-stroke-width': 2
        }
      });
    } catch (error) {
      console.error('Error in addCemeteryOverlay:', error);
    } catch (error) {
      console.error('Error in findAndColorCemeteries:', error);
    }
  }, [map, mapLoaded]);

  // Strategy 3: Brute force - check EVERY polygon feature for cemetery keywords
  const addCemeteryOverlay = useCallback((mainData: FeatureCollection) => {
    if (!map || !mapLoaded) return;
    
    try {
      // Check every single feature with a name for cemetery-like words
    const suspiciousCemeteries = mainData.features.filter(feature => {
      const props = feature.properties;
      if (!props || !props.name) return false;
      
      const name = props.name.toLowerCase();
      const words = name.split(/[\s\-_.,]+/); // Split on various separators
      
      // Cemetery-related words
      const cemeteryWords = [
        'cemetery', 'cemetary', 'burial', 'grave', 'tomb', 'memorial', 
        'rest', 'eternal', 'peace', 'mount', 'calvary', 'saint', 'holy',
        'cross', 'wood', 'lawn', 'hill', 'green', 'cypress', 'pine',
        'oak', 'elm', 'maple', 'rose', 'garden', 'park'
      ];
      
      // Check if name contains multiple cemetery-related words
      const matchingWords = words.filter(word => 
        cemeteryWords.some(cemWord => word.includes(cemWord) || cemWord.includes(word))
      );
      
      // If multiple matches, likely a cemetery
      return matchingWords.length >= 2 || 
             words.some(word => ['cemetery', 'cemetary', 'calvary'].includes(word));
    });
    
    console.log('Strategy 3: Suspicious cemetery features found:', 
                suspiciousCemeteries.map(f => ({ name: f.properties?.name, geometry: f.geometry.type })));
    
    if (suspiciousCemeteries.length > 0) {
      const suspiciousFC = {
        type: 'FeatureCollection' as const,
        features: suspiciousCemeteries
      };
      
      // Clean up existing
      if (map.getLayer('suspicious-cemeteries')) map.removeLayer('suspicious-cemeteries');
      if (map.getSource('suspicious-cemetery-data')) map.removeSource('suspicious-cemetery-data');
      
      map.addSource('suspicious-cemetery-data', {
        type: 'geojson',
        data: suspiciousFC
      });
      
      map.addLayer({
        id: 'suspicious-cemeteries',
        type: 'fill',
        source: 'suspicious-cemetery-data',
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint: {
          'fill-color': '#4A148C', // Purple to distinguish from regular cemeteries
          'fill-opacity': 0.7
        }
      });
    }
  }, [map, mapLoaded]);

  // Strategy 4: Geographic approach - find areas that are likely cemeteries by location
  const findCemeteriesByLocation = useCallback((mainData: FeatureCollection) => {
    if (!map || !mapLoaded) return;
    
    // Known cemetery locations in NYC (approximate coordinates)
    const knownCemeteryAreas = [
      { name: "Green-Wood Cemetery", center: [-73.9932, 40.6551], radius: 0.01 },
      { name: "Calvary Cemetery", center: [-73.9057, 40.7441], radius: 0.008 },
      { name: "Woodlawn Cemetery", center: [-73.8681, 40.8971], radius: 0.007 },
      { name: "Cypress Hills Cemetery", center: [-73.8813, 40.6851], radius: 0.006 },
      { name: "Evergreens Cemetery", center: [-73.9052, 40.6910], radius: 0.005 },
      { name: "Mount Hebron Cemetery", center: [-73.8440, 40.6340], radius: 0.004 }
    ];
    
    const nearCemeteryFeatures = mainData.features.filter(feature => {
      if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
      
      // Get centroid of feature
      try {
        const centroid = turf.centroid(feature);
        const [lng, lat] = centroid.geometry.coordinates;
        
        // Check if feature is near any known cemetery location
        return knownCemeteryAreas.some(cemetery => {
          const distance = Math.sqrt(
            Math.pow(lng - cemetery.center[0], 2) + 
            Math.pow(lat - cemetery.center[1], 2)
          );
          return distance < cemetery.radius;
        });
      } catch (err) {
        return false;
      }
    });
    
    console.log(`Strategy 4: Found ${nearCemeteryFeatures.length} features near known cemetery locations:`, 
                nearCemeteryFeatures.map(f => ({ name: f.properties?.name })));
    
    if (nearCemeteryFeatures.length > 0) {
      const locationFC = {
        type: 'FeatureCollection' as const,
        features: nearCemeteryFeatures
      };
      
      // Clean up existing
      if (map.getLayer('location-based-cemeteries')) map.removeLayer('location-based-cemeteries');
      if (map.getSource('location-cemetery-data')) map.removeSource('location-cemetery-data');
      
      map.addSource('location-cemetery-data', {
        type: 'geojson',
        data: locationFC
      });
      
      map.addLayer({
        id: 'location-based-cemeteries',
        type: 'fill',
        source: 'location-cemetery-data',
        paint: {
          'fill-color': '#FF6F00', // Orange to distinguish
          'fill-opacity': 0.8
        }
      });
    }
  }, [map, mapLoaded]);

  const loadGeographicData = useCallback(async () => {
    try {
      // Load roads data
      const roadsResponse = await fetch('/data/merged_roads.geojson.gz');
      if (roadsResponse.ok) {
        const roadsData = await roadsResponse.json();
        setRoadsData(roadsData);
      }
      
      // Extract land and water data from the main GeoJSON
      const mainData = await loadGeoJSONData();
      if (mainData) {
        console.log(`Processing ${mainData.features.length} total features`);
        
        // DEBUG: Find ALL features with names containing keywords we're looking for
        const debugResults = {
          cemeteryFeatures: [] as any[],
          waterFeatures: [] as any[],
          allNames: new Set<string>(),
          geometryTypes: new Map<string, number>(),
          propertyStats: new Map<string, number>()
        };
        
        mainData.features.forEach((feature, index) => {
          const props = feature.properties;
          const geomType = feature.geometry.type;
          
          // Track geometry types
          debugResults.geometryTypes.set(geomType, (debugResults.geometryTypes.get(geomType) || 0) + 1);
          
          if (props && props.name) {
            const name = props.name.toLowerCase();
            debugResults.allNames.add(props.name);
            
            // Look for cemetery-related names
            if (name.includes('cemetery') || name.includes('calvary') || 
                name.includes('green-wood') || name.includes('greenwood') || 
                name.includes('woodlawn') || name.includes('evergreens')) {
              debugResults.cemeteryFeatures.push({
                index,
                name: props.name,
                geometry: geomType,
                leisure: props.leisure,
                natural: props.natural,
                allProps: props
              });
            }
            
            // Look for water-related names
            if (name.includes('bay') || name.includes('kill') || name.includes('river') || 
                name.includes('newark') || name.includes('arthur') || name.includes('hudson')) {
              debugResults.waterFeatures.push({
                index,
                name: props.name,
                geometry: geomType,
                natural: props.natural,
                water: props.water,
                allProps: props
              });
            }
          }
          
          // Track all property keys
          if (props) {
            Object.keys(props).forEach(key => {
              const propKey = `${key}=${props[key]}`;
              debugResults.propertyStats.set(propKey, (debugResults.propertyStats.get(propKey) || 0) + 1);
            });
          }
        });
        
        console.log('=== DEBUGGING RESULTS ===');
        console.log('Geometry types:', Object.fromEntries(debugResults.geometryTypes));
        console.log('Found cemetery features:', debugResults.cemeteryFeatures);
        console.log('Found water features:', debugResults.waterFeatures);
        
        // Show sample of all names to help identify patterns
        const nameArray = Array.from(debugResults.allNames);
        console.log(`Total named features: ${nameArray.length}`);
        console.log('Sample names (first 20):', nameArray.slice(0, 20));
        
        // Show water-related names
        const waterNames = nameArray.filter(name => 
          name.toLowerCase().includes('bay') || 
          name.toLowerCase().includes('kill') || 
          name.toLowerCase().includes('river') ||
          name.toLowerCase().includes('water')
        );
        console.log('All water-related names found:', waterNames);
        
        // Show cemetery-related names
        const cemeteryNames = nameArray.filter(name => 
          name.toLowerCase().includes('cemetery') || 
          name.toLowerCase().includes('calvary') || 
          name.toLowerCase().includes('green') ||
          name.toLowerCase().includes('wood')
        );
        console.log('All cemetery-related names found:', cemeteryNames);
        
        // Show top property combinations
        const sortedProps = Array.from(debugResults.propertyStats.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 30);
        console.log('Top 30 property combinations:', sortedProps);

        // TRY ALL CEMETERY DETECTION STRATEGIES HERE
        console.log('\n=== APPLYING CEMETERY DETECTION STRATEGIES ===');
        
        // Wait a bit for map to be ready, then apply all strategies
        setTimeout(() => {
          addDirectCemeteryLayer(mainData);
          findAndColorCemeteries(mainData);
          addCemeteryOverlay(mainData);
          findCemeteriesByLocation(mainData);
        }, 1000);
        
        // IMPROVED LAND DETECTION - Working with limited properties
        const landFeatures = mainData.features.filter(feature => {
          const props = feature.properties;
          if (!props || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
          
          return (
            // CEMETERY DETECTION - Name-based only since we don't have landuse/amenity
            (props.name && props.name.toLowerCase().includes('cemetery')) ||
            (props.name && props.name.toLowerCase().includes('calvary')) ||
            (props.name && props.name.toLowerCase().includes('green-wood')) ||
            (props.name && props.name.toLowerCase().includes('greenwood')) ||
            (props.name && props.name.toLowerCase().includes('woodlawn')) ||
            (props.name && props.name.toLowerCase().includes('evergreens')) ||
            (props.name && props.name.toLowerCase().includes('cypress hills')) ||
            
            // Leisure areas (parks, etc.) - these we DO have
            props.leisure === 'park' ||
            props.leisure === 'playground' ||
            props.leisure === 'pitch' ||
            props.leisure === 'garden' ||
            props.leisure === 'golf_course' ||
            props.leisure === 'recreation_ground' ||
            props.leisure === 'stadium' ||
            props.leisure === 'sports_centre' ||
            
            // Natural land areas - these we DO have
            props.natural === 'wood' ||
            props.natural === 'forest' ||
            props.natural === 'grassland' ||
            props.natural === 'scrub' ||
            props.natural === 'heath' ||
            props.natural === 'fell' ||
            props.natural === 'bare_rock' ||
            props.natural === 'scree' ||
            props.natural === 'sand' ||
            props.natural === 'beach' ||
            props.natural === 'land' ||
            
            // Name-based detection for major land features
            (props.name && [
              'central park', 'prospect park', 'battery park', 'bryant park', 
              'madison square park', 'washington square park', 'riverside park',
              'governors island', 'staten island', 'liberty island', 'ellis island'
            ].some(landName => 
              props.name.toLowerCase().includes(landName.toLowerCase())
            ))
          );
        }) as Feature<Polygon | MultiPolygon, { [name: string]: any }>[];
        
        // OPTIMIZED WATER DETECTION - Based on your Overpass query properties
        const waterFeatures = mainData.features.filter(feature => {
          const props = feature.properties;
          if (!props || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
          
          const name = props.name ? props.name.toLowerCase() : '';
          
          return (
            // Direct natural=water (this is the main one from your Overpass query)
            props.natural === 'water' ||
            
            // Water property (if it exists)
            props.water ||
            
            // Named water bodies that your Overpass query specifically targets
            name === 'upper new york bay' ||
            name === 'lower new york bay' ||
            name === 'newark bay' ||
            name === 'jamaica bay' ||
            name === 'long island sound' ||
            name === 'hudson river' ||
            name === 'east river' ||
            name === 'harlem river' ||
            name === 'arthur kill' ||
            name === 'kill van kull' ||
            name === 'raritan bay' ||
            name === 'sheepshead bay' ||
            name === 'rockaway inlet' ||
            
            // Partial matches for the above (in case of slight name variations)
            (name.includes('new york bay') && (name.includes('upper') || name.includes('lower'))) ||
            (name.includes('bay') && (name.includes('newark') || name.includes('jamaica') || name.includes('raritan') || name.includes('sheepshead'))) ||
            (name.includes('sound') && name.includes('long island')) ||
            (name.includes('river') && (name.includes('hudson') || name.includes('east') || name.includes('harlem'))) ||
            (name.includes('kill') && (name.includes('arthur') || name.includes('van kull'))) ||
            (name.includes('inlet') && name.includes('rockaway')) ||
            
            // Additional common water body patterns that might exist
            name.includes(' bay') ||
            name.includes(' river') ||
            name.includes(' kill') ||
            name.includes(' sound') ||
            name.includes(' inlet') ||
            name.includes(' canal') ||
            name.includes(' creek') ||
            
            // Large unnamed water bodies (size-based detection for natural=water features)
            (() => {
              if (props.natural === 'water' && !name) {
                try {
                  const area = turf.area(feature);
                  // If it's a large water polygon (>100,000 sq meters = 0.1 sq km), include it
                  return area > 100000;
                } catch {
                  return false;
                }
              }
              return false;
            })()
          );
        }) as Feature<Polygon | MultiPolygon, { [name: string]: any }>[];
        
        // DEBUGGING: Log what water features we found
        console.log(`Found ${waterFeatures.length} water features:`);
        waterFeatures.forEach((feature, index) => {
          const props = feature.properties;
          try {
            const area = turf.area(feature);
            console.log(`Water feature ${index}: "${props?.name || 'unnamed'}", area: ${Math.round(area)} sq meters, natural: ${props?.natural}, water: ${props?.water}`);
          } catch (err) {
            console.log(`Water feature ${index}: "${props?.name || 'unnamed'}", area: unknown, natural: ${props?.natural}, water: ${props?.water}`);
          }
        });
        
        // Also add a more targeted fallback strategy based on your Overpass query
        const createWaterBodiesFromCoastlines = (geoData: FeatureCollection): Feature<Polygon | MultiPolygon>[] => {
          // Since your Overpass query specifically targets named water bodies,
          // we only need minimal fallback for cases where geometry might be missing
          const waterBodies: Feature<Polygon | MultiPolygon>[] = [];
          
          // Check if we have coastlines from your query
          const coastlines = geoData.features.filter(feature => 
            feature.geometry.type === 'LineString' &&
            feature.properties?.natural === 'coastline'
          );
          
          console.log(`Found ${coastlines.length} coastline features from Overpass query`);
          
          // Only add synthetic water if we have very few water features detected
          // Your Overpass query should have gotten most of them
          return waterBodies;
        };
        
        // Only add synthetic water bodies if we have very few detected
        // (Your Overpass query should have gotten the major ones)
        if (waterFeatures.length < 3) {
          console.log('Very few water bodies detected, checking if Overpass query worked properly...');
          console.log('This might indicate an issue with the GeoJSON data or query execution');
          // Don't add synthetic water - rely on the Overpass query data
        }
        
        console.log(`Found ${landFeatures.length} land features`);
        console.log(`Found ${waterFeatures.length} water features`);
        
        // If we have very few explicit land features, try the coastline-based approach
        if (landFeatures.length < 10) {
          console.log('Few explicit land features found, trying coastline-based approach...');
          const coastlineGenerated = createLandFromCoastlines(mainData);
          if (coastlineGenerated.features.length > 0) {
            // Ensure all coastline-generated features are properly typed
            const typedCoastlineFeatures = coastlineGenerated.features.filter(
              (feature): feature is Feature<Polygon | MultiPolygon, { [name: string]: any }> => 
                feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon'
            );
            landFeatures.push(...typedCoastlineFeatures);
            console.log(`Added ${typedCoastlineFeatures.length} coastline-generated land features`);
          }
        }
        
        setLandData({
          type: 'FeatureCollection' as const,
          features: landFeatures
        });
        
        setWaterData({
          type: 'FeatureCollection' as const, 
          features: waterFeatures
        });
      }
    } catch (error) {
      console.error('Error loading geographic data:', error);
    }
  }, [loadGeoJSONData, addDirectCemeteryLayer, findAndColorCemeteries, addCemeteryOverlay, findCemeteriesByLocation]);

  // IMPROVED coastline-to-land conversion strategy
  const createLandFromCoastlines = useCallback((geoData: FeatureCollection): FeatureCollection<Polygon | MultiPolygon> => {
    try {
      const allLandFeatures: Feature<Polygon | MultiPolygon, { [name: string]: any }>[] = [];
      
      // Get coastlines
      const coastlines = geoData.features.filter(feature => 
        feature.geometry.type === 'LineString' &&
        feature.properties?.natural === 'coastline'
      );

      console.log(`Processing ${coastlines.length} coastline features`);

      if (coastlines.length === 0) {
        // If no coastlines, create a simple bounding box land area
        console.log('No coastlines found, creating default land area');
        const bbox: [number, number, number, number] = [-74.30, 40.50, -73.70, 40.93];
        const landArea = turf.bboxPolygon(bbox);
        
        allLandFeatures.push({
          ...landArea,
          properties: { 
            landType: 'default-bbox',
            source: 'fallback'
          }
        } as Feature<Polygon, { [name: string]: any }>);
        
        return {
          type: 'FeatureCollection' as const,
          features: allLandFeatures
        };
      }

      // STRATEGY 1: Create comprehensive water mask, then subtract from bounding box
      try {
        const bbox: [number, number, number, number] = [-74.30, 40.50, -73.70, 40.93];
        let totalLandArea = turf.bboxPolygon(bbox);
        
        // Get all water bodies (both explicit and coastline-derived)
        const explicitWaterBodies = geoData.features.filter(feature => {
          const props = feature.properties;
          return props && 
            (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') &&
            (
              props.natural === 'water' ||
              (props.name && [
                'Upper New York Bay', 'Lower New York Bay', 'Newark Bay', 'Jamaica Bay',
                'Long Island Sound', 'Hudson River', 'East River', 'Harlem River'
              ].some(waterName => props.name.includes(waterName)))
            );
        });
        
        console.log(`Found ${explicitWaterBodies.length} explicit water bodies`);
        
        // Create water polygons from coastline segments using convex hull approach
        const coastlineWaterBodies: Feature<Polygon | MultiPolygon>[] = [];
        
        // Group coastlines by proximity to create coherent water bodies
        const processedCoastlines = new Set<number>();
        
        coastlines.forEach((coastline, index) => {
          if (processedCoastlines.has(index)) return;
          
          try {
            const coords = (coastline.geometry as any).coordinates;
            if (!coords || coords.length < 3) return;
            
            // Find nearby coastline segments
            const nearbyCoastlines = [coastline];
            const currentCoords = [...coords];
            
            coastlines.forEach((otherCoastline, otherIndex) => {
              if (otherIndex === index || processedCoastlines.has(otherIndex)) return;
              
              const otherCoords = (otherCoastline.geometry as any).coordinates;
              if (!otherCoords || otherCoords.length < 3) return;
              
              // Check if any endpoint of this coastline is close to any endpoint of the other
              const endpoints = [
                coords[0], coords[coords.length - 1],
                otherCoords[0], otherCoords[otherCoords.length - 1]
              ];
              
              let isNearby = false;
              for (let i = 0; i < 2; i++) {
                for (let j = 2; j < 4; j++) {
                  const dist = turf.distance(endpoints[i], endpoints[j], { units: 'kilometers' });
                  if (dist < 0.5) { // Within 500m
                    isNearby = true;
                    break;
                  }
                }
                if (isNearby) break;
              }
              
              if (isNearby) {
                nearbyCoastlines.push(otherCoastline);
                currentCoords.push(...otherCoords);
                processedCoastlines.add(otherIndex);
              }
            });
            
            processedCoastlines.add(index);
            
            // Create a polygon from all the collected coastline points
            if (currentCoords.length >= 6) { // Need at least 3 unique points for polygon
              try {
                // Use convex hull to create a proper polygon
                const points = currentCoords.map(coord => turf.point(coord));
                const pointCollection = turf.featureCollection(points);
                const hull = (turf as any).convexHull(pointCollection);
                
                if (hull && hull.geometry.type === 'Polygon') {
                  const area = turf.area(hull);
                  
                  // Only include significant water bodies (>50,000 sq meters)
                  if (area > 50000) {
                    coastlineWaterBodies.push(hull as Feature<Polygon>);
                    console.log(`Created water body from coastline group ${index}, area: ${Math.round(area)} sq meters`);
                  }
                }
              } catch (hullErr) {
                console.warn(`Could not create convex hull for coastline group ${index}:`, hullErr);
              }
            }
          } catch (err) {
            console.warn(`Error processing coastline group ${index}:`, err);
          }
        });
        
        // Subtract all water bodies from the total land area
        const allWaterBodies = [...explicitWaterBodies, ...coastlineWaterBodies];
        console.log(`Subtracting ${allWaterBodies.length} total water bodies from land`);
        
        allWaterBodies.forEach((waterBody, index) => {
          try {
            const difference = (turf as any).difference(totalLandArea, waterBody);
            if (difference) {
              totalLandArea = difference;
              console.log(`Subtracted water body ${index}`);
            }
          } catch (diffErr) {
            console.warn(`Could not subtract water body ${index}:`, diffErr);
          }
        });
        
        // Add the resulting land area(s)
        if (totalLandArea) {
          // Convert through unknown to avoid TypeScript geometry type conflicts
          const landFeature = totalLandArea as unknown as Feature<Polygon | MultiPolygon, { [name: string]: any }>;
          landFeature.properties = landFeature.properties || { landType: 'comprehensive', source: 'water-subtraction' };
          allLandFeatures.push(landFeature);
        }
        
      } catch (err) {
        console.warn('Comprehensive land creation failed:', err);
        
        // FALLBACK: Simple buffered coastlines
        try {
          console.log('Using simple buffer fallback');
          const allCoastlineCoords: number[][] = [];
          
          coastlines.forEach(coastline => {
            if (coastline.geometry.type === 'LineString') {
              const coords = (coastline.geometry as any).coordinates;
              allCoastlineCoords.push(...coords);
            }
          });
          
          if (allCoastlineCoords.length >= 3) {
            const points = allCoastlineCoords.map(coord => turf.point(coord));
            const pointCollection = turf.featureCollection(points);
            const hull = (turf as any).convexHull(pointCollection);
            
            if (hull && hull.geometry.type === 'Polygon') {
              // Buffer the hull slightly inward to create land
              const buffered = turf.buffer(hull, -0.001, { units: 'degrees' });
              if (buffered) {
                // Convert through unknown to avoid TypeScript geometry type conflicts
                const bufferedFeature = buffered as unknown as Feature<Polygon | MultiPolygon, { [name: string]: any }>;
                bufferedFeature.properties = { 
                  landType: 'coastline-hull-buffered',
                  source: 'fallback-buffer'
                };
                allLandFeatures.push(bufferedFeature);
              }
            }
          }
        } catch (fallbackErr) {
          console.warn('Fallback buffer approach also failed:', fallbackErr);
        }
      }

      console.log(`Created ${allLandFeatures.length} land features from coastlines`);
      
      return {
        type: 'FeatureCollection' as const,
        features: allLandFeatures
      };
      
    } catch (error) {
      console.error('Error creating land from coastlines:', error);
      return { type: 'FeatureCollection' as const, features: [] };
    }
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    let mapInstance: maplibregl.Map | null = null;
    let cleanedUp = false;

    const initializeMap = async () => {
      const baseStyle = {
        version: 8 as const,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background' as const,
            paint: { 'background-color': '#D3D3D3' } // Light gray background
          }
        ]
      };

      mapInstance = new maplibregl.Map({
        container: mapRef.current!,
        style: baseStyle,
        center: [-73.9712, 40.7831],
        zoom: 12
      });

      const nycBounds: maplibregl.LngLatBoundsLike = [
        [-74.25909, 40.477399],
        [-73.700272, 40.917577]
      ];
      mapInstance.setMaxBounds(nycBounds);

      mapInstance.on('load', async () => {
        if (cleanedUp) return;
        setMapLoaded(true);

        const geoData = await loadGeoJSONData();
        if (!geoData || !geoData.features.length) {
          console.warn('No GeoJSON features loaded.');
          return;
        }

        // Fit map to data
        try {
          const dataBbox = turf.bbox(geoData) as [number, number, number, number];
          if (dataBbox[0] !== dataBbox[2] && dataBbox[1] !== dataBbox[3]) {
            mapInstance!.fitBounds(dataBbox, { padding: 100, duration: 1000 });
          }
        } catch (err) {
          console.warn('Could not calculate bbox:', err);
        }

        // Main data source
        mapInstance!.addSource('geojson-data', {
          type: 'geojson',
          data: geoData
        });

        // Fallback layers from main data (parks, coastlines, etc.)
        mapInstance!.addLayer({
          id: 'parks',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'leisure', 'park'] as any,
          paint: {
            'fill-color': '#4CAF50',
            'fill-opacity': 0.8
          }
        });

        mapInstance!.addLayer({
          id: 'coastlines',
          type: 'line',
          source: 'geojson-data',
          filter: ['==', 'natural', 'coastline'] as any,
          paint: {
            'line-color': '#1976D2',
            'line-width': 2
          }
        });

        mapInstance!.addLayer({
          id: 'buildings',
          type: 'fill',
          source: 'geojson-data',
          filter: ['has', 'building'] as any,
          paint: {
            'fill-color': '#BDBDBD',
            'fill-opacity': 0.7
          }
        });
      });

      mapInstance.on('error', e => {
        console.error('Map error:', e.error);
      });

      setMap(mapInstance);
    };

    initializeMap();

    return () => {
      cleanedUp = true;
      if (mapInstance) {
        mapInstance.remove();
      }
      setMap(null);
    };
  }, [loadGeoJSONData]);

  // Load geographic data on mount
  useEffect(() => {
    loadGeographicData();
  }, [loadGeographicData]);

  // Add or update geographic sources/layers when data arrives
  useEffect(() => {
    if (!mapLoaded || !map) return;

    const addOrUpdate = (
      sourceId: string,
      data: FeatureCollection | null,
      layer: any
    ) => {
      if (!data) return;
      const existing = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(data as any);
        if (!map.getLayer(layer.id)) {
          map.addLayer(layer);
        }
      } else {
        map.addSource(sourceId, { type: 'geojson', data });
        if (!map.getLayer(layer.id)) {
          map.addLayer(layer);
        }
      }
    };

    // Add land areas with enhanced color coding for cemeteries and parks
    addOrUpdate('land-data', landData, {
      id: 'land-areas',
      type: 'fill',
      source: 'land-data',
      paint: { 
        'fill-color': [
          'case',
          
          // Cemetery colors (darker green) - Name-based detection only
          ['any',
            ['in', 'green-wood', ['downcase', ['coalesce', ['get', 'name'], '']]],
            ['in', 'greenwood', ['downcase', ['coalesce', ['get', 'name'], '']]],
            ['in', 'calvary', ['downcase', ['coalesce', ['get', 'name'], '']]],
            ['in', 'woodlawn', ['downcase', ['coalesce', ['get', 'name'], '']]],
            ['in', 'cemetery', ['downcase', ['coalesce', ['get', 'name'], '']]],
            ['in', 'evergreens', ['downcase', ['coalesce', ['get', 'name'], '']]],
            ['in', 'cypress', ['downcase', ['coalesce', ['get', 'name'], '']]]
          ], '#2E7D32', // Dark green for cemeteries
          
          // Park colors (bright green) - using leisure property we have
          ['==', ['get', 'leisure'], 'park'], '#4CAF50',
          ['==', ['get', 'leisure'], 'garden'], '#4CAF50',
          ['==', ['get', 'leisure'], 'playground'], '#4CAF50',
          ['==', ['get', 'leisure'], 'golf_course'], '#4CAF50',
          
          // Natural vegetation (forest green) - using natural property we have
          ['==', ['get', 'natural'], 'wood'], '#388E3C',
          ['==', ['get', 'natural'], 'forest'], '#388E3C',
          
          // Famous parks by name (bright green)
          ['any',
            ['in', 'central park', ['downcase', ['coalesce', ['get', 'name'], '']]],
            ['in', 'prospect park', ['downcase', ['coalesce', ['get', 'name'], '']]],
            ['in', 'battery park', ['downcase', ['coalesce', ['get', 'name'], '']]],
            ['in', 'bryant park', ['downcase', ['coalesce', ['get', 'name'], '']]]
          ], '#4CAF50',
          
          '#E8F5E8' // Very light green for all other land
        ],
        'fill-opacity': 0.9 
      }
    } as any);

    // Add water bodies with enhanced styling
    addOrUpdate('water-data', waterData, {
      id: 'water-bodies',
      type: 'fill',
      source: 'water-data',
      paint: { 
        'fill-color': [
          'case',
          // Darker blue for major water bodies
          ['any',
            ['in', 'bay', ['downcase', ['coalesce', ['get', 'name'], '']]],
            ['in', 'kill', ['downcase', ['coalesce', ['get', 'name'], '']]],
            ['in', 'sound', ['downcase', ['coalesce', ['get', 'name'], '']]],
            ['in', 'river', ['downcase', ['coalesce', ['get', 'name'], '']]],
            ['==', ['get', 'waterType'], 'major_body']
          ], '#1565C0', // Dark blue for major water bodies
          
          // Medium blue for other water
          '#4A90E2'
        ],
        'fill-opacity': 0.85
      },
      layout: {
        // Ensure layer is visible
        'visibility': 'visible'
      }
    } as any);

    // Add water body borders for better definition
    addOrUpdate('water-data', waterData, {
      id: 'water-bodies-border',
      type: 'line', 
      source: 'water-data',
      paint: {
        'line-color': '#0D47A1', // Very dark blue border
        'line-width': [
          'case',
          ['any',
            ['in', 'bay', ['downcase', ['coalesce', ['get', 'name'], '']]],
            ['in', 'kill', ['downcase', ['coalesce', ['get', 'name'], '']]],
            ['==', ['get', 'waterType'], 'major_body']
          ], 2, // Thicker border for major water bodies
          1    // Thinner border for smaller water bodies
        ],
        'line-opacity': 0.8
      }
    } as any);

    // Add roads
    addOrUpdate('roads-data', roadsData, {
      id: 'roads',
      type: 'line',
      source: 'roads-data',
      paint: { 
        'line-color': '#666666', 
        'line-width': 1.5 
      }
    } as any);

    // Ensure businesses layer stays on top
    if (map.getLayer('businesses-layer')) {
      map.moveLayer('businesses-layer');
    }
  }, [mapLoaded, map, landData, waterData, roadsData]);

  // Add business markers to the map
  useEffect(() => {
    if (!mapLoaded || !businesses || !map) return;

    // Remove existing business markers
    const existingMarkers = map.getSource('businesses');
    if (existingMarkers) {
      map.removeLayer('businesses-layer');
      map.removeSource('businesses');
    }

    // Create GeoJSON from businesses
    const businessFeatures = businesses.map(business => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [business.position.lng, business.position.lat]
      },
      properties: {
        id: business.id,
        name: business.name,
        businessType: business.businessType || 'unknown'
      }
    }));

    const businessFC = {
      type: 'FeatureCollection' as const,
      features: businessFeatures
    };

    // Add business source and layer
    map.addSource('businesses', {
      type: 'geojson',
      data: businessFC
    });

    map.addLayer({
      id: 'businesses-layer',
      type: 'circle',
      source: 'businesses',
      paint: {
        'circle-radius': 8,
        'circle-color': '#FACC15',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#FFFFFF'
      }
    });

    // Add click handler for businesses
    if (onBusinessClick) {
      map.on('click', 'businesses-layer', (e) => {
        if (e.features && e.features[0]) {
          const businessId = e.features[0].properties?.id;
          const business = businesses.find(b => b.id === businessId);
          if (business) {
            map.flyTo({
              center: [business.position.lng, business.position.lat],
              zoom: 16,
              duration: 800,
              essential: true
            });
            onBusinessClick(business);
          }
        }
      });
    }

    // Change cursor on hover
    map.on('mouseenter', 'businesses-layer', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'businesses-layer', () => {
      map.getCanvas().style.cursor = '';
    });

  }, [mapLoaded, businesses, onBusinessClick]);

  // Handle selected business highlighting
  useEffect(() => {
    if (!mapLoaded || !map) return;

    if (map.getLayer('businesses-layer')) {
      if (selectedBusiness) {
        map.setPaintProperty('businesses-layer', 'circle-color', [
          'case',
          ['==', ['get', 'id'], selectedBusiness.id],
          '#EF4444',
          '#FACC15'
        ]);
      } else {
        map.setPaintProperty('businesses-layer', 'circle-color', '#FACC15');
      }
    }
  }, [mapLoaded, selectedBusiness]);

  return (
    <div
      ref={mapRef}
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
    />
  );
};

export default MapLibreMap;