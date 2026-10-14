import React from 'react';
import { crmNav } from './crmNav';
import { num } from './ReportParts';

/** a count that opens the Sales Leads list with exactly the leads behind it (nothing to click when there are none) */
export const DrillNum: React.FC<{ n: number; ids?: string[]; title: string; className?: string }> = ({ n, ids, title, className = '' }) => {
  if (!ids || !n || !ids.length) return <>{num(n)}</>;
  return (
    <button type="button" title="Click to open these leads" className={`font-mono underline decoration-dotted underline-offset-2 hover:text-brand-red ${className}`}
      onClick={(e) => { e.stopPropagation(); crmNav.leads({ ids, title: `${title} · ${ids.length} leads`.replace(/ · \d+ leads$/, '') }); }}>{num(n)}</button>
  );
};
