import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './store/display'; // side effects: apply + subscribe the theme/motion store
import App from './App.tsx';

// T-PWA-2 (Chair PASS): the single service-worker registration path.
// Manual only — no virtual:pwa-register import anywhere. Deferred to the
// window load event so registration never competes with first paint (the
// 5.8 MB lib chunk), and only where service workers exist. Scope is the Vite
// base (Pages subpath or Workers root), so the worker never controls
// outside this app's base. Non-auto update: no skipWaiting, no auto-reload
// here — the update prompt is T-PWA-3.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .catch(() => {
        /* No worker offline — the app still works online, as before. */
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
