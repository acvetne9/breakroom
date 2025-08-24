# GeoJSON Compression Setup

Your app now supports compressed GeoJSON files for faster loading! 🚀

## How it works

- The app automatically tries to load `.geojson.gz` files first
- Falls back to regular `.geojson` files if compressed versions aren't available
- Uses gzip compression which can reduce file sizes by 70-90%

## To compress your files

1. Make sure you have your GeoJSON files in the `public/data/` folder:
   - `public/data/example-points.geojson`
   - `public/data/nyc_land.geojson`

2. Run the compression script:
   ```bash
   node compress-geojson.js
   ```

3. This will create compressed versions:
   - `public/data/example-points.geojson.gz`
   - `public/data/nyc_land.geojson.gz`

## Benefits

- **Faster loading**: Smaller files download quicker
- **Reduced bandwidth**: Saves data for users
- **Better performance**: Less network time means faster map rendering
- **Automatic fallback**: Still works if compression fails

## File size examples

Typical compression ratios for GeoJSON:
- Large land data: 70-90% size reduction
- Point data: 60-80% size reduction
- Complex polygons: 80-95% size reduction

The app handles decompression automatically using the pako library.