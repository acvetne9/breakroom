#!/usr/bin/env node

/**
 * Vector Tile Generator Script
 * 
 * This script converts the existing GeoJSON data to vector tiles (.pbf format)
 * using tippecanoe or other tile generation tools.
 * 
 * Usage:
 *   node scripts/generate-tiles.js
 * 
 * Prerequisites:
 *   - tippecanoe installed (brew install tippecanoe)
 *   - mb-util installed (npm install -g @mapbox/mbutil)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Paths
const PUBLIC_DIR = path.join(__dirname, '../public');
const DATA_DIR = path.join(PUBLIC_DIR, 'data');
const TILES_DIR = path.join(DATA_DIR, 'tiles');
const GEOJSON_FILE = path.join(DATA_DIR, 'example-points.geojson');
const MBTILES_FILE = path.join(DATA_DIR, 'nyc-tiles.mbtiles');

console.log('🧭 Vector Tile Generator');
console.log('========================');

// Check if tippecanoe is installed
try {
  execSync('which tippecanoe', { stdio: 'ignore' });
  console.log('✅ tippecanoe found');
} catch (error) {
  console.error('❌ tippecanoe not found. Please install it:');
  console.error('   macOS: brew install tippecanoe');
  console.error('   Ubuntu: apt-get install tippecanoe');
  process.exit(1);
}

// Check if mb-util is installed
try {
  execSync('which mb-util', { stdio: 'ignore' });
  console.log('✅ mb-util found');
} catch (error) {
  console.error('❌ mb-util not found. Please install it:');
  console.error('   npm install -g @mapbox/mbutil');
  process.exit(1);
}

// Check if GeoJSON file exists
if (!fs.existsSync(GEOJSON_FILE)) {
  // Check for gzipped version
  const gzFile = GEOJSON_FILE + '.gz';
  if (fs.existsSync(gzFile)) {
    console.log('📦 Found gzipped GeoJSON, extracting...');
    try {
      execSync(`gunzip -k "${gzFile}"`, { stdio: 'inherit' });
      console.log('✅ Extracted GeoJSON file');
    } catch (error) {
      console.error('❌ Failed to extract GeoJSON:', error.message);
      process.exit(1);
    }
  } else {
    console.error(`❌ GeoJSON file not found: ${GEOJSON_FILE}`);
    console.error('   Make sure you have example-points.geojson or example-points.geojson.gz in public/data/');
    process.exit(1);
  }
}

// Create tiles directory
if (!fs.existsSync(TILES_DIR)) {
  fs.mkdirSync(TILES_DIR, { recursive: true });
  console.log('📁 Created tiles directory');
}

console.log('\n🛠️ Generating vector tiles...');

try {
  // Generate MBTiles using tippecanoe
  const tippecanoecmd = [
    'tippecanoe',
    `-o "${MBTILES_FILE}"`,
    '-z16',  // max zoom
    '-Z8',   // min zoom
    '--drop-densest-as-needed',
    '--extend-zooms-if-still-dropping',
    '--layer=features',  // layer name
    '--force',  // overwrite existing
    `"${GEOJSON_FILE}"`
  ].join(' ');

  console.log('🔨 Running tippecanoe...');
  console.log(`   ${tippecanoecmd}`);
  execSync(tippecanoecmd, { stdio: 'inherit' });
  console.log('✅ Generated MBTiles file');

  // Extract tiles to directory structure
  console.log('📂 Extracting tiles...');
  const extractCmd = `mb-util "${MBTILES_FILE}" "${TILES_DIR}" --image_format=pbf`;
  console.log(`   ${extractCmd}`);
  execSync(extractCmd, { stdio: 'inherit' });
  console.log('✅ Extracted tiles to directory');

  // Clean up MBTiles file
  if (fs.existsSync(MBTILES_FILE)) {
    fs.unlinkSync(MBTILES_FILE);
    console.log('🧹 Cleaned up MBTiles file');
  }

  // Show directory structure
  console.log('\n📊 Tile generation summary:');
  const tileCounts = {};
  
  function countTiles(dir, prefix = '') {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        countTiles(fullPath, `${prefix}${item}/`);
      } else if (item.endsWith('.pbf')) {
        const zoom = prefix.split('/').length - 1;
        tileCounts[zoom] = (tileCounts[zoom] || 0) + 1;
      }
    }
  }
  
  countTiles(TILES_DIR);
  
  let totalTiles = 0;
  for (const [zoom, count] of Object.entries(tileCounts)) {
    console.log(`   Zoom ${zoom}: ${count} tiles`);
    totalTiles += count;
  }
  console.log(`   Total: ${totalTiles} tiles`);

  console.log('\n🎉 Vector tiles generated successfully!');
  console.log(`📁 Tiles location: ${TILES_DIR}`);
  console.log('🗺️ Your map should now display with vector tiles');

} catch (error) {
  console.error('❌ Error generating tiles:', error.message);
  process.exit(1);
}