import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, Crown, UserCheck, TrendingUp, RefreshCw,
  ArrowLeft, Sun, Moon, ShieldCheck, Search, ChevronUp, ChevronDown,
  Download, BarChart3, LayoutDashboard, DollarSign, ChevronLeft, ChevronRight,
  CheckSquare, Square, ToggleLeft, ToggleRight, Loader2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../hooks/useTheme';
import type { Plan, Profile } from '../../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminUser extends Profile {
  created_at: string;
}

type SortKey = 'email' | 'plan' | 'created_at';
type SortDir = 'asc' | 'desc';
type Tab     = 'overview' | 'users';

interface Props {
  onBack: () => void;
}

const PAGE_SIZE = 15;
const PREMIUM_PRICE = 9; // $/month

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function monthLabel(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ── Sub-components ────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  label: string;
  value: string | number;
  icon: React.FC<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  sub?: string;
  delay?: number;
}> = ({ label, value, icon: Icon, color, bg, border, sub, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3, delay }}
    className={`bg-surface border ${border} rounded-xl p-4 flex items-center gap-4`}
  >
    <div className={`w-10 h-10 rounded-xl ${bg} border ${border} flex items-center justify-center shrink-0`}>
      <Icon className={`w-5 h-5 ${color}`} />
    </div>
    <div className="min-w-0">
      <p className="text-[10px] text-faint uppercase tracking-wider font-semibold">{label}</p>
      <p className="text-2xl font-bold text-content leading-none mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-faint mt-0.5">{sub}</p>}
    </div>
  </motion.div>
);

// ── Main Component ────────────────────────────────────────────────────────────

