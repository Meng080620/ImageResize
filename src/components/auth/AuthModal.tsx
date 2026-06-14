import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mail, Lock, Loader2, Sparkles, Check, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const MIN_PW = 6;

function pwStrength(pw: string): { score: number; label: string; color: string } {
  if (pw.length === 0) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pw.length >= 8)  score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const map = [
    { label: 'Too short', color: 'bg-red-500' },
    { label: 'Weak',      color: 'bg-red-400' },
    { label: 'Fair',      color: 'bg-yellow-400' },
    { label: 'Good',      color: 'bg-blue-400' },
    { label: 'Strong',    color: 'bg-green-400' },
  ];
  return { score, ...map[Math.min(score, 4)] };
}

export const AuthModal: React.FC = () => {
  const { authModalOpen, closeAuthModal, signIn, signUp } = useAuth();
  const [tab,             setTab]             = useState<'signin' | 'signup'>('signin');
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw,          setShowPw]          = useState(false);
  const [showConfirmPw,   setShowConfirmPw]   = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [success,         setSuccess]         = useState(false);
  const [rememberMe,      setRememberMe]      = useState(true);

  const reset = () => {
    setEmail(''); setPassword(''); setConfirmPassword('');
    setError(null); setSuccess(false); setLoading(false);
    setShowPw(false); setShowConfirmPw(false);
  };

  const switchTab = (t: 'signin' | 'signup') => { setTab(t); reset(); };

  const validate = (): string | null => {
    if (!email.trim())    return 'Email is required.';
    if (!email.includes('@')) return 'Enter a valid email address.';
    if (password.length < MIN_PW) return `Password must be at least ${MIN_PW} characters.`;
    if (tab === 'signup' && password !== confirmPassword) return 'Passwords do not match.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErr = validate();
    if (validationErr) { setError(validationErr); return; }

    setLoading(true);
    setError(null);

    if (tab === 'signin') {
      const err = await signIn(email, password, rememberMe);
      setLoading(false);
      if (err) { setError(err); return; }
      closeAuthModal();
      reset();
    } else {
      const { error: err, confirmed } = await signUp(email, password);
      setLoading(false);
      if (err) { setError(err); return; }
      if (confirmed) {
        // Email confirmation disabled — user is already signed in
        closeAuthModal();
        reset();
      } else {
        setSuccess(true);
      }
    }
  };

  const strength = tab === 'signup' ? pwStrength(password) : null;
  const pwsMatch  = tab === 'signup' && confirmPassword.length > 0 && password === confirmPassword;
  const pwsMismatch = tab === 'signup' && confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <AnimatePresence>
      {authModalOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={closeAuthModal}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0.1 }}
            onClick={e => e.stopPropagation()}
            className="bg-surface border border-line-strong rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 pb-0 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider">Image Resize</span>
                </div>
                <h2 className="text-lg font-semibold text-content tracking-tight">
                  {tab === 'signin' ? 'Welcome back' : 'Create account'}
                </h2>
                <p className="text-xs text-faint mt-0.5">
                  {tab === 'signin'
                    ? 'Sign in to access AI features.'
                    : 'Free account — upgrade any time for AI features.'}
                </p>
              </div>
              <button onClick={closeAuthModal} className="p-1.5 text-faint hover:text-muted rounded-md hover:bg-elevated transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab switcher */}
            <div className="flex mx-6 mt-5 bg-base rounded-lg p-1 border border-line">
              {(['signin', 'signup'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                    tab === t ? 'bg-elevated text-content shadow-sm' : 'text-faint hover:text-muted'
                  }`}
                >
                  {t === 'signin' ? 'Sign In' : 'Sign Up'}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="p-6 pt-4">
              {success ? (
                <div className="flex flex-col items-center py-6 gap-3 text-center">
                  <div className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center border border-green-500/30">
                    <Check className="w-5 h-5 text-green-400" />
                  </div>
                  <p className="text-sm font-medium text-content">Check your email</p>
                  <p className="text-xs text-faint max-w-[220px] leading-relaxed">
                    We sent a confirmation link to <span className="text-content">{email}</span>. Click it to activate your account.
                  </p>
                  <button onClick={() => switchTab('signin')} className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                  {/* Email */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-medium text-muted">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint pointer-events-none" />
                      <input
                        type="email" value={email} onChange={e => setEmail(e.target.value)}
                        placeholder="you@example.com" autoComplete="email"
                        className="w-full bg-base border border-line-strong rounded-lg pl-9 pr-3 py-2 text-xs text-content placeholder:text-faint outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-medium text-muted">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint pointer-events-none" />
                      <input
                        type={showPw ? 'text' : 'password'}
                        value={password} onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                        className="w-full bg-base border border-line-strong rounded-lg pl-9 pr-9 py-2 text-xs text-content placeholder:text-faint outline-none focus:border-blue-500 transition-colors"
                      />
                      <button
                        type="button" onClick={() => setShowPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted transition-colors"
                      >
                        {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {/* Password strength (signup only) */}
                    {tab === 'signup' && password.length > 0 && strength && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex-1 h-1 bg-elevated rounded-full overflow-hidden flex gap-0.5">
                          {[0,1,2,3].map(i => (
                            <div
                              key={i}
                              className={`flex-1 h-full rounded-full transition-all ${
                                i < strength.score ? strength.color : 'bg-elevated'
                              }`}
                            />
                          ))}
                        </div>
                        <span className={`text-[10px] font-medium ${
                          strength.score <= 1 ? 'text-red-400' :
                          strength.score === 2 ? 'text-yellow-400' :
                          strength.score === 3 ? 'text-blue-400' : 'text-green-400'
                        }`}>{strength.label}</span>
                      </div>
                    )}
                  </div>

                  {/* Confirm password (signup only) */}
                  {tab === 'signup' && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-medium text-muted">Confirm Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint pointer-events-none" />
                        <input
                          type={showConfirmPw ? 'text' : 'password'}
                          value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                          placeholder="••••••••" autoComplete="new-password"
                          className={`w-full bg-base border rounded-lg pl-9 pr-9 py-2 text-xs text-content placeholder:text-faint outline-none transition-colors ${
                            pwsMismatch ? 'border-red-500/50 focus:border-red-500' :
                            pwsMatch    ? 'border-green-500/50 focus:border-green-500' :
                            'border-line-strong focus:border-blue-500'
                          }`}
                        />
                        <button
                          type="button" onClick={() => setShowConfirmPw(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted transition-colors"
                        >
                          {showConfirmPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        {pwsMatch && (
                          <Check className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 text-green-400" />
                        )}
                        {pwsMismatch && (
                          <AlertCircle className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 text-red-400" />
                        )}
                      </div>
                      {pwsMismatch && (
                        <p className="text-[10px] text-red-400">Passwords do not match</p>
                      )}
                    </div>
                  )}

                  {/* Remember me (signin only) */}
                  {tab === 'signin' && (
                    <label className="flex items-center gap-2 cursor-pointer select-none group">
                      <div
                        onClick={() => setRememberMe(v => !v)}
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 ${
                          rememberMe
                            ? 'bg-blue-600 border-blue-600'
                            : 'bg-base border-line-strong group-hover:border-blue-500/50'
                        }`}
                      >
                        {rememberMe && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <span className="text-[11px] text-muted">Remember me</span>
                    </label>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="flex items-start gap-2 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 leading-relaxed">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      {error}
                    </div>
                  )}

                  <button
                    type="submit" disabled={loading}
                    className="mt-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    {tab === 'signin' ? 'Sign In' : 'Create Account'}
                  </button>

                  <p className="text-center text-[11px] text-faint">
                    {tab === 'signin' ? "No account? " : "Already have an account? "}
                    <button
                      type="button"
                      onClick={() => switchTab(tab === 'signin' ? 'signup' : 'signin')}
                      className="text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      {tab === 'signin' ? 'Sign up free' : 'Sign in'}
                    </button>
                  </p>
                </form>
              )}
            </div>

            {/* Premium features list */}
            {!success && (
              <div className="px-6 pb-5 border-t border-line pt-4">
                <p className="text-[10px] text-faint font-medium uppercase tracking-wider mb-2">Premium includes</p>
                <div className="flex flex-col gap-1">
                  {['AI Background Removal', 'AI Upscale 2× / 4×', 'Batch ZIP Export', 'Multi-Size Export'].map(f => (
                    <div key={f} className="flex items-center gap-2">
                      <Sparkles className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                      <span className="text-[11px] text-muted">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
