import React, { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { createBusinessScatterplotLayer } from "@/utils/deckGLLayers";
import { Business } from "@/types";
import * as turf from "@turf/turf";

interface NeighborhoodFilter {
  name: string;
  borough: string;
  boundary: { lat: number; lon: number }[];
  center?: { lat: number; lon: number };
}

interface SearchFilters {
  neighborhoodFilter?: NeighborhoodFilter | null;
}

interface Props {
  businesses: Business[];
  searchFilters?: SearchFilters | null;
  onBusinessClick?: (business: Business) => void;
  selectedBusiness?: Business | null;
  landmarks?: { lat: number; lng: number; emoji: string }[];
  neighborhoodCenter?: { lat: number; lon: number };
}

const MapLibreMap: React.FC<Props> = ({ businesses, searchFilters }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const layersAddedRef = useRef(false);

  /** Add styled NYC layers */
  const addVectorLayers = useCallback((map: maplibregl.Map) => {
    try {
      const layers = [
        {
          id: "nyc-land",
          type: "fill" as const,
          source: "nyc-tiles",
          "source-layer": "examplepoints",
          layout: {},
          paint: { "fill-color": "#F5F5DC", "fill-opacity": 1.0 },
          filter: ["==", ["geometry-type"], "Polygon"] as any,
        },
        {
          id: "nyc-green-spaces",
          type: "fill" as const,
          source: "nyc-tiles",
          "source-layer": "examplepoints",
          layout: {},
          paint: { "fill-color": "#87C17A", "fill-opacity": 1.0 },
          filter: [
            "all",
            ["==", ["geometry-type"], "Polygon"],
            [
              "any",
              ["==", ["get", "leisure"], "park"],
              ["==", ["get", "landuse"], "cemetery"],
              ["==", ["get", "amenity"], "cemetery"],
              ["==", ["get", "amenity"], "grave_yard"],
              ["==", ["get", "landuse"], "recreation_ground"],
              ["==", ["get", "leisure"], "recreation_ground"],
              ["in", "cemetery", ["get", "name"]],
              ["in", "Cemetery", ["get", "name"]],
              ["in", "Graveyard", ["get", "name"]],
              ["in", "graveyard", ["get", "name"]],
              ["==", ["get", "place"], "cemetery"],
              ["==", ["get", "historic"], "cemetery"],
            ],
          ] as any,
        },
        {
          id: "nyc-water",
          type: "fill" as const,
          source: "nyc-tiles",
          "source-layer": "examplepoints",
          layout: {},
          paint: { "fill-color": "#6CA4E1", "fill-opacity": 1.0 },
          filter: [
            "all",
            ["==", ["geometry-type"], "Polygon"],
            ["has", "natural"],
          ] as any,
        },
        {
          id: "nyc-roads",
          type: "line" as const,
          source: "nyc-tiles",
          "source-layer": "examplepoints",
          layout: {},
          paint: {
            "line-color": "#666666",
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.5,
              14,
              1.5,
              16,
              3,
            ],
            "line-opacity": 0.8,
          },
          filter: [
            "all",
            ["==", ["geometry-type"], "LineString"],
            ["has", "highway"],
          ] as any,
        },
        {
          id: "nyc-road-labels",
          type: "symbol" as const,
          source: "nyc-tiles",
          "source-layer": "examplepoints",
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 12, 9, 16, 12],
            "text-max-width": 8,
            "text-line-height": 1.2,
            "symbol-placement": "line",
            "text-rotation-alignment": "map",
            "text-allow-overlap": false,
            "text-ignore-placement": false,
          },
          paint: {
            "text-color": "#333333",
            "text-halo-color": "#FFFFFF",
            "text-halo-width": 1.5,
            "text-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0.6, 16, 1],
          },
          filter: [
            "all",
            ["==", ["geometry-type"], "LineString"],
            ["has", "name"],
            ["has", "highway"],
            ["!=", ["get", "name"], ""],
          ] as any,
          minzoom: 12,
        },
      ];

      console.log("Adding", layers.length, "vector layers...");
      layers.forEach((layer, index) => {
        if (!map.getLayer(layer.id)) {
          map.addLayer(layer as any);
          console.log(`✅ Added layer ${index + 1}/${layers.length}: ${layer.id}`);
        }
      });
      layersAddedRef.current = true;
    } catch (error) {
      console.error("Error in addVectorLayers:", error);
    }
  }, []);

  /** Dedup businesses by id + lat/lng */
  const dedupeBusinesses = (list: Business[]): Business[] => {
    const seen = new Map<string, Business>();
    list.forEach((biz) => {
      const key = biz.id || `${biz.position.lat},${biz.position.lng}`;
      if (!seen.has(key)) seen.set(key, biz);
    });
    return Array.from(seen.values());
  };

  /** Neighborhood polygon filtering */
  const filterBusinessesByNeighborhood = useCallback(
    (list: Business[], neighborhood: NeighborhoodFilter): Business[] => {
      if (!neighborhood?.boundary?.length) return list;

      const polygon = turf.polygon([
        neighborhood.boundary.map((p) => [p.lon, p.lat]),
      ]);
      return list.filter((biz) =>
        turf.booleanPointInPolygon(
          turf.point([biz.position.lng, biz.position.lat]),
          polygon
        )
      );
    },
    []
  );

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8 as 8,
        sources: {
          "nyc-tiles": {
            type: "vector",
            tiles: ["https://tiles.example.com/{z}/{x}/{y}.pbf"],
            minzoom: 10,
            maxzoom: 20,
          },
        },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#e5e5e5" },
          },
        ],
      },
      center: searchFilters?.neighborhoodFilter?.center
        ? [
            searchFilters.neighborhoodFilter.center.lon,
            searchFilters.neighborhoodFilter.center.lat,
          ]
        : [-74.006, 40.7128],
      zoom: 12,
    });

    mapRef.current = map;
    overlayRef.current = new MapboxOverlay({ interleaved: true });
    map.addControl(overlayRef.current);

    map.on("load", () => {
      console.log("🗺️ Map loaded");
      addVectorLayers(map);
    });
  }, [addVectorLayers, searchFilters]);

  useEffect(() => {
    if (!overlayRef.current) return;

    let filtered = dedupeBusinesses(businesses);
    if (searchFilters?.neighborhoodFilter) {
      filtered = filterBusinessesByNeighborhood(
        filtered,
        searchFilters.neighborhoodFilter
      );
      console.log(
        `📍 ${filtered.length} businesses inside ${searchFilters.neighborhoodFilter.name}`
      );
    }

    overlayRef.current.setProps({
      layers: [createBusinessScatterplotLayer({ businesses: filtered })],
    });
  }, [businesses, searchFilters, filterBusinessesByNeighborhood]);

  return <div ref={mapContainerRef} className="w-full h-full" />;
};

export default MapLibreMap;
