import { describe, it, expect } from 'vitest';
import { createHybridStorage, type KV } from './supabase';

// In-memory KV so the routing logic is testable with no DOM.
const fakeKV = (): KV & { peek: (k: string) => string | null } => {
  const data = new Map<string, string>();
  return {
    getItem: k => (data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => { data.set(k, v); },
    removeItem: k => { data.delete(k); },
    peek: k => (data.has(k) ? data.get(k)! : null),
  };
};

describe('createHybridStorage — remember-me storage routing', () => {
  // This is the load-bearing fix: a single client whose token lands in the right
  // store. The old two-client design wrote "remember off" sessions where the app's
  // listener never looked, so the user appeared logged out.

  it('remembered → writes to localStorage and clears sessionStorage', () => {
    const local = fakeKV(), session = fakeKV();
    const s = createHybridStorage(() => true, local, session);
    session.setItem('sb-token', 'stale');     // a leftover session-store token
    s.setItem('sb-token', 'fresh');
    expect(local.peek('sb-token')).toBe('fresh');
    expect(session.peek('sb-token')).toBeNull(); // no stale duplicate
  });

  it('not remembered → writes to sessionStorage and clears localStorage', () => {
    const local = fakeKV(), session = fakeKV();
    const s = createHybridStorage(() => false, local, session);
    local.setItem('sb-token', 'stale');
    s.setItem('sb-token', 'fresh');
    expect(session.peek('sb-token')).toBe('fresh');
    expect(local.peek('sb-token')).toBeNull();
  });

  it('reads fall back to the other store (session found even when remember=true)', () => {
    const local = fakeKV(), session = fakeKV();
    const s = createHybridStorage(() => true, local, session);
    session.setItem('sb-token', 'fromSession');
    expect(s.getItem('sb-token')).toBe('fromSession');
  });

  it('removeItem clears both stores (sign-out)', () => {
    const local = fakeKV(), session = fakeKV();
    const s = createHybridStorage(() => true, local, session);
    local.setItem('sb-token', 'a'); session.setItem('sb-token', 'b');
    s.removeItem('sb-token');
    expect(local.peek('sb-token')).toBeNull();
    expect(session.peek('sb-token')).toBeNull();
  });
});
