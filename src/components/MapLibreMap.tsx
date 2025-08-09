import React, { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

interface Business {
  id: string;
  name: string;
  position: { lat: number; lng: number };
  atmosphere: string[];
  salary?: string;
  stories?: { id: string; text: string; author: string }[];
  businessType?: string;
  roles?: { role: string; salary: string; upvotes?: number; downvotes?: number; userVote?: "up" | "down" }[];
  placeId?: string;
}

interface MapLibreMapProps {
  businesses: Business[];
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({ businesses }) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#e5e5e5" }
          }
        ]
      },
      center: [-74.006, 40.7128],
      zoom: 11
    });

    mapRef.current = map;

    map.on("load", () => {
      // Example: Create a simple light-gray NYC land polygon
      const nycPolygon: Feature<Polygon> = turf.polygon([
        [
          [-74.25909, 40.477399],
          [-73.700272, 40.477399],
          [-73.700272, 40.917577],
          [-74.25909, 40.917577],
          [-74.25909, 40.477399]
        ]
      ]);

      const nycCollection: FeatureCollection<Polygon | MultiPolygon> = {
        type: "FeatureCollection",
        features: [nycPolygon]
      };

      map.addSource("nyc-land", {
        type: "geojson",
        data: nycCollection
      });

      map.addLayer({
        id: "nyc-land-fill",
        type: "fill",
        source: "nyc-land",
        paint: {
          "fill-color": "#d3d3d3",
          "fill-opacity": 0.8
        }
      });

      // Example: Add business points
      const businessFeatures: FeatureCollection = {
        type: "FeatureCollection",
        features: businesses.map((b) =>
          turf.point([b.position.lng, b.position.lat], { name: b.name })
        )
      };

      map.addSource("businesses", {
        type: "geojson",
        data: businessFeatures
      });

      map.addLayer({
        id: "business-points",
        type: "circle",
        source: "businesses",
        paint: {
          "circle-radius": 5,
          "circle-color": "#ff0000"
        }
      });
    });

    return () => {
      map.remove();
    };
  }, [businesses]);

  return <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />;
};

export default MapLibreMap;
