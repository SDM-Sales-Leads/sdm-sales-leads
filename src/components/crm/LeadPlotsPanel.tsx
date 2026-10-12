import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Trash2 } from 'lucide-react';
import { AssignedPlot, Lead, TimelineEvent } from './types';
import { Plot, landBankLink, trackLbClick } from '../../lib/plotsService';
import { canonicalParks } from '../../lib/parkAliases';
import { CrmPlotRecommendations } from './CrmPlotRecommendations';

const MAX = 20;
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const nf = (n: number | null | undefined) => (typeof n === 'number' && n > 0 ? Math.round(n).toLocaleString('en-US') : '—');
const sel = 'bg-brand-light text-brand-black px-3 py-2 rounded-xl font-bold text-xs border border-black/5 focus:outline-none focus:ring-2 focus:ring-brand-red disabled:opacity-50';

interface Props {
  lead: Lead; plots: Plot[]; landBankUrl?: string; user: string;
  onNavigateToInventory: () => void;
  /** saves through crmService.updateLead */
  onSave: (updates: Partial<Lead>) => void;
}

export const LeadPlotsPanel: React.FC<Props> = ({ lead, plots, landBankUrl, user, onNavigateToInventory, onSave }) => {
  const mode = lead.plotMode || 'recommend';
  const assigned = lead.assignedPlots || [];
  const leadParks = useMemo(() => canonicalParks(lead.project || ''), [lead.project]);
  const [park, setPark] = useState(() => (leadParks.length === 1 ? leadParks[0] : '')); const [sector, setSector] = useState(''); const [key, setKey] = useState('');

  useEffect(() => { setPark(leadParks.length === 1 ? leadParks[0] : ''); setSector(''); setKey(''); }, [lead.id, leadParks]);
  const have = useMemo(() => new Set(assigned.map((a) => a.key)), [assigned]);
  const avail = useMemo(() => plots.filter((p) => p.status === 'available' && !have.has(p.key)), [plots, have]);
  const parks = useMemo(() => [...new Set(avail.map((p) => p.park))].filter(Boolean).sort(collator.compare), [avail]);
  const sectors = useMemo(() => [...new Set(avail.filter((p) => p.park === park).map((p) => p.sector || p.landType || 'General'))].sort(collator.compare), [avail, park]);
  const choices = useMemo(() => avail.filter((p) => p.park === park && (p.sector || p.landType || 'General') === sector).sort((a, b) => collator.compare(a.unit, b.unit)), [avail, park, sector]);

  const ev = (title: string, description: string): TimelineEvent => ({ id: Math.random().toString(36).slice(2, 11), timestamp: new Date().toISOString(), type: 'Comment', user, title, description });
  const push = (updates: Partial<Lead>, e?: TimelineEvent) => onSave(e ? { ...updates, timeline: [...(lead.timeline || []), e] } : updates);

  const setMode = (m: 'recommend' | 'manual') => { if (m !== mode) push({ plotMode: m }); };
  const add = () => {
    const p = choices.find((c) => c.key === key);
    if (!p) return;
    if (assigned.length >= MAX) { toast.error(`A lead can hold at most ${MAX} plots.`); return; }
    const a: AssignedPlot = { key: p.key, park: p.park, project: p.project, unit: p.unit, areaSqm: p.areaSqM, listPriceSqm: p.listPriceSqm, listTotal: p.listTotal, status: p.status, assignedAt: new Date().toISOString(), assignedBy: user };
    push({ assignedPlots: [...assigned, a], plotMode: 'manual' }, ev('Plot assigned', `Plot ${p.unit} (${p.park}) assigned to this lead.`));
    setKey('');
  };
  const remove = (a: AssignedPlot) => push({ assignedPlots: assigned.filter((x) => x.key !== a.key) }, ev('Plot removed', `Plot ${a.unit} (${a.park}) removed from this lead.`));

  const live = useMemo(() => { const m = new Map<string, Plot>(); for (const p of plots) m.set(p.key, p); return m; }, [plots]);

  return (
    <div className="space-y-3 mt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-extrabold text-brand-gray uppercase tracking-wider">Plots for this customer</span>
        <div className="flex gap-1 p-1 rounded-xl bg-black/5">
          {([['recommend', 'Recommend plots for me'], ['manual', 'I will choose']] as const).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${mode === m ? 'bg-white shadow-sm text-brand-black' : 'text-brand-gray'}`}>{label}</button>
          ))}
        </div>
      </div>

      {assigned.length > 0 && (
        <div className="border border-brand-gray/15 rounded-xl divide-y divide-brand-gray/10 bg-white">
          {assigned.map((a) => {
            const now = live.get(a.key);
            const status = now?.status || a.status;
            return (
              <div key={a.key} className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <div className="font-bold font-mono text-brand-red">{a.unit} <span className="font-sans text-brand-black">· {a.park}</span></div>
                  <div className="text-[11px] text-brand-gray">{nf(a.areaSqm)} m² · {nf(a.listPriceSqm)} EGP/m² · {nf(a.listTotal)} EGP · <span className="font-bold capitalize">{status}</span></div>
                </div>
                <div className="flex items-center gap-2">
                  <a href={landBankLink(landBankUrl, a.key, status === 'available' ? 'hold' : 'plot', lead.id)} target="_blank" rel="noopener noreferrer"
                    onClick={() => trackLbClick(a.key, status === 'available' ? 'hold' : 'open', lead.id)}
                    className="px-2.5 py-1.5 rounded-lg bg-brand-red text-white text-[11px] font-bold flex items-center gap-1">{status === 'available' ? 'Hold in Land Bank' : 'Open in Land Bank'} <ExternalLink size={10} /></a>
                  <button onClick={() => remove(a)} aria-label="Remove plot" className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mode === 'manual' ? (
        <div className="flex flex-wrap items-center gap-2">
          <select className={sel} value={park} onChange={(e) => { setPark(e.target.value); setSector(''); setKey(''); }}><option value="">Park / project</option>{parks.map((x) => <option key={x}>{x}</option>)}</select>
          <select className={sel} disabled={!park} value={sector} onChange={(e) => { setSector(e.target.value); setKey(''); }}><option value="">Sector</option>{sectors.map((x) => <option key={x}>{x}</option>)}</select>
          <select className={sel} disabled={!sector} value={key} onChange={(e) => setKey(e.target.value)}><option value="">Plot</option>{choices.map((c) => <option key={c.key} value={c.key}>{c.unit} · {nf(c.areaSqM)} m²</option>)}</select>
          <button onClick={add} disabled={!key} className="px-3 py-2 rounded-xl bg-brand-red text-white text-xs font-bold disabled:opacity-50">Assign to this lead</button>
          {plots.length === 0 && <span className="text-[11px] text-brand-gray">No plots loaded from the Land Bank.</span>}
        </div>
      ) : (
        <CrmPlotRecommendations plots={plots} landBankUrl={landBankUrl} leadId={lead.id} project={lead.project} requiredSize={lead.requiredSize} onNavigateToInventory={onNavigateToInventory} />
      )}
    </div>
  );
};
