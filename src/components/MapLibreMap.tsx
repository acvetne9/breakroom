import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapLibreMapProps {
  businesses: any[];
  onBusinessClick: (business: any) => void;
  selectedBusiness: any;
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({
  businesses,
  onBusinessClick,
  selectedBusiness
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);

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

  const createLandFromCoastlinesAndWater = useCallback((geoData: FeatureCollection): FeatureCollection => {
    try {
      const allLandFeatures: any[] = [];
      
      // APPROACH 1: Create polygons from coastlines
      const coastlines = geoData.features.filter(feature => 
        feature.geometry.type === 'LineString' &&
        feature.properties?.natural === 'coastline'
      );

      console.log(`Found ${coastlines.length} coastline features`);

      for (const coastline of coastlines) {
        try {
          if (coastline.geometry.type !== 'LineString') continue;
          const coords = coastline.geometry.coordinates;
          if (coords.length < 3) continue;
          
          // Check if coastline forms a closed loop or can be closed
          const firstPoint = coords[0];
          const lastPoint = coords[coords.length - 1];
          const isAlreadyClosed = firstPoint[0] === lastPoint[0] && firstPoint[1] === lastPoint[1];
          
          // Only try to create polygon if we have enough points
          if (coords.length >= 4 || (coords.length >= 3 && !isAlreadyClosed)) {
            const closedCoords = isAlreadyClosed ? coords : [...coords, firstPoint];
            
            // Validate that we have a valid polygon (at least 4 points including closure)
            if (closedCoords.length >= 4) {
              const polygon = turf.polygon([closedCoords]);
              
              // Check if polygon is valid (has area)
              const area = turf.area(polygon);
              if (area > 1000) { // Only include polygons with significant area (>1000 sq meters)
                allLandFeatures.push({
                  ...polygon,
                  properties: { 
                    landType: 'coastline-derived',
                    area: area,
                    source: 'coastline'
                  }
                });
              }
            }
          }
        } catch (err) {
          console.warn('Could not create polygon from coastline:', err);
        }
      }

      // APPROACH 2: Create land by subtracting water bodies from bounding box
      try {
        // Get all explicit water polygon features
        const waterPolygons = geoData.features.filter(feature => {
          const props = feature.properties;
          if (!props) return false;
          
          return (
            // Natural water bodies
            props.natural === 'water' ||
            
            // Waterways - riverbanks (polygonal)
            props.waterway === 'riverbank' ||
            
            // Named major water bodies around NYC
            (props.name && [
              'Upper New York Bay', 'Lower New York Bay', 'Newark Bay', 'Jamaica Bay',
              'Long Island Sound', 'Hudson River', 'East River', 'Harlem River',
              'Arthur Kill', 'Kill Van Kull', 'Raritan Bay', 'Sheepshead Bay',
              'Rockaway Inlet'
            ].some(waterName => props.name.includes(waterName))) ||
            
            // Additional water-related landuse
            props.landuse === 'reservoir' ||
            props.landuse === 'basin' ||
            
            // Water-related leisure
            props.leisure === 'marina' ||
            
            // Additional natural water features
            props.natural === 'bay' ||
            props.natural === 'strait' ||
            
            // Place types that are water
            (props.place && ['sea', 'ocean', 'bay'].includes(props.place))
          ) && 
          // Only include polygonal water features for subtraction
          (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon');
        });

        console.log(`Found ${waterPolygons.length} explicit water polygons`);
        
        // Get linear water features for buffering
        const linearWaterFeatures = geoData.features.filter(feature => {
          const props = feature.properties;
          return props && 
            feature.geometry.type === 'LineString' &&
            (props.waterway && ['river', 'stream', 'canal'].includes(props.waterway));
        });
        
        console.log(`Found ${linearWaterFeatures.length} linear water features`);

        // Get coastlines - these define the boundary between land and major water bodies
        const coastlines = geoData.features.filter(feature => 
          feature.geometry.type === 'LineString' &&
          feature.properties?.natural === 'coastline'
        );
        
        console.log(`Found ${coastlines.length} coastline features`);

        if (waterPolygons.length > 0 || linearWaterFeatures.length > 0 || coastlines.length > 0) {
          // Create a bounding box for the NYC area (matching your query bounds)
          const bbox: [number, number, number, number] = [-74.30, 40.50, -73.70, 40.93];
          let landArea = turf.bboxPolygon(bbox);

          // STRATEGY: Assume everything is water initially, then subtract known land areas
          // This works better when you have coastlines but not explicit water polygons for bays

          // Method 1: If we have coastlines, create water polygons by buffering the entire area
          // and then subtracting small land polygons created from coastlines
          if (coastlines.length > 0) {
            try {
              // Create a large water area (the entire bounding box)
              let waterArea = turf.bboxPolygon(bbox);
              
              // Try to create small land islands from closed coastline loops
              for (const coastline of coastlines) {
                try {
                  const coords = coastline.geometry.coordinates;
                  if (coords.length < 4) continue;
                  
                  // Check if this coastline segment might form a closed area
                  const firstPoint = coords[0];
                  const lastPoint = coords[coords.length - 1];
                  const distance = turf.distance(firstPoint, lastPoint, { units: 'kilometers' });
                  
                  // If the coastline is nearly closed (endpoints are close), make it a land polygon
                  if (distance < 0.5) { // Within 500m
                    const closedCoords = [...coords, firstPoint];
                    if (closedCoords.length >= 4) {
                      const landPolygon = turf.polygon([closedCoords]);
                      const area = turf.area(landPolygon);
                      
                      // Only subtract significant land areas (greater than 100,000 sq meters)
                      if (area > 100000) {
                        const difference = turf.difference(waterArea, landPolygon);
                        if (difference) {
                          waterArea = difference;
                        }
                      }
                    }
                  }
                } catch (err) {
                  // Continue with other coastlines
                }
              }
              
              // The remaining area after subtracting land is our comprehensive water body
              if (waterArea) {
                // Now subtract this comprehensive water area from our land area
                const difference = turf.difference(landArea as any, waterArea as any);
                if (difference) {
                  landArea = difference;
                }
              }
            } catch (err) {
              console.warn('Could not process coastlines for comprehensive water:', err);
            }
          }

          // Method 2: Buffer linear water features and subtract them
          for (const linearWater of linearWaterFeatures) {
            try {
              if (linearWater.geometry.type !== 'LineString') continue;
              const bufferedWater = turf.buffer(linearWater, 0.0005, { units: 'degrees' }); // ~50m buffer
              if (bufferedWater) {
                const difference = turf.difference(landArea as any, bufferedWater as any);
                if (difference) {
                  landArea = difference as any;
                }
              }
            } catch (err) {
              console.warn('Could not buffer and subtract linear water feature:', err);
            }
          }

          // Method 3: Subtract explicit polygonal water bodies
          for (const waterFeature of waterPolygons) {
            try {
              const difference = turf.difference(landArea as any, waterFeature as any);
              if (difference) {
                landArea = difference as any;
              }
            } catch (err) {
              console.warn('Could not subtract water body:', err);
            }
          }

          // Add the resulting land mass
          if (landArea) {
            allLandFeatures.push({
              ...landArea,
              properties: { 
                landType: 'water-inverse',
                source: 'comprehensive-water-subtraction',
                waterFeaturesProcessed: waterPolygons.length + linearWaterFeatures.length,
                coastlinesProcessed: coastlines.length
              }
            } as any);
          }
        }
      } catch (err) {
        console.warn('Could not create land from water subtraction:', err);
      }

      // APPROACH 3: Fallback - create buffer around coastlines if other methods didn't work well
      if (allLandFeatures.length === 0 && coastlines.length > 0) {
        try {
          console.log('Using fallback buffer approach');
          const coastlineCollection = turf.featureCollection(coastlines);
          const buffered = turf.buffer(coastlineCollection, 0.002, { units: 'degrees' });
          
          if (buffered) {
            allLandFeatures.push({
              ...buffered,
              properties: { 
                landType: 'coastline-buffered',
                source: 'buffer-fallback'
              }
            });
          }
        } catch (err) {
          console.warn('Buffer fallback also failed:', err);
        }
      }

      console.log(`Created ${allLandFeatures.length} land features`);
      
      return {
        type: 'FeatureCollection',
        features: allLandFeatures
      };
      
    } catch (error) {
      console.error('Error creating land from coastlines and water:', error);
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
            paint: { 'background-color': '#2196F3' } // Blue background for water
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

        // Create land polygons from coastlines and water bodies
        const landPolygons = createLandFromCoastlinesAndWater(geoData);
        mapInstance!.addSource('land-polygons', {
          type: 'geojson',
          data: landPolygons
        });

        // --- LAND AREAS (light gray) - created from water subtraction
        mapInstance!.addLayer({
          id: 'land-areas',
          type: 'fill',
          source: 'land-polygons',
          paint: {
            'fill-color': '#E0E0E0', // Light gray land
            'fill-opacity': 0.9
          }
        });

        // --- COASTLINES (to show land/water boundaries)
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

        // --- SPECIFIC WATER FEATURES (blue overlays)
        mapInstance!.addLayer({
          id: 'water-bodies',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'natural', 'water'] as any,
          paint: {
            'fill-color': '#2196F3',
            'fill-opacity': 0.9
          }
        });

        mapInstance!.addLayer({
          id: 'rivers-poly',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'waterway', 'riverbank'] as any,
          paint: {
            'fill-color': '#2196F3',
            'fill-opacity': 0.9
          }
        });

        // --- PARKS (green overlay on land)
        mapInstance!.addLayer({
          id: 'parks',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'leisure', 'park'] as any,
          paint: {
            'fill-color': '#4CAF50',
            'fill-opacity': 0.7
          }
        });

        // --- ROADS (gray infrastructure)
        mapInstance!.addLayer({
          id: 'roads',
          type: 'line',
          source: 'geojson-data',
          filter: ['has', 'highway'] as any,
          paint: {
            'line-color': '#424242',
            'line-width': [
              'match',
              ['get', 'highway'],
              'motorway', 3,
              'trunk', 2.5,
              'primary', 2,
              'secondary', 1.5,
              1
            ]
          }
        });

        // --- RIVERS (blue lines)
        mapInstance!.addLayer({
          id: 'rivers',
          type: 'line',
          source: 'geojson-data',
          filter: ['==', 'waterway', 'river'] as any,
          paint: {
            'line-color': '#2196F3',
            'line-width': 3
          }
        });

        // --- CANALS (blue lines)
        mapInstance!.addLayer({
          id: 'canals',
          type: 'line',
          source: 'geojson-data',
          filter: ['==', 'waterway', 'canal'] as any,
          paint: {
            'line-color': '#2196F3',
            'line-width': 2
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
  }, [loadGeoJSONData, createLandFromCoastlinesAndWater]);

  return (
    <div
      ref={mapRef}
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
    />
  );
};

export default MapLibreMap;