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
        
        // IMPROVED LAND DETECTION - Much more comprehensive
        const landFeatures = mainData.features.filter(feature => {
          const props = feature.properties;
          if (!props || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
          
          return (
            // Landuse categories
            props.landuse === 'residential' ||
            props.landuse === 'commercial' ||
            props.landuse === 'industrial' ||
            props.landuse === 'retail' ||
            props.landuse === 'institutional' ||
            props.landuse === 'education' ||
            props.landuse === 'recreation_ground' ||
            props.landuse === 'cemetery' ||
            props.landuse === 'construction' ||
            props.landuse === 'brownfield' ||
            props.landuse === 'greenfield' ||
            
            // Natural land areas
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
            
            // Leisure areas (parks, etc.)
            props.leisure === 'park' ||
            props.leisure === 'playground' ||
            props.leisure === 'pitch' ||
            props.leisure === 'garden' ||
            props.leisure === 'golf_course' ||
            props.leisure === 'recreation_ground' ||
            props.leisure === 'stadium' ||
            props.leisure === 'sports_centre' ||
            
            // Amenities that represent land
            props.amenity === 'university' ||
            props.amenity === 'school' ||
            props.amenity === 'hospital' ||
            props.amenity === 'parking' ||
            
            // Transportation that represents solid ground
            props.aeroway === 'aerodrome' ||
            props.aeroway === 'runway' ||
            props.aeroway === 'taxiway' ||
            
            // Buildings (if polygonal)
            props.building ||
            
            // Administrative boundaries (often represent land areas)
            (props.admin_level && feature.geometry.type === 'Polygon') ||
            
            // Places that are typically land
            (props.place && ['city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood', 'island'].includes(props.place)) ||
            
            // Military areas
            props.military ||
            
            // Tourism areas
            props.tourism === 'camp_site' ||
            props.tourism === 'caravan_site' ||
            
            // Historic areas
            props.historic ||
            
            // Explicit land designation
            props.natural === 'land'
          );
        }) as Feature<Polygon | MultiPolygon, { [name: string]: any }>[];
        
        // IMPROVED WATER DETECTION
        const waterFeatures = mainData.features.filter(feature => {
          const props = feature.properties;
          if (!props || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
          
          return (
            // Natural water bodies
            props.natural === 'water' ||
            props.natural === 'bay' ||
            props.natural === 'strait' ||
            
            // Waterways - riverbanks (polygonal)
            props.waterway === 'riverbank' ||
            props.waterway === 'dock' ||
            
            // Named major water bodies
            (props.name && [
              'Upper New York Bay', 'Lower New York Bay', 'Newark Bay', 'Jamaica Bay',
              'Long Island Sound', 'Hudson River', 'East River', 'Harlem River',
              'Arthur Kill', 'Kill Van Kull', 'Raritan Bay', 'Sheepshead Bay',
              'Rockaway Inlet', 'Gowanus Canal', 'Newtown Creek'
            ].some(waterName => props.name && props.name.includes(waterName))) ||
            
            // Water-related landuse
            props.landuse === 'reservoir' ||
            props.landuse === 'basin' ||
            props.landuse === 'salt_pond' ||
            
            // Water-related leisure
            props.leisure === 'marina' ||
            props.leisure === 'swimming_pool' ||
            
            // Place types that are water
            (props.place && ['sea', 'ocean', 'bay'].includes(props.place))
          );
        }) as Feature<Polygon | MultiPolygon, { [name: string]: any }>[];
        
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
          type: 'FeatureCollection',
          features: landFeatures
        });
        
        setWaterData({
          type: 'FeatureCollection', 
          features: waterFeatures
        });
      }
    } catch (error) {
      console.error('Error loading geographic data:', error);
    }
  }, [loadGeoJSONData]);

  // SIMPLIFIED coastline-to-land conversion
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
          type: 'FeatureCollection',
          features: allLandFeatures
        };
      }

      // Try to create polygons from coastlines that are nearly closed
      coastlines.forEach((coastline, index) => {
        try {
          if (coastline.geometry.type !== 'LineString') return;
          
          const lineGeometry = coastline.geometry as any;
          const coords = lineGeometry.coordinates;
          if (!coords || coords.length < 4) return;
          
          const firstPoint = coords[0];
          const lastPoint = coords[coords.length - 1];
          const distance = turf.distance(firstPoint, lastPoint, { units: 'kilometers' });
          
          // If endpoints are close (within 1km), try to close the polygon
          if (distance < 1.0) {
            const closedCoords = [...coords, firstPoint];
            
            if (closedCoords.length >= 4) {
              try {
                const polygon = turf.polygon([closedCoords]);
                const area = turf.area(polygon);
                
                // Only include significant areas (>10,000 sq meters)
                if (area > 10000) {
                  allLandFeatures.push({
                    ...polygon,
                    properties: { 
                      landType: 'coastline-polygon',
                      area: area,
                      source: 'coastline-' + index
                    }
                  } as Feature<Polygon, { [name: string]: any }>);
                  console.log(`Created land polygon from coastline ${index}, area: ${Math.round(area)} sq meters`);
                }
              } catch (polyErr) {
                console.warn(`Could not create polygon from coastline ${index}:`, polyErr);
              }
            }
          }
        } catch (err) {
          console.warn(`Error processing coastline ${index}:`, err);
        }
      });

      console.log(`Created ${allLandFeatures.length} land features from coastlines`);
      
      return {
        type: 'FeatureCollection',
        features: allLandFeatures
      };
      
    } catch (error) {
      console.error('Error creating land from coastlines:', error);
      return { type: 'FeatureCollection', features: [] };
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
            paint: { 'background-color': '#87CEEB' } // Light blue background for water
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

    // Add land areas (green color for land)
    addOrUpdate('land-data', landData, {
      id: 'land-areas',
      type: 'fill',
      source: 'land-data',
      paint: { 
        'fill-color': [
          'case',
          ['==', ['get', 'landuse'], 'cemetery'], '#228B22', // Forest green for cemeteries
          '#90EE90' // Light green for all other land
        ],
        'fill-opacity': 0.9 
      }
    } as any);

    // Add water bodies (blue)
    addOrUpdate('water-data', waterData, {
      id: 'water-bodies',
      type: 'fill',
      source: 'water-data',
      paint: { 
        'fill-color': '#4A90E2', // Darker blue for water
        'fill-opacity': 0.8 
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