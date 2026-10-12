import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { Plot, PlotStatus, PlotsState, agoText, isOlderThan24h, landBankLink, loadPlots, plotsAreStale, getPlotsSnapshot } from '../../lib/plotsService';
import { PagerBar } from './LeadListParts';
import { useDebounced, usePagedList } from './usePagedList';
import { OfferPrintsList } from './OfferPrintsList';

const STATUS_LABEL: Record<PlotStatus, string> = { available: 'Available', reserved: 'Reserved', sold: 'Sold', eoi: 'EOI', hold: 'On hold', nfs: 'Not for sale', unknown: 'Unknown' };
const STATUS_CLASS: Record<PlotStatus, string> = {
  available: 'bg-emerald-100 text-emerald-800', reserved: 'bg-amber-100 text-amber-800', sold: 'bg-rose-100 text-rose-800',
  eoi: 'bg-yellow-100 text-yellow-800', hold: 'bg-slate-200 text-slate-700', nfs: 'bg-slate-300 text-slate-800', unknown: 'bg-slate-100 text-slate-500',
};
const nf = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n).toLocaleString('en-US') : '—');
const dash = (v?: string | null) => (v ? v : '—');
const dayText = (iso: string | null) => { if (!iso) return '—'; const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; };
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export const StatusPill: React.FC<{ status: PlotStatus }> = ({ status }) => (
  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
);

const LbLink: React.FC<{ plot: Plot; base: string; big?: boolean }> = ({ plot, base, big }) => {
  const hold = plot.status === 'available';
  return (
    <a href={landBankLink(base, plot.key, hold ? 'hold' : 'plot')} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
      className={hold
        ? `inline-flex items-center gap-1 rounded-lg bg-brand-red text-white font-bold whitespace-nowrap hover:opacity-90 ${big ? 'px-4 py-2 text-xs' : 'px-2.5 py-1 text-[11px]'}`
        : `inline-flex items-center gap-1 rounded-lg border border-brand-gray/30 text-brand-black font-semibold whitespace-nowrap hover:bg-brand-gray/5 ${big ? 'px-4 py-2 text-xs' : 'px-2.5 py-1 text-[11px]'}`}>
      {hold ? 'Hold in Land Bank' : 'Open in Land Bank'} <ExternalLink size={11} />
    </a>
  );
};

const Tile: React.FC<{ label: string; value: React.ReactNode; sub?: string }> = ({ label, value, sub }) => (
  <div className="bg-white border border-brand-gray/15 rounded-2xl p-4 shadow-sm">
    <div className="text-[10px] uppercase font-bold tracking-wider text-brand-gray">{label}</div>
    <div className="text-xl font-black mt-1 text-brand-black">{value}</div>
    {sub && <div className="text-[11px] text-brand-gray mt-0.5">{sub}</div>}
  </div>
);

