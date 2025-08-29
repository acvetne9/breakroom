import { useState, useEffect } from 'react';

export interface TileStatus {
  businessTilesExist: boolean;
  landTilesExist: boolean;
  allTilesReady: boolean;
  checked: boolean;
}

export const useTileChecker = () => {
  const [tileStatus, setTileStatus] = useState<TileStatus>({
    businessTilesExist: false,
    landTilesExist: false,
    allTilesReady: false,
    checked: false
  });

  const checkTileExists = async (url: string): Promise<boolean> => {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  };

  const checkAllTiles = async () => {
    console.log('🔍 Checking if vector tiles exist...');
    
    // Check if sample tiles exist at zoom 10
    const businessTileUrl = `${window.location.origin}/tiles/businesses/10/150/193.pbf`;
    const landTileUrl = `${window.location.origin}/tiles/land/10/150/193.pbf`;
    
    const [businessTilesExist, landTilesExist] = await Promise.all([
      checkTileExists(businessTileUrl),
      checkTileExists(landTileUrl)
    ]);

    const allTilesReady = businessTilesExist && landTilesExist;
    
    console.log('📊 Tile status:', { businessTilesExist, landTilesExist, allTilesReady });
    
    setTileStatus({
      businessTilesExist,
      landTilesExist,
      allTilesReady,
      checked: true
    });

    return { businessTilesExist, landTilesExist, allTilesReady };
  };

  useEffect(() => {
    checkAllTiles();
  }, []);

  return {
    tileStatus,
    checkAllTiles
  };
};