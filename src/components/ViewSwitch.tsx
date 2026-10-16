import React from 'react';
import { History, LayoutGrid, Sparkles } from 'lucide-react';
import { useAuth } from '../services/AuthContext';
import { setViewMode, useViewMode, ViewMode } from '../lib/viewMode';

const ITEMS: { mode: ViewMode; label: string; Icon: any }[] = [
  { mode: 'old', label: 'Classic look', Icon: History },
  { mode: 'new', label: 'Current look', Icon: LayoutGrid },
  { mode: 'glass', label: 'Glass look', Icon: Sparkles },
];

/** three small icons: classic, current, glass. The active one is filled. Same switch in every look. */
export const ViewSwitch: React.FC<{ tone?: 'dark' | 'light'; className?: string }> = ({ tone = 'dark', className = '' }) => {
  const { user } = useAuth();
  const mode = useViewMode(user?.id);
  const dark = tone === 'dark';
  return (
    <div translate="no" className={`inline-flex items-center gap-1 rounded-full p-0.5 ${dark ? 'bg-white/10 border border-white/15' : 'bg-black/5 border border-black/10'} ${className}`} role="group" aria-label="Choose the look">
      {ITEMS.map(({ mode: m, label, Icon }) => (
        <button key={m} type="button" title={label} aria-label={label} aria-pressed={mode === m} onClick={() => setViewMode(user?.id, m)}
          className={`w-7 h-7 rounded-full inline-flex items-center justify-center transition-colors ${mode === m ? 'bg-brand-red text-white shadow' : dark ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-[#6C737E] hover:text-[#E01E25] hover:bg-black/5'}`}>
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
};
