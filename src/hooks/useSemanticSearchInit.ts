import { useEffect } from 'react';
import { precomputeCommonTerms } from '@/utils/smartSearch';

/**
 * Hook to initialize semantic search on app load
 * Pre-computes synonyms for common hospitality terms in background
 */
export function useSemanticSearchInit() {
  useEffect(() => {
    // Precompute common terms in background (non-blocking)
    console.log('🚀 Starting semantic search precomputation...');
    precomputeCommonTerms()
      .then(() => console.log('✅ Semantic search precomputation complete'))
      .catch(err => {
        console.warn('Failed to precompute semantic search terms:', err);
      });
  }, []);
}
