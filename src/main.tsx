import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Check if we're running in Capacitor
const isCapacitor = () => {
  return !!(window as any).Capacitor || window.location.protocol === 'capacitor:';
};

// Note: Service worker approach disabled in favor of fetch interception in MapLibreMap.tsx
if (isCapacitor()) {
  console.log('🔧 Running in Capacitor - using direct tile patching');
} else {
  console.log('🌐 Running on web - using fetch interception for tile decompression');
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
