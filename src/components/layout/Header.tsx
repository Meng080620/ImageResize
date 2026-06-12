import React from 'react';
import { Layers, Sliders, Grid } from 'lucide-react';
import { useEditor } from '../../context/EditorContext';

export const Header: React.FC = () => {
  const { currentTab, setCurrentTab } = useEditor();

  return (
    <header className="sticky top-0 z-40 bg-[#09090b]/80 backdrop-blur-md border-b border-white/5 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="bg-blue-600 text-white p-2 rounded-lg flex items-center justify-center">
          <Layers className="w-5 h-5" />
        </div>
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-lg tracking-tight text-zinc-100">Image Resize</h1>
          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 font-mono text-xs font-medium rounded-md border border-blue-500/20">
            PRO
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-[#18181b] p-1 rounded-lg border border-white/5">
        <button 
          onClick={() => setCurrentTab('editor')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2 ${
            currentTab === 'editor' 
              ? 'bg-[#27272a] text-zinc-100 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#27272a]/50'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          Workspace
        </button>
        <button 
          onClick={() => setCurrentTab('sandbox')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2 ${
            currentTab === 'sandbox' 
              ? 'bg-[#27272a] text-zinc-100 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#27272a]/50'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
          Simulation
        </button>
      </div>
    </header>
  );
};
