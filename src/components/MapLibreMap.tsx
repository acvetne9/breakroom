import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { FeatureCollection, Polygon, Feature } from 'geojson';
import { bbox } from '@turf/turf';
import maplibregl from 'maplibre-gl';
import Supercluster from 'supercluster';
import * as turf from '@turf/turf';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapLibreMapProps {
  onMapLoad?: (map: maplibregl.Map) => void;
  businesses?: Array<{
    id: string;
    name: string;
    position: { lat: number; lng: number };
    atmosphere: string[];
    salary?: string;
  }>;
  onBusinessClick?: (business: any) => void;
  selectedBusiness?: { position: { lat: number; lng: number } } | null;
}

// NYC Borough coordinates - approximate boundaries
const createNYCMask = (): FeatureCollection<Polygon> => {
  // This creates an inverted mask - everything OUTSIDE NYC will be covered
  const worldBounds = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85]
  ];

  // Approximate NYC boundary (simplified)
  const nycBoundary = [
    [-74.2557, 40.4960], // Southwest corner
    [-73.7004, 40.4960], // Southeast corner
    [-73.7004, 40.9152], // Northeast corner
    [-74.2557, 40.9152], // Northwest corner
    [-74.2557, 40.4960]  // Close the polygon
  ];

  // Create a polygon with a hole (world minus NYC)
  const maskPolygon: Feature<Polygon> = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        worldBounds, // Outer ring (world)
        nycBoundary  // Inner ring (hole for NYC)
      ]
    },
    properties: {
      name: 'non-nyc-mask'
    }
  };

  return {
    type: 'FeatureCollection',
    features: [maskPolygon]
  };
};

// Enhanced road processing function that buffers line geometries into polygons
const processRoadGeometry = (geojsonData: any): FeatureCollection<Polygon> => {
  console.log('Processing road geometry - buffering all lines into gray polygons...');
  
  if (!geojsonData?.features) {
    console.warn('No features found in GeoJSON data');
    return { type: 'FeatureCollection', features: [] };
  }

  const bufferedFeatures: Feature<Polygon>[] = [];
  
  geojsonData.features.forEach((feature: any, index: number) => {
    try {
      const geomType = feature.geometry?.type;
      
      // Process LineString and MultiLineString geometries
      if (geomType === 'LineString' || geomType === 'MultiLineString') {
        console.log(`Buffering ${geomType} feature ${index}`);
        
        // Determine buffer width based on road type (if available)
        const highway = feature.properties?.highway;
        let bufferWidth = 3; // Default width in meters
        
        switch (highway) {
          case 'motorway':
          case 'trunk':
            bufferWidth = 8;
            break;
          case 'primary':
            bufferWidth = 6;
            break;
          case 'secondary':
            bufferWidth = 5;
            break;
          case 'tertiary':
            bufferWidth = 4;
            break;
          case 'residential':
          case 'service':
            bufferWidth = 3;
            break;
          case 'footway':
          case 'path':
            bufferWidth = 1.5;
            break;
          default:
            bufferWidth = 3;
        }
        
        const buffered = turf.buffer(feature, bufferWidth, { units: 'meters' });
        
        if (buffered && buffered.geometry) {
          // Handle both Polygon and MultiPolygon results from buffer
          if (buffered.geometry.type === 'Polygon') {
            bufferedFeatures.push({
              type: 'Feature',
              geometry: buffered.geometry as Polygon,
              properties: {
                name: feature.properties?.name || '',
                highway: feature.properties?.highway || '',
                original_type: geomType,
                buffered: true
              }
            });
          } else if (buffered.geometry.type === 'MultiPolygon') {
            // Convert MultiPolygon to multiple Polygon features
            buffered.geometry.coordinates.forEach((polygonCoords: any, polyIndex: number) => {
              bufferedFeatures.push({
                type: 'Feature',
                geometry: {
                  type: 'Polygon',
                  coordinates: polygonCoords
                },
                properties: {
                  name: feature.properties?.name || '',
                  highway: feature.properties?.highway || '',
                  original_type: geomType,
                  buffered: true,
                  multi_part: polyIndex
                }
              });
            });
          }
        }
      }
      // Also include existing polygon features if any
      else if (geomType === 'Polygon') {
        console.log(`Including existing polygon feature ${index}`);
        bufferedFeatures.push({
          type: 'Feature',
          geometry: feature.geometry,
          properties: {
            ...feature.properties,
            original_type: geomType,
            buffered: false
          }
        });
      }
      else if (geomType === 'MultiPolygon') {
        console.log(`Converting MultiPolygon feature ${index} to individual polygons`);
        feature.geometry.coordinates.forEach((polygonCoords: any, polyIndex: number) => {
          bufferedFeatures.push({
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: polygonCoords
            },
            properties: {
              ...feature.properties,
              original_type: geomType,
              buffered: false,
              multi_part: polyIndex
            }
          });
        });
      }
      
    } catch (err) {
      console.warn(`Buffer failed for feature ${index}:`, err);
    }
  });

  console.log(`Processed ${geojsonData.features.length} input features into ${bufferedFeatures.length} polygon features`);
  
  return {
    type: 'FeatureCollection',
    features: bufferedFeatures
  };
};

