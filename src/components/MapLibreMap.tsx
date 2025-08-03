// Enhanced road color modification for your existing component
const updateRoadColors = (mapInstance: maplibregl.Map) => {
  try {
    const layers = mapInstance.getStyle().layers;
    
    // More comprehensive road layer detection
    const roadKeywords = [
      'road', 'highway', 'street', 'bridge', 'tunnel',
      'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
      'residential', 'service', 'track', 'path', 'footway',
      'cycleway', 'steps', 'pedestrian', 'living_street'
    ];
    
    layers.forEach(layer => {
      const layerId = layer.id.toLowerCase();
      const isRoadLayer = roadKeywords.some(keyword => layerId.includes(keyword));
      
      if (isRoadLayer && layer.type === 'line') {
        // Set all road colors to #CCCCCC
        mapInstance.setPaintProperty(layer.id, 'line-color', '#CCCCCC');
        
        // Also handle casing (road outlines) if they exist
        if (layerId.includes('casing')) {
          mapInstance.setPaintProperty(layer.id, 'line-color', '#AAAAAA');
        }
      }
    });
    
    console.log(`Updated ${layers.filter(l => 
      roadKeywords.some(k => l.id.toLowerCase().includes(k)) && l.type === 'line'
    ).length} road layers`);
    
  } catch (e) {
    console.log('Could not modify road colors:', e);
  }
};

// Use this in your existing map initialization
// Replace the road color section in your style.load handler with:
// updateRoadColors(mapInstance);