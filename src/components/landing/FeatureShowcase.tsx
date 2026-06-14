import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useInView } from 'motion/react';
import {
  Wand2, ZoomIn, Crop, FileArchive, ShieldCheck, Lock,
  Check, AlertTriangle, Loader2, Upload, Ban,
} from 'lucide-react';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { getDemoSliderPair } from '../../utils/sampleImages';

type DemoKind = 'bg' | 'upscale' | 'resize' | 'batch' | 'inspect' | 'private';

interface Feature {
  id: DemoKind;
  icon: React.ElementType;
  title: string;
  desc: string;
  badge: string;
  color: string;     // text color
  bg: string;        // icon bg
  border: string;
  badgeColor: string;
}

const FEATURES: Feature[] = [
  { id: 'bg',      icon: Wand2,       title: 'AI Background Removal', desc: 'BiRefNet & ISNet models. Drag to compare — the cutout is pixel-clean, even on white-on-white.', badge: 'Premium', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', badgeColor: 'bg-purple-500/15 text-purple-400 border-purple-500/20' },
  { id: 'upscale', icon: ZoomIn,      title: 'AI Upscale 2× / 4×',   desc: 'ESRGAN super-resolution rebuilds real detail — low-res shots become crisp, not blurry.',           badge: 'Premium', color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   badgeColor: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  { id: 'resize',  icon: Crop,        title: 'Smart Resize & Crop',  desc: 'Auto-center, trim margins, contain or cover. Any aspect ratio, any marketplace, one click.',        badge: 'Free',    color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  badgeColor: 'bg-green-500/15 text-green-400 border-green-500/20' },
  { id: 'batch',   icon: FileArchive, title: 'Batch ZIP Export',     desc: 'Process your whole catalog at once and download a single ZIP at your chosen pixel size.',           badge: 'Premium', color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  badgeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  { id: 'inspect', icon: ShieldCheck, title: 'Quality Inspector',    desc: 'Flags low-res, wrong ratio, or missing BG removal before they hurt your conversions.',             badge: 'Free',    color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20',   badgeColor: 'bg-green-500/15 text-green-400 border-green-500/20' },
  { id: 'private', icon: Lock,        title: '100% Private',         desc: 'All AI runs locally via WebGPU / WASM. Zero server uploads — your images never leave your device.',  badge: 'Always',  color: 'text-rose-400',   bg: 'bg-rose-500/10',   border: 'border-rose-500/20',   badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
];

// ── Per-feature demo panels (lightweight CSS/motion — no models loaded here) ────

const BgDemo: React.FC<{ pair: { before: string; after: string } | null }> = ({ pair }) =>
  pair ? (
    <BeforeAfterSlider before={pair.before} after={pair.after} beforeLabel="Original" afterLabel="Removed" afterCheckerboard />
  ) : (
    <div className="w-full h-full flex items-center justify-center"><Loader2 className="w-6 h-6 text-muted animate-spin" /></div>
  );

const UpscaleDemo: React.FC<{ src: string | null }> = ({ src }) => (
  <div className="w-full h-full grid grid-cols-2 gap-0 bg-base">
    {(['Before · 300px', 'After · 1200px'] as const).map((label, i) => (
      <div key={label} className="relative flex items-center justify-center overflow-hidden">
        {src && (
          <img
            src={src} alt=""
            className="max-w-[80%] max-h-[80%] object-contain"
            style={i === 0 ? { filter: 'blur(3px) contrast(0.92)', imageRendering: 'pixelated', transform: 'scale(1.04)' } : undefined}
          />
        )}
        <span className={`absolute bottom-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-md ${i === 0 ? 'bg-black/50 text-white' : 'bg-blue-500/80 text-white'}`}>{label}</span>
        {i === 1 && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ repeat: Infinity, duration: 3, times: [0, 0.2, 0.8, 1] }}
            className="absolute top-2 right-2 text-[10px] font-bold text-blue-300 bg-blue-500/15 border border-blue-500/30 rounded px-1.5 py-0.5"
          >ESRGAN ✦</motion.div>
        )}
      </div>
    ))}
    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-line-strong -translate-x-1/2" />
  </div>
);

const RATIOS = [{ r: '1 / 1', label: '1:1' }, { r: '4 / 3', label: '4:3' }, { r: '16 / 9', label: '16:9' }, { r: '3 / 4', label: '3:4' }];
const ResizeDemo: React.FC = () => {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI(v => (v + 1) % RATIOS.length), 1400); return () => clearInterval(t); }, []);
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-base">
      <motion.div
        layout transition={{ type: 'spring', stiffness: 200, damping: 22 }}
        className="bg-green-500/10 border-2 border-green-500/40 rounded-lg flex items-center justify-center"
        style={{ aspectRatio: RATIOS[i].r, height: '46%' }}
      >
        <Crop className="w-7 h-7 text-green-400/70" />
      </motion.div>
      <div className="flex gap-1.5">
        {RATIOS.map((r, j) => (
          <span key={r.label} className={`text-[10px] font-mono px-2 py-0.5 rounded-md transition-all ${j === i ? 'bg-green-500/20 text-green-400 border border-green-500/40' : 'text-faint'}`}>{r.label}</span>
        ))}
      </div>
    </div>
  );
};

