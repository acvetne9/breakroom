import { useEffect } from 'react';
import { precomputeCommonTerms } from '@/utils/synonymService';

/**
 * Hook to initialize semantic search on app load
 * Pre-computes synonyms for common hospitality terms in background
 */
export function useSemanticSearchInit() {
  useEffect(() => {
    // Precompute common terms in background (non-blocking)
    precomputeCommonTerms().catch(err => {
      console.warn('Failed to precompute semantic search terms:', err);
    });
  }, []);
}
