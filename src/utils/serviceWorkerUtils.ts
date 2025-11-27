// =====================================================
// SERVICE WORKER REGISTRATION
// =====================================================
// Add this to your main app entry point (e.g., index.tsx or App.tsx)

export const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      console.log('🔧 Registering Service Worker...');
      
      const registration = await navigator.serviceWorker.register('/sw-tiles.js', {
        scope: '/'
      });

      console.log('✅ Service Worker registered:', registration);

      // Listen for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        console.log('🔄 Service Worker update found');
        
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('✨ New Service Worker available - reload to update');
            // Optionally show a notification to the user
            // showUpdateNotification();
          }
        });
      });

      return registration;
    } catch (error) {
      console.error('❌ Service Worker registration failed:', error);
    }
  } else {
    console.warn('⚠️ Service Workers not supported in this browser');
  }
};

// Helper: Unregister service worker (for debugging)
export const unregisterServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
      console.log('🗑️ Service Worker unregistered');
    }
  }
};

// Helper: Clear all caches
export const clearServiceWorkerCache = async () => {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();
      
      messageChannel.port1.onmessage = (event) => {
        resolve(event.data);
      };

      navigator.serviceWorker.controller.postMessage(
        { type: 'CLEAR_CACHE' },
        [messageChannel.port2]
      );
    });
  }
};

// Helper: Get cache size
export const getCacheSize = async () => {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();
      
      messageChannel.port1.onmessage = (event) => {
        resolve(event.data);
      };

      navigator.serviceWorker.controller.postMessage(
        { type: 'GET_CACHE_SIZE' },
        [messageChannel.port2]
      );
    });
  }
  return null;
};

// Usage example in your app:
/*
import { registerServiceWorker, getCacheSize, clearServiceWorkerCache } from './serviceWorkerUtils';

// In your main App component or index.tsx:
useEffect(() => {
  registerServiceWorker();
}, []);

// To check cache size:
const checkCache = async () => {
  const size = await getCacheSize();
  console.log('Cache size:', size);
};

// To clear cache (e.g., in settings):
const handleClearCache = async () => {
  await clearServiceWorkerCache();
  console.log('Cache cleared!');
};
*/
