import { useEffect } from 'react';

/**
 * Hook to initialize semantic search on app load
 * Models are now loaded on-demand, no precomputation needed
 */
export function useSemanticSearchInit() {
  useEffect(() => {
    console.log('ℹ️ Semantic search will load on-demand (no cache)');
  }, []);
}
