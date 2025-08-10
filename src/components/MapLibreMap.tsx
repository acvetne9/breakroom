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

  const waterKeywords = [
    'Upper New York Bay', 'Lower New York Bay', 'Newark Bay', 'Jamaica Bay',
    'Long Island Sound', 'Hudson River', 'East River', 'Harlem River',
    'Arthur Kill', 'Kill Van Kull', 'Raritan Bay', 'Sheepshead Bay',
    'Rockaway Inlet', 'Gowanus Canal', 'Newtown Creek'
  ];

  const additionalWaterAreas = [
    {
      name: "Jamaica Bay Extension",
      coordinates: [
        [-73.900, 40.620], [-73.850, 40.620], [-73.845, 40.580], [-73.895, 40.580], [-73.900, 40.620]
      ]
    }
  ];

  const createAdditionalWaterFeatures = useCallback((): Feature<Polygon>[] => {
    return additionalWaterAreas.map(area => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [area.coordinates] },
      properties: { name: area.name, natural: 'water', source: 'extra' }
    }));
  }, []);

  const loadGeoJSONData = useCallback(async (): Promise<FeatureCollection | null> => {
    try {
      const response = await fetch('/data/example-points.geojson');
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }, []);

  const createLandFromCoastlines = useCallback((geoData: FeatureCollection): FeatureCollection<Polygon | MultiPolygon> => {
    const bbox: [number, number, number, number] = [-74.30, 40.50, -73.70, 40.93];
    let totalLandArea = turf.bboxPolygon(bbox);
    const explicitWaterBodies = geoData.features.filter(feature => {
      const props = feature.properties;
      return props &&
        (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') &&
        (props.natural === 'water' || (props.name && waterKeywords.some(w => props.name.toLowerCase().includes(w.toLowerCase()))));
    });
    explicitWaterBodies.push(...createAdditionalWaterFeatures());
    explicitWaterBodies.forEach(waterBody => {
      try {
        const diff = (turf as any).difference(totalLandArea, waterBody);
        if (diff) totalLandArea = diff;
      } catch {}
    });
    const landFeature = totalLandArea as Feature<Polygon | MultiPolygon>;
    landFeature.properties = { landType: 'generated' };
    return { type: 'FeatureCollection', features: [landFeature] };
  }, [waterKeywords, createAdditionalWaterFeatures]);

  const loadGeographicData = useCallback(async () => {
    const mainData = await loadGeoJSONData();

    const landFeatures: Feature<Polygon | MultiPolygon>[] = [];
    const waterFeatures: Feature<Polygon | MultiPolygon>[] = [];

    if (mainData) {
      mainData.features.forEach(feature => {
        const props = feature.properties || {};
        if (['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
          if (props.natural === 'water' || (props.name && waterKeywords.some(w => props.name.toLowerCase().includes(w.toLowerCase())))) {
            waterFeatures.push(feature as Feature<Polygon | MultiPolygon>);
          } else {
            landFeatures.push(feature as Feature<Polygon | MultiPolygon>);
          }
        }
      });
      waterFeatures.push(...createAdditionalWaterFeatures());
    }

    // If no land features, try to create from coastlines
    if (!landFeatures.length && mainData) {
      const generatedLand = createLandFromCoastlines(mainData);
      landFeatures.push(...generatedLand.features);
    }

    // Fallback water coverage if nothing found
    if (!waterFeatures.length) {
      console.warn("No water features found — creating fallback coverage");
      const bbox: [number, number, number, number] = [-74.30, 40.50, -73.70, 40.93];
      let fallbackWater = turf.bboxPolygon(bbox);
      if (landFeatures.length) {
        landFeatures.forEach(land => {
          try {
            const diff = (turf as any).difference(fallbackWater, land);
            if (diff) fallbackWater = diff;
          } catch {}
        });
      }
      (fallbackWater as Feature<Polygon>).properties = { natural: "water", source: "fallback" };
      waterFeatures.push(fallbackWater as Feature<Polygon | MultiPolygon>);
    }

    setLandData({ type: 'FeatureCollection', features: landFeatures });
    setWaterData({ type: 'FeatureCollection', features: waterFeatures });
  }, [loadGeoJSONData, waterKeywords, createAdditionalWaterFeatures, createLandFromCoastlines]);

  useEffect(() => {
    if (!mapRef.current) return;
    const mapInstance = new maplibregl.Map({
      container: mapRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#D3D3D3' } }]
      },
      center: [-73.9712, 40.7831],
      zoom: 12
    });
    mapInstance.setMaxBounds([[-74.25909, 40.477399], [-73.700272, 40.917577]]);
    mapInstance.on('load', () => setMapLoaded(true));
    setMap(mapInstance);
    return () => { mapInstance.remove(); setMap(null); };
  }, []);

  useEffect(() => {
    if (mapLoaded && map) {
      loadGeographicData();
    }
  }, [mapLoaded, map]);

  useEffect(() => {
    if (!map || !mapLoaded) return;
    const addOrUpdateSource = (id: string, data: FeatureCollection | null, layer: any) => {
      if (!data) return;
      if (map.getSource(id)) {
        (map.getSource(id) as maplibregl.GeoJSONSource).setData(data as any);
      } else {
        map.addSource(id, { type: 'geojson', data });
      }
      if (!map.getLayer(layer.id)) map.addLayer(layer);
    };
    addOrUpdateSource('land-data', landData, {
      id: 'land-areas',
      type: 'fill',
      source: 'land-data',
      paint: { 'fill-color': '#D3D3D3', 'fill-opacity': 0.9 }
    });
    addOrUpdateSource('water-data', waterData, {
      id: 'water-bodies',
      type: 'fill',
      source: 'water-data',
      paint: { 'fill-color': '#4A90E2', 'fill-opacity': 0.8 }
    });
  }, [map, mapLoaded, landData, waterData]);

  return <div ref={mapRef} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />;
};

export default MapLibreMap;
