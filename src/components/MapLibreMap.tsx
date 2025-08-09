import React, { useEffect, useRef, useState, useCallback } from 'react';
import type {
  FeatureCollection,
  Feature,
  LineString,
  Polygon,
  MultiPolygon,
  Geometry
} from 'geojson';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import difference from '@turf/difference';
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
      const allLandFeatures: Feature<Polygon | MultiPolygon, any>[] = [];

      // --- APPROACH 1: Coastline-derived polygons
      const coastlines = geoData.features.filter(
        feature => feature.geometry.type === 'LineString' && feature.properties?.natural === 'coastline'
      ) as Feature<LineString>[];

      coastlines.forEach(coastline => {
        const coords = coastline.geometry.coordinates;
        if (!coords || coords.length < 3) return;

        const firstPoint = coords[0];
        const lastPoint = coords[coords.length - 1];
        const isAlreadyClosed =
          firstPoint[0] === lastPoint[0] && firstPoint[1] === lastPoint[1];

        if (coords.length >= 4 || (coords.length >= 3 && !isAlreadyClosed)) {
          const closedCoords = isAlreadyClosed ? coords : [...coords, firstPoint];
          if (closedCoords.length >= 4) {
            const polygon = turf.polygon([closedCoords]);
            const area = turf.area(polygon);
            if (area > 1000) {
              allLandFeatures.push({
                ...polygon,
                properties: {
                  landType: 'coastline-derived',
                  area,
                  source: 'coastline'
                }
              });
            }
          }
        }
      });

      // --- APPROACH 2: Land = bounding box - water
      const waterPolygons = geoData.features.filter(feature => {
        const props = feature.properties || {};
        return (
          (props.natural === 'water' ||
            props.waterway === 'riverbank' ||
            (props.name &&
              [
                'Upper New York Bay',
                'Lower New York Bay',
                'Newark Bay',
                'Jamaica Bay',
                'Long Island Sound',
                'Hudson River',
                'East River',
                'Harlem River',
                'Arthur Kill',
                'Kill Van Kull',
                'Raritan Bay',
                'Sheepshead Bay',
                'Rockaway Inlet'
              ].some(waterName => props.name.includes(waterName))) ||
            props.landuse === 'reservoir' ||
            props.landuse === 'basin' ||
            props.leisure === 'marina' ||
            props.natural === 'bay' ||
            props.natural === 'strait' ||
            (props.place && ['sea', 'ocean', 'bay'].includes(props.place))) &&
          (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')
        );
      }) as Feature<Polygon | MultiPolygon>[];

      const linearWaterFeatures = geoData.features.filter(feature => {
        const props = feature.properties || {};
        return (
          feature.geometry.type === 'LineString' &&
          props.waterway &&
          ['river', 'stream', 'canal'].includes(props.waterway)
        );
      }) as Feature<LineString>[];

      if (waterPolygons.length || linearWaterFeatures.length || coastlines.length) {
        const bbox: [number, number, number, number] = [-74.3, 40.5, -73.7, 40.93];
        let landArea: Feature<Polygon | MultiPolygon> = turf.bboxPolygon(bbox);

        // Subtract coastline-defined land from waterArea
        if (coastlines.length) {
          let waterArea: Feature<Polygon | MultiPolygon> = turf.bboxPolygon(bbox);

          coastlines.forEach(coastline => {
            const coords = coastline.geometry.coordinates;
            if (coords.length < 4) return;

            const firstPoint = coords[0];
            const lastPoint = coords[coords.length - 1];
            const dist = turf.distance(turf.point(firstPoint), turf.point(lastPoint), {
              units: 'kilometers'
            });

            if (dist < 0.5) {
              const closedCoords = [...coords, firstPoint];
              const landPolygon = turf.polygon([closedCoords]);
              const area = turf.area(landPolygon);
              if (area > 100000) {
                const diff = difference(waterArea, landPolygon);
                if (diff) waterArea = diff;
              }
            }
          });

          const diff = difference(landArea, waterArea);
          if (diff) landArea = diff;
        }

        // Buffer linear water and subtract
        linearWaterFeatures.forEach(linearWater => {
          const buffered = turf.buffer(linearWater, 0.0005, { units: 'degrees' });
          if (buffered) {
            const diff = difference(landArea, buffered);
            if (diff) landArea = diff;
          }
        });

        // Subtract polygonal water
        waterPolygons.forEach(waterFeature => {
          const diff = difference(landArea, waterFeature);
          if (diff) landArea = diff;
        });

        allLandFeatures.push({
          ...landArea,
          properties: {
            landType: 'water-inverse',
            source: 'comprehensive-water-subtraction'
          }
        });
      }

      // --- Fallback buffer
      if (!allLandFeatures.length && coastlines.length) {
        const coastlineCollection = turf.featureCollection(coastlines);
        const buffered = turf.buffer(coastlineCollection, 0.002, { units: 'degrees' });
        if (buffered) {
          allLandFeatures.push({
            ...buffered,
            properties: { landType: 'coastline-buffered', source: 'buffer-fallback' }
          });
        }
      }

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
            paint: { 'background-color': '#2196F3' }
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
        if (!geoData || !geoData.features.length) return;

        // Fit to bbox of data
        const dataBbox = turf.bbox(geoData) as [number, number, number, number];
        if (dataBbox[0] !== dataBbox[2] && dataBbox[1] !== dataBbox[3]) {
          mapInstance!.fitBounds(dataBbox, { padding: 100, duration: 1000 });
        }

        mapInstance!.addSource('geojson-data', { type: 'geojson', data: geoData });

        const landPolygons = createLandFromCoastlinesAndWater(geoData);
        mapInstance!.addSource('land-polygons', { type: 'geojson', data: landPolygons });

        mapInstance!.addLayer({
          id: 'land-areas',
          type: 'fill',
          source: 'land-polygons',
          paint: { 'fill-color': '#E0E0E0', 'fill-opacity': 0.9 }
        });

        mapInstance!.addLayer({
          id: 'coastlines',
          type: 'line',
          source: 'geojson-data',
          filter: ['==', 'natural', 'coastline'],
          paint: { 'line-color': '#1976D2', 'line-width': 2 }
        });

        mapInstance!.addLayer({
          id: 'water-bodies',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'natural', 'water'],
          paint: { 'fill-color': '#2196F3', 'fill-opacity': 0.9 }
        });

        mapInstance!.addLayer({
          id: 'rivers-poly',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'waterway', 'riverbank'],
          paint: { 'fill-color': '#2196F3', 'fill-opacity': 0.9 }
        });

        mapInstance!.addLayer({
          id: 'parks',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'leisure', 'park'],
          paint: { 'fill-color': '#4CAF50', 'fill-opacity': 0.7 }
        });

        mapInstance!.addLayer({
          id: 'cemeteries',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'landuse', 'cemetery'],
          paint: { 'fill-color': '#4CAF50', 'fill-opacity': 0.6 }
        });

        mapInstance!.addLayer({
          id: 'roads',
          type: 'line',
          source: 'geojson-data',
          filter: ['has', 'highway'],
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

        mapInstance!.addLayer({
          id: 'rivers',
          type: 'line',
          source: 'geojson-data',
          filter: ['==', 'waterway', 'river'],
          paint: { 'line-color': '#2196F3', 'line-width': 3 }
        });

        mapInstance!.addLayer({
          id: 'canals',
          type: 'line',
          source: 'geojson-data',
          filter: ['==', 'waterway', 'canal'],
          paint: { 'line-color': '#2196F3', 'line-width': 2 }
        });
      });

      mapInstance.on('error', e => console.error('Map error:', e.error));
      setMap(mapInstance);
    };

    initializeMap();

    return () => {
      cleanedUp = true;
      if (mapInstance) mapInstance.remove();
      setMap(null);
    };
  }, [loadGeoJSONData, createLandFromCoastlinesAndWater]);

  return (
    <div ref={mapRef} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
  );
};

export default MapLibreMap;
