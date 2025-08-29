# Vector Tiles Setup

This app now automatically detects when vector tiles are missing and shows setup instructions. Vector tiles reduce memory usage by 90%+ compared to loading entire GeoJSON files.

## Automatic Detection

When you load the app:
1. ✅ **If tiles exist**: Uses vector tiles automatically (much faster!)
2. ⚠️ **If tiles missing**: Shows setup modal with step-by-step instructions
3. 🔄 **Fallback**: Always falls back to GeoJSON if tiles fail to load

## Quick Setup Options

### Option 1: Run the build script (Recommended)
```bash
# Make executable and run
chmod +x build-tiles.sh
./build-tiles.sh
```

### Option 2: Manual commands
Follow the step-by-step instructions in the setup modal that appears when you load the app.

### Option 3: Node.js script
```bash
node build-tiles.js
```

## What happens after setup

1. **90%+ memory reduction**: Only loads tiles in viewport instead of entire files
2. **Faster loading**: Pre-simplified geometry at different zoom levels
3. **Better performance**: Especially noticeable on mobile devices
4. **Automatic detection**: App will automatically use tiles once they're available

## File structure after setup
```
public/tiles/
├── businesses/
│   └── 10/
│       └── 150/
│           └── 193.pbf (example tile)
└── land/
    └── 10/
        └── 150/
            └── 193.pbf (example tile)
```

## Troubleshooting

- **Modal doesn't disappear**: Refresh the page after generating tiles
- **Tiles not loading**: Check browser console for network errors
- **tippecanoe errors**: Make sure your GeoJSON files are valid
- **Still using GeoJSON**: The app automatically falls back if tiles fail

The system is designed to be zero-maintenance once set up - it will automatically detect and use the most efficient data source available.