// Shared bits of the report tabs: sortable table, CSV / Excel export buttons, duration formats.
import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, FileSpreadsheet } from 'lucide-react';
import { InfoTip } from './CrmMetricsUi';
import { downloadCsv } from './crmCsv';
import { OutSheet, buildXlsx } from './xlsxLite';

export const TH = 'py-2 px-2 text-[10px] uppercase text-brand-gray font-bold tracking-wide whitespace-nowrap';
export const TD = 'py-2 px-2 font-mono';

/** hours -> "35 min", "5.2 h", "3.4 days"; "—" when null */
export const fmtHours = (h: number | null | undefined): string => {
  if (h == null || !Number.isFinite(h)) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} days`;
};
export const fmtDays = (d: number | null | undefined): string => (d == null || !Number.isFinite(d) ? '—' : `${d.toFixed(d < 10 ? 1 : 0)} d`);
export const num = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('en-US'));
const stamp = () => new Date().toISOString().slice(0, 10);

/** CSV (first sheet) and Excel (all sheets) of what is on screen. Rows are plain values, headers in row 0. */
export const ExportBar: React.FC<{ name: string; sheets: () => OutSheet[]; disabled?: boolean }> = ({ name, sheets, disabled }) => {
  const btn = 'bg-brand-gray/10 hover:bg-brand-gray/20 disabled:opacity-40 text-brand-black px-3 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1.5';
  const csv = () => { const s = sheets()[0]; if (s) downloadCsv(`${name}-${stamp()}.csv`, (s.rows[0] || []).map(String), s.rows.slice(1)); };
  const xlsx = () => {
    const blob = buildXlsx(sheets());
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `${name}-${stamp()}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  return (
    <div className="flex gap-1.5 print:hidden">
      <button onClick={csv} disabled={disabled} className={btn}><Download size={12} />CSV</button>
      <button onClick={xlsx} disabled={disabled} className={btn}><FileSpreadsheet size={12} />Excel</button>
    </div>
  );
};

export interface Column<R> {
  id: string; head: string; info?: string; right?: boolean;
  /** value used for sorting (null sorts last) */
  sort?: (r: R) => number | string | null;
  cell: (r: R) => React.ReactNode;
}
/** Sortable table. Click a header to sort, click again to reverse. */
export function DataTable<R>({ rows, cols, rowKey, first, limit = 50, empty = 'No data in this period.', onRow, defaultSort, foot }: {
  rows: R[]; cols: Column<R>[]; rowKey: (r: R) => string; first?: string; limit?: number; empty?: string; onRow?: (r: R) => void;
  defaultSort?: { id: string; dir: 'asc' | 'desc' }; foot?: React.ReactNode;
}) {
  const [sort, setSort] = useState<{ id: string; dir: 'asc' | 'desc' } | null>(defaultSort || null);
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => {
    const c = sort && cols.find((x) => x.id === sort.id);
    if (!c || !c.sort) return rows;
    const f = c.sort; const k = sort!.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = f(a); const y = f(b);
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      return (typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : x - y) * k;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  const shown = all ? sorted : sorted.slice(0, limit);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-brand-gray/15">
            {cols.map((c, i) => (
              <th key={c.id} className={`${TH} ${i || !first ? '' : ''} ${c.right ? 'text-right' : ''} ${c.sort ? 'cursor-pointer select-none hover:text-brand-black' : ''}`}
                onClick={() => c.sort && setSort((s) => (s && s.id === c.id ? { id: c.id, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { id: c.id, dir: i === 0 ? 'asc' : 'desc' }))}>
                <span className="inline-flex items-center gap-1">{c.head}{c.info && <InfoTip text={c.info} />}
                  {sort?.id === c.id && (sort.dir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-gray/10 font-semibold text-brand-black">
          {sorted.length === 0 && <tr><td colSpan={cols.length} className="py-6 text-center text-brand-gray">{empty}</td></tr>}
          {shown.map((r) => (
            <tr key={rowKey(r)} className={`hover:bg-brand-gray/5 ${onRow ? 'cursor-pointer' : ''}`} onClick={onRow ? () => onRow(r) : undefined}>
              {cols.map((c) => <td key={c.id} className={`py-2 px-2 ${c.right ? 'text-right font-mono' : ''}`}>{c.cell(r)}</td>)}
            </tr>
          ))}
          {foot}
        </tbody>
      </table>
      {sorted.length > limit && (
        <button onClick={() => setAll((v) => !v)} className="text-[10px] text-brand-red font-bold mt-2">{all ? `Show the top ${limit}` : `Show all ${sorted.length}`}</button>
      )}
    </div>
  );
}

/** a small horizontal bar with a label (used for per-person channel / source mixes) */
export const MiniBar: React.FC<{ label: string; n: number; max: number; total?: number; color?: string }> = ({ label, n, max, total, color = '#D32F2F' }) => (
  <div className="flex items-center gap-2 text-[10px]">
    <span className="w-28 truncate font-bold text-brand-black" title={label}>{label}</span>
    <div className="flex-1 h-1.5 bg-brand-gray/10 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${max > 0 ? Math.max(3, (n / max) * 100) : 0}%`, background: color }} /></div>
    <span className="w-16 text-right font-mono font-bold text-brand-gray">{n}{total ? ` · ${Math.round((n / total) * 100)}%` : ''}</span>
  </div>
);
