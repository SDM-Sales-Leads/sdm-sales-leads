// Who changed the owner / status / source / value / stage dates of a lead, and when. Written by the server, read-only here.
import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { crmService } from './crmService';

const LABEL: Record<string, string> = { owner: 'Owner', status: 'Status', source: 'Source', value: 'Value', stage: 'Stage date', cash: 'Cash', create: 'Created', delete: 'Deleted' };

export const LeadAuditHistory: React.FC<{ leadId: string; version?: string }> = ({ leadId, version }) => {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  // nothing is read until the section is opened; reopening after a save shows the new entries
  useEffect(() => {
    if (!open) return;
    let off = false;
    setRows(null);
    crmService.fetchAudit(leadId).then((r) => { if (!off) { setRows(r.rows); setError(r.error || ''); } });
    return () => { off = true; };
  }, [open, leadId, version]);

  return (
    <div className="space-y-2">
      <button onClick={() => setOpen((o) => !o)} className="text-[10px] font-extrabold text-brand-gray uppercase tracking-wider flex items-center gap-1.5 hover:text-brand-black">
        <ShieldCheck size={12} /> Change history (audit) {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="bg-brand-gray/5 border border-brand-gray/15 rounded-xl p-3 text-[11px] space-y-1.5 max-h-60 overflow-y-auto">
          {rows === null && !error && <p className="text-brand-gray">Loading…</p>}
          {error && <p className="text-rose-700 font-semibold">{error}</p>}
          {rows && rows.length === 0 && !error && <p className="text-brand-gray">No recorded changes yet.</p>}
          {rows?.map((r, i) => (
            <div key={r.id ?? i} className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 border-b border-brand-gray/10 pb-1.5 last:border-0">
              <span className="text-brand-black">
                <strong>{LABEL[r.action] || r.action}</strong>
                {r.from_value || r.to_value ? <>: {r.from_value ?? '—'} <span className="text-brand-gray">→</span> {r.to_value ?? '—'}</> : null}
                {r.note ? <span className="text-brand-gray"> ({r.note})</span> : null}
              </span>
              <span className="text-brand-gray font-mono whitespace-nowrap">{r.actor_name || '—'} · {r.at ? new Date(r.at).toLocaleString() : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
