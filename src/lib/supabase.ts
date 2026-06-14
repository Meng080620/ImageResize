/// <reference types="vite/client" />
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const isConfigured = url?.startsWith('http') && key?.length > 10;

const REMEMBER_KEY = 'ir_remember';

/** Minimal storage surface — lets us inject in-memory fakes in tests. */
export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/**
 * The bug this fixes: there used to be TWO Supabase clients (localStorage +
 * sessionStorage) but AuthContext only listened to one, so "remember me = off"
 * logins were invisible to the app (and triggered the "Multiple GoTrueClient
 * instances" warning). Now there is a SINGLE client whose storage routes to
 * localStorage (remember) or sessionStorage (don't) based on a flag.
 *
 * `isRemember` is read on every access, so a sign-in after `setRemember(false)`
 * lands in sessionStorage; reads fall back to the other store so an existing
 * session is still found regardless of where it was written; removeItem clears
 * both on sign-out. Pure (takes its stores as args) so it's unit-testable with
 * no DOM.
 */
export function createHybridStorage(isRemember: () => boolean, local: KV, session: KV): KV {
  const primary = () => (isRemember() ? local : session);
  const other = () => (isRemember() ? session : local);
  return {
    getItem: (k) => primary().getItem(k) ?? other().getItem(k),
    setItem: (k, v) => { primary().setItem(k, v); other().removeItem(k); }, // no stale duplicate
    removeItem: (k) => { local.removeItem(k); session.removeItem(k); },
  };
}

/** Persist the remember choice. Call BEFORE sign-in so the token is written to the right store. */
export function setRemember(remember: boolean): void {
  try { localStorage.setItem(REMEMBER_KEY, remember ? 'true' : 'false'); } catch { /* no-DOM */ }
}

/** Defaults to true (remember) when unset or unreadable. */
export function getRemember(): boolean {
  try { return localStorage.getItem(REMEMBER_KEY) !== 'false'; } catch { return true; }
}

// Only build the DOM-backed storage in the browser; in the node test env it stays
// undefined and supabase-js falls back to its own memory storage.
const hasDom = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
const hybridStorage = hasDom ? createHybridStorage(getRemember, localStorage, sessionStorage) : undefined;

export const supabase: SupabaseClient = isConfigured
  ? createClient(url, key, {
      auth: { storage: hybridStorage as Storage | undefined, persistSession: true, autoRefreshToken: true },
    })
  : createClient('https://placeholder.supabase.co', 'placeholder-key-that-is-long-enough');

export const SUPABASE_CONFIGURED = isConfigured;

export type Plan = 'free' | 'premium';

export interface Profile {
  id: string;
  email: string;
  plan: Plan;
}

// Emails that always have full access regardless of plan.
export const ADMIN_EMAILS = ['mengmobile777@gmail.com'];
