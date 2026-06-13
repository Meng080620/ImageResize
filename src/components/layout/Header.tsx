import React from 'react';
import { Sliders, Grid, Sun, Moon } from 'lucide-react';
import { useEditor } from '../../context/EditorContext';
import { useTheme } from '../../hooks/useTheme';

export const Header: React.FC = () => {
  const { currentTab, setCurrentTab } = useEditor();
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-40 bg-base/80 backdrop-blur-md border-b border-line px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <img src={theme === 'dark' ? '/logo-dark.png' : '/logo.png'} alt="Image Resize logo" className="w-9 h-9 rounded-lg object-contain" />
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-lg tracking-tight text-content">Image Resize</h1>
          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 font-mono text-xs font-medium rounded-md border border-blue-500/20">
            PRO
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 bg-surface p-1 rounded-lg border border-line">
        <button
          onClick={() => setCurrentTab('editor')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2 ${
            currentTab === 'editor' 
              ? 'bg-elevated text-content shadow-sm'
              : 'text-muted hover:text-content hover:bg-elevated/50'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          Workspace
        </button>
        <button 
          onClick={() => setCurrentTab('sandbox')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2 ${
            currentTab === 'sandbox' 
              ? 'bg-elevated text-content shadow-sm'
              : 'text-muted hover:text-content hover:bg-elevated/50'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
          Simulation
        </button>
      </div>

        <button
          onClick={toggle}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface border border-line text-muted hover:text-content hover:bg-elevated transition-all"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