// Process parks and green spaces with more comprehensive detection
const processParksGeometry = (geojsonData: any): FeatureCollection<Polygon> => {
  console.log('Processing parks and green spaces...');
  
  if (!geojsonData?.features) {
    console.warn('No park features found in GeoJSON data');
    return { type: 'FeatureCollection', features: [] };
  }

  const parkFeatures: Feature<Polygon>[] = [];
  
  geojsonData.features.forEach((feature: any, index: number) => {
    try {
      const geomType = feature.geometry?.type;
      const leisure = feature.properties?.leisure;
      const landuse = feature.properties?.landuse;
      const natural = feature.properties?.natural;
      const amenity = feature.properties?.amenity;
      
      // More comprehensive park detection
      const isPark = leisure === 'park' || 
                     leisure === 'garden' ||
                     leisure === 'golf_course' ||
                     leisure === 'pitch' ||
                     leisure === 'playground' ||
                     landuse === 'forest' || 
                     landuse === 'grass' || 
                     landuse === 'meadow' ||
                     landuse === 'recreation_ground' ||
                     landuse === 'village_green' ||
                     natural === 'wood' ||
                     natural === 'grassland' ||
                     natural === 'scrub' ||
                     amenity === 'grave_yard' ||
                     feature.properties?.name?.toLowerCase().includes('park') ||
                     feature.properties?.name?.toLowerCase().includes('garden') ||
                     feature.properties?.name?.toLowerCase().includes('green');
      
      if (isPark) {
        console.log(`Found park feature ${index}: ${leisure || landuse || natural || 'unnamed'}`);
        
        if (geomType === 'Polygon') {
          parkFeatures.push({
            type: 'Feature',
            geometry: feature.geometry,
            properties: {
              ...feature.properties,
              feature_type: 'park'
            }
          });
        } else if (geomType === 'MultiPolygon') {
          feature.geometry.coordinates.forEach((polygonCoords: any, polyIndex: number) => {
            parkFeatures.push({
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: polygonCoords
              },
              properties: {
                ...feature.properties,
                feature_type: 'park',
                multi_part: polyIndex
              }
            });
          });
        }
      }
    } catch (err) {
      console.warn(`Processing failed for park feature ${index}:`, err);
    }
  });

  console.log(`Processed ${parkFeatures.length} park features`);
  
  return {
    type: 'FeatureCollection',
    features: parkFeatures
  };
};

