import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mail, Lock, Loader2, Sparkles, Check, Eye, EyeOff, AlertCircle, KeyRound, ArrowLeft } from 'lucide-react';
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

// signup & reset share a 3-step wizard: email → 6-digit code → (set / new) password.
type Mode = 'signin' | 'signup' | 'reset';
type Step = 'email' | 'code' | 'password';

export const AuthModal: React.FC = () => {
  const {
    authModalOpen, closeAuthModal, signIn,
    requestSignupOtp, verifyOtp, setPassword, resendOtp,
    requestPasswordReset, verifyRecoveryOtp,
  } = useAuth();
  const [mode,            setMode]            = useState<Mode>('signin');
  const [step,            setStep]            = useState<Step>('email');
  const [email,           setEmail]           = useState('');
  const [code,            setCode]            = useState('');
  const [password,        setPassword_]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw,          setShowPw]          = useState(false);
  const [showConfirmPw,   setShowConfirmPw]   = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [resent,          setResent]          = useState(false);
  const [rememberMe,      setRememberMe]      = useState(true);
  const [cooldown,        setCooldown]        = useState(0); // seconds until resend is allowed

  const isWizard = mode !== 'signin';

  // Tick down the resend cooldown — throttles email sends so we don't hammer
  // Supabase's auth-email rate limit.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const reset = () => {
    setStep('email');
    setEmail(''); setCode(''); setPassword_(''); setConfirmPassword('');
    setError(null); setResent(false); setLoading(false); setCooldown(0);
    setShowPw(false); setShowConfirmPw(false);
  };

  const switchMode = (m: Mode) => { setMode(m); reset(); };

  // ── Submit handlers ──────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    if (!email.trim() || !email.includes('@')) { setError('Enter a valid email address.'); return; }
    if (password.length < MIN_PW) { setError(`Password must be at least ${MIN_PW} characters.`); return; }
    setLoading(true); setError(null);
    const err = await signIn(email, password, rememberMe);
    setLoading(false);
    if (err) { setError(err); return; }
    closeAuthModal(); reset();
  };

  const handleSendCode = async () => {
    if (!email.trim() || !email.includes('@')) { setError('Enter a valid email address.'); return; }
    setLoading(true); setError(null);
    const err = mode === 'signup' ? await requestSignupOtp(email) : await requestPasswordReset(email);
    setLoading(false);
    if (err) { setError(err); return; }
    setStep('code');
    setCooldown(60);
  };

  const handleVerifyCode = async () => {
    if (!/^\d{6,10}$/.test(code.trim())) { setError('Enter the code from your email.'); return; }
    setLoading(true); setError(null);
    const err = mode === 'signup' ? await verifyOtp(email, code) : await verifyRecoveryOtp(email, code);
    setLoading(false);
    if (err) { setError(err); return; }
    setStep('password'); // verified + signed in; now (re)set the password
  };

  const handleSetPassword = async () => {
    if (password.length < MIN_PW) { setError(`Password must be at least ${MIN_PW} characters.`); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true); setError(null);
    const err = await setPassword(password);
    setLoading(false);
    if (err) { setError(err); return; }
    closeAuthModal(); reset();
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError(null); setResent(false);
    const err = mode === 'signup' ? await resendOtp(email) : await requestPasswordReset(email);
    if (err) { setError(err); return; }
    setResent(true);
    setCooldown(60);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signin')     handleSignIn();
    else if (step === 'email') handleSendCode();
    else if (step === 'code')  handleVerifyCode();
    else                       handleSetPassword();
  };

  const strength = (isWizard && step === 'password') ? pwStrength(password) : null;
  const pwsMatch    = step === 'password' && confirmPassword.length > 0 && password === confirmPassword;
  const pwsMismatch = step === 'password' && confirmPassword.length > 0 && password !== confirmPassword;

  const title =
    mode === 'signin'    ? 'Welcome back'
    : step === 'email'   ? (mode === 'signup' ? 'Create account' : 'Reset password')
    : step === 'code'    ? 'Check your email'
    :                      (mode === 'signup' ? 'Set a password' : 'New password');
  const subtitle =
    mode === 'signin'    ? 'Sign in to access AI features.'
    : step === 'email'   ? (mode === 'signup' ? "We'll email you a 6-digit code — no password yet." : "We'll email you a 6-digit code to reset your password.")
    : step === 'code'    ? `Enter the code sent to ${email}.`
    :                      (mode === 'signup' ? 'Last step — choose a password to finish.' : 'Choose a new password for your account.');
  const cta =
    mode === 'signin'    ? 'Sign In'
    : step === 'email'   ? (mode === 'signup' ? 'Send code' : 'Send reset code')
    : step === 'code'    ? 'Verify code'
    :                      (mode === 'signup' ? 'Create account' : 'Update password');

  const showExtras = mode === 'signin' || step === 'email'; // footer link + premium list

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
                <h2 className="text-lg font-semibold text-content tracking-tight">{title}</h2>
                <p className="text-xs text-faint mt-0.5">{subtitle}</p>
              </div>
              <button onClick={closeAuthModal} className="p-1.5 text-faint hover:text-muted rounded-md hover:bg-elevated transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab switcher (hidden in reset mode) */}
            {mode !== 'reset' && (
              <div className="flex mx-6 mt-5 bg-base rounded-lg p-1 border border-line">
                {(['signin', 'signup'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => switchMode(t)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                      mode === t ? 'bg-elevated text-content shadow-sm' : 'text-faint hover:text-muted'
                    }`}
                  >
                    {t === 'signin' ? 'Sign In' : 'Sign Up'}
                  </button>
                ))}
              </div>
            )}

            {/* Step indicator (wizard only) */}
            {isWizard && (
              <div className="flex items-center justify-center gap-1.5 mt-4">
                {(['email', 'code', 'password'] as Step[]).map((s, i) => {
                  const order = { email: 0, code: 1, password: 2 };
                  const active = order[step] >= i;
                  return <div key={s} className={`h-1 rounded-full transition-all ${active ? 'bg-blue-500 w-6' : 'bg-line w-3'}`} />;
                })}
              </div>
            )}

            {/* Body */}
            <div className="p-6 pt-4">
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                {/* Email — sign-in, and wizard step 1 */}
                {(mode === 'signin' || step === 'email') && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-medium text-muted">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint pointer-events-none" />
                      <input
                        type="email" value={email} onChange={e => setEmail(e.target.value)}
                        placeholder="you@example.com" autoComplete="email" autoFocus
                        className="w-full bg-base border border-line-strong rounded-lg pl-9 pr-3 py-2 text-xs text-content placeholder:text-faint outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                  </div>
                )}

                {/* OTP code — wizard step 2 */}
                {isWizard && step === 'code' && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-medium text-muted">Verification code</label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint pointer-events-none" />
                      <input
                        inputMode="numeric" value={code}
                        onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="••••••" autoFocus maxLength={10}
                        className="w-full bg-base border border-line-strong rounded-lg pl-9 pr-3 py-2 text-sm tracking-[0.4em] font-mono text-content placeholder:text-faint placeholder:tracking-normal outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <button type="button" onClick={() => { setStep('email'); setError(null); }}
                        className="flex items-center gap-1 text-[11px] text-faint hover:text-muted transition-colors">
                        <ArrowLeft className="w-3 h-3" /> Change email
                      </button>
                      <button type="button" onClick={handleResend} disabled={cooldown > 0}
                        className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors disabled:text-faint disabled:cursor-not-allowed">
                        {cooldown > 0 ? `Resend in ${cooldown}s` : resent ? 'Code resent ✓' : 'Resend code'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Password — sign-in, and wizard step 3 */}
                {(mode === 'signin' || (isWizard && step === 'password')) && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-medium text-muted">{mode === 'reset' ? 'New password' : 'Password'}</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint pointer-events-none" />
                      <input
                        type={showPw ? 'text' : 'password'}
                        value={password} onChange={e => setPassword_(e.target.value)}
                        placeholder="••••••••" autoFocus={isWizard}
                        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                        className="w-full bg-base border border-line-strong rounded-lg pl-9 pr-9 py-2 text-xs text-content placeholder:text-faint outline-none focus:border-blue-500 transition-colors"
                      />
                      <button type="button" onClick={() => setShowPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted transition-colors">
                        {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {/* Strength (wizard step 3) */}
                    {isWizard && step === 'password' && password.length > 0 && strength && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex-1 h-1 bg-elevated rounded-full overflow-hidden flex gap-0.5">
                          {[0,1,2,3].map(i => (
                            <div key={i} className={`flex-1 h-full rounded-full transition-all ${i < strength.score ? strength.color : 'bg-elevated'}`} />
                          ))}
                        </div>
                        <span className={`text-[10px] font-medium ${
                          strength.score <= 1 ? 'text-red-400' :
                          strength.score === 2 ? 'text-yellow-400' :
                          strength.score === 3 ? 'text-blue-400' : 'text-green-400'
                        }`}>{strength.label}</span>
                      </div>
                    )}

                    {/* Forgot password (sign-in only) */}
                    {mode === 'signin' && (
                      <button type="button" onClick={() => switchMode('reset')}
                        className="self-end text-[11px] text-blue-400 hover:text-blue-300 transition-colors">
                        Forgot password?
                      </button>
                    )}
                  </div>
                )}

                {/* Confirm password — wizard step 3 */}
                {isWizard && step === 'password' && (
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
                      <button type="button" onClick={() => setShowConfirmPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted transition-colors">
                        {showConfirmPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      {pwsMatch    && <Check       className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 text-green-400" />}
                      {pwsMismatch && <AlertCircle className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 text-red-400" />}
                    </div>
                    {pwsMismatch && <p className="text-[10px] text-red-400">Passwords do not match</p>}
                  </div>
                )}

                {/* Remember me (sign-in only) */}
                {mode === 'signin' && (
                  <label className="flex items-center gap-2 cursor-pointer select-none group">
                    <div
                      onClick={() => setRememberMe(v => !v)}
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 ${
                        rememberMe ? 'bg-blue-600 border-blue-600' : 'bg-base border-line-strong group-hover:border-blue-500/50'
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
                  {cta}
                </button>

                {/* Back to sign in (reset mode) */}
                {mode === 'reset' && step === 'email' && (
                  <button type="button" onClick={() => switchMode('signin')}
                    className="flex items-center justify-center gap-1 text-[11px] text-faint hover:text-muted transition-colors">
                    <ArrowLeft className="w-3 h-3" /> Back to sign in
                  </button>
                )}

                {/* Footer link (signin / signup email step) */}
                {showExtras && mode !== 'reset' && (
                  <p className="text-center text-[11px] text-faint">
                    {mode === 'signin' ? "No account? " : "Already have an account? "}
                    <button type="button"
                      onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
                      className="text-blue-400 hover:text-blue-300 transition-colors">
                      {mode === 'signin' ? 'Sign up free' : 'Sign in'}
                    </button>
                  </p>
                )}
              </form>
            </div>

            {/* Premium features list (signin / signup email step) */}
            {showExtras && mode !== 'reset' && (
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
