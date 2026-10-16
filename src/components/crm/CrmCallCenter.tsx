import React, { useEffect, useMemo, useState } from 'react';
import { AlarmClock, ChevronDown, ChevronUp, PhoneCall } from 'lucide-react';
import type { Lead } from './types';
import { CC_HOURS, ccLeft, ccState } from './leadMetrics';
import { phoneIntl } from './leadConfig';

/** Call center leads waiting for their first contact: most urgent first, with the time left of the 24 hours. */
export const CrmCallCenter: React.FC<{ leads: Lead[]; onOpen: (l: Lead) => void }> = ({ leads, onOpen }) => {
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(true);
  const [all, setAll] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const rows = useMemo(() => leads.map((l) => ({ l, s: ccState(l, now) })).filter((x) => x.s).sort((a, b) => a.s!.leftMs - b.s!.leftMs) as { l: Lead; s: NonNullable<ReturnType<typeof ccState>> }[], [leads, now]);
  if (!rows.length) return null;
  const late = rows.filter((r) => r.s.overdue).length;
  const shown = all ? rows : rows.slice(0, 6);
  return (
    <section className={`rounded-2xl border shadow-sm overflow-hidden ${late ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`} aria-label="Call center leads waiting for first contact">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <span className={`w-9 h-9 rounded-full flex items-center justify-center text-white ${late ? 'bg-red-600' : 'bg-amber-500'}`}><AlarmClock size={18} /></span>
        <span className="flex-1 min-w-0">
          <span className="block font-extrabold text-brand-black text-sm">Call center first: {rows.length} {rows.length === 1 ? 'lead' : 'leads'} waiting for the first contact</span>
          <span className="block text-[11px] font-semibold text-brand-gray">Every call center lead must be contacted within {CC_HOURS} hours. {late ? <b className="text-red-700">{late} past the limit: the team leader has been alerted.</b> : 'Call, WhatsApp or e-mail, then log it.'}</span>
        </span>
        {open ? <ChevronUp size={18} className="text-brand-gray" /> : <ChevronDown size={18} className="text-brand-gray" />}
      </button>
      {open && (
        <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {shown.map(({ l, s }) => (
            <button key={l.id} type="button" onClick={() => onOpen(l)} className="bg-white rounded-xl border border-brand-gray/15 hover:border-brand-red/50 px-3 py-2.5 text-left flex items-center gap-3">
              <PhoneCall size={16} className={s.overdue ? 'text-red-600' : 'text-amber-600'} />
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-[13px] text-brand-black truncate">{l.customerName || l.id}</span>
                <span className="block text-[11px] text-brand-gray font-mono truncate">{phoneIntl(l.phoneNumber) || l.phoneNumber || '—'} · {l.assignedSalespersonName || 'not assigned yet'}</span>
              </span>
              <span className={`shrink-0 text-[11px] font-extrabold rounded-full px-2.5 py-1 ${s.overdue ? 'bg-red-600 text-white' : s.leftMs < 6 * 3600_000 ? 'bg-amber-500 text-white' : 'bg-emerald-100 text-emerald-800'}`}>{s.overdue ? `Late ${ccLeft(s.leftMs)}` : `${ccLeft(s.leftMs)} left`}</span>
            </button>
          ))}
          {rows.length > 6 && <button type="button" onClick={() => setAll(!all)} className="text-[12px] font-bold text-brand-red py-2 md:col-span-2 xl:col-span-3">{all ? 'Show fewer' : `Show all ${rows.length}`}</button>}
        </div>
      )}
    </section>
  );
};
