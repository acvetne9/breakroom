import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Check if we're running in Capacitor
const isCapacitor = () => {
  return !!(window as any).Capacitor || window.location.protocol === 'capacitor:';
};

// Register service worker to normalize .pbf headers on the fly (web only)
if ('serviceWorker' in navigator && !isCapacitor()) {
  // Set up service worker BEFORE rendering app
  (async () => {
    try {
      // Unregister any existing service workers first
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        console.log('🧩 Unregistered old service worker');
      }
      
      // Register new service worker
      const reg = await navigator.serviceWorker.register('/tiles-sw.js', { 
        scope: '/' 
      });
      console.log('🧩 Service worker registered for tiles:', reg.scope);
      
      // Wait for service worker to be ready and controlling
      await navigator.serviceWorker.ready;
      
      // If there's a waiting worker, activate it
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        // Wait a bit for activation
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Ensure we have a controller
      if (!navigator.serviceWorker.controller) {
        console.log('🧩 No controller yet, reloading page to activate service worker...');
        window.location.reload();
        return;
      }
      
      console.log('🧩 Service worker is active and controlling the page');
    } catch (err) {
      console.log('🧩 Service worker registration failed:', err);
    }
  })();
} else if (isCapacitor()) {
  console.log('🔧 Running in Capacitor - service worker disabled, using tile patching');
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
