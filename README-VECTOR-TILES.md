# Vector Tiles Setup

Your map has been configured to use vector tiles exclusively with the original "Load businesses by location" styling (wheat land, green parks, blue water, gray roads).

## Quick Start

1. **Install required tools:**
   ```bash
   # macOS
   brew install tippecanoe
   npm install -g @mapbox/mbutil
   
   # Ubuntu
   apt-get install tippecanoe
   npm install -g @mapbox/mbutil
   ```

2. **Generate vector tiles:**
   ```bash
   # Option 1: Use the shell script
   cd public/data/tiles
   chmod +x generate.sh
   ./generate.sh
   
   # Option 2: Use the Node.js script
   node scripts/generate-tiles.js
   ```

3. **Verify tiles were created:**
   ```bash
   # Check if tiles exist
   ls public/data/tiles/
   # Should show directories like: 8/ 9/ 10/ 11/ 12/ 13/ 14/ 15/ 16/
   
   # Count total tiles
   find public/data/tiles -name "*.pbf" | wc -l
   ```

## Current Status

- ✅ Map configured for vector tiles
- ✅ Original styling preserved (wheat/green/blue/gray)
- ✅ Tile generation scripts created
- ⏳ **Vector tiles need to be generated**

## What the Scripts Do

The generation scripts will:
1. Take your existing `example-points.geojson` (or `.gz` version)
2. Convert it to vector tiles using `tippecanoe`
3. Extract tiles to `public/data/tiles/{z}/{x}/{y}.pbf`
4. Clean up temporary files

## Expected Directory Structure

After running the script, you should have:
```
public/data/tiles/
├── 8/
│   ├── 75/
│   │   ├── 96.pbf
│   │   └── 97.pbf
│   └── 76/
├── 9/
├── 10/
├── 11/
├── 12/
├── 13/
├── 14/
├── 15/
└── 16/
```

## Troubleshooting

**"Vector Tiles Not Found" message:**
- Run the tile generation script
- Check that `.pbf` files exist in `public/data/tiles/`

**No map features visible:**
- Verify tiles were generated correctly
- Check browser console for tile loading errors
- Ensure tile server is serving `.pbf` files correctly

**Performance issues:**
- Vector tiles should be much faster than GeoJSON
- Tiles are cached and only loaded when needed
- Consider reducing max zoom level if tiles are too large