const BatchDemo: React.FC = () => {
  const [n, setN] = useState(0);
  useEffect(() => { const t = setInterval(() => setN(v => (v + 1) % 13), 260); return () => clearInterval(t); }, []);
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-base">
      <div className="grid grid-cols-4 gap-1.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <motion.div
            key={i}
            animate={{ opacity: i < n ? 1 : 0.15, scale: i < n ? 1 : 0.9 }}
            transition={{ duration: 0.2 }}
            className="w-9 h-9 rounded-md bg-amber-500/20 border border-amber-500/30 flex items-center justify-center"
          >
            {i < n && <Check className="w-3.5 h-3.5 text-amber-400" />}
          </motion.div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-[11px] font-semibold text-amber-400">
        <FileArchive className="w-4 h-4" /> {n >= 12 ? 'catalog.zip ready' : `Processing ${n}/12…`}
      </div>
    </div>
  );
};

const ISSUES = [
  { ok: false, label: 'Resolution too low (480px)' },
  { ok: false, label: 'Wrong aspect ratio (5:4)' },
  { ok: true,  label: 'Background removed' },
  { ok: true,  label: 'Centered & trimmed' },
];
const InspectDemo: React.FC = () => (
  <div className="w-full h-full flex flex-col items-center justify-center gap-2.5 px-6 bg-base">
    {ISSUES.map((it, i) => (
      <motion.div
        key={it.label}
        initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: false }}
        transition={{ delay: i * 0.25, repeat: Infinity, repeatType: 'reverse', repeatDelay: 2, duration: 0.4 }}
        className={`w-full max-w-[280px] flex items-center gap-2.5 px-3 py-2 rounded-lg border text-[11px] ${
          it.ok ? 'bg-green-500/10 border-green-500/25 text-green-400' : 'bg-red-500/10 border-red-500/25 text-red-400'
        }`}
      >
        {it.ok ? <Check className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
        <span className="text-content/90">{it.label}</span>
      </motion.div>
    ))}
  </div>
);

const PrivateDemo: React.FC = () => (
  <div className="w-full h-full flex flex-col items-center justify-center gap-5 bg-base relative overflow-hidden">
    <div className="flex items-center gap-5">
      <div className="flex flex-col items-center gap-1">
        <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center"><Upload className="w-5 h-5 text-rose-400" /></div>
        <span className="text-[10px] text-faint">your device</span>
      </div>
      <div className="relative">
        <motion.div animate={{ x: [0, 14, 0] }} transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}>
          <Ban className="w-6 h-6 text-rose-400" />
        </motion.div>
      </div>
      <div className="flex flex-col items-center gap-1 opacity-40">
        <div className="w-12 h-12 rounded-xl bg-base border border-line-strong flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-muted" /></div>
        <span className="text-[10px] text-faint">server</span>
      </div>
    </div>
    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-400">
      <Lock className="w-3.5 h-3.5" /> Nothing uploaded — ever
    </div>
  </div>
);

// ── Showcase ───────────────────────────────────────────────────────────────────
export const FeatureShowcase: React.FC = () => {
  const [active, setActive] = useState(0);
  const [pair, setPair] = useState<{ before: string; after: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const [paused, setPaused] = useState(false);

  useEffect(() => { setPair(getDemoSliderPair()); }, []);

  // Auto-advance while in view and not being hovered.
  useEffect(() => {
    if (!inView || paused) return;
    const t = setInterval(() => setActive(v => (v + 1) % FEATURES.length), 4500);
    return () => clearInterval(t);
  }, [inView, paused]);

  const f = FEATURES[active];

  return (
    <div ref={ref} className="grid grid-cols-1 lg:grid-cols-5 gap-4" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {/* Tabs */}
      <div className="lg:col-span-2 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
        {FEATURES.map((feat, i) => {
          const isActive = i === active;
          return (
            <button
              key={feat.id}
              onClick={() => setActive(i)}
              aria-pressed={isActive}
              className={`relative text-left shrink-0 lg:shrink rounded-xl border p-3.5 transition-all flex items-start gap-3 min-w-[220px] lg:min-w-0 ${
                isActive ? `${feat.bg} ${feat.border} shadow-sm` : 'bg-surface border-line hover:border-line-strong'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg ${feat.bg} border ${feat.border} flex items-center justify-center shrink-0`}>
                <feat.icon className={`w-[18px] h-[18px] ${feat.color}`} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className={`font-semibold text-xs ${isActive ? 'text-content' : 'text-muted'}`}>{feat.title}</h3>
                  <span className={`text-[8px] font-bold px-1.5 py-px rounded-full border ${feat.badgeColor} uppercase tracking-wide hidden sm:inline`}>{feat.badge}</span>
                </div>
                <AnimatePresence initial={false}>
                  {isActive && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="text-[11px] text-muted leading-relaxed mt-1 overflow-hidden"
                    >
                      {feat.desc}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              {isActive && (
                <motion.div layoutId="featTabBar" className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-full ${feat.color.replace('text-', 'bg-')}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* Demo panel */}
      <div className="lg:col-span-3">
        <div className="relative rounded-2xl border border-line-strong overflow-hidden bg-base shadow-xl shadow-black/20" style={{ height: '340px' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={f.id}
              initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0"
            >
              {f.id === 'bg'      && <BgDemo pair={pair} />}
              {f.id === 'upscale' && <UpscaleDemo src={pair?.after ?? null} />}
              {f.id === 'resize'  && <ResizeDemo />}
              {f.id === 'batch'   && <BatchDemo />}
              {f.id === 'inspect' && <InspectDemo />}
              {f.id === 'private' && <PrivateDemo />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
