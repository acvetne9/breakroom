import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Check if we're running in Capacitor
const isCapacitor = () => {
  return !!(window as any).Capacitor || window.location.protocol === 'capacitor:';
};

// Register service worker to normalize .pbf headers on the fly (web only)
let serviceWorkerReady: Promise<void> | null = null;

if ('serviceWorker' in navigator && !isCapacitor()) {
  serviceWorkerReady = (async () => {
    try {
      // Check if service worker is already registered and active
      const existingReg = await navigator.serviceWorker.getRegistration('/');
      
      if (existingReg && existingReg.active) {
        console.log('🧩 Service worker already active');
        return;
      }
      
      // Register new service worker
      const reg = await navigator.serviceWorker.register('/tiles-sw.js', { 
        scope: '/' 
      });
      console.log('🧩 Service worker registered for tiles:', reg.scope);
      
      // Wait for activation
      await new Promise<void>((resolve) => {
        if (reg.active) {
          console.log('🧩 Service worker already active');
          resolve();
        } else {
          const checkState = () => {
            if (reg.installing) {
              reg.installing.addEventListener('statechange', function handler() {
                if (this.state === 'activated') {
                  console.log('🧩 Service worker activated');
                  resolve();
                  this.removeEventListener('statechange', handler);
                }
              });
            } else if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
              reg.waiting.addEventListener('statechange', function handler() {
                if (this.state === 'activated') {
                  console.log('🧩 Service worker activated after skip waiting');
                  resolve();
                  this.removeEventListener('statechange', handler);
                }
              });
            } else if (reg.active) {
              console.log('🧩 Service worker active');
              resolve();
            }
          };
          checkState();
        }
      });
    } catch (err) {
      console.log('🧩 Service worker registration failed:', err);
    }
  })();
} else if (isCapacitor()) {
  console.log('🔧 Running in Capacitor - service worker disabled, using tile patching');
  serviceWorkerReady = Promise.resolve();
}

// Export for use in components
(window as any).__serviceWorkerReady = serviceWorkerReady;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
