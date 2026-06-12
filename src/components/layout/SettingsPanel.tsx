import React, { useRef } from 'react';
import { Sliders, RotateCcw, Scale, Crop, Sparkles } from 'lucide-react';
import { useEditor } from '../../context/EditorContext';
import { AspectRatioType, BackgroundStyle } from '../../types';

export const SettingsPanel: React.FC = () => {
  const { settings, setSettings, handleResetSettings } = useEditor();
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
    <aside className="lg:col-span-3 bg-[#18181b] border border-white/5 rounded-xl p-4 flex flex-col shadow-lg gap-5 h-[calc(100vh-100px)] overflow-y-auto sticky top-[80px]">
      <div className="flex items-center justify-between pb-3 border-b border-white/5 shrink-0">
        <h2 className="font-semibold text-sm text-zinc-100 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-500" /> Settings
        </h2>
        <button onClick={handleResetSettings} className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-3 shrink-0">
        <label className="text-xs font-semibold text-zinc-300">Dimensions</label>
        <div className="grid grid-cols-2 gap-1.5">
          {(['1:1', '4:3', '3:4', '16:9', 'custom'] as AspectRatioType[]).map((type) => (
            <button
              key={type}
              onClick={() => setSettings(p => ({ ...p, aspectRatioType: type }))}
              className={`py-1.5 rounded-md text-xs font-medium border transition-all ${
                settings.aspectRatioType === type 
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' 
                  : 'bg-[#27272a]/50 border-white/5 text-zinc-400 hover:bg-[#27272a]'
              }`}
            >
              {type === 'custom' ? 'Custom' : type}
            </button>
          ))}
        </div>
        {settings.aspectRatioType === 'custom' && (
          <div className="grid grid-cols-2 gap-2 mt-1">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Width</span>
              <input 
                type="number" value={settings.customWidth}
                onChange={(e) => setSettings(p => ({ ...p, customWidth: Math.max(10, Number(e.target.value)) }))}
                className="w-full bg-[#09090b] border border-white/10 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Height</span>
              <input 
                type="number" value={settings.customHeight}
                onChange={(e) => setSettings(p => ({ ...p, customHeight: Math.max(10, Number(e.target.value)) }))}
                className="w-full bg-[#09090b] border border-white/10 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 shrink-0">
        <label className="text-xs font-semibold text-zinc-300">Fit Mode</label>
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
                  : 'bg-[#27272a]/50 border-white/5 text-zinc-400 hover:bg-[#27272a]'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 shrink-0">
        <label className="text-xs font-semibold text-zinc-300">Padding: {settings.padding}%</label>
        <input 
          type="range" min="0" max="40" value={settings.padding}
          onChange={(e) => setSettings(p => ({ ...p, padding: Number(e.target.value) }))}
          className="w-full h-1.5 rounded-lg bg-zinc-800 accent-blue-500 cursor-pointer"
        />
      </div>

      <div className="flex flex-col gap-2 shrink-0 border-t border-white/5 pt-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-zinc-300">Trim Margins</label>
          <input 
            type="checkbox" checked={settings.trimProductMargins}
            onChange={(e) => setSettings(p => ({ ...p, trimProductMargins: e.target.checked }))}
            className="w-3.5 h-3.5 rounded bg-zinc-800 accent-blue-500 border-white/10"
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <label className="text-xs font-semibold text-zinc-300">Auto-Center <span className="text-[10px] text-blue-400 font-mono bg-blue-500/10 px-1 py-0.5 rounded ml-1">AI</span></label>
          <input 
            type="checkbox" checked={settings.autoCenter}
            onChange={(e) => setSettings(p => ({ ...p, autoCenter: e.target.checked }))}
            className="w-3.5 h-3.5 rounded bg-zinc-800 accent-blue-500 border-white/10"
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <label className="text-xs font-semibold text-zinc-300">Upscale Small</label>
          <input 
            type="checkbox" checked={settings.upscaleSmallImages}
            onChange={(e) => setSettings(p => ({ ...p, upscaleSmallImages: e.target.checked }))}
            className="w-3.5 h-3.5 rounded bg-zinc-800 accent-blue-500 border-white/10"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 shrink-0 border-t border-white/5 pt-4">
        <label className="text-xs font-semibold text-zinc-300">Background</label>
        <div className="grid grid-cols-2 gap-1.5">
          {(['solid', 'auto', 'blurred', 'transparent'] as BackgroundStyle[]).map((style) => (
            <button
              key={style}
              onClick={() => setSettings(p => ({ ...p, bgStyle: style }))}
              className={`py-1.5 rounded-md text-xs font-medium border transition-all capitalize ${
                settings.bgStyle === style 
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' 
                  : 'bg-[#27272a]/50 border-white/5 text-zinc-400 hover:bg-[#27272a]'
              }`}
            >
              {style}
            </button>
          ))}
        </div>
        {settings.bgStyle === 'solid' && (
          <div className="flex items-center gap-2 mt-1 bg-[#09090b] p-1.5 rounded-lg border border-white/10">
            <input 
              type="color" value={settings.backgroundColor}
              onChange={(e) => setSettings(p => ({ ...p, backgroundColor: e.target.value }))}
              className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
            />
            <input 
              type="text" value={settings.backgroundColor}
              onChange={(e) => setSettings(p => ({ ...p, backgroundColor: e.target.value }))}
              className="flex-1 bg-transparent px-2 text-xs text-zinc-200 outline-none font-mono"
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 shrink-0 border-t border-white/5 pt-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-zinc-300">Drop Shadow</label>
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
                  : 'bg-[#27272a]/50 border-white/5 text-zinc-400 hover:bg-[#27272a]'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        {settings.shadowType !== 'none' && (
          <div className="mt-2 flex flex-col gap-4 bg-[#09090b] p-3 rounded-lg border border-white/5">
            <div className="flex bg-[#18181b] p-0.5 rounded-lg border border-white/10 text-xs font-medium">
              <button
                onClick={() => setSettings(p => ({ ...p, shadowType: 'custom', shadowPlacement: 'outset' }))}
                className={`flex-1 py-1 rounded-md transition-all ${
                  settings.shadowPlacement === 'outset' ? 'bg-[#27272a] text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Outset
              </button>
              <button
                onClick={() => setSettings(p => ({ ...p, shadowType: 'custom', shadowPlacement: 'inset' }))}
                className={`flex-1 py-1 rounded-md transition-all ${
                  settings.shadowPlacement === 'inset' ? 'bg-[#27272a] text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Inset
              </button>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex-1 flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 font-mono">X</span>
                  <input type="number" value={settings.shadowOffsetX} onChange={(e) => setSettings(p => ({ ...p, shadowType: 'custom', shadowOffsetX: Number(e.target.value) }))} className="w-12 bg-[#18181b] border border-white/10 rounded px-1 text-center text-zinc-200 outline-none" />
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 font-mono">Y</span>
                  <input type="number" value={settings.shadowOffsetY} onChange={(e) => setSettings(p => ({ ...p, shadowType: 'custom', shadowOffsetY: Number(e.target.value) }))} className="w-12 bg-[#18181b] border border-white/10 rounded px-1 text-center text-zinc-200 outline-none" />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input type="color" value={settings.shadowColor} onChange={(e) => setSettings(p => ({ ...p, shadowType: 'custom', shadowColor: e.target.value }))} className="w-6 h-6 rounded cursor-pointer bg-transparent border-0" />
                </div>
              </div>

              <div 
                ref={gridRef}
                onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
                className="w-16 h-16 border border-white/10 bg-[#18181b] rounded-lg relative overflow-hidden cursor-crosshair shrink-0"
              >
                <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-white/10" />
                <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-white/10" />
                <div 
                  className="absolute w-2 h-2 bg-blue-500 rounded-full shadow-sm -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${Math.min(95, Math.max(5, ((settings.shadowOffsetX + 40) / 80) * 100))}%`, top: `${Math.min(95, Math.max(5, ((settings.shadowOffsetY + 40) / 80) * 100))}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 shrink-0 border-t border-white/5 pt-4 mb-4">
        <label className="text-xs font-semibold text-zinc-300">Export Settings</label>
        
        <div className="grid grid-cols-3 gap-1.5">
          {['jpeg', 'png', 'webp'].map((fmt) => (
            <button
              key={fmt}
              onClick={() => setSettings(p => ({ ...p, exportFormat: fmt as any }))}
              className={`py-1 rounded text-xs font-medium border transition-all uppercase ${
                settings.exportFormat === fmt
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                  : 'bg-[#27272a]/50 border-white/5 text-zinc-400 hover:bg-[#27272a]'
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>

        {settings.exportFormat !== 'png' && (
          <div className="flex flex-col gap-1 mt-1">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-zinc-500">Quality</span>
              <span className="text-[10px] text-zinc-400 font-mono">{Math.round(settings.exportQuality * 100)}%</span>
            </div>
            <input 
              type="range" min="0.1" max="1" step="0.05" value={settings.exportQuality}
              onChange={(e) => setSettings(p => ({ ...p, exportQuality: Number(e.target.value) }))}
              className="w-full h-1.5 rounded-lg bg-zinc-800 accent-blue-500 cursor-pointer"
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
