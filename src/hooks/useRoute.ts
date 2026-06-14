import { useState, useEffect } from 'react';

export type Route = 'landing' | 'app' | 'admin';

function getRoute(): Route {
  if (window.location.pathname.startsWith('/admin')) return 'admin';
  if (window.location.hash === '#/admin') return 'admin';
  if (window.location.hash === '#/app') return 'app';
  return 'landing';
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(getRoute);

  useEffect(() => {
    const onHash = () => setRoute(getRoute());
    const onPop  = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  const navigate = (r: Route) => {
    if (r === 'admin') {
      window.history.pushState(null, '', '/admin');
      setRoute('admin'); // pushState never fires popstate — update manually
      return;
    }
    if (window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
    }
    window.location.hash = r === 'app' ? '#/app' : '#/';
  };

  return { route, navigate };
}
