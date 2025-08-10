// MapLibreMap.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, Polygon, MultiPolygon, LineString } from "geojson";

interface MapLibreMapProps {
  businesses?: {
    id: string;
    name: string;
    position: { lat: number; lng: number };
    businessType?: string;
  }[];
  onBusinessClick?: (business: any) => void;
  selectedBusiness?: any;
}

const NYC_BBOX: [number, number, number, number] = [-74.30, 40.50, -73.70, 40.93];

const waterKeywords = [
  "upper new york bay","lower new york bay","newark bay","jamaica bay",
  "long island sound","hudson river","east river","harlem river",
  "arthur kill","kill van kull","raritan bay","sheepshead bay",
  "rockaway inlet","gowanus canal","newtown creek"
];

const additionalWaterAreas = [
  {
    name: "Jamaica Bay Extension",
    coordinates: [
      [-73.900, 40.620], [-73.850, 40.620], [-73.845, 40.580], [-73.895, 40.580], [-73.900, 40.620]
    ]
  }
];

const emptyFC = { type: "FeatureCollection", features: [] as Feature[] };

const MapLibreMap: React.FC<MapLibreMapProps> = ({ businesses = [], onBusinessClick, selectedBusiness }) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const fetchJSON = useCallback(async (url: string) => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn("fetch failed:", url, resp.statusText);
        return null;
      }
      return await resp.json();
    } catch (err) {
      console.warn("fetch error:", url, err);
      return null;
    }
  }, []);

  const createAdditionalWaterFeatures = useCallback(() => {
    return additionalWaterAreas.map(area => ({
      type: "Feature" as const,
      geometry: { type: "Polygon" as const, coordinates: [area.coordinates] },
      properties: { name: area.name, natural: "water", source: "extra" }
    }));
  }, []);

  const createLandFromCoastlines = useCallback((geoData: FeatureCollection) => {
    // Fallback approach: start with bbox as land, subtract water polygons we can recognize.
    let totalLand = turf.bboxPolygon(NYC_BBOX);
    const explicitWater = geoData.features.filter(f => {
      const p = (f as any).properties || {};
      return (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon") &&
        (p.natural === "water" || (p.name && waterKeywords.some(w => p.name.toLowerCase().includes(w.toLowerCase()))));
    });
    explicitWater.push(...createAdditionalWaterFeatures());
    explicitWater.forEach(w => {
      try {
        const diff = (turf as any).difference(totalLand, w);
        if (diff) totalLand = diff;
      } catch (err) {
        console.warn("difference error:", err);
      }
    });
    (totalLand as any).properties = { source: "generated-land" };
    return { type: "FeatureCollection", features: [totalLand as Feature<Polygon | MultiPolygon>] } as FeatureCollection<Polygon | MultiPolygon>;
  }, [createAdditionalWaterFeatures]);

  const loadAndProcessGeo = useCallback(async () => {
    // load main geojson (may be null)
    const mainData = await fetchJSON("/data/example-points.geojson");

    // load roads (try both .geojson and .geojson.gz if you serve gz)
    let roadsData = await fetchJSON("/data/merged_roads.geojson");
    if (!roadsData) roadsData = await fetchJSON("/data/merged_roads.geojson.gz");

    // classifying features
    const landFeatures: Feature<Polygon | MultiPolygon>[] = [];
    const waterFeatures: Feature<Polygon | MultiPolygon>[] = [];

    if (mainData && Array.isArray(mainData.features)) {
      mainData.features.forEach((f: Feature) => {
        if (!f.geometry) return;
        if (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon") {
          const props = (f as any).properties || {};
          const name = (props.name || "").toString().toLowerCase();
          const isWater = props.natural === "water" ||
            waterKeywords.some(w => name.includes(w.toLowerCase()));
          if (isWater) waterFeatures.push(f as Feature<Polygon | MultiPolygon>);
          else landFeatures.push(f as Feature<Polygon | MultiPolygon>);
        }
      });
    }

    // add additional known water shapes
    waterFeatures.push(...createAdditionalWaterFeatures());

    // If no explicit land polygons, attempt to generate land from coastlines / bbox
    if (!landFeatures.length && mainData) {
      const generated = createLandFromCoastlines(mainData);
      if (generated && generated.features.length) landFeatures.push(...generated.features as Feature<Polygon | MultiPolygon>[]);
    }

    // If no water polygons at all -> fallback bbox water minus any land we have
    if (!waterFeatures.length) {
      console.warn("No water polygons found — building fallback water from bbox");
      let fallback = turf.bboxPolygon(NYC_BBOX);
      landFeatures.forEach(land => {
        try {
          const diff = (turf as any).difference(fallback, land);
          if (diff) fallback = diff;
        } catch (err) {
          console.warn("Could not subtract land from fallback water:", err);
        }
      });
      (fallback as any).properties = { natural: "water", source: "fallback" };
      waterFeatures.push(fallback as Feature<Polygon | MultiPolygon>);
    }

    // Prepare sources to set on the map
    const finalMain = mainData ?? emptyFC;
    const finalLand = { type: "FeatureCollection", features: landFeatures } as FeatureCollection<Polygon | MultiPolygon>;
    const finalWater = { type: "FeatureCollection", features: waterFeatures } as FeatureCollection<Polygon | MultiPolygon>;
    const finalRoads = roadsData ?? emptyFC;

    return { finalMain, finalLand, finalWater, finalRoads };
  }, [fetchJSON, createAdditionalWaterFeatures, createLandFromCoastlines]);

  // init map
  useEffect(() => {
    if (!mapRef.current) return;
    const baseStyle = {
      version: 8 as const,
      sources: {},
      layers: [
        { id: "background", type: "background" as const, paint: { "background-color": "#EDEDED" } }
      ]
    };

    const m = new maplibregl.Map({
      container: mapRef.current,
      style: baseStyle,
      center: [-73.9712, 40.7831],
      zoom: 12
    });

    m.setMaxBounds([[-74.25909, 40.477399], [-73.700272, 40.917577]]);
    m.on("load", () => {
      // Create empty sources so we can add layers immediately in deterministic order
      m.addSource("geojson-data", { type: "geojson", data: emptyFC });
      m.addSource("land-data", { type: "geojson", data: emptyFC });
      m.addSource("water-data", { type: "geojson", data: emptyFC });
      m.addSource("roads-data", { type: "geojson", data: emptyFC });
      m.addSource("businesses", { type: "geojson", data: emptyFC });

      // Add layers in the order we want them stacked (water first)
      // 1) water (fills)
      m.addLayer({
        id: "water-bodies",
        type: "fill",
        source: "water-data",
        paint: { "fill-color": "#4A90E2", "fill-opacity": 0.8 }
      });

      // 2) land (general)
      m.addLayer({
        id: "land-areas",
        type: "fill",
        source: "land-data",
        paint: { "fill-color": "#D3D3D3", "fill-opacity": 0.95 }
      });

      // 3) parks (drawn above land; uses the main geojson-data source so parks keep their specific shapes if present)
      m.addLayer({
        id: "parks-fill",
        type: "fill",
        source: "geojson-data",
        filter: ["==", ["get", "leisure"], "park"],
        paint: { "fill-color": "#4CAF50", "fill-opacity": 0.9 }
      });

      // 4) building fills (above land)
      m.addLayer({
        id: "buildings-fill",
        type: "fill",
        source: "geojson-data",
        filter: ["has", "building"],
        paint: { "fill-color": "#BDBDBD", "fill-opacity": 0.9 }
      });

      // 5) roads (lines) above land/buildings
      m.addLayer({
        id: "roads-line",
        type: "line",
        source: "roads-data",
        paint: { "line-color": "#666666", "line-width": 1.6 }
      });

      // 6) businesses on top
      m.addLayer({
        id: "businesses-layer",
        type: "circle",
        source: "businesses",
        paint: {
          "circle-radius": 8,
          "circle-color": "#FACC15",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#FFFFFF"
        }
      });

      setMapLoaded(true);
    });

    m.on("error", e => console.error("map error:", e.error));
    setMap(m);

    return () => {
      try { m.remove(); } catch (e) {}
      setMap(null);
    };
  }, []);

  // Once map is ready, load geo and populate sources
  useEffect(() => {
    if (!map || !mapLoaded) return;
    let cancelled = false;

    (async () => {
      const { finalMain, finalLand, finalWater, finalRoads } = await loadAndProcessGeo();

      if (cancelled) return;

      // set data safely (update existing sources)
      const setSourceData = (id: string, data: FeatureCollection) => {
        const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
        if (src) {
          try { src.setData(data as any); }
          catch (err) { console.warn("setData error for", id, err); }
        } else {
          // fallback: add source then try to place layer at sensible position
          try { map.addSource(id, { type: "geojson", data: data as any }); } catch {}
        }
      };

      setSourceData("geojson-data", finalMain as any);
      setSourceData("land-data", finalLand as any);
      setSourceData("water-data", finalWater as any);
      setSourceData("roads-data", finalRoads as any);

      // businesses
      const businessFC = {
        type: "FeatureCollection",
        features: businesses.map(b => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [b.position.lng, b.position.lat] },
          properties: { id: b.id, name: b.name, businessType: b.businessType || "unknown" }
        }))
      } as FeatureCollection;
      setSourceData("businesses", businessFC as any);

      // ensure layer order: if any of the layers accidentally got created out of order, move them
      // prefer to keep the order: background -> water-bodies -> land-areas -> parks-fill -> buildings-fill -> roads-line -> businesses-layer
      const order = ["water-bodies","land-areas","parks-fill","buildings-fill","roads-line","businesses-layer"];
      for (let i = 0; i < order.length; i++) {
        const id = order[i];
        if (!map.getLayer(id)) continue;
        const before = order[i+1] && map.getLayer(order[i+1]) ? order[i+1] : undefined;
        try {
          if (before) map.moveLayer(id, before);
        } catch (err) { /* ignore */ }
      }

      // setup click handlers for businesses
      if (onBusinessClick) {
        map.on("click", "businesses-layer", (e) => {
          const feat = e.features?.[0];
          if (!feat) return;
          const bid = feat.properties?.id;
          const business = businesses.find(b => b.id === bid);
          if (business) onBusinessClick(business);
        });
      }

    })();

    return () => { cancelled = true; };
  }, [map, mapLoaded, loadAndProcessGeo, businesses, onBusinessClick]);

  // selected business highlighting
  useEffect(() => {
    if (!map || !mapLoaded) return;
    if (!map.getLayer("businesses-layer")) return;
    map.setPaintProperty("businesses-layer", "circle-color",
      selectedBusiness ? [
        "case",
        ["==", ["get", "id"], selectedBusiness.id], "#EF4444",
        "#FACC15"
      ] : "#FACC15"
    );
  }, [map, mapLoaded, selectedBusiness]);

  return <div ref={el => (mapRef.current = el)} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} />;
};

export default MapLibreMap;