export const CrmPlotsInventory: React.FC = () => {
  const [st, setSt] = useState<PlotsState | null>(() => getPlotsSnapshot());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [availOnly, setAvailOnly] = useState(true);
  const [park, setPark] = useState('');
  const [status, setStatus] = useState('');
  const [landType, setLandType] = useState('');
  const [sector, setSector] = useState('');
  const [minA, setMinA] = useState(''); const [maxA, setMaxA] = useState('');
  const [minP, setMinP] = useState(''); const [maxP, setMaxP] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const [open, setOpen] = useState<Plot | null>(null);

  const refresh = useCallback(async (force: boolean) => {
    setLoading(true); setErr('');
    try { setSt(await loadPlots(force)); } catch (e: any) { setErr(e.message || 'Plots could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  // on open: load, or revalidate when older than 2 minutes (a tiny call when nothing changed)
  useEffect(() => { if (plotsAreStale()) refresh(false); }, [refresh]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);

  const sorted = useMemo(() => (st ? [...st.plots].sort((a, b) => collator.compare(a.park, b.park) || collator.compare(a.unit, b.unit)) : []), [st]);
  const hay = useMemo(() => new WeakMap<Plot, string>(), []);
  const hayOf = (p: Plot) => { let s = hay.get(p); if (s === undefined) { s = `${p.unit} ${p.merged?.join(' ') || ''} ${p.key}`.toLowerCase(); hay.set(p, s); } return s; };

  const opts = useMemo(() => {
    const parks = new Set<string>(), types = new Set<string>(), sectors = new Set<string>();
    for (const p of sorted) { if (p.park) parks.add(p.park); if (p.landType) types.add(p.landType); if (p.sector) sectors.add(p.sector); }
    const s = (x: Set<string>) => [...x].sort(collator.compare);
    return { parks: s(parks), types: s(types), sectors: s(sectors) };
  }, [sorted]);

  const rows = useMemo(() => {
    const lo = Number(minA) || 0, hi = Number(maxA) || Infinity, plo = Number(minP) || 0, phi = Number(maxP) || Infinity;
    const needle = dq.trim().toLowerCase();
    const stat = availOnly ? 'available' : status;
    return sorted.filter((p) =>
      (!stat || p.status === stat) && (!park || p.park === park) && (!landType || p.landType === landType) && (!sector || p.sector === sector) &&
      p.areaSqM >= lo && p.areaSqM <= hi &&
      (plo === 0 && phi === Infinity ? true : p.listPriceSqm !== null && p.listPriceSqm >= plo && p.listPriceSqm <= phi) &&
      (!needle || hayOf(p).includes(needle)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, availOnly, status, park, landType, sector, minA, maxA, minP, maxP, dq]);

  // tiles + per-park chips, one pass
  const kpi = useMemo(() => {
    const by = new Map<string, { n: number; area: number }>();
    let n = 0, area = 0;
    for (const p of sorted) {
      if (p.status !== 'available') continue;
      n++; area += p.areaSqM;
      const g = by.get(p.park) || { n: 0, area: 0 }; g.n++; g.area += p.areaSqM; by.set(p.park, g);
    }
    return { n, area, parks: [...by.entries()].sort((a, b) => collator.compare(a[0], b[0])) };
  }, [sorted]);

  const resetKey = `${availOnly}|${status}|${park}|${landType}|${sector}|${minA}|${maxA}|${minP}|${maxP}|${dq}`;
  const { pageRows, page, pageSize, setPage, setPageSize, allShown, more } = usePagedList(rows, 'crm.plots.page', resetKey);
  const base = st?.landBankUrl || '';
  const never = !st || !st.updatedAt || st.count === 0;
  const stale = !never && isOlderThan24h(st!.updatedAt);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Plots Inventory</h2>
          <p className="text-sm text-brand-gray">
            {st?.updatedAt ? <>Updated from Land Bank <strong className="text-brand-black">{agoText(st.updatedAt)}</strong></> : 'Not published by the Land Bank yet'}
            {st && <span> · {st.count.toLocaleString('en-US')} plots</span>}
          </p>
        </div>
        <button onClick={() => refresh(true)} disabled={loading} className="px-3 py-2 rounded-xl bg-white border border-brand-gray/25 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh
        </button>
      </div>

      {err && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{err}</div>}
      {st && never && !err && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle size={15} /> The Land Bank has not published the plots yet. An Admin or Sales Operation user must open the Land Bank page and publish them.
        </div>
      )}
      {stale && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle size={15} /> This snapshot is older than 24 hours ({agoText(st!.updatedAt)}). Availability may have changed; check in the Land Bank before promising a plot.
        </div>
      )}
      {!st && loading && <p className="text-sm text-brand-gray flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading plots…</p>}

      {st && !never && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Available plots" value={kpi.n.toLocaleString('en-US')} />
            <Tile label="Available area" value={`${Math.round(kpi.area).toLocaleString('en-US')} sqm`} />
            <Tile label="Parks with availability" value={kpi.parks.length} />
            <Tile label="Matching the filters" value={rows.length.toLocaleString('en-US')} />
          </div>
          {kpi.parks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {kpi.parks.map(([name, g]) => (
                <button key={name} onClick={() => setPark(park === name ? '' : name)}
                  className={`px-3 py-1.5 rounded-xl border text-[11px] text-left ${park === name ? 'border-brand-red bg-brand-red/5' : 'border-brand-gray/20 bg-white'}`}>
                  <span className="font-bold text-brand-black">{name}</span>
                  <span className="block text-brand-gray">{g.n.toLocaleString('en-US')} plots · {Math.round(g.area).toLocaleString('en-US')} sqm</span>
                </button>
              ))}
            </div>
          )}

          <div className="bg-white border border-brand-gray/15 rounded-2xl p-3 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search plot code" className="input-field pl-9 w-full" />
              </div>
              <label className="flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl bg-brand-gray/5 cursor-pointer select-none">
                <input type="checkbox" checked={availOnly} onChange={(e) => setAvailOnly(e.target.checked)} /> Available only
              </label>
              <select className="input-field" value={park} onChange={(e) => setPark(e.target.value)}><option value="">All parks</option>{opts.parks.map((x) => <option key={x}>{x}</option>)}</select>
              <select className="input-field disabled:opacity-50" disabled={availOnly} value={availOnly ? 'available' : status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>{(Object.keys(STATUS_LABEL) as PlotStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
              <select className="input-field" value={landType} onChange={(e) => setLandType(e.target.value)}><option value="">All land types</option>{opts.types.map((x) => <option key={x}>{x}</option>)}</select>
              <select className="input-field" value={sector} onChange={(e) => setSector(e.target.value)}><option value="">All sectors</option>{opts.sectors.map((x) => <option key={x}>{x}</option>)}</select>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-brand-gray">
              <span className="font-bold">Area (sqm)</span>
              <input type="number" min={0} value={minA} onChange={(e) => setMinA(e.target.value)} placeholder="min" className="input-field w-24" />
              <input type="number" min={0} value={maxA} onChange={(e) => setMaxA(e.target.value)} placeholder="max" className="input-field w-24" />
              <span className="font-bold ml-2">Price / sqm (EGP)</span>
              <input type="number" min={0} value={minP} onChange={(e) => setMinP(e.target.value)} placeholder="min" className="input-field w-24" />
              <input type="number" min={0} value={maxP} onChange={(e) => setMaxP(e.target.value)} placeholder="max" className="input-field w-24" />
              {(park || status || landType || sector || minA || maxA || minP || maxP || q) && (
                <button onClick={() => { setPark(''); setStatus(''); setLandType(''); setSector(''); setMinA(''); setMaxA(''); setMinP(''); setMaxP(''); setQ(''); }} className="ml-auto text-brand-red font-bold">Clear filters</button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-brand-gray/20 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className="bg-brand-gray/5 border-b border-brand-gray/15 text-brand-gray text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Park</th><th className="py-3 px-3">Plot</th><th className="py-3 px-3">Status</th><th className="py-3 px-3 text-right">Area (sqm)</th>
                  <th className="py-3 px-3 text-right">Price / sqm</th><th className="py-3 px-3 text-right">Total price</th><th className="py-3 px-3">Land type</th><th className="py-3 px-3">Sector</th><th className="py-3 px-3">Hold until</th><th className="py-3 px-3" />
                </tr></thead>
                <tbody className="divide-y divide-brand-gray/10">
                  {pageRows.length === 0 && <tr><td colSpan={10} className="py-10 text-center text-brand-gray">No plots match these filters.</td></tr>}
                  {pageRows.map((p) => (
                    <tr key={p.key} onClick={() => setOpen(p)} className="hover:bg-brand-gray/5 cursor-pointer">
                      <td className="py-2.5 px-4 font-semibold">{dash(p.park)}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-brand-red">{dash(p.unit)}{p.merged && <span className="ml-1 text-[9px] text-brand-gray font-sans">merged ×{p.merged.length}</span>}</td>
                      <td className="py-2.5 px-3"><StatusPill status={p.status} /></td>
                      <td className="py-2.5 px-3 text-right font-mono">{nf(p.areaSqM)}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{nf(p.listPriceSqm)}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{nf(p.listTotal)}</td>
                      <td className="py-2.5 px-3">{dash(p.landType)}</td>
                      <td className="py-2.5 px-3">{dash(p.sector)}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap">{p.status === 'hold' ? dayText(p.holdUntil) : '—'}</td>
                      <td className="py-2.5 px-3 text-right"><LbLink plot={p} base={base} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PagerBar total={rows.length} page={page} pageSize={pageSize} onPage={setPage} onSize={setPageSize} shown={allShown} onMore={more} />
          </div>
          <p className="text-[11px] text-brand-gray">Prices are list prices in EGP from the Land Bank. Hold requests are made and approved in the Land Bank.</p>
        </>
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={() => setOpen(null)}>
          <div className="bg-white w-full max-w-md h-full overflow-y-auto p-6 space-y-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black font-mono">{dash(open.unit)}</h3>
                <p className="text-xs text-brand-gray font-semibold">{dash(open.park)}</p>
              </div>
              <button onClick={() => setOpen(null)} aria-label="Close" className="p-2 rounded-xl hover:bg-black/5"><X size={18} /></button>
            </div>
            <div className="flex items-center gap-3"><StatusPill status={open.status} /><LbLink plot={open} base={base} big /></div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {([
                ['Area', open.areaSqM ? `${nf(open.areaSqM)} sqm` : '—'], ['Price / sqm', open.listPriceSqm ? `${nf(open.listPriceSqm)} EGP` : '—'],
                ['Total price', open.listTotal ? `${nf(open.listTotal)} EGP` : '—'], ['Land type', dash(open.landType)],
                ['Sector', dash(open.sector)], ['Hold until', open.status === 'hold' ? dayText(open.holdUntil) : '—'],
                ['Project (MDS)', dash(open.project)], ['Merged plots', open.merged ? open.merged.join(', ') : '—'],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="bg-brand-gray/5 rounded-xl p-3"><div className="text-[10px] uppercase font-bold text-brand-gray tracking-wider">{k}</div><div className="font-bold mt-0.5 break-words">{v}</div></div>
              ))}
            </div>
            <div>
              <h4 className="text-[10px] uppercase font-bold text-brand-gray tracking-widest mb-2">Offers printed for this plot</h4>
              <div className="border border-brand-gray/15 rounded-xl"><OfferPrintsList plotKey={open.key} compact /></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
