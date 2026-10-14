// Marketing tab of the Sales Reports: only what the other tabs do not already show.
//  - who added leads and when (count + last date per user)
//  - every lost lead with contact, source, reason and the last comment
//  - every won deal with contact, source, area, price and project
// (leads per day, plot sizes, projects, industries, statuses, qualified / contacted are in the other tabs)
import React, { useMemo } from 'react';
import { fmtDay, fmtEGP, P } from './leadMetrics';
import { Card } from './CrmMetricsUi';
import { DataTable, Column, ExportBar, num } from './ReportParts';
import { crmNav } from './crmNav';
import type { ReportCtx } from './CrmReportsExtra';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
const lastComment = (p: P): string => {
  const cs: any[] = (p.l as any).comments || [];
  const c = cs[cs.length - 1];
  return c ? String(c.comment || c.text || '').replace(/\s+/g, ' ').slice(0, 300) : '';
};
const phoneOf = (p: P) => String((p.l as any).phoneNumber || '');
const IdBtn: React.FC<{ id: string }> = ({ id }) => (
  <button type="button" className="font-mono underline decoration-dotted underline-offset-2 hover:text-brand-red" title="Open this lead" onClick={() => crmNav.lead(id)}>{id}</button>
);

export const MarketingTab: React.FC<{ c: ReportCtx }> = ({ c }) => {
  const day = (ms: number) => (ms ? fmtDay(new Date(ms).toISOString().slice(0, 10)) : '—');

  const byUser = useMemo(() => {
    const m = new Map<string, { name: string; n: number; last: number; lastId: string; week: number; today: number }>();
    const weekAgo = c.nowMs - 7 * 864e5;
    for (const p of c.pool) {
      const raw = String((p.l as any).createdBy || '').trim();
      const name = !raw ? 'System (mail / sheet / import)' : UUID.test(raw) ? 'A user (id only)' : raw;
      const r = m.get(name) || { name, n: 0, last: 0, lastId: '', week: 0, today: 0 };
      r.n++;
      if (p.createdMs > r.last) { r.last = p.createdMs; r.lastId = p.id; }
      if (p.createdMs >= weekAgo) r.week++;
      if (p.created === c.today) r.today++;
      m.set(name, r);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [c.pool, c.nowMs, c.today]);

  const lost = useMemo(() => c.pool.filter((p) => p.lost), [c.pool]);
  const won = useMemo(() => c.pool.filter((p) => p.won), [c.pool]);

  const userCols: Column<(typeof byUser)[number]>[] = [
    { id: 'u', head: 'Added by', sort: (r) => r.name, cell: (r) => <span className="font-bold">{r.name}</span> },
    { id: 'n', head: 'Leads added (period)', right: true, sort: (r) => r.n, cell: (r) => num(r.n) },
    { id: 't', head: 'Today', right: true, sort: (r) => r.today, cell: (r) => num(r.today) },
    { id: 'w', head: 'Last 7 days', right: true, sort: (r) => r.week, cell: (r) => num(r.week) },
    { id: 'l', head: 'Last lead added', right: true, sort: (r) => r.last, cell: (r) => <span>{day(r.last)} · {r.lastId ? <IdBtn id={r.lastId} /> : null}</span> },
  ];
  const lostCols: Column<P>[] = [
    { id: 'id', head: 'Lead', sort: (p) => p.id, cell: (p) => <IdBtn id={p.id} /> },
    { id: 'n', head: 'Name', sort: (p) => p.l.customerName || '', cell: (p) => <span className="font-bold">{p.l.customerName || '—'}</span> },
    { id: 'co', head: 'Company', sort: (p) => p.l.companyName || '', cell: (p) => p.l.companyName || '—' },
    { id: 'ph', head: 'Phone', cell: (p) => <span className="font-mono">{phoneOf(p) || '—'}</span> },
    { id: 'so', head: 'Source', sort: (p) => p.source, cell: (p) => p.source },
    { id: 'pr', head: 'Project', sort: (p) => p.project, cell: (p) => p.project },
    { id: 're', head: 'Reason', sort: (p) => p.reason, cell: (p) => p.reason },
    { id: 'cm', head: 'Comments / notes', cell: (p) => <span className="text-brand-gray">{lastComment(p) || '—'}</span> },
    { id: 'ow', head: 'Salesperson', sort: (p) => p.ownerName, cell: (p) => p.ownerName || '—' },
  ];
  const wonCols: Column<P>[] = [
    { id: 'id', head: 'Lead', sort: (p) => p.id, cell: (p) => <IdBtn id={p.id} /> },
    { id: 'n', head: 'Name', sort: (p) => p.l.customerName || '', cell: (p) => <span className="font-bold">{p.l.customerName || '—'}</span> },
    { id: 'co', head: 'Company', sort: (p) => p.l.companyName || '', cell: (p) => p.l.companyName || '—' },
    { id: 'ph', head: 'Phone', cell: (p) => <span className="font-mono">{phoneOf(p) || '—'}</span> },
    { id: 'so', head: 'Source', sort: (p) => p.source, cell: (p) => p.source },
    { id: 'sq', head: 'Area (sqm)', right: true, sort: (p) => p.area || null, cell: (p) => (p.area ? num(p.area) : '—') },
    { id: 'pv', head: 'Price (EGP)', right: true, sort: (p) => p.value || null, cell: (p) => (p.value ? fmtEGP(p.value) : '—') },
    { id: 'pr', head: 'Project / location', sort: (p) => p.project, cell: (p) => p.project },
    { id: 'cl', head: 'Closed', right: true, sort: (p) => p.closing || '', cell: (p) => (p.closing ? fmtDay(p.closing) : '—') },
    { id: 'ow', head: 'Salesperson', sort: (p) => p.ownerName, cell: (p) => p.ownerName || '—' },
  ];

  return (
    <div className="space-y-6">
      <Card title="Who added the leads" info="Leads of the period grouped by the person who registered them. Leads that came from the mailbox, the Facebook sheet or an import are under System.">
        <DataTable rows={byUser} cols={userCols} rowKey={(r) => r.name} limit={30} empty="No leads in this period." />
      </Card>

      <Card
        title={`Lost leads · ${lost.length}`}
        info="Every lost lead of the period (Lost, Not Interested, Low Budget) with who it was, where it came from, why it was lost and the last comment."
        right={<ExportBar name="lost-leads" disabled={!lost.length} sheets={() => [{ name: 'Lost leads', rows: [
          ['Lead', 'Name', 'Company', 'Phone', 'Source', 'Project', 'Reason', 'Comments', 'Salesperson'],
          ...lost.map((p) => [p.id, p.l.customerName, p.l.companyName, phoneOf(p), p.source, p.project, p.reason, lastComment(p), p.ownerName]),
        ] }]} />}
      >
        <DataTable rows={lost} cols={lostCols} rowKey={(p) => p.id} limit={25} empty="No lost leads in this period." />
      </Card>

      <Card
        title={`Won deals · ${won.length}`}
        info="Every deal won in the period with the customer, source, area, price and project."
        right={<ExportBar name="won-deals" disabled={!won.length} sheets={() => [{ name: 'Won deals', rows: [
          ['Lead', 'Name', 'Company', 'Phone', 'Source', 'Area (sqm)', 'Price (EGP)', 'Project', 'Closed', 'Salesperson'],
          ...won.map((p) => [p.id, p.l.customerName, p.l.companyName, phoneOf(p), p.source, p.area || '', p.value || '', p.project, p.closing, p.ownerName]),
        ] }]} />}
      >
        <DataTable rows={won} cols={wonCols} rowKey={(p) => p.id} limit={25} empty="No won deals in this period." />
      </Card>
    </div>
  );
};
