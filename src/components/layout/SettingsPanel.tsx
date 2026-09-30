import React, { useRef, useState, useCallback } from 'react';
import { Sliders, RotateCcw, Scale, Crop, Sparkles, Wand2, Loader2, Check, ArrowUpNarrowWide, X, Store, Download } from 'lucide-react';
import { useEditor } from '../../context/EditorContext';
import { AspectRatioType, BackgroundStyle } from '../../types';
import type { ResizeSettings } from '../../types';
import { BG_MODEL_MAP } from '../../utils/imageProcessor';
import { Switch, SwitchField, SwitchGroup } from '../../catalyst-ui-kit/typescript/switch';
import { Label } from '../../catalyst-ui-kit/typescript/fieldset';
import { Button } from '../../catalyst-ui-kit/typescript/button';
import { Input } from '../../catalyst-ui-kit/typescript/input';

type PresetPatch = Partial<ResizeSettings>;

function PreloadModelsButton({ bgQuality }: { bgQuality: 'fast' | 'balanced' | 'quality' }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const preload = useCallback(async () => {
    setState('loading');
    try {
      await Promise.all([
        import('@imgly/background-removal').then(({ removeBackground }) =>
          removeBackground('data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', {
            model: BG_MODEL_MAP[bgQuality],
            output: { format: 'image/png' },
          }).catch(() => {}),
        ),
        import('upscaler').then(() => {}),
      ]);
      setState('done');
    } catch {
      setState('error');
    }
  }, [bgQuality]);

  if (state === 'done') return <p className="text-[10px] text-green-400">Models loaded — batch processing ready.</p>;

  return (
    <button
      onClick={preload}
      disabled={state === 'loading'}
      className="flex items-center gap-1.5 text-[10px] text-faint hover:text-muted transition-colors disabled:opacity-50"
      title="Download and cache AI models now so batch processing starts immediately"
    >
      {state === 'loading'
        ? <><Loader2 className="w-3 h-3 animate-spin" /> Downloading models…</>
        : state === 'error'
        ? <><Download className="w-3 h-3 text-red-400" /> Preload failed — retry</>
        : <><Download className="w-3 h-3" /> Preload models for faster batch processing</>}
    </button>
  );
}

const PRESETS: { id: string; label: string; hint: string; patch: PresetPatch }[] = [
  {
    id: 'shopify',
    label: 'Shopify',
    hint: '1:1 · 2048px · white · JPEG',
    patch: { aspectRatioType: '1:1', bgStyle: 'solid', backgroundColor: '#ffffff', exportFormat: 'jpeg', exportQuality: 0.92, fitMode: 'contain', padding: 5 },
  },
  {
    id: 'amazon',
    label: 'Amazon',
    hint: '1:1 · 1000px · white · JPEG',
    patch: { aspectRatioType: '1:1', bgStyle: 'solid', backgroundColor: '#ffffff', exportFormat: 'jpeg', exportQuality: 0.95, fitMode: 'contain', padding: 0, trimProductMargins: true },
  },
  {
    id: 'etsy',
    label: 'Etsy',
    hint: '4:3 · lifestyle · transparent',
    patch: { aspectRatioType: '4:3', bgStyle: 'transparent', exportFormat: 'png', fitMode: 'contain', padding: 3 },
  },
  {
    id: 'instagram',
    label: 'Instagram',
    hint: '1:1 · square · auto-bg',
    patch: { aspectRatioType: '1:1', bgStyle: 'auto', exportFormat: 'jpeg', exportQuality: 0.90, fitMode: 'contain', padding: 8 },
  },
  {
    id: 'woo',
    label: 'WooCommerce',
    hint: '1:1 · 800px · white · JPEG',
    patch: { aspectRatioType: '1:1', bgStyle: 'solid', backgroundColor: '#ffffff', exportFormat: 'jpeg', exportQuality: 0.90, fitMode: 'contain', padding: 5 },
  },
  {
    id: 'lazada',
    label: 'Lazada / Shopee',
    hint: '1:1 · white bg · no padding',
    patch: { aspectRatioType: '1:1', bgStyle: 'solid', backgroundColor: '#ffffff', exportFormat: 'jpeg', exportQuality: 0.92, fitMode: 'contain', padding: 0, trimProductMargins: true },
  },
];

