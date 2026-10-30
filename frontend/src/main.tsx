import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);

// PWA service worker (offline shell + queued sync via localStorage outbox)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
// Replay queued clipboard writes when back online
window.addEventListener('online', async () => {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith('clip-outbox-')) {
      const code = k.replace('clip-outbox-', '');
      try {
        await fetch(`/api/rooms/${code}/clipboard`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: localStorage.getItem(k) }) });
        localStorage.removeItem(k);
      } catch {}
    }
  }
});
