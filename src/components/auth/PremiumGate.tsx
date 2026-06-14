import React from 'react';
import { Lock, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface Props {
  children?: React.ReactNode;
  label?: string;        // e.g. "AI Background Removal"
  inline?: boolean;      // true = render children as disabled+overlaid, false = replace entirely
}

export const PremiumGate: React.FC<Props> = ({ children, label, inline = true }) => {
  const { isPremium, openAuthModal } = useAuth();

  if (isPremium) return <>{children}</>;

  if (!inline) {
    return (
      <button
        onClick={openAuthModal}
        className="flex items-center justify-center gap-2 w-full py-2 rounded-md text-xs font-medium border border-line bg-elevated/50 text-faint hover:bg-elevated hover:text-muted transition-all"
      >
        <Lock className="w-3.5 h-3.5" />
        {label ?? 'Premium Feature'}
        <span className="text-[9px] uppercase font-mono bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20">
          Upgrade
        </span>
      </button>
    );
  }

  return (
    <div className="relative">
      <div className="pointer-events-none opacity-30 select-none">{children}</div>
      <button
        onClick={openAuthModal}
        className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-md bg-base/60 backdrop-blur-[2px] border border-blue-500/20 hover:border-blue-500/40 hover:bg-base/70 transition-all group"
      >
        <div className="w-7 h-7 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center group-hover:bg-blue-500/25 transition-all">
          <Lock className="w-3.5 h-3.5 text-blue-400" />
        </div>
        <span className="text-[10px] font-semibold text-blue-400">
          {label ? `${label} — ` : ''}Premium
        </span>
        <span className="text-[9px] text-faint flex items-center gap-1">
          <Sparkles className="w-2.5 h-2.5" /> Sign in to unlock
        </span>
      </button>
    </div>
  );
};
