import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import './index.css';
import App from './App.tsx';

// Evita que el navegador almacene la página en bfcache.
// Al tener un listener de 'unload' (aunque esté vacío), Chrome/Safari
// no cachean la página y fuerzan un F5 real al volver,
// igual que FIFA.com o cualquier app que no quiera una preview en blanco.
window.addEventListener('unload', () => {});

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
