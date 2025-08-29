#!/usr/bin/env node

// Build script to generate vector tiles automatically
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting vector tile generation...');

// Check if tippecanoe is installed
try {
  execSync('tippecanoe --version', { stdio: 'ignore' });
  console.log('✅ tippecanoe found');
} catch (error) {
  console.error('❌ tippecanoe not found. Install it first:');
  console.error('  macOS: brew install tippecanoe');
  console.error('  Ubuntu: sudo apt install tippecanoe');
  process.exit(1);
}

// Create tiles directory
const tilesDir = path.join(__dirname, 'public', 'tiles');
if (!fs.existsSync(tilesDir)) {
  fs.mkdirSync(tilesDir, { recursive: true });
  console.log('📁 Created public/tiles directory');
}

try {
  // Generate business tiles
  console.log('🏢 Generating business tiles...');
  execSync(`tippecanoe -o public/tiles/businesses.mbtiles public/data/example-points.geojson \\
    --minimum-zoom=10 \\
    --maximum-zoom=16 \\
    --drop-densest-as-needed \\
    --simplify-only-low-zooms \\
    --layer=businesses`, { stdio: 'inherit' });
  
  // Generate land tiles
  console.log('🏞️ Generating land tiles...');
  execSync(`tippecanoe -o public/tiles/land.mbtiles public/data/nyc_land.geojson \\
    --minimum-zoom=8 \\
    --maximum-zoom=16 \\
    --layer=land`, { stdio: 'inherit' });
  
  // Extract tiles
  console.log('📦 Extracting tile files...');
  execSync('tile-join -e public/tiles/businesses public/tiles/businesses.mbtiles', { stdio: 'inherit' });
  execSync('tile-join -e public/tiles/land public/tiles/land.mbtiles', { stdio: 'inherit' });
  
  // Clean up mbtiles files
  fs.unlinkSync('public/tiles/businesses.mbtiles');
  fs.unlinkSync('public/tiles/land.mbtiles');
  
  console.log('🎉 Vector tiles generated successfully!');
  console.log('💡 Refresh your app to use the new tiles');
  
} catch (error) {
  console.error('❌ Error generating tiles:', error.message);
  process.exit(1);
}