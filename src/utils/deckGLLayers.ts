import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { COORDINATE_SYSTEM } from "@deck.gl/core";
import { polygon, point, booleanPointInPolygon } from "@turf/turf";
import type { Business } from "@/types/business";
import type { LayerProps } from "@deck.gl/core";

// deck.gl 9 still honours the WebGL-style flag at runtime but types the newer
// luma.gl parameter names, hence the cast.
const NO_DEPTH_TEST = { depthTest: false } as unknown as LayerProps["parameters"];

export interface DeckGLBusinessLayerProps {
  businesses: Business[];
  onBusinessClick?: (business: Business) => void;
  neighborhoodBoundary?: { lat: number; lon: number }[] | null;
  zoom?: number;
  clickedBusinessIds?: Set<string>;
}

export interface LandmarkEmojiLayerProps {
  landmarks: { lat: number; lng: number; emoji: string }[];
  zoom?: number;
}

const GOLD: [number, number, number, number] = [250, 204, 21, 255];
const ORANGE: [number, number, number, number] = [249, 115, 22, 255];
const WHITE: [number, number, number, number] = [255, 255, 255, 255];

/** Keep only businesses strictly inside a neighborhood polygon. */
const filterBusinessesInPolygon = (
  businesses: Business[],
  neighborhoodBoundary?: { lat: number; lon: number }[] | null,
): Business[] => {
  if (!neighborhoodBoundary?.length) return businesses;

  try {
    const coords = neighborhoodBoundary.map((p) => [p.lon, p.lat]);
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (coords.length > 2 && (first[0] !== last[0] || first[1] !== last[1])) coords.push(first);

    const turfPoly = polygon([coords]);
    return businesses.filter((b) => b?.position && booleanPointInPolygon(point([b.position.lng, b.position.lat]), turfPoly));
  } catch (err) {
    console.error("Error filtering businesses by polygon:", err);
    return businesses;
  }
};

/** Scatterplot of business dots. Gold by default, orange once clicked this session. */
export const createBusinessScatterplotLayer = ({
  businesses,
  onBusinessClick,
  neighborhoodBoundary,
  zoom = 12,
  clickedBusinessIds,
}: DeckGLBusinessLayerProps) => {
  const filteredBusinesses = filterBusinessesInPolygon(
    businesses.filter((b) => b != null),
    neighborhoodBoundary,
  );
  if (filteredBusinesses.length === 0) return null;

  const radiusMin = zoom < 12 ? 6 : zoom < 14 ? 8 : 10;
  const radiusMax = zoom < 12 ? 10 : zoom < 14 ? 12 : 15;

  return new ScatterplotLayer<Business>({
    id: "businesses-scatter",
    data: filteredBusinesses,
    pickable: true,
    // Depth testing culls overlapping dots; we want them all drawn.
    parameters: NO_DEPTH_TEST,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    stroked: true,
    filled: true,
    opacity: 1.0,
    radiusMinPixels: radiusMin,
    radiusMaxPixels: radiusMax,
    lineWidthMinPixels: 2,
    getPosition: (d) => [d.position.lng, d.position.lat],
    getRadius: 15,
    getFillColor: (d) => (clickedBusinessIds?.has(d.id) ? ORANGE : GOLD),
    getLineColor: WHITE,
    onClick: onBusinessClick ? (info) => info.object && onBusinessClick(info.object) : undefined,
    updateTriggers: {
      getFillColor: [clickedBusinessIds?.size ?? 0],
    },
  });
};

/** Emoji markers for landmarks; drawn under the business dots. */
export const createEmojiLandmarkLayer = ({ landmarks, zoom = 12 }: LandmarkEmojiLayerProps) => {
  const validLandmarks = landmarks.filter((l) => l != null && l.lat != null && l.lng != null && l.emoji != null);
  if (validLandmarks.length === 0) return null;

  const emojiSize = zoom < 12 ? 20 : zoom < 14 ? 24 : 28;

  return new TextLayer<{ lat: number; lng: number; emoji: string }>({
    id: "emoji-landmarks",
    data: validLandmarks,
    pickable: false,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    getPosition: (d) => [d.lng, d.lat],
    getText: (d) => d.emoji,
    getSize: emojiSize,
    getAngle: 0,
    getTextAnchor: "middle",
    getAlignmentBaseline: "center",
    parameters: NO_DEPTH_TEST,
    updateTriggers: { getSize: [zoom] },
  });
};
