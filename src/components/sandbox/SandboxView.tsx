import React from 'react';
import { Sliders, XCircle, Check, ChevronRight } from 'lucide-react';
import { useEditor } from '../../context/EditorContext';
import { AspectRatioType } from '../../types';

export const SandboxView: React.FC = () => {
  const { images, settings, setSettings, setCurrentTab } = useEditor();

  return (
    <div className="bg-surface border border-line rounded-xl p-6 md:p-8 flex flex-col shadow-lg gap-8 min-h-[80vh]">
      <div className="max-w-3xl">
        <h2 className="font-semibold text-2xl tracking-tight text-content">Storefront Simulation</h2>
        <p className="text-sm text-muted mt-1">
          Visualizing how your custom boundaries and aspect ratios harmonize in a realistic catalog layout.
        </p>
      </div>

      <div className="bg-base border border-line rounded-xl p-5 flex flex-col lg:flex-row items-center justify-between gap-6">
        <div className="flex-1 w-full">
          <div className="flex justify-between items-center text-xs font-medium text-muted mb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-500" />
              <span>Adjust Product Padding Margin</span>
            </div>
            <span className="font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded text-xs font-semibold">
              {settings.padding}%
            </span>
          </div>
          <input 
            type="range" min="0" max="40" value={settings.padding}
            onChange={(e) => setSettings(p => ({ ...p, padding: Number(e.target.value) }))}
            className="w-full h-1.5 rounded-lg bg-track accent-blue-500 cursor-pointer"
          />
        </div>

        <div className="flex-shrink-0 w-full lg:w-auto">
          <div className="flex flex-col">
            <span className="text-xs text-faint font-medium mb-2 block">Catalog Grid Aspect Ratio</span>
            <div className="flex gap-1.5 bg-surface p-1.5 rounded-lg border border-line">
              {(['1:1', '4:3', '3:4'] as AspectRatioType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setSettings(p => ({ ...p, aspectRatioType: type }))}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    settings.aspectRatioType === type 
                      ? 'bg-elevated text-content shadow-sm' 
                      : 'text-faint hover:text-muted'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* BEFORE SIMULATION */}
        <div className="border border-red-500/10 bg-red-500/5 rounded-xl p-5 flex flex-col">
          <div className="flex items-start justify-between pb-4 border-b border-red-500/10 mb-5">
            <div className="flex gap-3 items-center">
              <XCircle className="w-5 h-5 text-red-500" />
              <h3 className="font-medium text-sm text-red-400">Before: Unaligned Ratios</h3>
            </div>
          </div>

          <div className="bg-base rounded-xl p-4 border border-line shadow-inner flex-1">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {images.map((img, idx) => (
                <div key={`bad-item-${img.id}`} className="flex flex-col bg-surface rounded-lg border border-line p-2 overflow-hidden">
                  <div className="bg-elevated rounded flex items-center justify-center p-1 relative overflow-hidden h-32 border border-line">
                    <img 
                      src={img.originalUrl} alt="" 
                      className="max-h-full max-w-full block"
                      style={{ ...(idx % 3 === 0 ? { objectFit: 'cover', width: '100%', height: '100%' } : { objectFit: 'contain' }) }}
                    />
                  </div>
                  <div className="mt-2 text-left">
                    <p className="text-xs font-medium text-muted line-clamp-1">{img.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-faint">Raw size</span>
                      <span className="text-[10px] text-muted">$124</span>
                    </div>
                  </div>
                </div>
              ))}
              {images.length === 0 && <div className="col-span-4 text-center py-10 text-xs text-faint">Upload images to see simulation</div>}
            </div>
          </div>
        </div>
        
        {/* AFTER SIMULATION */}
        <div className="border border-green-500/10 bg-green-500/5 rounded-xl p-5 flex flex-col">
          <div className="flex items-start justify-between pb-4 border-b border-green-500/10 mb-5">
            <div className="flex gap-3 items-center">
              <Check className="w-5 h-5 text-green-500" />
              <h3 className="font-medium text-sm text-green-400">After: Uniform Padding</h3>
            </div>
          </div>

          <div className="bg-base rounded-xl p-4 border border-line shadow-inner flex-1">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {images.map((img) => (
                <div key={`good-item-${img.id}`} className="flex flex-col bg-surface rounded-lg border border-line p-2 overflow-hidden">
                  <div 
                    className="bg-elevated rounded overflow-hidden relative border border-line flex items-center justify-center w-full"
                    style={{ aspectRatio: settings.aspectRatioType === 'custom' ? `${settings.customWidth}/${settings.customHeight}` : settings.aspectRatioType.replace(':', '/') }}
                  >
                    <img src={img.processedUrl} alt="" className="w-full h-full object-contain block" />
                  </div>
                  <div className="mt-2 text-left">
                    <p className="text-xs font-medium text-muted line-clamp-1">{img.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-faint">Uniform</span>
                      <span className="text-[10px] text-muted">$124</span>
                    </div>
                  </div>
                </div>
              ))}
              {images.length === 0 && <div className="col-span-4 text-center py-10 text-xs text-faint">Upload images to see simulation</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-auto bg-base p-4 rounded-xl border border-line flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-xs text-muted">Adjustments propagate in real-time. Everything is generated client-side.</p>
        <button
          onClick={() => setCurrentTab('editor')}
          className="px-4 py-2 bg-blue-600 text-white font-medium text-xs rounded-lg hover:bg-blue-500 transition-all flex items-center gap-1"
        >
          Return to Workspace <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
