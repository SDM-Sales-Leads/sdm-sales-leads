import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { OFFER_TYPE_LABEL, OfferPrint, fetchOfferPrints } from '../../lib/plotsService';

const egp = (n?: number | null) => (typeof n === 'number' && n > 0 ? 'EGP ' + Math.round(n).toLocaleString('en-US') : '—');
const when = (iso: string) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; };

/** Offers printed in the Land Bank for a contact / lead / plot. Loads when it is mounted (i.e. when its section or tab opens). */
export const OfferPrintsList: React.FC<{ contactId?: string; leadId?: string; plotKey?: string; compact?: boolean }> = ({ contactId, leadId, plotKey, compact }) => {
  const [rows, setRows] = useState<OfferPrint[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let off = false;
    setRows(null); setErr('');
    fetchOfferPrints({ contactId, leadId, plotKey }).then((r) => { if (!off) setRows(r); }).catch((e) => { if (!off) setErr(e.message || 'Could not load.'); });
    return () => { off = true; };
  }, [contactId, leadId, plotKey]);

  if (err) return <p className="text-xs text-rose-600 font-semibold py-3">{err}</p>;
  if (!rows) return <p className="text-xs text-brand-gray py-4 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Loading…</p>;
  if (!rows.length) return <p className="text-xs text-brand-gray py-4 text-center">No offers printed yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead><tr className="bg-brand-gray/5 border-b border-brand-gray/15 text-brand-gray text-[10px] font-bold uppercase tracking-wider">
          <th className="py-2 px-3">Type</th><th className="py-2 px-3">Plots</th><th className="py-2 px-3 text-right">Total</th>{!compact && <th className="py-2 px-3">Document</th>}<th className="py-2 px-3">By</th><th className="py-2 px-3">When</th>
        </tr></thead>
        <tbody className="divide-y divide-brand-gray/10">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-2 px-3 font-bold text-brand-black whitespace-nowrap">{OFFER_TYPE_LABEL[r.offerType] || r.offerType || '—'}</td>
              <td className="py-2 px-3 font-mono">{(r.plots || []).map((p) => [p.park, p.unit].filter(Boolean).join(' ')).filter(Boolean).join(', ') || '—'}</td>
              <td className="py-2 px-3 text-right font-mono">{egp(r.totalValue)}</td>
              {!compact && <td className="py-2 px-3 text-brand-gray">{r.docName || r.summary || '—'}</td>}
              <td className="py-2 px-3">{r.printedByName || r.printedBy || '—'}</td>
              <td className="py-2 px-3 text-brand-gray whitespace-nowrap">{when(r.printedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** Collapsible section: nothing is requested until it is opened. */
export const OfferPrintsSection: React.FC<{ leadId: string }> = ({ leadId }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="text-[10px] font-extrabold text-brand-gray uppercase tracking-wider">Offers printed {open ? '▴' : '▾'}</button>
      {open && <div className="mt-2 border border-brand-gray/15 rounded-xl bg-white"><OfferPrintsList leadId={leadId} compact /></div>}
    </div>
  );
};
