// Simple script to create compressed versions of the GeoJSON files
const fs = require('fs');
const zlib = require('zlib');

// Read and compress example-points.geojson
const examplePoints = fs.readFileSync('public/data/example-points.geojson');
const compressedPoints = zlib.gzipSync(examplePoints, { level: 9 });
fs.writeFileSync('public/data/example-points.geojson.gz', compressedPoints);

// Read and compress nyc_land.geojson
const nycLand = fs.readFileSync('public/data/nyc_land.geojson');
const compressedLand = zlib.gzipSync(nycLand, { level: 9 });
fs.writeFileSync('public/data/nyc_land.geojson.gz', compressedLand);

console.log('✅ Created compressed GeoJSON files:');
console.log('- public/data/example-points.geojson.gz');
console.log('- public/data/nyc_land.geojson.gz');

// Show compression stats
const originalPointsSize = fs.statSync('public/data/example-points.geojson').size;
const compressedPointsSize = fs.statSync('public/data/example-points.geojson.gz').size;
const pointsRatio = ((originalPointsSize - compressedPointsSize) / originalPointsSize * 100).toFixed(1);

const originalLandSize = fs.statSync('public/data/nyc_land.geojson').size;
const compressedLandSize = fs.statSync('public/data/nyc_land.geojson.gz').size;
const landRatio = ((originalLandSize - compressedLandSize) / originalLandSize * 100).toFixed(1);

console.log('\n📊 Compression Stats:');
console.log(`Points: ${originalPointsSize} → ${compressedPointsSize} bytes (${pointsRatio}% saved)`);
console.log(`Land: ${originalLandSize} → ${compressedLandSize} bytes (${landRatio}% saved)`);
console.log('\n🚀 App will now load compressed versions automatically!');