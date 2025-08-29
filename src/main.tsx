import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Register service worker to normalize .pbf headers on the fly
if ('serviceWorker' in navigator) {
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
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
