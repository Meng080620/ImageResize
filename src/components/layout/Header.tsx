import React, { useState, useRef, useEffect } from 'react';
import { Sliders, Grid, Sun, Moon, User, LogOut, Crown, ChevronDown, ArrowLeft, ShieldCheck } from 'lucide-react';
import { useEditor } from '../../context/EditorContext';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  onBackToLanding: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onBackToLanding }) => {
  const { currentTab, setCurrentTab } = useEditor();
  const { theme, toggle } = useTheme();
  const { user, isAdmin, isPremium, signOut, openAuthModal } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-base/80 backdrop-blur-md border-b border-line px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onBackToLanding}
          className="p-1.5 text-faint hover:text-muted hover:bg-elevated rounded-lg transition-all"
          title="Back to home"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
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
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface border border-line text-muted hover:text-content hover:bg-elevated transition-all"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Auth button */}
        {user ? (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(v => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-line hover:bg-elevated transition-all"
            >
              <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
                {isAdmin
                  ? <Crown className="w-3 h-3 text-yellow-400" />
                  : <User className="w-3 h-3 text-blue-400" />}
              </div>
              <span className="text-xs text-content max-w-[120px] truncate hidden sm:block">
                {user.email}
              </span>
              {(isAdmin || isPremium) && (
                <span className="text-[9px] font-semibold text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 rounded uppercase hidden sm:block">
                  {isAdmin ? 'Admin' : 'Pro'}
                </span>
              )}
              <ChevronDown className="w-3 h-3 text-faint" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-surface border border-line-strong rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-line">
                  <p className="text-xs font-medium text-content truncate">{user.email}</p>
                  <p className="text-[10px] text-faint mt-0.5">
                    {isAdmin ? 'Admin — full access' : isPremium ? 'Premium plan' : 'Free plan'}
                  </p>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => { window.location.hash = '#/admin'; setDropdownOpen(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-amber-400 hover:bg-amber-500/5 transition-all border-b border-line"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" /> Admin Portal
                  </button>
                )}
                <button
                  onClick={() => { signOut(); setDropdownOpen(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-muted hover:text-red-400 hover:bg-red-500/5 transition-all"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={openAuthModal}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all"
          >
            <User className="w-3.5 h-3.5" /> Sign In
          </button>
        )}
      </div>
    </header>
  );
};
