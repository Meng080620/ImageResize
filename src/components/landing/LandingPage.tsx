import React, { useState, useEffect } from 'react';
import { motion, useInView } from 'motion/react';
import {
  Wand2, ZoomIn, FileArchive, Crop, Sparkles, Check, ArrowRight,
  Upload, Download, Sun, Moon, ChevronRight, ChevronDown, Star, Loader2,
  ShieldCheck, Zap, Lock, Globe,
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../context/AuthContext';
import { startCheckout } from '../../lib/stripe';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { FeatureShowcase } from './FeatureShowcase';
import { getDemoSliderPair } from '../../utils/sampleImages';

interface Props { onLaunchApp: () => void; }

// ── Animated counter ──────────────────────────────────────────────────────────
const Counter: React.FC<{ to: number; suffix?: string; duration?: number }> = ({
  to, suffix = '', duration = 1.5,
}) => {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const start = Date.now();
    const tick = () => {
      const pct = Math.min(1, (Date.now() - start) / (duration * 1000));
      setVal(Math.round(to * (1 - Math.pow(1 - pct, 3))));
      if (pct < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, to, duration]);

  return <span ref={ref}>{val}{suffix}</span>;
};

// ── Data ──────────────────────────────────────────────────────────────────────
const MARKETPLACES = [
  { name: 'Shopify',     color: '#96bf48' },
  { name: 'Amazon',      color: '#ff9900' },
  { name: 'Etsy',        color: '#f56400' },
  { name: 'WooCommerce', color: '#7f54b3' },
  { name: 'Lazada',      color: '#0f146d' },
  { name: 'Shopee',      color: '#ee4d2d' },
];

const STEPS = [
  { n: '01', icon: Upload,   title: 'Upload',  desc: 'Drag & drop your product images. JPG, PNG, WEBP — any mix.' },
  { n: '02', icon: Wand2,    title: 'Enhance', desc: 'Remove BG, upscale, adjust framing. One click each.' },
  { n: '03', icon: Download, title: 'Export',  desc: 'Download individually or as a ZIP at your target size.' },
];

const PLANS = [
  {
    name: 'Free', price: '$0', period: 'forever', highlight: false,
    desc: 'Basic image prep, forever free.',
    cta: 'Start for free',
    features: ['Smart resize & crop', 'Fit mode (contain/cover)', 'Auto-center & trim', 'Quality inspector', 'Single image download', 'Unlimited images'],
    locked: ['AI Background Removal', 'AI Upscale 2× / 4×', 'Batch ZIP Export'],
  },
  {
    name: 'Premium', price: '$12', period: 'per month', highlight: true,
    desc: 'Full AI suite for product teams.',
    cta: 'Get Premium',
    features: ['Everything in Free', 'AI Background Removal', 'AI Upscale 2× / 4×', 'Batch ZIP Export', 'Fast / Balanced / Quality models', 'WebGPU acceleration'],
    locked: [],
  },
];

const REVIEWS = [
  { name: 'Sofia L.',  role: 'E-commerce manager',   text: 'Cut our photo editing from 3 hours to 20 minutes. Batch BG removal alone is worth every cent.',      stars: 5 },
  { name: 'Kevin T.',  role: 'Product photographer', text: 'Quality mode for hair and fur edges is genuinely impressive. No other browser tool comes close.',      stars: 5 },
  { name: 'Amara N.',  role: 'Shopify merchant',     text: 'Fully private — nothing uploaded to a server. Processes 50 images in a couple of minutes.',            stars: 5 },
];

const STATS = [
  { icon: ShieldCheck, value: '100%', label: 'Client-side AI',    sub: 'Nothing leaves your device',   color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20'  },
  { icon: Lock,        value: '0',    label: 'Server uploads',     sub: 'Your images stay yours',       color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20'   },
  { icon: Sparkles,    value: '3',    label: 'AI models built-in', sub: 'ISNet · ESRGAN · WebGPU',     color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  { icon: Zap,         value: '<30s', label: 'Per BG removal',     sub: 'On a modern browser',         color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20'  },
];

const FAQ = [
  {
    q: 'Does it work offline after the first load?',
    a: 'Yes. Once the AI model downloads (cached by your browser), the entire app works with no internet connection. All processing is local — no network calls during inference.',
  },
  {
    q: 'How large are the AI models?',
    a: 'Background removal: 20 MB (Fast), 40 MB (Balanced), or 80 MB (Quality). AI Upscale is ~15 MB per factor. Each file downloads once and is cached indefinitely by the browser.',
  },
  {
    q: 'What actually happens to my images?',
    a: 'Nothing leaves your device. The AI runs inside your browser via WebAssembly and WebGPU — there is no server to upload images to. We physically cannot see your files.',
  },
  {
    q: 'Which browsers are supported?',
    a: 'Chrome, Firefox, Safari, and Edge all work. WebGPU acceleration (2–4× faster inference) requires Chrome 113+ or Edge 113+. Safari 17+ has partial WebGPU support.',
  },
  {
    q: 'Can I cancel my subscription anytime?',
    a: 'Yes, anytime — no questions asked. Cancel from your account settings and you keep Premium access until the end of the current billing period.',
  },
];

// Words before the gradient phrase — animated individually.
const HERO_WORDS = ['AI', 'image', 'tools', 'built', 'for'];

// ── Component ─────────────────────────────────────────────────────────────────
export const LandingPage: React.FC<Props> = ({ onLaunchApp }) => {
  const { theme, toggle } = useTheme();
  const { user, isPremium, isAdmin, openAuthModal } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError,   setCheckoutError]   = useState<string | null>(null);
  const [demoImages, setDemoImages] = useState<{ before: string; after: string } | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    setDemoImages(getDemoSliderPair());
  }, []);

  const handleUpgrade = async () => {
    if (!user)      { openAuthModal(); return; }
    if (isPremium)  { onLaunchApp();   return; }
    setCheckoutLoading(true);
    setCheckoutError(null);
    const err = await startCheckout();
    if (err) {
      setCheckoutError(err);
      setCheckoutLoading(false);
    } else {
      // Stripe redirect should unmount this; reset as fallback if it silently fails
      setTimeout(() => setCheckoutLoading(false), 8000);
    }
  };

  return (
    // ── #6 Dot-grid depth layer ──────────────────────────────────────────────
    <div
      className="min-h-screen bg-base text-content font-sans antialiased"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }}
    >

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-40 border-b border-line bg-base/80 backdrop-blur-md px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={theme === 'dark' ? '/logo-dark.png' : '/logo.png'} alt="" className="w-8 h-8 rounded-lg object-contain shrink-0" />
            <span className="font-bold text-base tracking-tight text-content">Image Resize</span>
            <span className="hidden sm:inline-flex px-2 py-0.5 bg-blue-500/10 text-blue-400 font-mono text-[10px] font-semibold rounded border border-blue-500/20">PRO</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
              className="hidden sm:block text-sm text-muted hover:text-content transition-colors font-medium"
            >
              Pricing
            </button>
            <button onClick={toggle} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-content hover:bg-elevated transition-all">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {user ? (
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button onClick={() => { window.location.hash = '#/admin'; }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-all">
                    Admin
                  </button>
                )}
                <button onClick={onLaunchApp}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all">
                  Open App <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                <button onClick={openAuthModal} className="hidden sm:block text-sm text-muted hover:text-content transition-colors font-medium">Sign In</button>
                <button onClick={openAuthModal}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all">
                  Get Started
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative px-6 pt-16 pb-10 overflow-hidden">

        {/* ── #1 Gradient mesh + animated orb ────────────────────────────── */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute inset-0 opacity-60"
            style={{
              background: `
                radial-gradient(ellipse 80% 50% at 20% 40%, rgba(120,80,255,0.15) 0%, transparent 60%),
                radial-gradient(ellipse 60% 40% at 80% 20%, rgba(56,189,248,0.12) 0%, transparent 60%),
                radial-gradient(ellipse 50% 60% at 50% 80%, rgba(59,130,246,0.10) 0%, transparent 60%)
              `,
            }}
          />
          <motion.div
            animate={{ x: [0, 60, -40, 0], y: [0, -40, 30, 0] }}
            transition={{ repeat: Infinity, duration: 18, ease: 'easeInOut' }}
            className="absolute top-1/4 left-1/3 w-[500px] h-[500px] rounded-full blur-[100px]"
            style={{ background: 'rgba(139,92,246,0.08)' }}
          />
        </div>

        <div className="max-w-5xl mx-auto relative">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-6">
              <Sparkles className="w-3 h-3" /> 100% client-side · no uploads · no privacy risk
            </div>

            {/* ── #5 Word-by-word headline reveal ──────────────────────── */}
            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight leading-[1.12] mb-5 text-content">
              {HERO_WORDS.map((word, i) => (
                <motion.span
                  key={word}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="inline-block mr-[0.25em]"
                >
                  {word}
                </motion.span>
              ))}
              <motion.span
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: HERO_WORDS.length * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400"
              >
                product teams
              </motion.span>
            </h1>

            <p className="text-lg text-muted max-w-2xl mx-auto mb-8 leading-relaxed">
              Remove backgrounds, upscale resolution, and batch-export your entire catalog — all inside the browser, zero server uploads.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button onClick={onLaunchApp}
                className="flex items-center gap-2 px-7 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5">
                Launch App — it's free <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-surface border border-line-strong hover:bg-elevated text-content font-semibold text-sm transition-all hover:-translate-y-0.5">
                See pricing
              </button>
            </div>
            <div className="flex items-center justify-center gap-4 mt-4 text-xs text-faint">
              <span className="flex items-center gap-1"><Check className="w-3 h-3 text-green-400" /> No credit card</span>
              <span className="flex items-center gap-1"><Check className="w-3 h-3 text-green-400" /> Free plan forever</span>
              <span className="flex items-center gap-1"><Check className="w-3 h-3 text-green-400" /> Works offline</span>
            </div>
          </motion.div>

          {/* Before/After slider */}
          <motion.div
            initial={{ opacity: 0, y: 32, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="relative max-w-3xl mx-auto"
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
              className="absolute -top-4 -left-4 z-20 bg-surface border border-purple-500/30 rounded-xl px-3 py-2 shadow-xl hidden sm:flex items-center gap-2"
            >
              <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              <span className="text-[11px] font-semibold text-content">Background removed</span>
            </motion.div>
            <motion.div
              animate={{ y: [0, 6, 0] }}
              transition={{ repeat: Infinity, duration: 3.5, ease: 'easeInOut', delay: 0.5 }}
              className="absolute -bottom-4 -right-4 z-20 bg-surface border border-green-500/30 rounded-xl px-3 py-2 shadow-xl hidden sm:flex items-center gap-2"
            >
              <Zap className="w-3 h-3 text-green-400" />
              <span className="text-[11px] font-semibold text-content">Export-ready</span>
            </motion.div>

            {/* Glow beam under the slider */}
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-[70%] h-12 blur-2xl rounded-full pointer-events-none" style={{ background: 'rgba(99,102,241,0.25)' }} />
            <div className="rounded-2xl overflow-hidden border border-line-strong shadow-2xl shadow-black/40" style={{ height: '460px' }}>
              {demoImages ? (
                <BeforeAfterSlider
                  before={demoImages.before}
                  after={demoImages.after}
                  beforeLabel="Original"
                  afterLabel="White BG"
                />
              ) : (
                <div className="w-full h-full bg-surface flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-muted animate-spin" />
                </div>
              )}
            </div>
            <p className="text-center text-[11px] text-faint mt-3">
              ← Drag the slider to compare · AI background removal demo
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Marketplace trust bar — #2 Marquee ── */}
      <section className="border-y border-line bg-surface/40 py-5 overflow-hidden">
        <p className="text-center text-[10px] text-faint uppercase tracking-widest font-semibold mb-4">
          Used by sellers on
        </p>
        {/* Duplicate the list so the seam is invisible at -50% translate */}
        <motion.div
          animate={{ x: ['0%', '-50%'] }}
          transition={{ repeat: Infinity, duration: 22, ease: 'linear' }}
          className="flex gap-3 w-max"
          style={{ willChange: 'transform' }}
        >
          {[...MARKETPLACES, ...MARKETPLACES].map((m, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-base border border-line shrink-0"
            >
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color }} />
              <span className="text-xs font-semibold text-muted">{m.name}</span>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── Stats ── */}
      <section className="py-12 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-3">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07 }}
              className={`bg-surface border ${s.border} rounded-xl p-4 flex items-center gap-3`}
            >
              <div className={`w-9 h-9 rounded-xl ${s.bg} border ${s.border} flex items-center justify-center shrink-0`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <div className="min-w-0">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] font-semibold text-content leading-tight">{s.label}</p>
                <p className="text-[9px] text-faint leading-tight">{s.sub}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Feature cards — #4 Glassmorphism ── */}
      <section className="px-6 py-16 bg-surface/30 border-y border-line">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-content">Everything your catalog needs</h2>
            <p className="text-muted mt-3 max-w-xl mx-auto text-sm">Professional image prep without Photoshop, without a server, without a designer.</p>
          </div>
          <FeatureShowcase />
          <p className="text-center text-[11px] text-faint mt-5">
            ← Pick a feature to see it in action · auto-plays while you browse
          </p>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">How it works</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-content">Three steps to export-ready</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 relative">
            <div className="hidden sm:block absolute top-8 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px bg-gradient-to-r from-transparent via-line-strong to-transparent" />
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.4 }}
                className="flex flex-col items-center text-center gap-4"
              >
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                    <s.icon className="w-6 h-6 text-blue-400" />
                  </div>
                  <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center">{i + 1}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-content mb-1.5">{s.title}</h3>
                  <p className="text-xs text-muted leading-relaxed">{s.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing — #3 Animated border on Premium ── */}
      <section className="px-6 py-20 bg-surface/30 border-y border-line" id="pricing">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-content">Simple, honest pricing</h2>
            <p className="text-muted mt-3 text-sm">Start free. Upgrade when you need AI features.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
            {PLANS.map((plan, i) => (
              <div key={plan.name} className={plan.highlight ? 'relative' : ''}>
                {/* Spinning conic-gradient ring — premium card only */}
                {plan.highlight && (
                  <div className="absolute inset-[-1px] rounded-2xl overflow-hidden z-0">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
                      className="absolute inset-[-100%] origin-center"
                      style={{
                        background: 'conic-gradient(from 0deg, #3b82f6, #a855f7, #06b6d4, #3b82f6)',
                      }}
                    />
                  </div>
                )}

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className={`relative z-10 rounded-2xl border p-6 flex flex-col gap-5 ${
                    plan.highlight
                      ? 'border-transparent bg-surface shadow-xl shadow-blue-500/10'
                      : 'border-line bg-surface'
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-600 text-white text-[10px] font-bold rounded-full tracking-wide">
                      MOST POPULAR
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] font-bold text-faint uppercase tracking-widest mb-2">{plan.name}</p>
                    <div className="flex items-end gap-1.5">
                      <span className="text-4xl font-bold text-content">{plan.price}</span>
                      <span className="text-sm text-faint mb-1">/ {plan.period}</span>
                    </div>
                    <p className="text-xs text-muted mt-1.5">{plan.desc}</p>
                  </div>
                  <button
                    onClick={plan.highlight ? handleUpgrade : onLaunchApp}
                    disabled={plan.highlight && checkoutLoading}
                    className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${
                      plan.highlight
                        ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md hover:shadow-lg hover:shadow-blue-500/25'
                        : 'bg-elevated hover:bg-hover text-content border border-line-strong'
                    }`}
                  >
                    {plan.highlight && checkoutLoading
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Redirecting…</>
                      : <>{plan.cta} <ChevronRight className="w-3.5 h-3.5" /></>
                    }
                  </button>
                  {plan.highlight && (
                    <p className="text-[10px] text-faint text-center -mt-3">
                      {checkoutError
                        ? <span className="text-red-400">{checkoutError}</span>
                        : 'Cancel anytime — no questions asked.'}
                    </p>
                  )}
                  <div className="flex flex-col gap-2">
                    {plan.features.map(f => (
                      <div key={f} className="flex items-center gap-2.5">
                        <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
                        <span className="text-xs text-content">{f}</span>
                      </div>
                    ))}
                    {plan.locked.map(f => (
                      <div key={f} className="flex items-center gap-2.5 opacity-30">
                        <div className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">
                          <div className="w-3 h-px bg-muted" />
                        </div>
                        <span className="text-xs text-muted">{f}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Reviews ── */}
      <section className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">Reviews</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-content">Trusted by product teams</h2>
            <div className="flex items-center justify-center gap-2 mt-3">
              <div className="flex -space-x-1.5">
                {['bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-emerald-500'].map((c, j) => (
                  <div key={j} className={`w-6 h-6 rounded-full border-2 border-canvas ${c} opacity-90`} />
                ))}
              </div>
              <p className="text-xs text-faint">
                <span className="text-content font-semibold">1,200+</span> designers &amp; developers
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {REVIEWS.map((r, i) => (
              <motion.div
                key={r.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="bg-surface border border-line rounded-2xl p-5 flex flex-col gap-3 hover:border-line-strong transition-colors"
              >
                <div className="flex gap-0.5">
                  {[...Array(r.stars)].map((_, j) => (
                    <Star key={j} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-content leading-relaxed flex-1">"{r.text}"</p>
                <div className="pt-2 border-t border-line">
                  <p className="text-xs font-semibold text-content">{r.name}</p>
                  <p className="text-[10px] text-faint">{r.role}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="px-6 py-20 bg-surface/30 border-y border-line">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">FAQ</p>
            <h2 className="text-3xl font-bold tracking-tight text-content">Common questions</h2>
          </div>
          <div className="flex flex-col divide-y divide-line">
            {FAQ.map((item, i) => (
              <div key={i} className="py-4">
                <button
                  className="w-full flex items-center justify-between gap-4 text-left text-sm font-semibold text-content hover:text-muted transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className="w-4 h-4 shrink-0 text-faint transition-transform duration-200"
                    style={{ transform: openFaq === i ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  />
                </button>
                {openFaq === i && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="text-sm text-muted mt-3 leading-relaxed overflow-hidden"
                  >
                    {item.a}
                  </motion.p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="px-6 py-24 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full blur-3xl" style={{ background: 'rgba(59,130,246,0.15)' }} />
        </div>
        <div className="max-w-2xl mx-auto text-center relative">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-content mb-4">
              Ready to ship better product images?
            </h2>
            <p className="text-muted text-sm mb-8">Start free. No design skills, no Photoshop, no server needed.</p>
            <button
              onClick={onLaunchApp}
              className="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-base transition-all shadow-xl shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5"
            >
              <Sparkles className="w-5 h-5" /> Launch for free — no signup needed
            </button>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-line px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-faint">
          <div className="flex items-center gap-3">
            <img src={theme === 'dark' ? '/logo-dark.png' : '/logo.png'} alt="" className="w-5 h-5 rounded object-contain" />
            <span className="font-semibold text-muted">Image Resize</span>
            <span>© 2026 · Client-side processing only</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-muted transition-colors">Pricing</button>
            <span>·</span>
            <button onClick={openAuthModal} className="hover:text-muted transition-colors">Sign In</button>
            <span>·</span>
            <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> 100% Private</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
