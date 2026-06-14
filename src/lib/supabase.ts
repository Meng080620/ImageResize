/// <reference types="vite/client" />
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const isConfigured = url?.startsWith('http') && key?.length > 10;

// Default client — persists session in localStorage (survives browser restart).
export const supabase: SupabaseClient = isConfigured
  ? createClient(url, key)
  : createClient('https://placeholder.supabase.co', 'placeholder-key-that-is-long-enough');

// Session-only client — stores token in sessionStorage so it dies when the tab closes.
// Used when the user unchecks "Remember me". Supabase refreshes the JWT every ~55 min
// and would re-write to localStorage on the default client, breaking the expectation.
export const supabaseSession: SupabaseClient = isConfigured
  ? createClient(url, key, { auth: { storage: sessionStorage, persistSession: true } })
  : supabase; // fallback to default when unconfigured — auth is disabled anyway

export const SUPABASE_CONFIGURED = isConfigured;

export type Plan = 'free' | 'premium';

export interface Profile {
  id: string;
  email: string;
  plan: Plan;
}

// Emails that always have full access regardless of plan.
export const ADMIN_EMAILS = ['mengmobile777@gmail.com'];
