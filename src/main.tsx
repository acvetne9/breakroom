import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Check if we're running in Capacitor
const isCapacitor = () => {
  return !!(window as any).Capacitor || window.location.protocol === 'capacitor:';
};

// Register service worker to handle tile decompression on web
// On Capacitor, we use fetch patching instead (see capacitorTileHandler.ts)
if ('serviceWorker' in navigator && !isCapacitor()) {
  console.log('🌐 Web environment detected - registering service worker for tiles');
  
  window.addEventListener('load', async () => {
    try {
      // Unregister any old service workers first
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        console.log('🧹 Unregistered old service worker');
      }
      
      // Register new service worker
      const registration = await navigator.serviceWorker.register('/tiles-sw.js', { 
        scope: '/' 
      });
      console.log('✅ Service worker registered:', registration.scope);
      
      // Force immediate activation if waiting
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      
      // Wait for the service worker to be active and controlling
      await navigator.serviceWorker.ready;
      console.log('✅ Service worker is ready and active');
      
      // Store SW ready state globally for map initialization
      (window as any).__SW_READY__ = true;
      
    } catch (err) {
      console.error('❌ Service worker registration failed:', err);
      // Mark as ready anyway so app doesn't hang
      (window as any).__SW_READY__ = true;
    }
  });
} else if (isCapacitor()) {
  console.log('📱 Capacitor environment detected - service worker disabled (using fetch patching)');
  (window as any).__SW_READY__ = true; // No SW needed on Capacitor
} else {
  console.log('⚠️ Service workers not supported in this environment');
  (window as any).__SW_READY__ = true;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
