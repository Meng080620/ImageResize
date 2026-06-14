import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthModal } from './components/auth/AuthModal';
import { useRoute } from './hooks/useRoute';
import { LandingPage } from './components/landing/LandingPage';
import { AdminPortal } from './components/admin/AdminPortal';
import App from './App';

const Router: React.FC = () => {
  const { route, navigate } = useRoute();
  const { refreshProfile } = useAuth();

  // After Stripe redirects back with ?payment=success, refresh the profile
  // so the plan upgrade is reflected immediately without a manual reload.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      refreshProfile();
      // Clean the query param from the URL without a reload
      const clean = window.location.pathname + window.location.hash.replace(/\?.*$/, '');
      window.history.replaceState(null, '', clean);
    }
  }, [refreshProfile]);

  return (
    <>
      <AnimatePresence mode="wait">
        {route === 'landing' && (
          <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <LandingPage onLaunchApp={() => navigate('app')} />
          </motion.div>
        )}
        {route === 'app' && (
          <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <App onBackToLanding={() => navigate('landing')} />
          </motion.div>
        )}
        {route === 'admin' && (
          <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <AdminPortal onBack={() => navigate('landing')} />
          </motion.div>
        )}
      </AnimatePresence>
      <AuthModal />
    </>
  );
};

export default function Root() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
