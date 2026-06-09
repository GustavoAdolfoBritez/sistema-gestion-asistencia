import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import './index.css';
import App from './App.tsx';

// Detecta restauración desde caché del navegador mobile (bfcache).
// Al minimizar y volver, Chrome/Safari pueden mostrar pantalla en blanco
// porque no recalcula el layout correctamente desde el snapshot bfcache.
let pageHiddenAt = 0;

window.addEventListener('pagehide', () => {
  pageHiddenAt = Date.now();
});

window.addEventListener('pageshow', () => {
  if (pageHiddenAt && Date.now() - pageHiddenAt > 1000) {
    pageHiddenAt = 0;
    setTimeout(() => {
      // Navegación completa en vez de reload(), fuerza carga fresca
      window.location.href = window.location.href;
    }, 50);
  } else {
    pageHiddenAt = 0;
  }
});

// Fallback: si la página estuvo en background más de 30s y vuelve,
// forzamos navegación completa.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pageHiddenAt = Date.now();
  } else if (pageHiddenAt && Date.now() - pageHiddenAt > 30000) {
    pageHiddenAt = 0;
    window.location.href = window.location.href;
  }
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
