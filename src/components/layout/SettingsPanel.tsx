import React, { useRef, useState } from 'react';
import { Sliders, RotateCcw, Scale, Crop, Sparkles, Wand2, Loader2, Check, ArrowUpNarrowWide } from 'lucide-react';
import { useEditor } from '../../context/EditorContext';
import { AspectRatioType, BackgroundStyle } from '../../types';

export const SettingsPanel: React.FC = () => {
  const { settings, setSettings, handleResetSettings, selectedImage, selectedImageAnalysis, handleRemoveBackground, handleRemoveBackgroundAll, isBgProcessing, bgProgress, bgStage, bgBatch, handleUpscale, isUpscaling, upscaleProgress } = useEditor();
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
    <aside className="lg:col-span-3 bg-surface border border-line rounded-xl p-4 flex flex-col shadow-lg gap-5 h-[calc(100vh-100px)] overflow-y-auto sticky top-[80px]">
      <div className="flex items-center justify-between pb-3 border-b border-line shrink-0">
        <h2 className="font-semibold text-sm text-content flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-500" /> Settings
        </h2>
        <button onClick={handleResetSettings} className="p-1 text-faint hover:text-muted transition-colors">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
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
              <input 
                type="number" value={settings.customWidth}
                onChange={(e) => setSettings(p => ({ ...p, customWidth: Math.max(10, Number(e.target.value)) }))}
                className="w-full bg-base border border-line-strong rounded px-2 py-1 text-xs text-content outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <span className="text-[10px] text-faint uppercase tracking-wider mb-1 block">Height</span>
              <input 
                type="number" value={settings.customHeight}
                onChange={(e) => setSettings(p => ({ ...p, customHeight: Math.max(10, Number(e.target.value)) }))}
                className="w-full bg-base border border-line-strong rounded px-2 py-1 text-xs text-content outline-none focus:border-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 shrink-0">
        <label className="text-xs font-semibold text-muted">Fit Mode</label>
        <div className="flex flex-col gap-1.5">
          {[
            { key: 'contain', label: 'Contain (Fit inside)' },
            { key: 'cover', label: 'Cover (Zoom to fill)' },
            { key: 'stretch', label: 'Stretch (Distort)' }
          ].map((mode) => (
            <button
              key={mode.key}
              onClick={() => setSettings(p => ({ ...p, fitMode: mode.key as any }))}
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
      </div>

      <div className="flex flex-col gap-3 shrink-0">
        <label className="text-xs font-semibold text-muted">Padding: {settings.padding}%</label>
        <input 
          type="range" min="0" max="40" value={settings.padding}
          onChange={(e) => setSettings(p => ({ ...p, padding: Number(e.target.value) }))}
          className="w-full h-1.5 rounded-lg bg-track accent-blue-500 cursor-pointer"
        />
      </div>

      <div className="flex flex-col gap-2 shrink-0 border-t border-line pt-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-muted">Trim Margins</label>
          <input 
            type="checkbox" checked={settings.trimProductMargins}
            onChange={(e) => setSettings(p => ({ ...p, trimProductMargins: e.target.checked }))}
            className="w-3.5 h-3.5 rounded bg-track accent-blue-500 border-line-strong"
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <label className="text-xs font-semibold text-muted">Auto-Center <span className="text-[10px] text-blue-400 font-mono bg-blue-500/10 px-1 py-0.5 rounded ml-1">AI</span></label>
          <input 
            type="checkbox" checked={settings.autoCenter}
            onChange={(e) => setSettings(p => ({ ...p, autoCenter: e.target.checked }))}
            className="w-3.5 h-3.5 rounded bg-track accent-blue-500 border-line-strong"
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <label className="text-xs font-semibold text-muted">Upscale Small</label>
          <input 
            type="checkbox" checked={settings.upscaleSmallImages}
            onChange={(e) => setSettings(p => ({ ...p, upscaleSmallImages: e.target.checked }))}
            className="w-3.5 h-3.5 rounded bg-track accent-blue-500 border-line-strong"
          />
        </div>
      </div>

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
          <label className="text-xs font-semibold text-muted">Upscale</label>
          {/* 2×/4× picks a dedicated ESRGAN model, not 2× applied twice. */}
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

        <button
          onClick={() => selectedImage && handleUpscale(selectedImage.id, upscaleFactor)}
          disabled={!selectedImage || upscaleBusy}
          className={`flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            upscaled
              ? 'bg-green-500/15 text-green-400 border-green-500/40 hover:bg-green-500/25'
              : 'bg-blue-500/15 text-blue-400 border-blue-500/40 hover:bg-blue-500/25'
          }`}
        >
          {upscaleBusy ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {upscaleLabel}</>
          ) : upscaled ? (
            <><Check className="w-3.5 h-3.5" /> Upscaled · Restore</>
          ) : (
            <><ArrowUpNarrowWide className="w-3.5 h-3.5" /> Upscale {upscaleFactor}× <span className="text-[9px] uppercase font-mono bg-blue-500/20 px-1 py-0.5 rounded">AI</span></>
          )}
        </button>

        {upscaleBusy && upscaleProgress != null && upscaleProgress > 0 && (
          <div className="h-1 w-full rounded-full bg-track overflow-hidden">
            <div className="h-full bg-blue-500 transition-all duration-200" style={{ width: `${upscaleProgress}%` }} />
          </div>
        )}

        {isLowRes && !upscaled && !upscaleBusy && (
          <p className="text-[10px] text-amber-500/80 leading-tight">
            ⚡ This image is low-res — upscaling sharpens it before export.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 shrink-0 border-t border-line pt-4">
        <label className="text-xs font-semibold text-muted">Background</label>

        <button
          onClick={() => selectedImage && handleRemoveBackground(selectedImage.id)}
          disabled={!selectedImage || bgBusy || batchRunning}
          className={`flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            bgRemoved
              ? 'bg-green-500/15 text-green-400 border-green-500/40 hover:bg-green-500/25'
              : 'bg-blue-500/15 text-blue-400 border-blue-500/40 hover:bg-blue-500/25'
          }`}
        >
          {bgBusy ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {progressLabel}</>
          ) : bgRemoved ? (
            <><Check className="w-3.5 h-3.5" /> Background removed · Restore</>
          ) : (
            <><Wand2 className="w-3.5 h-3.5" /> Remove Background <span className="text-[9px] uppercase font-mono bg-blue-500/20 px-1 py-0.5 rounded">AI</span></>
          )}
        </button>

        <button
          onClick={handleRemoveBackgroundAll}
          disabled={batchRunning || bgBusy}
          className="flex items-center justify-center gap-2 py-1.5 rounded-md text-[11px] font-medium border border-line-strong bg-elevated/50 text-muted hover:bg-elevated transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {batchRunning ? (
            <><Loader2 className="w-3 h-3 animate-spin" /> Removing all · {bgBatch!.done}/{bgBatch!.total} {bgProgress !== null ? `· ${bgProgress}%` : ''}</>
          ) : (
            <><Wand2 className="w-3 h-3" /> Remove Background — All</>
          )}
        </button>

        {batchRunning && (
          <div className="h-1 w-full rounded-full bg-track overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-200"
              style={{ width: `${Math.round(((bgBatch!.done + (bgProgress ?? 0) / 100) / bgBatch!.total) * 100)}%` }}
            />
          </div>
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
        {settings.bgStyle === 'solid' && (
          <div className="flex items-center gap-2 mt-1 bg-base p-1.5 rounded-lg border border-line-strong">
            <input 
              type="color" value={settings.backgroundColor}
              onChange={(e) => setSettings(p => ({ ...p, backgroundColor: e.target.value }))}
              className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
            />
            <input 
              type="text" value={settings.backgroundColor}
              onChange={(e) => setSettings(p => ({ ...p, backgroundColor: e.target.value }))}
              className="flex-1 bg-transparent px-2 text-xs text-content outline-none font-mono"
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
          {['none', 'soft', 'medium', 'hard', 'glow', 'custom'].map((preset) => (
            <button
              key={preset}
              onClick={() => setSettings(p => ({ ...p, shadowType: preset as any }))}
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
          {['jpeg', 'png', 'webp'].map((fmt) => (
            <button
              key={fmt}
              onClick={() => setSettings(p => ({ ...p, exportFormat: fmt as any }))}
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
