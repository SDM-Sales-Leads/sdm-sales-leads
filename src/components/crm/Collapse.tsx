import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** A section that opens and closes. The content stays mounted when closed, so a half-filled form keeps what was typed. */
export const Collapse: React.FC<{ title: string; summary?: React.ReactNode; badge?: React.ReactNode; defaultOpen?: boolean; forceOpen?: boolean; className?: string; children: React.ReactNode }> = ({ title, summary, badge, defaultOpen = false, forceOpen = false, className = '', children }) => {
  const [open, setOpen] = useState(defaultOpen);
  const show = open || forceOpen;
  return (
    <section className={`rounded-xl border border-brand-gray/15 bg-white overflow-hidden ${className}`}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={show} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-brand-gray/5 transition-colors">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[11px] font-extrabold text-brand-black uppercase tracking-wider">{title}{badge}</span>
          {!show && summary && <span className="block text-[11px] text-brand-gray font-medium truncate mt-0.5">{summary}</span>}
        </span>
        <ChevronDown size={16} className={`text-brand-gray transition-transform ${show ? 'rotate-180' : ''}`} />
      </button>
      <div hidden={!show} className="px-4 pb-4 pt-1 border-t border-brand-gray/10">{children}</div>
    </section>
  );
};
