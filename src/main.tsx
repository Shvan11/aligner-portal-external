import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Self-hosted fonts + icons, bundled by Vite and served same-origin from the
// Cloudflare Pages edge — replaces the render-blocking Google Fonts + cdnjs
// Font Awesome <link>s that used to sit in index.html. Same-origin removes the
// extra DNS+TLS round-trips to googleapis/gstatic/cdnjs from the critical
// render path, keeps first paint working where Google domains are slow/blocked,
// and leaks no visitor IP to Google. Variable fonts expose the family with a
// " Variable" suffix (see --font-display/--font-body in styles.css). Only the
// solid + brands icon styles are imported (this app uses no `far` icons).
import '@fontsource-variable/bricolage-grotesque'; // --font-display (headings/brand)
import '@fontsource-variable/schibsted-grotesk';   // --font-body
import '@fortawesome/fontawesome-free/css/fontawesome.min.css'; // FA core (.fa base + utils)
import '@fortawesome/fontawesome-free/css/solid.min.css';       // fas
import '@fortawesome/fontawesome-free/css/brands.min.css';      // fab
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
