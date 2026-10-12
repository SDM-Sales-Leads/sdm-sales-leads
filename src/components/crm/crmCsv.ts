// CSV export helpers shared by the Won Deals, Contracts and Audit pages (opens in Excel).
export const csvCell = (v: unknown) => {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // formula-injection guard
  return `"${t.replace(/"/g, '""')}"`;
};

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const csv = [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fmtEgp = (n: number | undefined | null) => (n && n > 0 ? Math.round(n).toLocaleString('en-US') : '—');
export const todayIso = () => new Date().toISOString().slice(0, 10);
