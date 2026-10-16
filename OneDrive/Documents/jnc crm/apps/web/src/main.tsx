import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './styles/globals.css';

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
