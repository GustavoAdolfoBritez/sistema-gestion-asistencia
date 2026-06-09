import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import './index.css';
import App from './App.tsx';

// Restauración desde bfcache: el navegador muestra una snapshot vieja.
// Forzamos reload completo para que React se reinicie correctamente.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    window.location.reload();
  }
});

// Mobile Chrome: al volver del background, el motor de renderizado
// puede quedar congelado. Forzamos reflow y, si sigue roto, reload.
let lastHidden = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    lastHidden = Date.now();
    return;
  }
  if (Date.now() - lastHidden < 2000) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const root = document.getElementById('root');
      if (!root || root.children.length > 0) return;
      window.location.reload();
    });
  });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          style: {
            fontFamily: 'Lexend, sans-serif',
            fontSize: '14px',
          },
        }}
      />
    </BrowserRouter>
  </StrictMode>
);
