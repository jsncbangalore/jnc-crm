import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './styles/globals.css';

// React-driven DOM initialization: configure body attributes and theme inside React
if (typeof document !== 'undefined') {
  document.body.className = 'font-sans antialiased selection:bg-crm-blue selection:text-white m-0 p-0';
  try {
    const saved = localStorage.getItem('crm_theme') || 'light';
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  } catch {}
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Prevent Back/Forward Cache (bfcache) restoration of protected pages after logout
if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', (event: PageTransitionEvent) => {
    if (event.persisted) {
      window.location.reload();
    }
  });
}
