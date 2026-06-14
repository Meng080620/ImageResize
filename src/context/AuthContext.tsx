import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, setRemember, SUPABASE_CONFIGURED, ADMIN_EMAILS, type Plan, type Profile } from '../lib/supabase';

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
  /** OTP signup step 1: email a 6-digit code, creating the user if needed. */
  requestSignupOtp: (email: string) => Promise<string | null>;
  /** OTP signup step 2: verify the code → signs the user in. */
  verifyOtp: (email: string, token: string) => Promise<string | null>;
  /** OTP signup step 3: set the password on the now-authenticated user. */
  setPassword: (password: string) => Promise<string | null>;
  /** Re-send the OTP code. */
  resendOtp: (email: string) => Promise<string | null>;
  /** Forgot-password step 1: email a recovery code. */
  requestPasswordReset: (email: string) => Promise<string | null>;
  /** Forgot-password step 2: verify the recovery code → signs the user in to set a new password. */
  verifyRecoveryOtp: (email: string, token: string) => Promise<string | null>;
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

  const NOT_CONFIGURED = 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env';

  const signIn = useCallback(async (email: string, password: string, rememberMe = true): Promise<string | null> => {
    if (!EMAIL_RE.test(email.trim())) return 'Please enter a valid email address.';
    if (!SUPABASE_CONFIGURED) return NOT_CONFIGURED;
    // Persist the choice BEFORE signing in so the session token is written to the
    // matching store (localStorage when remembered, sessionStorage when not).
    setRemember(rememberMe);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error?.message ?? null;
  }, []);

  const requestSignupOtp = useCallback(async (email: string): Promise<string | null> => {
    if (!EMAIL_RE.test(email.trim())) return 'Please enter a valid email address.';
    if (!SUPABASE_CONFIGURED) return NOT_CONFIGURED;
    // A signed-up user should be remembered by default.
    setRemember(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    return error?.message ?? null;
  }, []);

  const verifyOtp = useCallback(async (email: string, token: string): Promise<string | null> => {
    if (!SUPABASE_CONFIGURED) return NOT_CONFIGURED;
    if (!/^\d{6,10}$/.test(token.trim())) return 'Enter the code from your email.';
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
    return error?.message ?? null;
  }, []);

  const setPassword = useCallback(async (password: string): Promise<string | null> => {
    if (!SUPABASE_CONFIGURED) return NOT_CONFIGURED;
    const { error } = await supabase.auth.updateUser({ password });
    return error?.message ?? null;
  }, []);

  const resendOtp = useCallback(async (email: string): Promise<string | null> => {
    if (!SUPABASE_CONFIGURED) return NOT_CONFIGURED;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    return error?.message ?? null;
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<string | null> => {
    if (!EMAIL_RE.test(email.trim())) return 'Please enter a valid email address.';
    if (!SUPABASE_CONFIGURED) return NOT_CONFIGURED;
    // Sends the "Reset Password" email; with {{ .Token }} in that template it carries a code.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    return error?.message ?? null;
  }, []);

  const verifyRecoveryOtp = useCallback(async (email: string, token: string): Promise<string | null> => {
    if (!SUPABASE_CONFIGURED) return NOT_CONFIGURED;
    if (!/^\d{6,10}$/.test(token.trim())) return 'Enter the code from your email.';
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'recovery' });
    return error?.message ?? null;
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
      signIn, requestSignupOtp, verifyOtp, setPassword, resendOtp,
      requestPasswordReset, verifyRecoveryOtp, signOut, refreshProfile,
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
