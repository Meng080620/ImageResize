import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, supabaseSession, SUPABASE_CONFIGURED, ADMIN_EMAILS, type Plan, type Profile } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  plan: Plan;
  isAdmin: boolean;
  isPremium: boolean;
  loading: boolean;
  authModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; confirmed: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const fetchProfile = useCallback(async (userId: string, email: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, plan')
      .eq('id', userId)
      .single();
    if (data) {
      setProfile(data as Profile);
    } else {
      // Profile missing — create it (handles race with trigger)
      const { data: created } = await supabase
        .from('profiles')
        .upsert({ id: userId, email, plan: 'free' })
        .select()
        .single();
      if (created) setProfile(created as Profile);
    }
  }, []);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) { setLoading(false); return; }

    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id, session.user.email ?? '');
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: string, session: Session | null) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id, session.user.email ?? '');
        } else {
          setProfile(null);
        }
      }
    );
    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string, rememberMe = true): Promise<string | null> => {
    if (!EMAIL_RE.test(email.trim())) return 'Please enter a valid email address.';
    if (!SUPABASE_CONFIGURED) return 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env';
    // Use the sessionStorage-backed client when not remembering so token refreshes
    // also stay in sessionStorage — the localStorage approach was undone on first refresh.
    const client = rememberMe ? supabase : supabaseSession;
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    return error?.message ?? null;
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<{ error: string | null; confirmed: boolean }> => {
    if (!EMAIL_RE.test(email.trim())) return { error: 'Please enter a valid email address.', confirmed: false };
    if (!SUPABASE_CONFIGURED) return { error: 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env', confirmed: false };
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return { error: error.message, confirmed: false };
    // If Supabase email confirmation is disabled, a session is returned immediately
    return { error: null, confirmed: !!data.session };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!SUPABASE_CONFIGURED) return;
    const { data: { user: u } } = await supabase.auth.getUser();
    if (u) await fetchProfile(u.id, u.email ?? '');
  }, [fetchProfile]);

  const isAdmin   = !!user && ADMIN_EMAILS.includes(user.email ?? '');
  const plan: Plan = isAdmin ? 'premium' : (profile?.plan ?? 'free');
  const isPremium  = plan === 'premium';

  return (
    <AuthContext.Provider value={{
      user, profile, plan, isAdmin, isPremium, loading,
      authModalOpen, openAuthModal: () => setAuthModalOpen(true), closeAuthModal: () => setAuthModalOpen(false),
      signIn, signUp, signOut, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