// Process water features with more comprehensive detection
const processWaterGeometry = (geojsonData: any): FeatureCollection<Polygon> => {
  console.log('Processing water features...');
  
  if (!geojsonData?.features) {
    console.warn('No water features found in GeoJSON data');
    return { type: 'FeatureCollection', features: [] };
  }

  const waterFeatures: Feature<Polygon>[] = [];
  
  geojsonData.features.forEach((feature: any, index: number) => {
    try {
      const geomType = feature.geometry?.type;
      const natural = feature.properties?.natural;
      const waterway = feature.properties?.waterway;
      const landuse = feature.properties?.landuse;
      const water = feature.properties?.water;
      
      // More comprehensive water feature detection
      const isWater = natural === 'water' || 
                      natural === 'coastline' ||
                      waterway === 'river' || 
                      waterway === 'stream' ||
                      waterway === 'canal' ||
                      waterway === 'dock' ||
                      landuse === 'reservoir' ||
                      landuse === 'basin' ||
                      water === 'lake' ||
                      water === 'pond' ||
                      water === 'river' ||
                      feature.properties?.place === 'sea' ||
                      feature.properties?.name?.toLowerCase().includes('river') ||
                      feature.properties?.name?.toLowerCase().includes('lake') ||
                      feature.properties?.name?.toLowerCase().includes('pond');
      
      if (isWater) {
        console.log(`Found water feature ${index}: ${natural || waterway || landuse || 'unnamed'}`);
        
        if (geomType === 'Polygon') {
          waterFeatures.push({
            type: 'Feature',
            geometry: feature.geometry,
            properties: {
              ...feature.properties,
              feature_type: 'water'
            }
          });
        } else if (geomType === 'MultiPolygon') {
          feature.geometry.coordinates.forEach((polygonCoords: any, polyIndex: number) => {
            waterFeatures.push({
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: polygonCoords
              },
              properties: {
                ...feature.properties,
                feature_type: 'water',
                multi_part: polyIndex
              }
            });
          });
        } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
          // Buffer water lines (rivers, streams) to create polygons
          let bufferWidth = 5; // Default 5m buffer
          
          // Adjust buffer width based on waterway type
          if (waterway === 'river') bufferWidth = 10;
          else if (waterway === 'canal') bufferWidth = 8;
          else if (waterway === 'stream') bufferWidth = 3;
          
          const buffered = turf.buffer(feature, bufferWidth, { units: 'meters' });
          
          if (buffered && buffered.geometry) {
            if (buffered.geometry.type === 'Polygon') {
              waterFeatures.push({
                type: 'Feature',
                geometry: buffered.geometry as Polygon,
                properties: {
                  ...feature.properties,
                  feature_type: 'water',
                  buffered: true
                }
              });
            } else if (buffered.geometry.type === 'MultiPolygon') {
              buffered.geometry.coordinates.forEach((polygonCoords: any, polyIndex: number) => {
                waterFeatures.push({
                  type: 'Feature',
                  geometry: {
                    type: 'Polygon',
                    coordinates: polygonCoords
                  },
                  properties: {
                    ...feature.properties,
                    feature_type: 'water',
                    buffered: true,
                    multi_part: polyIndex
                  }
                });
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn(`Processing failed for water feature ${index}:`, err);
    }
  });

  console.log(`Processed ${waterFeatures.length} water features`);
  
  return {
    type: 'FeatureCollection',
    features: waterFeatures
  };
};

const MapLibreMap: React.FC<MapLibreMapProps> = ({ 
  onMapLoad, 
  businesses = [], 
  onBusinessClick, 
  selectedBusiness
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [markers, setMarkers] = useState<maplibregl.Marker[]>([]);
  const [currentZoom, setCurrentZoom] = useState<number>(14);
  const clusterRef = useRef<Supercluster | null>(null);
  
  const MARKER_VISIBILITY_ZOOM_THRESHOLD = 13;

  // Optimized function to load GeoJSON data
  const loadGeoJSONData = useCallback(async (filename: string): Promise<any> => {
    try {
      console.log(`Loading GeoJSON data from ${filename}...`);
      
      const response = await fetch(`/data/${filename}`, {
        headers: {
          'Accept': 'application/json, application/gzip, */*'
        }
      });
      
      if (!response.ok) {
        console.warn(`Failed to load GeoJSON ${filename}:`, response.statusText);
        return null; // Return null instead of throwing to continue with other data
      }
      
      // Simple decompression for .gz files
      const text = await response.text();
      
      // Check if it's already JSON
      if (text.trim().startsWith('{')) {
        return JSON.parse(text);
      }
      
      // Handle gzipped content
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes[0] === 0x1f && bytes[1] === 0x8b && 'DecompressionStream' in window) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          }
        });
        
        const decompressedStream = stream.pipeThrough(new (window as any).DecompressionStream('gzip'));
        const decompressedResponse = new Response(decompressedStream);
        const decompressedText = await decompressedResponse.text();
        return JSON.parse(decompressedText);
      }
      
      return null;
    } catch (error) {
      console.warn(`Error loading GeoJSON ${filename}:`, error);
      return null; // Return null to continue with other data
    }
  }, []);

  // Initialize map with roads, parks, and water
  useEffect(() => {
    if (!mapRef.current) return;
    
    console.log('MapLibre: Initializing map with roads, parks, and water features...');
    let mapInstance: maplibregl.Map | null = null;
    let isCleanedUp = false;

    const initializeMap = async () => {
      try {
        console.log('=== MAP INITIALIZATION START ===');
        
        // Create a map with a light base color for non-covered areas
        console.log('Creating map with light base...');
        mapInstance = new maplibregl.Map({
          container: mapRef.current!,
          style: {
            version: 8,
            sources: {},
            layers: [],
            glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf'
          },
          center: [-73.9712, 40.7831],
          zoom: 14,
          maxBounds: [
            [-74.2557, 40.4960],
            [-73.7004, 40.9152]
          ]
        });

        console.log('Basic map created, waiting for load...');

        mapInstance.on('load', async () => {
          console.log('Basic map loaded successfully!');
          
          try {
            // Add a light background for all areas first
            const nycBounds: Feature<Polygon> = {
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [[
                  [-74.2557, 40.4960],
                  [-73.7004, 40.4960],
                  [-73.7004, 40.9152],
                  [-74.2557, 40.9152],
                  [-74.2557, 40.4960]
                ]]
              },
              properties: {}
            };

            mapInstance!.addSource('background', {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: [nycBounds]
              }
            });

            mapInstance!.addLayer({
              id: 'background-fill',
              type: 'fill',
              source: 'background',
              paint: {
                'fill-color': '#f8f8f8', // Very light gray background
                'fill-opacity': 1.0
              }
            });

            // Load and process all GeoJSON data files
            console.log('Loading GeoJSON data files...');
            const [roadsData, parksData, waterData] = await Promise.all([
              loadGeoJSONData('merged_roads.geojson.gz'),
              loadGeoJSONData('merged_roads.geojson.gz'),
              loadGeoJSONData('merged_roads.geojson.gz'),
            ]);
            
            if (isCleanedUp) {
              console.log('MapLibre: Initialization cancelled due to cleanup');
              return;
            }
            
            // Process and add water features first (bottom layer)
            if (waterData) {
              console.log('Processing and adding water features...');
              const processedWaterData = processWaterGeometry(waterData);
              
              if (processedWaterData.features.length > 0) {
                mapInstance!.addSource('water-features', {
                  type: 'geojson',
                  data: processedWaterData
                });

                mapInstance!.addLayer({
                  id: 'water-fill',
                  type: 'fill',
                  source: 'water-features',
                  paint: {
                    'fill-color': '#4A90E2', // Bright blue for water
                    'fill-opacity': 0.9
                  }
                });

                mapInstance!.addLayer({
                  id: 'water-outline',
                  type: 'line',
                  source: 'water-features',
                  paint: {
                    'line-color': '#357ABD', // Darker blue outline
                    'line-width': 1,
                    'line-opacity': 0.8
                  }
                });

                console.log(`Added ${processedWaterData.features.length} water features with blue color`);
              } else {
                console.log('No water features to add');
              }
            } else {
              console.log('No water data loaded');
            }

            // Process and add parks (middle layer)
            if (parksData) {
              console.log('Processing and adding park features...');
              const processedParksData = processParksGeometry(parksData);
              
              if (processedParksData.features.length > 0) {
                mapInstance!.addSource('parks-features', {
                  type: 'geojson',
                  data: processedParksData
                });

                mapInstance!.addLayer({
                  id: 'parks-fill',
                  type: 'fill',
                  source: 'parks-features',
                  paint: {
                    'fill-color': '#4CAF50', // Bright green for parks
                    'fill-opacity': 0.9
                  }
                });

                mapInstance!.addLayer({
                  id: 'parks-outline',
                  type: 'line',
                  source: 'parks-features',
                  paint: {
                    'line-color': '#388E3C', // Darker green outline
                    'line-width': 1,
                    'line-opacity': 0.6
                  }
                });

                console.log(`Added ${processedParksData.features.length} park features with green color`);
              } else {
                console.log('No park features to add');
              }
            } else {
              console.log('No parks data loaded');
            }

            // Process and add roads (top layer)
            if (roadsData) {
              console.log('Processing and adding road features...');
              const bufferedRoadsData = processRoadGeometry(roadsData);
              
              if (bufferedRoadsData.features.length > 0) {
                mapInstance!.addSource('buffered-roads', {
                  type: 'geojson',
                  data: bufferedRoadsData
                });

                mapInstance!.addLayer({
                  id: 'buffered-roads-fill',
                  type: 'fill',
                  source: 'buffered-roads',
                  paint: {
                    'fill-color': '#666666', // Medium gray for roads
                    'fill-opacity': 0.8
                  }
                });

                mapInstance!.addLayer({
                  id: 'buffered-roads-outline',
                  type: 'line',
                  source: 'buffered-roads',
                  paint: {
                    'line-color': '#444444', // Darker gray outline
                    'line-width': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      10, 0.3,
                      15, 0.8,
                      18, 1.2
                    ],
                    'line-opacity': 0.6
                  }
                });

                console.log(`Added ${bufferedRoadsData.features.length} road features`);
              }
            } else {
              console.log('No roads data loaded');
            }

            // Finally, add the NYC boundary mask to hide non-NYC areas
            console.log('Creating NYC boundary mask...');
            const nycMask = createNYCMask();
            
            mapInstance!.addSource('nyc-mask', {
              type: 'geojson',
              data: nycMask
            });

            mapInstance!.addLayer({
              id: 'non-nyc-overlay',
              type: 'fill',
              source: 'nyc-mask',
              paint: {
                'fill-color': 'rgba(255, 255, 255, 1.0)', // Solid white overlay to hide non-NYC
                'fill-opacity': 1.0
              }
            });

            console.log('All layers added successfully! Parks should be green, water should be blue.');

          } catch (dataError) {
            console.error('Error adding feature data to map:', dataError);
          }
          
          if (!isCleanedUp) {
            setMap(mapInstance);
            onMapLoad?.(mapInstance);
          }
        });

        // Add zoom change listener
        const zoomHandler = () => {
          if (mapInstance) {
            const zoom = mapInstance.getZoom();
            setCurrentZoom(zoom);
          }
        };
        mapInstance.on('zoom', zoomHandler);

        // Error handling
        mapInstance.on('error', (e) => {
          console.error('MapLibre: Map error:', e);
        });

        console.log('MapLibre: Map instance created, waiting for load event');

      } catch (error) {
        console.error('MapLibre: Error during initialization:', error);
      }
    };

    initializeMap();

    return () => {
      console.log('MapLibre: Cleanup function called');
      isCleanedUp = true;
      
      // Cleanup function
      try {
        if (mapInstance && mapInstance.getContainer()) {
          console.log('MapLibre: Removing map instance');
          mapInstance.remove();
        }
      } catch (error) {
        console.warn('MapLibre: Error cleaning up map:', error);
      }
      mapInstance = null;
      setMap(null);
    };
  }, []); // No dependencies needed since we load from local files

  // Create marker clustering
  useEffect(() => {
    if (!map || !businesses.length) return;

    // Clear existing markers
    markers.forEach(marker => marker.remove());

    // Prepare data for clustering
    const points = businesses.map(business => ({
      type: 'Feature' as const,
      properties: {
        cluster: false,
        business
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [business.position.lng, business.position.lat]
      }
    }));

    // Initialize supercluster
    const cluster = new Supercluster({
      radius: 80,
      maxZoom: 12
    });

    cluster.load(points);
    clusterRef.current = cluster;

    // Get clusters for current view
    const bounds = map.getBounds();
    const zoom = Math.floor(map.getZoom());
    
    const clusters = cluster.getClusters(
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      zoom
    );

    const newMarkers: maplibregl.Marker[] = [];

    clusters.forEach(cluster => {
      const [lng, lat] = cluster.geometry.coordinates;
      
      if (cluster.properties.cluster) {
        // Could add cluster markers here if needed
      } else {
        // Create individual business marker
        const el = document.createElement('div');
        el.className = 'business-marker';
        el.style.cssText = `
          background: #FFEB3B;
          border: 2px solid #FFC107;
          border-radius: 50%;
          width: 16px;
          height: 16px;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          z-index: 1000;
        `;
        
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);

        // Add click handler
        el.addEventListener('click', () => {
          onBusinessClick?.(cluster.properties.business);
        });

        newMarkers.push(marker);
      }
    });

    setMarkers(newMarkers);

    // Update markers on map move
    const updateMarkers = () => {
      // Clear existing markers
      newMarkers.forEach(marker => marker.remove());
      
      // Get new clusters
      const bounds = map.getBounds();
      const zoom = Math.floor(map.getZoom());
      
      const clusters = cluster.getClusters(
        [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        zoom
      );

      const updatedMarkers: maplibregl.Marker[] = [];

      clusters.forEach(cluster => {
        const [lng, lat] = cluster.geometry.coordinates;
        
        if (!cluster.properties.cluster) {
          const el = document.createElement('div');
          el.className = 'business-marker';
          el.style.cssText = `
            background: #FFEB3B;
            border: 2px solid #FFC107;
            border-radius: 50%;
            width: 16px;
            height: 16px;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            z-index: 1000;
          `;
          
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([lng, lat])
            .addTo(map);

          el.addEventListener('click', () => {
            onBusinessClick?.(cluster.properties.business);
          });

          updatedMarkers.push(marker);
        }
      });

      setMarkers(updatedMarkers);
    };

    map.on('moveend', updateMarkers);
    map.on('zoomend', updateMarkers);

    return () => {
      map.off('moveend', updateMarkers);
      map.off('zoomend', updateMarkers);
      newMarkers.forEach(marker => marker.remove());
    };
  }, [map, businesses, onBusinessClick, currentZoom]);

  // Center map on selected business
  useEffect(() => {
    if (!map || !selectedBusiness?.position) return;
    
    map.easeTo({
      center: [selectedBusiness.position.lng, selectedBusiness.position.lat],
      zoom: 16
    });
  }, [map, selectedBusiness]);

  return (
    <div 
      ref={mapRef} 
      className="absolute inset-0 w-full h-full"
      style={{ 
        zIndex: 1,
        backgroundColor: '#f8f8f8' // Light gray background for loading state
      }}
    />
  );
};

export default MapLibreMap;