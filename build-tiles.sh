#!/bin/bash

# Vector tiles build script
echo "🚀 Starting vector tile generation..."

# Check if tippecanoe is installed
if ! command -v tippecanoe &> /dev/null; then
    echo "❌ tippecanoe not found. Install it first:"
    echo "  macOS: brew install tippecanoe"
    echo "  Ubuntu: sudo apt install tippecanoe"
    exit 1
fi

echo "✅ tippecanoe found"

# Create tiles directory
mkdir -p public/tiles
echo "📁 Created public/tiles directory"

# Generate business tiles
echo "🏢 Generating business tiles..."
tippecanoe -o public/tiles/businesses.mbtiles public/data/example-points.geojson \
  --minimum-zoom=10 \
  --maximum-zoom=16 \
  --drop-densest-as-needed \
  --simplify-only-low-zooms \
  --layer=businesses

# Generate land tiles
echo "🏞️ Generating land tiles..."
tippecanoe -o public/tiles/land.mbtiles public/data/nyc_land.geojson \
  --minimum-zoom=8 \
  --maximum-zoom=16 \
  --layer=land

# Extract tiles
echo "📦 Extracting tile files..."
tile-join -e public/tiles/businesses public/tiles/businesses.mbtiles
tile-join -e public/tiles/land public/tiles/land.mbtiles

# Clean up mbtiles files
rm -f public/tiles/businesses.mbtiles
rm -f public/tiles/land.mbtiles

echo "🎉 Vector tiles generated successfully!"
echo "💡 Refresh your app to use the new tiles"