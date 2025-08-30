# Vector Tiles Directory

This directory should contain vector tiles in the Mapbox Vector Tile format (.pbf files).

## Structure
```
tiles/
├── {z}/
│   ├── {x}/
│   │   ├── {y}.pbf
│   │   └── ...
│   └── ...
└── ...
```

## Generating Vector Tiles

To generate vector tiles from your GeoJSON data:

### Option 1: Using tippecanoe (Recommended)
```bash
# Install tippecanoe
brew install tippecanoe  # macOS
# or
apt-get install tippecanoe  # Ubuntu

# Generate tiles
tippecanoe -o tiles.mbtiles \
  -z12 \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --layer=features \
  example-points.geojson

# Extract to directory structure
mb-util tiles.mbtiles tiles/
```

### Option 2: Using @mapbox/tile-reduce
```bash
npm install -g @mapbox/tile-reduce @mapbox/mbtiles

# Process and generate tiles
tile-reduce example-points.geojson \
  --map=./tile-processor.js \
  --output=tiles.mbtiles

# Extract tiles
mb-util tiles.mbtiles tiles/
```

### Current Status
- [ ] Vector tiles generated
- [ ] Tiles placed in correct directory structure
- [ ] Map configured to use vector tiles

The map will not display properly until actual .pbf vector tiles are generated and placed in this directory.