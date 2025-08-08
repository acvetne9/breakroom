# GeoJSON Data Directory

This directory contains GeoJSON files used by the map application.

## Current Files:
- `merged_roads.geojson.gz` - Compressed NYC road network data

## Adding New GeoJSON Data:

### Method 1: Direct File Upload
1. Place your `.geojson` files in this directory
2. Reference them in your code like: `/data/your-file.geojson`

### Method 2: Compressed Files
1. For large files, compress them: `gzip your-file.geojson`
2. Save as `your-file.geojson.gz`
3. The app will automatically decompress them

### Method 3: External URLs
You can also load GeoJSON from external URLs in your code.

## File Format Example:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-73.9857, 40.7484]
      },
      "properties": {
        "name": "Times Square"
      }
    }
  ]
}
```