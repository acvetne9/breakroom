import { useState, useEffect } from 'react';

export const usePerformanceMode = () => {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [lowPerformanceDevice, setLowPerformanceDevice] = useState(false);

  useEffect(() => {
    // Check for user's reduced motion preference
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(motionQuery.matches);

    const handleMotionChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    motionQuery.addEventListener('change', handleMotionChange);

    // Detect low-performance devices
    const detectLowPerformance = () => {
      // Check hardware concurrency (CPU cores)
      const cores = navigator.hardwareConcurrency || 1;
      
      // Check device memory (if available)
      const memory = (navigator as any).deviceMemory || 0;
      
      // Check connection speed (if available)
      const connection = (navigator as any).connection;
      const slowConnection = connection && 
        (connection.effectiveType === 'slow-2g' || 
         connection.effectiveType === '2g' || 
         connection.saveData);

      // Consider it low performance if:
      // - Less than 4 CPU cores, OR
      // - Less than 4GB memory, OR  
      // - Slow connection detected
      const isLowPerformance = cores < 4 || memory < 4 || slowConnection;
      
      setLowPerformanceDevice(isLowPerformance);
    };

    detectLowPerformance();

    return () => {
      motionQuery.removeEventListener('change', handleMotionChange);
    };
  }, []);

  return {
    reducedMotion,
    lowPerformanceDevice,
    shouldReduceMotion: reducedMotion || lowPerformanceDevice
  };
};