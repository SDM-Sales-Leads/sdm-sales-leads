import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Network } from 'lucide-react';
import { Lead } from './types';
import { ACTIVE_EXCLUDE } from './leadConfig';
import { useAuth } from '../../services/AuthContext';
import { adminService } from '../../services/adminService';
import { crmScopeOf, isManagerScope } from './leadMetrics';
import { fmtEgp } from './crmCsv';

export interface CrmHierarchyProps {
  leads: Lead[];
  onLeadsUpdated: () => void;
  currentRole: string;
  setActiveSubTab?: (tab: string) => void;
}

// Old "Hierarchy" (spec_D 9 / spec_A 2.3): who reports to whom (users.teamLeaderId), with lead counts and won value per person.
// Read-only here: the reporting line is edited on the Users page.
const SALES_ROLES = ['Sales Team', 'Sales Rep', 'Sales Team Leader', 'Sales Operation', 'Admin'];
const RANK: Record<string, number> = { Admin: 0, 'Sales Operation': 1, 'Sales Team Leader': 2 };

interface Person { id: string; name: string; role: string; dept: string; leaderId?: string; active: boolean }
interface Stat { leads: number; open: number; won: number; value: number }
const blank = (): Stat => ({ leads: 0, open: 0, won: 0, value: 0 });
interface Node { p: Person; kids: Node[]; own: Stat; total: Stat }

export const CrmHierarchy: React.FC<CrmHierarchyProps> = ({ leads }) => {
  const { user, permissions } = useAuth();
  const scope = crmScopeOf(user, permissions);
  const allowed = isManagerScope(scope);
  const uid = String(user?.id ?? '');
  const [people, setPeople] = useState<Person[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState('');
  const [salesOnly, setSalesOnly] = useState(true);
  const [closed, setClosed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!allowed) { setLoaded(true); return; }
    let alive = true;
    adminService.getUsers().then((all: any[]) => {
      if (!alive) return;
      setPeople(all.map((u) => ({
        id: String(u.id), name: u.name || '—', role: u.role || '—', dept: u.department || '',
        leaderId: u.teamLeaderId ? String(u.teamLeaderId) : undefined, active: u.active !== false,
      })));
    }).catch((e) => alive && setErr(String(e?.message || 'Could not load the users.'))).finally(() => alive && setLoaded(true));
    return () => { alive = false; };
  }, [allowed]);

  // one pass over the leads
  const stats = useMemo(() => {
    const m = new Map<string, Stat>();
    for (const l of leads) {
      const id = String(l.assignedSalespersonId || '');
      if (!id || l.mergedInto) continue;
      let s = m.get(id); if (!s) { s = blank(); m.set(id, s); }
      s.leads++;
      if (l.status === 'Won') { s.won++; s.value += Number(l.dealValue) || 0; }
      else if (!ACTIVE_EXCLUDE.includes(String(l.status))) s.open++;
    }
    return m;
  }, [leads]);

  const roots = useMemo(() => {
    const list = people.filter((p) => p.active && (!salesOnly || SALES_ROLES.includes(p.role) || stats.has(p.id)));
    const byId = new Map(list.map((p) => [p.id, p]));
    const nodes = new Map<string, Node>(list.map((p) => [p.id, { p, kids: [], own: stats.get(p.id) || blank(), total: blank() }]));
    const top: Node[] = [];
    for (const n of nodes.values()) {
      // a missing / unknown leader or a loop -> top level
      let parent = n.p.leaderId && byId.has(n.p.leaderId) && n.p.leaderId !== n.p.id ? nodes.get(n.p.leaderId) : undefined;
      for (let a = parent, i = 0; a && i < 50; i++) { if (a.p.id === n.p.id) { parent = undefined; break; } a = a.p.leaderId ? nodes.get(a.p.leaderId) : undefined; }
      if (parent) parent.kids.push(n); else top.push(n);
    }
    const sort = (a: Node, b: Node) => (RANK[a.p.role] ?? 9) - (RANK[b.p.role] ?? 9) || a.p.name.localeCompare(b.p.name);
    const roll = (n: Node, depth: number): Stat => {
      n.kids.sort(sort);
      const t = { ...n.own };
      if (depth < 40) for (const k of n.kids) { const s = roll(k, depth + 1); t.leads += s.leads; t.open += s.open; t.won += s.won; t.value += s.value; }
      n.total = t; return t;
    };
    top.sort(sort); top.forEach((n) => roll(n, 0));
    // a team leader sees their own branch only
    if (scope === 'team') { const me = nodes.get(uid); return me ? [me] : []; }
    return top;
  }, [people, stats, salesOnly, scope, uid]);

  const toggle = (id: string) => setClosed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const row = (n: Node, depth: number): React.ReactNode => {
    const open = !closed.has(n.p.id);
    const hasKids = n.kids.length > 0;
    return (
      <React.Fragment key={n.p.id}>
        <tr className="border-b border-gray-50">
          <td className="px-3 py-2.5" style={{ paddingLeft: 12 + depth * 22 }}>
            <div className="flex items-center gap-1.5">
              {hasKids ? <button onClick={() => toggle(n.p.id)} className="text-brand-gray" aria-label={open ? 'Collapse' : 'Expand'}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button> : <span className="w-3.5" />}
              <span className="font-bold text-brand-dark">{n.p.name}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-brand-gray font-semibold">{n.p.role}</span>
              {hasKids && <span className="text-[11px] text-brand-gray">{n.kids.length} direct report{n.kids.length > 1 ? 's' : ''}</span>}
            </div>
          </td>
          <td className="px-3 py-2.5 text-brand-gray">{n.p.dept || '—'}</td>
          <td className="px-3 py-2.5">{n.own.leads ? n.own.leads.toLocaleString('en-US') : '—'}</td>
          <td className="px-3 py-2.5">{n.own.open ? n.own.open.toLocaleString('en-US') : '—'}</td>
          <td className="px-3 py-2.5">{n.own.won ? n.own.won.toLocaleString('en-US') : '—'}</td>
          <td className="px-3 py-2.5 font-semibold">{fmtEgp(n.own.value)}</td>
          <td className="px-3 py-2.5 text-brand-gray">{hasKids ? `${n.total.leads.toLocaleString('en-US')} leads · ${n.total.won.toLocaleString('en-US')} won · ${fmtEgp(n.total.value)}` : '—'}</td>
        </tr>
        {open && n.kids.map((k) => row(k, depth + 1))}
      </React.Fragment>
    );
  };

  if (!allowed) return <div className="p-6 text-sm text-brand-gray">The organisation chart is available to managers only.</div>;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-brand-dark flex items-center gap-2"><Network size={20} /> Hierarchy</h2>
          <p className="text-sm text-brand-gray">Who reports to whom, with each person's leads and won value. The reporting line is set on the Users page.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-brand-dark">
          <input type="checkbox" checked={salesOnly} onChange={(e) => setSalesOnly(e.target.checked)} /> Sales people only
        </label>
      </div>
      {err && <div className="text-sm text-red-600">{err}</div>}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-brand-gray border-b border-gray-100">
            {['Person', 'Department', 'Leads', 'Open', 'Won', 'Won value (EGP)', 'Whole branch'].map((h) => <th key={h} className="px-3 py-3 font-bold whitespace-nowrap">{h}</th>)}
          </tr></thead>
          <tbody>
            {!loaded ? <tr><td colSpan={7} className="px-3 py-6 text-brand-gray">Loading…</td></tr>
              : roots.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-brand-gray">No people to show.</td></tr>
              : roots.map((n) => row(n, 0))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
