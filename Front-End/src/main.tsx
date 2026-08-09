import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import '@/styles/globals.css';

/*
 * Entry point.
 *
 * BrowserRouter rather than HashRouter: the deployed host must serve index.html for
 * every unmatched path, or a refresh on /auth/request-access is a 404 from the static
 * server before React ever loads.
 *
 * The session lives in AuthProvider, mounted inside App above the route table — it has
 * to wrap the router, because the route guards read it.
 */

const container = document.getElementById('root');
if (!container) throw new Error('No #root element — check index.html');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
