import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { ExportBar } from './ReportParts';

export interface CrmLbActivityProps {
  leads?: unknown; onLeadsUpdated?: () => void; currentRole?: string; setActiveSubTab?: (tab: string) => void;
}
interface Row {
  userId: string; name: string; salesOffers: number; financialOffers: number; proposals: number; totalPrints: number;
  uniqueContacts: number; uniquePlots: number; holdClicks: number; openClicks: number; lastPrintAt?: string | null; lastClickAt?: string | null;
}
type Period = 'week' | 'month' | 'quarter' | 'all' | 'custom';
type SortKey = 'name' | 'salesOffers' | 'financialOffers' | 'proposals' | 'totalPrints' | 'uniqueContacts' | 'uniquePlots' | 'clicks' | 'lastPrintAt' | 'lastClickAt';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function range(p: Period, from: string, to: string): { from?: string; to?: string } {
  const n = new Date();
  if (p === 'week') { const d = new Date(n); d.setDate(n.getDate() - ((n.getDay() + 6) % 7)); return { from: iso(d), to: iso(n) }; }
  if (p === 'month') return { from: iso(new Date(n.getFullYear(), n.getMonth(), 1)), to: iso(n) };
  if (p === 'quarter') return { from: iso(new Date(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3, 1)), to: iso(n) };
  if (p === 'custom') return { from: from || undefined, to: to || undefined };
  return {};
}
const clicksOf = (r: Row) => (r.holdClicks || 0) + (r.openClicks || 0);
const num = (n?: number | null) => (n || 0).toLocaleString('en-US');
const when = (s?: string | null) => { if (!s) return '—'; const d = new Date(s); return Number.isFinite(d.getTime()) ? d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; };

const COLS: { k: SortKey; label: string; right?: boolean }[] = [
  { k: 'name', label: 'Salesperson' }, { k: 'salesOffers', label: 'Sales offers', right: true }, { k: 'financialOffers', label: 'Initial financial offers', right: true },
  { k: 'proposals', label: 'Proposals', right: true }, { k: 'totalPrints', label: 'Total printed offers', right: true }, { k: 'uniqueContacts', label: 'Unique customers', right: true },
  { k: 'uniquePlots', label: 'Unique plots', right: true }, { k: 'clicks', label: 'Sent to Land Bank (hold / open)', right: true },
  { k: 'lastPrintAt', label: 'Last print' }, { k: 'lastClickAt', label: 'Last click' },
];