export const AdminPortal: React.FC<Props> = ({ onBack }) => {
  const { user, isAdmin } = useAuth();
  const { theme, toggle } = useTheme();

  const [tab,         setTab]         = useState<Tab>('overview');
  const [users,       setUsers]       = useState<AdminUser[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [search,      setSearch]      = useState('');
  const [sortKey,     setSortKey]     = useState<SortKey>('created_at');
  const [sortDir,     setSortDir]     = useState<SortDir>('desc');
  const [updatingId,  setUpdatingId]  = useState<string | null>(null);
  const [page,        setPage]        = useState(1);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, email, plan, created_at')
      .order('created_at', { ascending: false });
    if (err) { setError(err.message); setLoading(false); return; }
    setUsers((data ?? []) as AdminUser[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── Derived stats ─────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total      = users.length;
    const premium    = users.filter(u => u.plan === 'premium').length;
    const free       = users.filter(u => u.plan === 'free').length;
    const conversion = total ? Math.round((premium / total) * 100) : 0;
    const mrr        = premium * PREMIUM_PRICE;
    return { total, premium, free, conversion, mrr };
  }, [users]);

  // Monthly signups — last 6 months
  const monthlySignups = useMemo(() => {
    const now    = new Date();
    const months: { label: string; count: number; premCount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const inMonth = users.filter(u => {
        if (!u.created_at) return false;
        const ud = new Date(u.created_at);
        return ud.getFullYear() === d.getFullYear() && ud.getMonth() === d.getMonth();
      });
      months.push({
        label:     monthLabel(d),
        count:     inMonth.length,
        premCount: inMonth.filter(u => u.plan === 'premium').length,
      });
    }
    return months;
  }, [users]);

  const maxMonthly = Math.max(...monthlySignups.map(m => m.count), 1);

  const recentUsers = useMemo(() => [...users].slice(0, 5), [users]);

  // ── User table ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter(u => u.email.toLowerCase().includes(q) || u.plan.includes(q));
  }, [users, search]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  }), [filtered, sortKey, sortDir]);

  const totalPages  = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated   = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allSelected = paginated.length > 0 && paginated.every(u => selected.has(u.id));
  const someSelected = paginated.some(u => selected.has(u.id));

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const toggleSelect = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleSelectAll = () =>
    setSelected(prev => {
      const n = new Set(prev);
      if (allSelected) paginated.forEach(u => n.delete(u.id));
      else             paginated.forEach(u => n.add(u.id));
      return n;
    });

  const togglePlan = async (u: AdminUser) => {
    const next: Plan = u.plan === 'premium' ? 'free' : 'premium';
    setUpdatingId(u.id);
    const { error: err } = await supabase.from('profiles').update({ plan: next }).eq('id', u.id);
    if (!err) setUsers(prev => prev.map(p => p.id === u.id ? { ...p, plan: next } : p));
    setUpdatingId(null);
  };

  const bulkSetPlan = async (plan: Plan) => {
    if (selected.size === 0) return;
    setBulkLoading(true);
    const ids = [...selected];
    const { error: err } = await supabase.from('profiles').update({ plan }).in('id', ids);
    if (!err) {
      setUsers(prev => prev.map(p => ids.includes(p.id) ? { ...p, plan } : p));
      setSelected(new Set());
    }
    setBulkLoading(false);
  };

  const exportCSV = () => {
    const rows = [['Email', 'Plan', 'Joined'], ...sorted.map(u => [u.email, u.plan, fmtDate(u.created_at)])];
    const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `users_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 150);
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? null : sortDir === 'asc'
      ? <ChevronUp   className="w-3 h-3 inline ml-0.5 text-blue-400" />
      : <ChevronDown className="w-3 h-3 inline ml-0.5 text-blue-400" />;

  // ── Access guard ──────────────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <div className="text-center">
          <ShieldCheck className="w-10 h-10 text-faint mx-auto mb-3" />
          <p className="text-sm text-muted font-medium">Admin access only</p>
          <button onClick={onBack} className="mt-4 text-xs text-blue-400 hover:text-blue-300 transition-colors">← Go back</button>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-base text-content font-sans antialiased flex flex-col">

      {/* ── Top bar ── */}
      <header className="sticky top-0 z-40 bg-base/80 backdrop-blur-md border-b border-line px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="p-1.5 text-faint hover:text-muted hover:bg-elevated rounded-lg transition-all shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
              <Crown className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <span className="font-semibold text-sm text-content hidden sm:block">Admin</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold truncate max-w-[180px]">
              {user?.email}
            </span>
          </div>
        </div>

        {/* Tab nav */}
        <nav className="flex items-center bg-elevated rounded-xl p-1 border border-line gap-0.5">
          {([
            { id: 'overview' as Tab, label: 'Overview', icon: LayoutDashboard },
            { id: 'users'    as Tab, label: 'Users',    icon: Users },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                tab === id ? 'bg-surface text-content shadow-sm' : 'text-faint hover:text-muted'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:block">{label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button onClick={fetchUsers} disabled={loading} className="p-1.5 text-faint hover:text-muted hover:bg-elevated rounded-lg transition-all disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={toggle} className="p-1.5 text-faint hover:text-muted hover:bg-elevated rounded-lg transition-all">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {error && (
        <div className="px-6 py-2.5 bg-red-500/5 border-b border-red-500/15 text-xs text-red-400">
          <span className="font-semibold">Error:</span> {error} — Apply the admin RLS policy in Supabase SQL editor.
        </div>
      )}

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        <AnimatePresence mode="wait">

          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-8">

              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Users" value={loading ? '—' : stats.total}     icon={Users}      color="text-blue-400"   bg="bg-blue-500/10"   border="border-blue-500/20"   delay={0}    />
                <StatCard label="Premium"     value={loading ? '—' : stats.premium}   icon={Crown}      color="text-amber-400"  bg="bg-amber-500/10"  border="border-amber-500/20"  delay={0.06} />
                <StatCard label="Free"        value={loading ? '—' : stats.free}      icon={UserCheck}  color="text-green-400"  bg="bg-green-500/10"  border="border-green-500/20"  delay={0.12} />
                <StatCard label="Est. MRR"    value={loading ? '—' : `$${stats.mrr}`} icon={DollarSign} color="text-purple-400" bg="bg-purple-500/10" border="border-purple-500/20" delay={0.18}
                  sub={`${stats.premium} × $${PREMIUM_PRICE}/mo`} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Plan distribution */}
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}
                  className="bg-surface border border-line rounded-xl p-5 flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-faint" />
                    <h3 className="text-sm font-semibold text-content">Plan Distribution</h3>
                    <span className="ml-auto text-xs font-bold text-content">{stats.conversion}%</span>
                    <span className="text-[10px] text-faint">conversion</span>
                  </div>
                  <div className="h-4 bg-elevated rounded-full overflow-hidden flex">
                    <motion.div
                      className="h-full bg-amber-500 rounded-l-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${stats.conversion}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                    />
                    <div className="flex-1 bg-blue-500/20" />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Premium <strong className="text-content">{stats.premium}</strong></span>
                    <span className="flex items-center gap-1.5 text-muted"><span className="w-2.5 h-2.5 rounded-full bg-blue-500/50 inline-block" /> Free <strong className="text-content">{stats.free}</strong></span>
                  </div>
                </motion.div>

                {/* Monthly signups bar chart */}
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.26 }}
                  className="bg-surface border border-line rounded-xl p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-faint" />
                    <h3 className="text-sm font-semibold text-content">Monthly Signups</h3>
                    <span className="ml-auto text-[10px] text-faint">last 6 months</span>
                  </div>
                  <div className="flex items-end gap-2" style={{ height: 80 }}>
                    {monthlySignups.map((m, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full">
                        <div className="w-full flex flex-col justify-end flex-1">
                          <motion.div
                            className="w-full rounded-t-md bg-blue-500/35 relative overflow-hidden min-h-[2px]"
                            initial={{ height: 0 }}
                            animate={{ height: `${(m.count / maxMonthly) * 100}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.3 + i * 0.07 }}
                          >
                            {m.premCount > 0 && (
                              <motion.div
                                className="absolute bottom-0 w-full bg-amber-500/70"
                                initial={{ height: 0 }}
                                animate={{ height: `${(m.premCount / Math.max(m.count, 1)) * 100}%` }}
                                transition={{ duration: 0.5, ease: 'easeOut', delay: 0.5 + i * 0.07 }}
                              />
                            )}
                          </motion.div>
                        </div>
                        <span className="text-[9px] text-faint">{m.label}</span>
                        {m.count > 0 && <span className="text-[9px] font-bold text-content">{m.count}</span>}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-faint">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500/35 inline-block" />Free</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500/70 inline-block" />Premium</span>
                  </div>
                </motion.div>
              </div>

              {/* Recent signups */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.32 }}
                className="bg-surface border border-line rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-line flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-content">Recent Signups</h3>
                  <button onClick={() => setTab('users')} className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors">View all →</button>
                </div>
                <div className="divide-y divide-line">
                  {loading
                    ? [...Array(5)].map((_, i) => (
                        <div key={i} className="px-5 py-3 flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-elevated animate-pulse" />
                          <div className="h-3 bg-elevated rounded w-40 animate-pulse" />
                          <div className="ml-auto h-3 bg-elevated rounded w-14 animate-pulse" />
                        </div>
                      ))
                    : recentUsers.length === 0
                      ? <p className="px-5 py-8 text-center text-xs text-faint">No users yet.</p>
                      : recentUsers.map((u, i) => (
                          <motion.div key={u.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.04 }}
                            className="px-5 py-3 flex items-center gap-3 hover:bg-elevated/30 transition-colors">
                            <div className="w-7 h-7 rounded-full bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-[10px] font-bold text-blue-400 shrink-0">
                              {u.email[0].toUpperCase()}
                            </div>
                            <span className="text-xs text-content font-medium flex-1 truncate">{u.email}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border shrink-0 ${
                              u.plan === 'premium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-elevated text-faint border-line'
                            }`}>{u.plan}</span>
                            <span className="text-[10px] text-faint shrink-0 hidden sm:block">{fmtDate(u.created_at)}</span>
                          </motion.div>
                        ))
                  }
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* ── USERS ── */}
          {tab === 'users' && (
            <motion.div key="users" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-4">

              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint pointer-events-none" />
                  <input
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    placeholder="Search by email or plan…"
                    className="w-full bg-surface border border-line-strong rounded-lg pl-9 pr-3 py-2 text-xs text-content placeholder:text-faint outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                {selected.size > 0 && (
                  <div className="flex items-center gap-2 bg-surface border border-line-strong rounded-lg px-3 py-2">
                    <span className="text-[11px] font-semibold text-content">{selected.size} selected</span>
                    <div className="w-px h-4 bg-line-strong" />
                    <button onClick={() => bulkSetPlan('premium')} disabled={bulkLoading}
                      className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-semibold disabled:opacity-50 transition-colors">
                      {bulkLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ToggleRight className="w-3.5 h-3.5" />}
                      Upgrade all
                    </button>
                    <button onClick={() => bulkSetPlan('free')} disabled={bulkLoading}
                      className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 font-semibold disabled:opacity-50 transition-colors">
                      {bulkLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      Downgrade all
                    </button>
                    <button onClick={() => setSelected(new Set())} className="text-[11px] text-faint hover:text-muted transition-colors">Clear</button>
                  </div>
                )}

                <button onClick={exportCSV} disabled={sorted.length === 0}
                  className="flex items-center gap-2 px-3 py-2 bg-surface border border-line-strong rounded-lg text-xs text-muted hover:text-content hover:border-blue-500/40 transition-all font-medium disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>

              {/* Table */}
              <div className="bg-surface border border-line rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-line bg-elevated/40">
                        <th className="px-4 py-3 w-8">
                          <button onClick={toggleSelectAll} className="text-faint hover:text-muted transition-colors">
                            {allSelected
                              ? <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                              : someSelected ? <CheckSquare className="w-3.5 h-3.5 text-blue-400/50" />
                              : <Square className="w-3.5 h-3.5" />}
                          </button>
                        </th>
                        <th className="text-left px-4 py-3 text-faint font-semibold">
                          <button onClick={() => handleSort('email')} className="hover:text-muted transition-colors flex items-center gap-1">Email <SortIcon k="email" /></button>
                        </th>
                        <th className="text-left px-4 py-3 text-faint font-semibold">
                          <button onClick={() => handleSort('plan')} className="hover:text-muted transition-colors flex items-center gap-1">Plan <SortIcon k="plan" /></button>
                        </th>
                        <th className="text-left px-4 py-3 text-faint font-semibold hidden sm:table-cell">
                          <button onClick={() => handleSort('created_at')} className="hover:text-muted transition-colors flex items-center gap-1">Joined <SortIcon k="created_at" /></button>
                        </th>
                        <th className="text-right px-4 py-3 text-faint font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        [...Array(8)].map((_, i) => (
                          <tr key={i} className="border-b border-line last:border-0">
                            <td className="px-4 py-3"><div className="w-3.5 h-3.5 bg-elevated rounded animate-pulse" /></td>
                            <td className="px-4 py-3"><div className="h-3 bg-elevated rounded w-44 animate-pulse" /></td>
                            <td className="px-4 py-3"><div className="h-3 bg-elevated rounded w-16 animate-pulse" /></td>
                            <td className="px-4 py-3 hidden sm:table-cell"><div className="h-3 bg-elevated rounded w-24 animate-pulse" /></td>
                            <td className="px-4 py-3"><div className="h-5 bg-elevated rounded w-20 ml-auto animate-pulse" /></td>
                          </tr>
                        ))
                      ) : paginated.length === 0 ? (
                        <tr><td colSpan={5} className="px-5 py-12 text-center text-faint">{search ? 'No users match your search.' : 'No users yet.'}</td></tr>
                      ) : paginated.map((u, i) => {
                        const isMe  = u.email === user?.email;
                        const isSel = selected.has(u.id);
                        return (
                          <motion.tr key={u.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.025 }}
                            className={`border-b border-line last:border-0 transition-colors ${isSel ? 'bg-blue-500/5' : 'hover:bg-elevated/30'}`}>
                            <td className="px-4 py-3">
                              <button onClick={() => toggleSelect(u.id)} disabled={isMe} className="text-faint hover:text-muted transition-colors disabled:opacity-30">
                                {isSel ? <CheckSquare className="w-3.5 h-3.5 text-blue-400" /> : <Square className="w-3.5 h-3.5" />}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-content font-medium">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-[9px] font-bold text-blue-400 shrink-0">
                                  {u.email[0].toUpperCase()}
                                </div>
                                <span className="truncate max-w-[200px]">{u.email}</span>
                                {isMe && <span className="text-[9px] text-amber-400 font-bold shrink-0">you</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                u.plan === 'premium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/25' : 'bg-elevated text-faint border-line'
                              }`}>
                                {u.plan === 'premium' && <Crown className="w-2.5 h-2.5" />}
                                {u.plan}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-faint hidden sm:table-cell">{fmtDate(u.created_at)}</td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => togglePlan(u)} disabled={updatingId === u.id || isMe}
                                title={isMe ? "Can't change your own plan" : undefined}
                                className={`px-3 py-1 rounded-lg text-[10px] font-semibold border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                  u.plan === 'premium'
                                    ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                                    : 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20'
                                }`}>
                                {updatingId === u.id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : u.plan === 'premium' ? 'Downgrade' : 'Upgrade'}
                              </button>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {!loading && sorted.length > 0 && (
                  <div className="px-5 py-3 border-t border-line bg-elevated/20 flex items-center justify-between gap-4 flex-wrap">
                    <span className="text-[10px] text-faint">
                      {sorted.length} user{sorted.length !== 1 ? 's' : ''}
                      {search && ` (filtered from ${users.length})`}
                      {selected.size > 0 && ` · ${selected.size} selected`}
                    </span>
                    {totalPages > 1 && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 text-faint hover:text-muted rounded disabled:opacity-30">
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        {[...Array(totalPages)].map((_, i) => {
                          const p = i + 1;
                          if (totalPages > 7 && p !== 1 && p !== totalPages && Math.abs(p - page) > 2) {
                            return (p === page - 3 || p === page + 3)
                              ? <span key={p} className="text-[10px] text-faint px-1">…</span>
                              : null;
                          }
                          return (
                            <button key={p} onClick={() => setPage(p)}
                              className={`w-6 h-6 rounded text-[10px] font-semibold transition-all ${
                                p === page ? 'bg-blue-600 text-white' : 'text-faint hover:text-muted hover:bg-elevated'
                              }`}>{p}</button>
                          );
                        })}
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 text-faint hover:text-muted rounded disabled:opacity-30">
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
};
