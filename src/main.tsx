import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Register service worker to normalize .pbf headers on the fly
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/data/tiles/tiles-sw.js', { 
      scope: '/data/tiles/' 
    })
      .then(reg => console.log('🧩 Service worker registered for tiles:', reg.scope))
      .catch(err => console.log('🧩 Service worker registration failed:', err));
  });
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