export const CrmLbActivity: React.FC<CrmLbActivityProps> = () => {
  const [period, setPeriod] = useState<Period>('month');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [totals, setTotals] = useState<Partial<Row> | null>(null);
  const [err, setErr] = useState(''); const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<SortKey>('totalPrints'); const [dir, setDir] = useState<1 | -1>(-1);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const r = range(period, from, to);
      const sp = new URLSearchParams(); if (r.from) sp.set('from', r.from); if (r.to) sp.set('to', r.to);
      const res = await fetch('/api/crm/lb-activity' + (sp.toString() ? '?' + sp : ''));
      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.success === false) throw new Error((j && (j.error || j.message)) || `HTTP ${res.status}`);
      setRows(Array.isArray(j.rows) ? j.rows : []); setTotals(j.totals || null);
    } catch (e: any) { setErr(e.message || 'Could not load.'); setRows(null); }
    finally { setLoading(false); }
  }, [period, from, to]);
  useEffect(() => { if (period !== 'custom' || (from && to)) load(); }, [load, period, from, to]);

  const sorted = useMemo(() => {
    if (!rows) return [];
    const v = (r: Row): string | number => sort === 'clicks' ? clicksOf(r) : sort === 'name' ? (r.name || '').toLowerCase() : sort === 'lastPrintAt' || sort === 'lastClickAt' ? (r[sort] || '') : (r[sort] as number) || 0;
    return [...rows].sort((a, b) => { const x = v(a), y = v(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
  }, [rows, sort, dir]);
  const tot = useMemo(() => {
    const t = { salesOffers: 0, financialOffers: 0, proposals: 0, totalPrints: 0, holdClicks: 0, openClicks: 0 };
    (rows || []).forEach((r) => { t.salesOffers += r.salesOffers || 0; t.financialOffers += r.financialOffers || 0; t.proposals += r.proposals || 0; t.totalPrints += r.totalPrints || 0; t.holdClicks += r.holdClicks || 0; t.openClicks += r.openClicks || 0; });
    return t;
  }, [rows]);
  const maxPrints = Math.max(1, ...(rows || []).map((r) => r.totalPrints || 0));
  const click = (k: SortKey) => { if (sort === k) setDir((d) => (d === 1 ? -1 : 1)); else { setSort(k); setDir(k === 'name' ? 1 : -1); } };

  const sheets = () => [{
    name: 'Land Bank activity',
    rows: [
      ['Salesperson', 'Sales offers', 'Initial financial offers', 'Proposals', 'Total printed offers', 'Unique customers', 'Unique plots', 'Hold clicks', 'Open clicks', 'Last print', 'Last click'],
      ...sorted.map((r) => [r.name, r.salesOffers, r.financialOffers, r.proposals, r.totalPrints, r.uniqueContacts, r.uniquePlots, r.holdClicks, r.openClicks, r.lastPrintAt || '', r.lastClickAt || '']),
      ['Total', tot.salesOffers, tot.financialOffers, tot.proposals, tot.totalPrints, totals?.uniqueContacts ?? '', totals?.uniquePlots ?? '', tot.holdClicks, tot.openClicks, '', ''],
    ],
  }];
  const pb = (k: Period, label: string) => (
    <button key={k} onClick={() => setPeriod(k)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${period === k ? 'bg-white shadow-sm text-brand-black' : 'text-brand-gray'}`}>{label}</button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Land Bank Activity</h2>
          <p className="text-sm text-brand-gray">Offers printed in the Land Bank and plots sent there, per salesperson. A PDF with several plots counts once.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="px-3 py-2 rounded-xl bg-white border border-brand-gray/25 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh
          </button>
          <ExportBar name="land-bank-activity" sheets={sheets} disabled={!sorted.length} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 rounded-xl bg-black/5">{pb('week', 'This week')}{pb('month', 'This month')}{pb('quarter', 'This quarter')}{pb('all', 'All')}{pb('custom', 'Custom')}</div>
        {period === 'custom' && (<>
          <input type="date" className="input-field" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="input-field" value={to} onChange={(e) => setTo(e.target.value)} />
        </>)}
      </div>
      {err && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{err}</div>}
      {!rows && loading && <p className="text-sm text-brand-gray flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>}
      {rows && (
        <>
          <div className="bg-white rounded-2xl border border-brand-gray/20 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="bg-brand-gray/5 border-b border-brand-gray/15 text-brand-gray text-[10px] font-bold uppercase tracking-wider">
                {COLS.map((c) => (
                  <th key={c.k} onClick={() => click(c.k)} className={`py-3 px-3 cursor-pointer select-none whitespace-nowrap ${c.right ? 'text-right' : ''}`}>{c.label}{sort === c.k ? (dir === 1 ? ' ▲' : ' ▼') : ''}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-brand-gray/10">
                {sorted.length === 0 && <tr><td colSpan={COLS.length} className="py-10 text-center text-brand-gray">No activity in this period.</td></tr>}
                {sorted.map((r) => (
                  <tr key={r.userId || r.name}>
                    <td className="py-2.5 px-3 font-bold">{r.name || '—'}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{num(r.salesOffers)}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{num(r.financialOffers)}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{num(r.proposals)}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold">{num(r.totalPrints)}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{num(r.uniqueContacts)}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{num(r.uniquePlots)}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{num(clicksOf(r))} <span className="text-brand-gray">({num(r.holdClicks)} / {num(r.openClicks)})</span></td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-brand-gray">{when(r.lastPrintAt)}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-brand-gray">{when(r.lastClickAt)}</td>
                  </tr>
                ))}
              </tbody>
              {sorted.length > 0 && (
                <tfoot><tr className="bg-brand-gray/5 font-black border-t-2 border-brand-gray/20">
                  <td className="py-2.5 px-3">Total</td>
                  <td className="py-2.5 px-3 text-right font-mono">{num(tot.salesOffers)}</td><td className="py-2.5 px-3 text-right font-mono">{num(tot.financialOffers)}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{num(tot.proposals)}</td><td className="py-2.5 px-3 text-right font-mono">{num(tot.totalPrints)}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{totals?.uniqueContacts != null ? num(totals.uniqueContacts) : '—'}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{totals?.uniquePlots != null ? num(totals.uniquePlots) : '—'}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{num(tot.holdClicks + tot.openClicks)} <span className="text-brand-gray font-normal">({num(tot.holdClicks)} / {num(tot.openClicks)})</span></td>
                  <td colSpan={2} />
                </tr></tfoot>
              )}
            </table>
          </div>
          {sorted.length > 0 && (
            <div className="bg-white rounded-2xl border border-brand-gray/20 shadow-sm p-4 space-y-2">
              <h4 className="text-[10px] uppercase font-bold text-brand-gray tracking-widest">Leaderboard · printed offers</h4>
              {[...rows].sort((a, b) => (b.totalPrints || 0) - (a.totalPrints || 0)).slice(0, 15).map((r) => (
                <div key={r.userId || r.name} className="flex items-center gap-3 text-xs">
                  <span className="w-40 truncate font-semibold">{r.name || '—'}</span>
                  <div className="flex-1 h-3 bg-brand-gray/10 rounded-full overflow-hidden"><div className="h-full bg-brand-red rounded-full" style={{ width: `${((r.totalPrints || 0) / maxPrints) * 100}%` }} /></div>
                  <span className="w-10 text-right font-mono font-bold">{num(r.totalPrints)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
