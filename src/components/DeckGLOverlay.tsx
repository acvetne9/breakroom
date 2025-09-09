// import React, { useMemo, useRef, useEffect, useState } from 'react';
// import { MapboxOverlay } from '@deck.gl/mapbox';
// import { createBusinessScatterplotLayer, createBusinessClusterLayer } from '@/utils/deckGLLayers';
// import type { Business } from '@/types/business';

// // Singleton overlay for performance
// let overlayInstance: MapboxOverlay | null = null;
// let overlayUpdateTimeout: NodeJS.Timeout | null = null;

// interface DeckGLOverlayProps {
//   map: maplibregl.Map;
//   businesses: Business[] | any[]; // Can be clustered data from worker
//   selectedBusinessId?: string;
//   onBusinessClick?: (business: Business) => void;
//   enableClustering?: boolean;
//   isClusteredData?: boolean; // Indicates if data is pre-clustered
//   zoom?: number; // Current zoom level
// }

// export const DeckGLOverlay: React.FC<DeckGLOverlayProps> = ({
//   map,
//   businesses,
//   selectedBusinessId,
//   onBusinessClick,
//   enableClustering = true,
//   isClusteredData = false,
//   zoom = 12
// }) => {
//   const [overlayReady, setOverlayReady] = useState(false);
  
//   // Initialize overlay once
//   const overlay = useMemo(() => {
//     if (overlayInstance) {
//       setOverlayReady(true);
//       return overlayInstance;
//     }

//     const newOverlay = new MapboxOverlay({
//       interleaved: true,
//       layers: []
//     });

//     // Add to map
//     map.addControl(newOverlay as any);
//     overlayInstance = newOverlay;
//     setOverlayReady(true);

//     return newOverlay;
//   }, [map]);

//   // Always show individual clickable businesses - no clustering
//   const layers = useMemo(() => {
//     if (!businesses.length) return [];
    
//     // If data is pre-clustered from worker, extract individual businesses
//     if (isClusteredData) {
//       console.log(`🎯 Extracting individual businesses from clustered data: ${businesses.length} items`);
//       const individualBusinesses = businesses.flatMap((item: any) => {
//         if (item.type === 'cluster' && item.businesses) {
//           return item.businesses;
//         } else if (item.type !== 'cluster') {
//           return [item];
//         }
//         return [];
//       });
      
//       return [createBusinessScatterplotLayer({
//         businesses: individualBusinesses as Business[],
//         selectedBusinessId,
//         onBusinessClick,
//       })];
//     }
    
//     console.log(`🎯 Creating scatter layer with ${businesses.length} individual clickable businesses`);
    
//     return [createBusinessScatterplotLayer({
//       businesses: businesses as Business[],
//       selectedBusinessId,
//       onBusinessClick,
//     })];
//   }, [businesses, selectedBusinessId, onBusinessClick, enableClustering, isClusteredData, zoom]); // Removed map dependency

//   // Smooth layer updates with improved transitions
//   useEffect(() => {
//     if (!overlay || !overlayReady) return;

//     // Clear existing timeout
//     if (overlayUpdateTimeout) {
//       clearTimeout(overlayUpdateTimeout);
//     }

//     // Direct update without timeout to prevent loops
//     overlay.setProps({ 
//       layers
//     });
//     console.log(`🎯 Updated deck.gl with ${layers.length} layers`);

//     return () => {
//       if (overlayUpdateTimeout) {
//         clearTimeout(overlayUpdateTimeout);
//       }
//     };
//   }, [overlay, overlayReady, layers]);

//   // Cleanup
//   useEffect(() => {
//     return () => {
//       console.log('🔧 DeckGLOverlay cleanup');
//       if (overlayUpdateTimeout) {
//         clearTimeout(overlayUpdateTimeout);
//       }
//     };
//   }, []);

//   return null;
// };