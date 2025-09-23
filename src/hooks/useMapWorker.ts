import { useCallback, useRef, useEffect } from 'react';
import type { Business } from '@/types/business';

interface WorkerResponse {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
}

let workerInstance: Worker | null = null;
const pendingRequests = new Map<string, {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}>();

// Initialize worker singleton
function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('../workers/mapWorker.ts', import.meta.url),
      { type: 'module' }
    );
    
    workerInstance.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { id, success, result, error } = e.data;
      const pending = pendingRequests.get(id);
      
      if (pending) {
        pendingRequests.delete(id);
        if (success) {
          pending.resolve(result);
        } else {
          pending.reject(new Error(error || 'Worker error'));
        }
      }
    };
    
    workerInstance.onerror = (error) => {
      console.error('Worker error:', error);
      // Reject all pending requests
      pendingRequests.forEach(({ reject }) => {
        reject(new Error('Worker crashed'));
      });
      pendingRequests.clear();
    };
  }
  
  return workerInstance;
}

export const useMapWorker = () => {
  const requestIdRef = useRef(0);
  
  const postMessage = useCallback(<T>(type: string, data: any): Promise<T> => {
    return new Promise((resolve, reject) => {
      try {
        const worker = getWorker();
        const id = `req-${++requestIdRef.current}`;
        
        pendingRequests.set(id, { resolve, reject });
        
        worker.postMessage({ id, type, data });
        
        // Timeout after 30 seconds
        setTimeout(() => {
          if (pendingRequests.has(id)) {
            pendingRequests.delete(id);
            reject(new Error('Worker request timeout'));
          }
        }, 30000);
        
      } catch (error) {
        reject(error);
      }
    });
  }, []);
  
  const clusterBusinesses = useCallback(async (
    businesses: Business[], 
    zoom: number, 
    bounds: [number, number, number, number]
  ) => {
    if (!Array.isArray(businesses) || businesses.length === 0) return [];
    
    try {
      return await postMessage('cluster', { businesses, zoom, bounds });
    } catch (error) {
      console.error('Clustering failed, falling back to original data:', error);
      return businesses.map(business => ({ type: 'point', ...business }));
    }
  }, [postMessage]);
  
  const simplifyShapes = useCallback(async (
    features: any[], 
    zoom: number
  ) => {
    if (features.length === 0) return [];
    
    try {
      return await postMessage('simplify', { features, zoom });
    } catch (error) {
      console.error('Simplification failed, using original features:', error);
      return features;
    }
  }, [postMessage]);
  
  const processAllShapes = useCallback(async (
    shapeData: {
      parks?: any[];
      water?: any[];
      roads?: any[];
      waterways?: any[];
    },
    zoom: number
  ) => {
    try {
      return await postMessage('process-shapes', { ...shapeData, zoom });
    } catch (error) {
      console.error('Shape processing failed, using original data:', error);
      return shapeData;
    }
  }, [postMessage]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't terminate worker immediately - keep it for reuse
      // workerInstance?.terminate();
    };
  }, []);
  
  return {
    clusterBusinesses,
    simplifyShapes,
    processAllShapes
  };
};