export const SettingsPanel: React.FC = () => {
  const { settings, setSettings, handleResetSettings, selectedImage, selectedImageAnalysis, handleRemoveBackground, handleRemoveBackgroundAll, isBgProcessing, bgProgress, bgStage, bgBatch, bgQuality, setBgQuality, handleCancelBgRemoval, handleCancelUpscale, handleUpscale, isUpscaling, upscaleProgress } = useEditor();
  const bgBusy = selectedImage ? isBgProcessing(selectedImage.id) : false;
  const bgRemoved = !!selectedImage?.bgRemoved;
  const batchRunning = bgBatch !== null;
  const progressLabel =
    bgStage === 'download' ? `Downloading model ${bgProgress ?? 0}%`
    : bgStage === 'process' ? `Processing ${bgProgress ?? 0}%`
    : 'Preparing…'; // clicked, lib still importing / no stage reported yet

  const [upscaleFactor, setUpscaleFactor] = useState<2 | 4>(2);
  const upscaleBusy = selectedImage ? isUpscaling(selectedImage.id) : false;
  const upscaled = !!selectedImage?.upscaled;
  const isLowRes = !!selectedImageAnalysis?.issues?.includes('Low resolution');
  // Mirror the bg "Preparing…" pattern: no misleading 0% before the model reports.
  const upscaleLabel = upscaleProgress != null && upscaleProgress > 0 ? `Upscaling ${upscaleProgress}%` : 'Preparing…';
  const gridRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!gridRef.current) return;
    gridRef.current.setPointerCapture(e.pointerId);
    updateOffsets(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!gridRef.current || !gridRef.current.hasPointerCapture(e.pointerId)) return;
    updateOffsets(e);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (gridRef.current) gridRef.current.releasePointerCapture(e.pointerId);
  };

  const updateOffsets = (e: React.PointerEvent) => {
    if (!gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const offsetValX = Math.round((x / rect.width - 0.5) * 80);
    const offsetValY = Math.round((y / rect.height - 0.5) * 80);
    setSettings(p => ({ ...p, shadowType: 'custom', shadowOffsetX: offsetValX, shadowOffsetY: offsetValY }));
  };

  return (
    <aside className="order-3 lg:col-span-3 bg-surface border border-line rounded-xl p-4 flex flex-col shadow-lg gap-5 lg:h-[calc(100vh-100px)] lg:overflow-y-auto lg:sticky lg:top-[80px]">
      <div className="flex items-center justify-between pb-3 border-b border-line shrink-0">
        <h2 className="font-semibold text-sm text-content flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-500" /> Settings
        </h2>
        <button onClick={handleResetSettings} className="p-1 text-faint hover:text-muted transition-colors" title="Reset to defaults">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Marketplace presets */}
      <div className="flex flex-col gap-2 shrink-0">
        <label className="text-xs font-semibold text-muted flex items-center gap-1.5">
          <Store className="w-3.5 h-3.5" /> Marketplace Preset
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => setSettings(prev => ({ ...prev, ...p.patch }))}
              className="flex flex-col items-start px-2.5 py-2 rounded-lg border border-line bg-elevated/40 hover:bg-elevated hover:border-line-strong transition-all text-left"
            >
              <span className="text-[11px] font-semibold text-content">{p.label}</span>
              <span className="text-[9px] text-faint mt-0.5 leading-snug">{p.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 shrink-0">
        <label className="text-xs font-semibold text-muted">Dimensions</label>
        <div className="grid grid-cols-2 gap-1.5">
          {(['1:1', '4:3', '3:4', '16:9', 'custom'] as AspectRatioType[]).map((type) => (
            <button
              key={type}
              onClick={() => setSettings(p => ({ ...p, aspectRatioType: type }))}
              className={`py-1.5 rounded-md text-xs font-medium border transition-all ${
                settings.aspectRatioType === type 
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' 
                  : 'bg-elevated/50 border-line text-muted hover:bg-elevated'
              }`}
            >
              {type === 'custom' ? 'Custom' : type}
            </button>
          ))}
        </div>
        {settings.aspectRatioType === 'custom' && (
          <div className="grid grid-cols-2 gap-2 mt-1">
            <div>
              <span className="text-[10px] text-faint uppercase tracking-wider mb-1 block">Width</span>
              <Input
                type="number" value={settings.customWidth}
                onChange={(e) => setSettings(p => ({ ...p, customWidth: Math.max(10, Number(e.target.value)) }))}
                className="[&_input]:!py-1 [&_input]:!px-2 [&_input]:!text-xs [&_input]:!leading-5"
              />
            </div>
            <div>
              <span className="text-[10px] text-faint uppercase tracking-wider mb-1 block">Height</span>
              <Input
                type="number" value={settings.customHeight}
                onChange={(e) => setSettings(p => ({ ...p, customHeight: Math.max(10, Number(e.target.value)) }))}
                className="[&_input]:!py-1 [&_input]:!px-2 [&_input]:!text-xs [&_input]:!leading-5"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 shrink-0">
        <label className="text-xs font-semibold text-muted">Fit Mode</label>
        <div className="flex flex-col gap-1.5">
          {([
            { key: 'contain', label: 'Contain', desc: 'Full image visible · padding fills the remaining space' },
            { key: 'cover',   label: 'Cover',   desc: 'Image fills the frame · edges may be cropped out' },
            { key: 'stretch', label: 'Stretch', desc: 'Image distorts to fill exactly — not recommended for products' },
          ] as const).map((mode) => (
            <button
              key={mode.key}
              onClick={() => setSettings(p => ({ ...p, fitMode: mode.key }))}
              className={`py-1.5 px-3 rounded-md text-xs font-medium border text-left transition-all ${
                settings.fitMode === mode.key
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                  : 'bg-elevated/50 border-line text-muted hover:bg-elevated'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-faint leading-relaxed -mt-1">
          {settings.fitMode === 'contain' && 'Full image visible · padding fills the remaining space'}
          {settings.fitMode === 'cover'   && 'Image fills the frame · edges may be cropped out'}
          {settings.fitMode === 'stretch' && 'Image distorts to fill exactly — not recommended for products'}
        </p>
      </div>

      <div className="flex flex-col gap-3 shrink-0">
        <label className="text-xs font-semibold text-muted">Padding: {settings.padding}%</label>
        <input 
          type="range" min="0" max="40" value={settings.padding}
          onChange={(e) => setSettings(p => ({ ...p, padding: Number(e.target.value) }))}
          className="w-full h-1.5 rounded-lg bg-track accent-blue-500 cursor-pointer"
        />
      </div>

      <SwitchGroup className="shrink-0 border-t border-line pt-4 !space-y-3">
        <SwitchField>
          <Label className="!text-xs !font-semibold !text-muted">Trim Margins</Label>
          <Switch
            name="trim" color="blue" checked={settings.trimProductMargins}
            onChange={(v: boolean) => setSettings(p => ({ ...p, trimProductMargins: v }))}
          />
        </SwitchField>
        <SwitchField>
          <Label className="!text-xs !font-semibold !text-muted">
            Auto-Center <span className="ml-1 rounded bg-blue-500/10 px-1 py-0.5 font-mono text-[10px] text-blue-400">AI</span>
          </Label>
          <Switch
            name="auto-center" color="blue" checked={settings.autoCenter}
            onChange={(v: boolean) => setSettings(p => ({ ...p, autoCenter: v }))}
          />
        </SwitchField>
        <SwitchField>
          <Label className="!text-xs !font-semibold !text-muted">Upscale Small</Label>
          <Switch
            name="upscale-small" color="blue" checked={settings.upscaleSmallImages}
            onChange={(v: boolean) => setSettings(p => ({ ...p, upscaleSmallImages: v }))}
          />
        </SwitchField>
      </SwitchGroup>

      <div className="flex flex-col gap-3 shrink-0 border-t border-line pt-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-muted">Enhance Quality</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettings(p => ({ ...p, brightness: 102, contrast: 108, saturation: 110, sharpen: 30 }))}
              className="flex items-center gap-1 text-[10px] font-medium text-blue-400 hover:text-blue-300 transition-colors"
            >
              <Sparkles className="w-3 h-3" /> Auto
            </button>
            <button
              onClick={() => setSettings(p => ({ ...p, brightness: 100, contrast: 100, saturation: 100, sharpen: 0 }))}
              className="text-[10px] font-medium text-faint hover:text-muted transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {([
          { key: 'brightness', label: 'Brightness', min: 50, max: 150, unit: '%' },
          { key: 'contrast', label: 'Contrast', min: 50, max: 150, unit: '%' },
          { key: 'saturation', label: 'Saturation', min: 0, max: 200, unit: '%' },
          { key: 'sharpen', label: 'Sharpen', min: 0, max: 100, unit: '' },
        ] as const).map(({ key, label, min, max, unit }) => (
          <div key={key} className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-muted">{label}</span>
              <span className="text-[10px] text-faint font-mono">{settings[key]}{unit}</span>
            </div>
            <input
              type="range" min={min} max={max} value={settings[key]}
              onChange={(e) => setSettings(p => ({ ...p, [key]: Number(e.target.value) }))}
              className="w-full h-1.5 rounded-lg bg-track accent-blue-500 cursor-pointer"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 shrink-0 border-t border-line pt-4">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs font-semibold text-muted">Upscale</label>
            <p className="text-[10px] text-faint mt-0.5">AI enlarges small images without blur — run before export</p>
          </div>
          <div className="flex items-center gap-0.5 bg-elevated/50 border border-line rounded-md p-0.5">
            {([2, 4] as const).map((f) => (
              <button
                key={f}
                onClick={() => setUpscaleFactor(f)}
                disabled={upscaleBusy}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all disabled:opacity-50 ${
                  upscaleFactor === f ? 'bg-blue-500/20 text-blue-400' : 'text-faint hover:text-muted'
                }`}
              >
                {f}×
              </button>
            ))}
          </div>
        </div>

        {(
          <>
            <Button
              color={upscaled ? ('green' as const) : ('blue' as const)}
              onClick={() => selectedImage && handleUpscale(selectedImage.id, upscaleFactor)}
              disabled={!selectedImage || upscaleBusy}
              className="w-full !text-xs !items-center"
            >
              {upscaleBusy ? (
                <><Loader2 data-slot="icon" className="animate-spin" /> {upscaleLabel}</>
              ) : upscaled ? (
                <><Check data-slot="icon" /> Upscaled · Restore</>
              ) : (
                <><ArrowUpNarrowWide data-slot="icon" /> Upscale {upscaleFactor}× <span className="rounded bg-white/25 px-1 py-px font-mono text-[9px] uppercase">AI</span></>
              )}
            </Button>
            {upscaleBusy && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-track overflow-hidden">
                  {upscaleProgress != null && upscaleProgress > 0 && (
                    <div className="h-full bg-blue-500 transition-all duration-200" style={{ width: `${upscaleProgress}%` }} />
                  )}
                </div>
                <button onClick={handleCancelUpscale} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all shrink-0">
                  <X className="w-2.5 h-2.5" /> Cancel
                </button>
              </div>
            )}
          </>
        )}

        {isLowRes && !upscaled && !upscaleBusy && (
          <p className="text-[10px] text-amber-500/80 leading-tight">
            ⚡ This image is low-res — upscaling sharpens it before export.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 shrink-0 border-t border-line pt-4">
        <label className="text-xs font-semibold text-muted">Background</label>

        {(
          <>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-faint">Model quality</span>
              <div className="flex items-center gap-0.5 bg-elevated/50 border border-line rounded-md p-0.5">
                {([
                  { key: 'fast', label: 'Fast', title: 'isnet_quint8 · ~20MB · fastest' },
                  { key: 'balanced', label: 'Balanced', title: 'isnet_fp16 · ~40MB · default' },
                  { key: 'quality', label: 'Quality', title: 'isnet · ~80MB · best edges' },
                ] as const).map(({ key, label, title }) => (
                  <button
                    key={key}
                    onClick={() => setBgQuality(key)}
                    title={title}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                      bgQuality === key ? 'bg-blue-500/20 text-blue-400' : 'text-faint hover:text-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[10px] text-faint leading-relaxed -mt-1">
              {bgQuality === 'fast'     && 'Fast · ~20MB model · good for simple backgrounds'}
              {bgQuality === 'balanced' && 'Balanced · ~40MB model · recommended for most products'}
              {bgQuality === 'quality'  && 'Quality · ~80MB model · best for hair, fur, fine edges'}
            </p>

            {/* Preload models — avoids the download stall mid-batch */}
            <PreloadModelsButton bgQuality={bgQuality} />

            {/* Single BG removal — shows cancel inline when busy */}
            <div className="flex gap-2">
              <Button
                color={bgRemoved ? ('green' as const) : ('blue' as const)}
                onClick={() => selectedImage && handleRemoveBackground(selectedImage.id)}
                disabled={!selectedImage || bgBusy || batchRunning}
                className="flex-1 !text-xs !items-center"
              >
                {bgBusy ? (
                  <><Loader2 data-slot="icon" className="animate-spin" /> {progressLabel}</>
                ) : bgRemoved ? (
                  <><Check data-slot="icon" /> Removed · Restore</>
                ) : (
                  <><Wand2 data-slot="icon" /> Remove BG <span className="rounded bg-white/25 px-1 py-px font-mono text-[9px] uppercase">AI</span></>
                )}
              </Button>
              {bgBusy && (
                <Button color="red" onClick={handleCancelBgRemoval}>
                  <X data-slot="icon" /> Cancel
                </Button>
              )}
            </div>

            {/* Batch BG removal — shows cancel inline when running */}
            <div className="flex gap-2">
              <Button
                outline
                onClick={handleRemoveBackgroundAll}
                disabled={batchRunning || bgBusy}
                className="flex-1 !text-xs !items-center"
              >
                {batchRunning ? (
                  <><Loader2 data-slot="icon" className="animate-spin" /> Removing all · {bgBatch!.done}/{bgBatch!.total} {bgProgress !== null ? `· ${bgProgress}%` : ''}</>
                ) : (
                  <><Wand2 data-slot="icon" /> Remove Background — All</>
                )}
              </Button>
              {batchRunning && (
                <Button color="red" onClick={handleCancelBgRemoval}>
                  <X data-slot="icon" /> Cancel
                </Button>
              )}
            </div>

            {batchRunning && (
              <div className="h-1 w-full rounded-full bg-track overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-200"
                  style={{ width: `${Math.round(((bgBatch!.done + (bgProgress ?? 0) / 100) / bgBatch!.total) * 100)}%` }}
                />
              </div>
            )}
          </>
        )}

        {bgRemoved && settings.bgStyle === 'transparent' && settings.exportFormat === 'jpeg' && (
          <p className="text-[10px] text-amber-500/80 leading-tight">⚠️ Export as PNG/WEBP to keep transparency.</p>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          {(['solid', 'auto', 'blurred', 'transparent'] as BackgroundStyle[]).map((style) => (
            <button
              key={style}
              onClick={() => setSettings(p => ({ ...p, bgStyle: style }))}
              className={`py-1.5 rounded-md text-xs font-medium border transition-all capitalize ${
                settings.bgStyle === style
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                  : 'bg-elevated/50 border-line text-muted hover:bg-elevated'
              }`}
            >
              {style}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-faint leading-relaxed -mt-1">
          {settings.bgStyle === 'solid'       && 'Flat color background — set the color below'}
          {settings.bgStyle === 'auto'        && 'Automatically matches dominant color from the image'}
          {settings.bgStyle === 'blurred'     && 'Blurred version of the image fills the background'}
          {settings.bgStyle === 'transparent' && 'No background — export as PNG or WEBP to preserve transparency'}
        </p>
        {settings.bgStyle === 'solid' && (
          <div className="flex items-center gap-2 mt-1 bg-base p-1.5 rounded-lg border border-line-strong">
            <input 
              type="color" value={settings.backgroundColor}
              onChange={(e) => setSettings(p => ({ ...p, backgroundColor: e.target.value }))}
              className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
            />
            <Input
              type="text" value={settings.backgroundColor} aria-label="Background colour hex"
              onChange={(e) => setSettings(p => ({ ...p, backgroundColor: e.target.value }))}
              className="flex-1 font-mono [&_input]:!py-1 [&_input]:!px-2 [&_input]:!text-xs [&_input]:!leading-5"
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 shrink-0 border-t border-line pt-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-muted">Drop Shadow</label>
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            {settings.shadowType}
          </span>
        </div>
        
        <div className="grid grid-cols-3 gap-1.5">
          {(['none', 'soft', 'medium', 'hard', 'glow', 'custom'] as const).map((preset) => (
            <button
              key={preset}
              onClick={() => setSettings(p => ({ ...p, shadowType: preset }))}
              className={`py-1 rounded text-xs font-medium border transition-all capitalize ${
                settings.shadowType === preset
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                  : 'bg-elevated/50 border-line text-muted hover:bg-elevated'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        {settings.shadowType !== 'none' && (
          <div className="mt-2 flex flex-col gap-4 bg-base p-3 rounded-lg border border-line">
            <div className="flex bg-surface p-0.5 rounded-lg border border-line-strong text-xs font-medium">
              <button
                onClick={() => setSettings(p => ({ ...p, shadowType: 'custom', shadowPlacement: 'outset' }))}
                className={`flex-1 py-1 rounded-md transition-all ${
                  settings.shadowPlacement === 'outset' ? 'bg-elevated text-content shadow-sm' : 'text-faint hover:text-muted'
                }`}
              >
                Outset
              </button>
              <button
                onClick={() => setSettings(p => ({ ...p, shadowType: 'custom', shadowPlacement: 'inset' }))}
                className={`flex-1 py-1 rounded-md transition-all ${
                  settings.shadowPlacement === 'inset' ? 'bg-elevated text-content shadow-sm' : 'text-faint hover:text-muted'
                }`}
              >
                Inset
              </button>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex-1 flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-faint font-mono">X</span>
                  <input type="number" value={settings.shadowOffsetX} onChange={(e) => setSettings(p => ({ ...p, shadowType: 'custom', shadowOffsetX: Number(e.target.value) }))} className="w-12 bg-surface border border-line-strong rounded px-1 text-center text-content outline-none" />
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-faint font-mono">Y</span>
                  <input type="number" value={settings.shadowOffsetY} onChange={(e) => setSettings(p => ({ ...p, shadowType: 'custom', shadowOffsetY: Number(e.target.value) }))} className="w-12 bg-surface border border-line-strong rounded px-1 text-center text-content outline-none" />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input type="color" value={settings.shadowColor} onChange={(e) => setSettings(p => ({ ...p, shadowType: 'custom', shadowColor: e.target.value }))} className="w-6 h-6 rounded cursor-pointer bg-transparent border-0" />
                </div>
              </div>

              <div 
                ref={gridRef}
                onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
                className="w-16 h-16 border border-line-strong bg-surface rounded-lg relative overflow-hidden cursor-crosshair shrink-0"
              >
                <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-line-strong" />
                <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-line-strong" />
                <div 
                  className="absolute w-2 h-2 bg-blue-500 rounded-full shadow-sm -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${Math.min(95, Math.max(5, ((settings.shadowOffsetX + 40) / 80) * 100))}%`, top: `${Math.min(95, Math.max(5, ((settings.shadowOffsetY + 40) / 80) * 100))}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 shrink-0 border-t border-line pt-4 mb-4">
        <label className="text-xs font-semibold text-muted">Export Settings</label>

        <div className="grid grid-cols-3 gap-1.5">
          {(['jpeg', 'png', 'webp'] as const).map((fmt) => (
            <button
              key={fmt}
              onClick={() => setSettings(p => ({ ...p, exportFormat: fmt }))}
              className={`py-1 rounded text-xs font-medium border transition-all uppercase ${
                settings.exportFormat === fmt
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                  : 'bg-elevated/50 border-line text-muted hover:bg-elevated'
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-faint leading-relaxed -mt-1">
          {settings.exportFormat === 'jpeg' && 'Smallest file · no transparency · best for solid backgrounds'}
          {settings.exportFormat === 'png'  && 'Lossless · supports transparency · larger file size'}
          {settings.exportFormat === 'webp' && 'Modern format · transparency + compression · best all-rounder'}
        </p>

        {settings.exportFormat !== 'png' && (
          <div className="flex flex-col gap-1 mt-1">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-faint">Quality</span>
              <span className="text-[10px] text-muted font-mono">{Math.round(settings.exportQuality * 100)}%</span>
            </div>
            <input 
              type="range" min="0.1" max="1" step="0.05" value={settings.exportQuality}
              onChange={(e) => setSettings(p => ({ ...p, exportQuality: Number(e.target.value) }))}
              className="w-full h-1.5 rounded-lg bg-track accent-blue-500 cursor-pointer"
            />
            {settings.exportFormat === 'jpeg' && settings.bgStyle === 'transparent' && (
              <p className="text-[10px] text-amber-500/80 leading-tight mt-1">
                ⚠️ JPEG does not support transparency. Transparent areas will render as black. Switch to PNG or WEBP.
              </p>
            )}
          </div>
        )}
      </div>

    </aside>
  );
};
