const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Function to compress a GeoJSON file
function compressGeoJSON(inputFile, outputFile) {
  return new Promise((resolve, reject) => {
    console.log(`Compressing ${inputFile}...`);
    
    const input = fs.createReadStream(inputFile);
    const output = fs.createWriteStream(outputFile);
    const gzip = zlib.createGzip({ level: 9 }); // Maximum compression
    
    // Get original file size
    const stats = fs.statSync(inputFile);
    const originalSize = stats.size;
    
    input
      .pipe(gzip)
      .pipe(output)
      .on('finish', () => {
        const compressedStats = fs.statSync(outputFile);
        const compressedSize = compressedStats.size;
        const ratio = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
        
        console.log(`✅ ${inputFile} -> ${outputFile}`);
        console.log(`   Original: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Compressed: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Saved: ${ratio}%`);
        console.log('');
        resolve();
      })
      .on('error', reject);
  });
}

// Main function - run compression immediately
async function main() {
  const filesToCompress = [
    'public/data/example-points.geojson',
    'public/data/nyc_land.geojson'
  ];
  
  console.log('🗜️  Compressing GeoJSON files...\n');
  
  for (const file of filesToCompress) {
    if (fs.existsSync(file)) {
      const outputFile = file + '.gz';
      await compressGeoJSON(file, outputFile);
    } else {
      console.log(`⚠️  File not found: ${file}`);
    }
  }
  
  console.log('✨ Compression complete!');
  console.log('\nCompressed files created:');
  console.log('- public/data/example-points.geojson.gz');
  console.log('- public/data/nyc_land.geojson.gz');
}

// Run immediately
main().then(() => {
  console.log('\n🚀 Your app will now load compressed GeoJSON automatically!');
}).catch(console.error);