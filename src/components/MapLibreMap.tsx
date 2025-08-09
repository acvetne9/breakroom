import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Feature, FeatureCollection, Polygon, MultiPolygon, LineString } from 'geojson';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';

interface MapLibreMapProps {
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

  const createLandFromCoastlinesAndWater = useCallback((geoData: FeatureCollection): FeatureCollection => {
    try {
      const allLandFeatures: any[] = [];
      const coastlines = geoData.features.filter(
        feature => feature.geometry.type === 'LineString' && feature.properties?.natural === 'coastline'
      );

      console.log(`Found ${coastlines.length} coastline features`);

      // Coastline loop polygons
      coastlines.forEach(coastline => {
        try {
          const coords = (coastline.geometry as any).coordinates;
          if (!coords || coords.length < 3) return;
          const firstPoint = coords[0];
          const lastPoint = coords[coords.length - 1];
          const isClosed = firstPoint[0] === lastPoint[0] && firstPoint[1] === lastPoint[1];
          const closedCoords = isClosed ? coords : [...coords, firstPoint];
          if (closedCoords.length >= 4) {
            const polygon = turf.polygon([closedCoords]);
            const area = turf.area(polygon);
            if (area > 1000) {
              allLandFeatures.push({
                ...polygon,
                properties: { landType: 'coastline-derived', area, source: 'coastline' }
              });
            }
          }
        } catch (err) {
          console.warn('Could not create polygon from coastline:', err);
        }
      });

      // Subtract water polygons
      const waterPolygons = geoData.features.filter(feature => {
        const props = feature.properties;
        if (!props) return false;
        return (
          (props.natural === 'water' || props.waterway === 'riverbank' || props.landuse === 'reservoir' || props.landuse === 'basin') &&
          (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')
        );
      });

      const linearWaterFeatures = geoData.features.filter(feature => {
        const props = feature.properties;
        return (
          props &&
          feature.geometry.type === 'LineString' &&
          props.waterway &&
          ['river', 'stream', 'canal'].includes(props.waterway)
        );
      });

      console.log(`Found ${waterPolygons.length} water polygons`);
      console.log(`Found ${linearWaterFeatures.length} linear water features`);

      if (waterPolygons.length > 0 || linearWaterFeatures.length > 0 || coastlines.length > 0) {
        const bbox: [number, number, number, number] = [-74.30, 40.50, -73.70, 40.93];
        let landArea: any = turf.bboxPolygon(bbox);
        let waterArea: any = turf.bboxPolygon(bbox);

        // Coastline subtraction
        coastlines.forEach(coastline => {
          try {
            const coords = (coastline.geometry as any).coordinates;
            if (!coords || coords.length < 4) return;
            const firstPoint = coords[0];
            const lastPoint = coords[coords.length - 1];
            const distance = turf.distance(firstPoint, lastPoint, { units: 'kilometers' });
            if (distance < 0.5) {
              const closedCoords = [...coords, firstPoint];
              const landPolygon = turf.polygon([closedCoords]);
              if (turf.area(landPolygon) > 100000) {
                const diff = (turf as any).difference(waterArea, landPolygon);
                if (diff) waterArea = diff;
              }
            }
          } catch {}
        });

        try {
          const diff = (turf as any).difference(landArea, waterArea);
          if (diff) landArea = diff;
        } catch (err) {
          console.warn('Error subtracting water area from land area:', err);
        }

        // Linear water buffering
        linearWaterFeatures.forEach(linearWater => {
          try {
            const buffered = turf.buffer(linearWater, 0.0005, { units: 'degrees' });
            const diff = (turf as any).difference(landArea, buffered);
            if (diff) landArea = diff;
          } catch {}
        });

        // Polygonal water subtraction
        waterPolygons.forEach(waterFeature => {
          try {
            const diff = (turf as any).difference(landArea, waterFeature);
            if (diff) landArea = diff;
          } catch {}
        });

        if (landArea) {
          allLandFeatures.push({
            ...landArea,
            properties: {
              landType: 'water-inverse',
              source: 'comprehensive-water-subtraction',
              waterFeaturesProcessed: waterPolygons.length + linearWaterFeatures.length,
              coastlinesProcessed: coastlines.length
            }
          });
        }
      }

      // Fallback
      if (allLandFeatures.length === 0 && coastlines.length > 0) {
        const buffered = turf.buffer(turf.featureCollection(coastlines), 0.002, { units: 'degrees' });
        if (buffered) {
          allLandFeatures.push({
            ...buffered,
            properties: { landType: 'coastline-buffered', source: 'buffer-fallback' }
          });
        }
      }

      console.log(`Created ${allLandFeatures.length} land features`);
      return { type: 'FeatureCollection', features: allLandFeatures };
    } catch (error) {
      console.error('Error creating land from coastlines and water:', error);
      return { type: 'FeatureCollection', features: [] };
    }
  }, []);

  const loadGeographicData = useCallback(async () => {
    try {
      const roadsResponse = await fetch('/data/merged_roads.geojson.gz');
      if (roadsResponse.ok) {
        setRoadsData(await roadsResponse.json());
      }

      const mainData = await loadGeoJSONData();
      if (!mainData) return;

      const waterFeatures = mainData.features.filter(feature =>
        feature.properties &&
        (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') &&
        (
          feature.properties.natural === 'water' ||
          feature.properties.waterway === 'riverbank' ||
          feature.properties.landuse === 'reservoir' ||
          feature.properties.landuse === 'basin'
        )
      ) as Feature<Polygon | MultiPolygon>[];

      let landFeatures = mainData.features.filter(feature =>
        (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') &&
        !waterFeatures.includes(feature)
      ) as Feature<Polygon | MultiPolygon>[];

      if (landFeatures.length === 0) {
        landFeatures = createLandFromCoastlinesAndWater(mainData).features as Feature<Polygon | MultiPolygon>[];
      }

      setLandData({ type: 'FeatureCollection', features: landFeatures });
      setWaterData({ type: 'FeatureCollection', features: waterFeatures });
    } catch (error) {
      console.error('Error loading geographic data:', error);
    }
  }, [loadGeoJSONData, createLandFromCoastlinesAndWater]);

  // Map init
  useEffect(() => {
    if (!mapRef.current) return;
    let mapInstance: maplibregl.Map | null = null;
    let cleanedUp = false;

    const initializeMap = async () => {
      mapInstance = new maplibregl.Map({
        container: mapRef.current!,
        style: {
          version: 8,
          sources: {},
          layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#2196F3' } }]
        },
        center: [-73.9712, 40.7831],
        zoom: 12
      });

      const nycBounds: maplibregl.LngLatBoundsLike = [
        [-74.25909, 40.477399],
        [-73.700272, 40.917577]
      ];
      mapInstance.setMaxBounds(nycBounds);

      mapInstance.on('load', () => {
        if (cleanedUp) return;
        setMapLoaded(true);
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
  }, []);

  useEffect(() => { loadGeographicData(); }, [loadGeographicData]);

  // Add/update data layers
  useEffect(() => {
    if (!mapLoaded || !map) return;
    const addOrUpdate = (id: string, data: FeatureCollection | null, layer: any) => {
      if (!data) return;
      const src = map.getSource(id) as maplibregl.GeoJSONSource;
      if (src) {
        src.setData(data as any);
        if (!map.getLayer(layer.id)) map.addLayer(layer);
      } else {
        map.addSource(id, { type: 'geojson', data });
        map.addLayer(layer);
      }
    };

    addOrUpdate('land-data', landData, { id: 'land-areas', type: 'fill', source: 'land-data', paint: { 'fill-color': '#E0E0E0', 'fill-opacity': 0.9 } });
    addOrUpdate('water-data', waterData, { id: 'water-bodies', type: 'fill', source: 'water-data', paint: { 'fill-color': '#2196F3', 'fill-opacity': 0.9 } });
    addOrUpdate('roads-data', roadsData, { id: 'roads', type: 'line', source: 'roads-data', paint: { 'line-color': '#424242', 'line-width': 2 } });
  }, [mapLoaded, map, landData, waterData, roadsData]);

  // Business markers
  useEffect(() => {
    if (!mapLoaded || !map || !businesses) return;
    if (map.getSource('businesses')) {
      map.removeLayer('businesses-layer');
      map.removeSource('businesses');
    }

    const businessFC = {
      type: 'FeatureCollection' as const,
      features: businesses.map(b => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [b.position.lng, b.position.lat] },
        properties: { id: b.id, name: b.name, businessType: b.businessType || 'unknown' }
      }))
    };

    map.addSource('businesses', { type: 'geojson', data: businessFC });
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

    map.on('click', 'businesses-layer', e => {
      if (e.features && e.features[0]) {
        const businessId = e.features[0].properties?.id;
        const business = businesses.find(b => b.id === businessId);
        if (business && onBusinessClick) {
          map.flyTo({ center: [business.position.lng, business.position.lat], zoom: 16, duration: 800 });
          onBusinessClick(business);
        }
      }
    });

    map.on('mouseenter', 'businesses-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'businesses-layer', () => { map.getCanvas().style.cursor = ''; });
  }, [mapLoaded, businesses, onBusinessClick, map]);

  // Highlight selected business
  useEffect(() => {
    if (!mapLoaded || !map || !map.getLayer('businesses-layer')) return;
    map.setPaintProperty('businesses-layer', 'circle-color',
      selectedBusiness
        ? ['case', ['==', ['get', 'id'], selectedBusiness.id], '#EF4444', '#FACC15']
        : '#FACC15'
    );
  }, [mapLoaded, selectedBusiness, map]);

  return <div ref={mapRef} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />;
};

export default MapLibreMap;
