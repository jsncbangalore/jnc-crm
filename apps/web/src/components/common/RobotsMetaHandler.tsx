import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function RobotsMetaHandler() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  React.useEffect(() => {
    let robotsMeta = document.querySelector('meta[name="robots"]');
    if (!robotsMeta) {
      robotsMeta = document.createElement('meta');
      robotsMeta.setAttribute('name', 'robots');
      document.head.appendChild(robotsMeta);
    }

    const path = location.pathname.replace(/\/+$/, '') || '/';
    // Only '/' for visitors (unauthenticated) and '/landing' may be indexed
    const isIndexOrLanding = (path === '/' && !isAuthenticated) || path === '/landing';

    if (isIndexOrLanding) {
      robotsMeta.setAttribute('content', 'index, follow');
    } else {
      robotsMeta.setAttribute('content', 'noindex, nofollow');
    }
  }, [location.pathname, isAuthenticated]);

  return null;
}
