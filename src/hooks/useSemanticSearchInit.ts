import { useEffect } from 'react';
import { precomputeCommonTerms } from '@/utils/smartSearch';
import { pipeline } from "@xenova/transformers";

/**
 * Hook to initialize semantic search on app load
 * Pre-computes synonyms for common hospitality terms in background
 */
export function useSemanticSearchInit() {
  useEffect(() => {
    // Preload embedder model in background
    console.log('🚀 Preloading semantic embedder model...');
    pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2")
      .then(() => console.log('✅ Embedder model loaded'))
      .catch(err => console.warn('⚠️ Failed to preload embedder:', err));
    
    // Precompute common terms in background (non-blocking)
    console.log('🚀 Starting semantic search precomputation...');
    precomputeCommonTerms()
      .then(() => console.log('✅ Semantic search precomputation complete'))
      .catch(err => {
        console.warn('Failed to precompute semantic search terms:', err);
      });
  }, []);
}
