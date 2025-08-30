#!/bin/bash

# Vector Tile Generation Script
# This script generates vector tiles from GeoJSON data

echo "🧭 Vector Tile Generator"
echo "========================"

# Check if tippecanoe is installed
if ! command -v tippecanoe &> /dev/null; then
    echo "❌ tippecanoe not found. Please install it:"
    echo "   macOS: brew install tippecanoe"
    echo "   Ubuntu: apt-get install tippecanoe"
    exit 1
fi
echo "✅ tippecanoe found"

# Check if mb-util is installed
if ! command -v mb-util &> /dev/null; then
    echo "❌ mb-util not found. Please install it:"
    echo "   npm install -g @mapbox/mbutil"
    exit 1
fi
echo "✅ mb-util found"

# Paths
DATA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TILES_DIR="$DATA_DIR/tiles"
GEOJSON_FILE="$DATA_DIR/example-points.geojson"
MBTILES_FILE="$DATA_DIR/nyc-tiles.mbtiles"

# Check if GeoJSON exists
if [ ! -f "$GEOJSON_FILE" ]; then
    # Check for gzipped version
    if [ -f "$GEOJSON_FILE.gz" ]; then
        echo "📦 Found gzipped GeoJSON, extracting..."
        gunzip -k "$GEOJSON_FILE.gz"
        echo "✅ Extracted GeoJSON file"
    else
        echo "❌ GeoJSON file not found: $GEOJSON_FILE"
        echo "   Make sure you have example-points.geojson or example-points.geojson.gz"
        exit 1
    fi
fi

# Clean existing tiles
if [ -d "$TILES_DIR" ]; then
    echo "🧹 Cleaning existing tiles..."
    find "$TILES_DIR" -name "*.pbf" -delete
fi
mkdir -p "$TILES_DIR"

echo ""
echo "🛠️ Generating vector tiles..."

# Generate MBTiles using tippecanoe
echo "🔨 Running tippecanoe..."
tippecanoe \
    -o "$MBTILES_FILE" \
    -z16 \
    -Z8 \
    --drop-densest-as-needed \
    --extend-zooms-if-still-dropping \
    --layer=features \
    --force \
    "$GEOJSON_FILE"

if [ $? -ne 0 ]; then
    echo "❌ tippecanoe failed"
    exit 1
fi
echo "✅ Generated MBTiles file"

# Extract tiles to directory structure
echo "📂 Extracting tiles..."
mb-util "$MBTILES_FILE" "$TILES_DIR" --image_format=pbf

if [ $? -ne 0 ]; then
    echo "❌ mb-util failed"
    exit 1
fi
echo "✅ Extracted tiles to directory"

# Clean up MBTiles file
if [ -f "$MBTILES_FILE" ]; then
    rm "$MBTILES_FILE"
    echo "🧹 Cleaned up MBTiles file"
fi

# Count tiles
echo ""
echo "📊 Tile generation summary:"
find "$TILES_DIR" -name "*.pbf" | wc -l | xargs echo "   Total tiles:"

echo ""
echo "🎉 Vector tiles generated successfully!"
echo "📁 Tiles location: $TILES_DIR"
echo "🗺️ Your map should now display with vector tiles"