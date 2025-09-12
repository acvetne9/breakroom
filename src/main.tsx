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
  window.addEventListener('load', async () => {
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
      
      // Force activation
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    } catch (err) {
      console.log('🧩 Service worker registration failed:', err);
    }
  });
} else if (isCapacitor()) {
  console.log('🔧 Running in Capacitor - service worker disabled');
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
