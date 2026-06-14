import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Mail, Lock, Loader2, Check, Eye, EyeOff, AlertCircle, Crown, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const MIN_PW = 6;

// Deterministic accent color from the email, so each user gets a stable avatar tint.
function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function initials(name: string | null | undefined, email: string): string {
  const n = (name ?? '').trim();
  if (n) return n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

interface Props { open: boolean; onClose: () => void; }

export const AccountModal: React.FC<Props> = ({ open, onClose }) => {
  const { user, profile, plan, isAdmin, isPremium, updateProfile, setPassword } = useAuth();

  const [name,        setName]        = useState(profile?.name ?? '');
  const [savingName,  setSavingName]  = useState(false);
  const [nameMsg,     setNameMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  const [password,    setPassword_]   = useState('');
  const [confirmPw,   setConfirmPw]   = useState('');
  const [showPw,      setShowPw]      = useState(false);
  const [savingPw,    setSavingPw]    = useState(false);
  const [pwMsg,       setPwMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  // Keep the name field in sync if the profile loads after mount.
  React.useEffect(() => { setName(profile?.name ?? ''); }, [profile?.name]);

  const email = user?.email ?? '';
  const hue = hueFromString(email);

  const saveName = async () => {
    setSavingName(true); setNameMsg(null);
    const err = await updateProfile({ name: name.trim() || null });
    setSavingName(false);
    setNameMsg(err ? { ok: false, text: err } : { ok: true, text: 'Saved' });
  };

  const savePassword = async () => {
    if (password.length < MIN_PW) { setPwMsg({ ok: false, text: `Password must be at least ${MIN_PW} characters.` }); return; }
    if (password !== confirmPw)   { setPwMsg({ ok: false, text: 'Passwords do not match.' }); return; }
    setSavingPw(true); setPwMsg(null);
    const err = await setPassword(password);
    setSavingPw(false);
    if (err) { setPwMsg({ ok: false, text: err }); return; }
    setPassword_(''); setConfirmPw('');
    setPwMsg({ ok: true, text: 'Password updated' });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0.1 }}
            onClick={e => e.stopPropagation()}
            className="bg-surface border border-line-strong rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 pb-4 flex items-start justify-between border-b border-line">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ backgroundColor: `hsl(${hue} 70% 92%)`, color: `hsl(${hue} 60% 35%)` }}
                >
                  {initials(name, email)}
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-content tracking-tight truncate">{name.trim() || 'Your account'}</h2>
                  <p className="text-xs text-faint truncate">{email}</p>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 text-faint hover:text-muted rounded-md hover:bg-elevated transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-5">
              {/* Plan */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted">Plan</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                  (isAdmin || isPremium) ? 'bg-amber-500/10 text-amber-400 border-amber-500/25' : 'bg-elevated text-faint border-line'
                }`}>
                  {(isAdmin || isPremium) && <Crown className="w-2.5 h-2.5" />}
                  {isAdmin ? 'Admin' : plan === 'premium' ? 'Premium' : 'Free'}
                </span>
              </div>

              {/* Display name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-muted">Display name</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint pointer-events-none" />
                    <input
                      value={name} onChange={e => { setName(e.target.value); setNameMsg(null); }}
                      placeholder="Your name" maxLength={60}
                      className="w-full bg-base border border-line-strong rounded-lg pl-9 pr-3 py-2 text-xs text-content placeholder:text-faint outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <button onClick={saveName} disabled={savingName || name.trim() === (profile?.name ?? '').trim()}
                    className="px-3 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
                    {savingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                  </button>
                </div>
                {nameMsg && (
                  <p className={`text-[10px] flex items-center gap-1 ${nameMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
                    {nameMsg.ok ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}{nameMsg.text}
                  </p>
                )}
              </div>

              {/* Email (read-only) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-muted">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint pointer-events-none" />
                  <input value={email} readOnly
                    className="w-full bg-elevated/50 border border-line rounded-lg pl-9 pr-3 py-2 text-xs text-muted outline-none cursor-not-allowed" />
                </div>
              </div>

              {/* Change password */}
              <div className="flex flex-col gap-1.5 pt-1 border-t border-line">
                <label className="text-[11px] font-medium text-muted mt-3">Change password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint pointer-events-none" />
                  <input
                    type={showPw ? 'text' : 'password'} value={password}
                    onChange={e => { setPassword_(e.target.value); setPwMsg(null); }}
                    placeholder="New password" autoComplete="new-password"
                    className="w-full bg-base border border-line-strong rounded-lg pl-9 pr-9 py-2 text-xs text-content placeholder:text-faint outline-none focus:border-blue-500 transition-colors"
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted transition-colors">
                    {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <input
                  type={showPw ? 'text' : 'password'} value={confirmPw}
                  onChange={e => { setConfirmPw(e.target.value); setPwMsg(null); }}
                  placeholder="Confirm new password" autoComplete="new-password"
                  className="w-full bg-base border border-line-strong rounded-lg px-3 py-2 text-xs text-content placeholder:text-faint outline-none focus:border-blue-500 transition-colors"
                />
                {pwMsg && (
                  <p className={`text-[10px] flex items-center gap-1 ${pwMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
                    {pwMsg.ok ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}{pwMsg.text}
                  </p>
                )}
                <button onClick={savePassword} disabled={savingPw || !password}
                  className="mt-1 py-2 rounded-lg text-xs font-semibold bg-elevated text-content border border-line-strong hover:bg-hover transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {savingPw ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                  Update password
                </button>
              </div>

              {/* Upsell for free users */}
              {!isPremium && !isAdmin && (
                <div className="flex items-center gap-2 text-[11px] text-blue-400 bg-blue-500/5 border border-blue-500/15 rounded-lg px-3 py-2">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" /> Upgrade to Premium to unlock the AI tools.
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
