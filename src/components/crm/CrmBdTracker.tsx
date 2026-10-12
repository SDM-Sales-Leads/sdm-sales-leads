import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Save, Target } from 'lucide-react';
import { useAuth } from '../../services/AuthContext';
import { CrmOffersProps } from './CrmOffers';

// Business Development weekly tracker: five fixed categories, a target and a done count per category, and milestone notes.
// BD people fill in their own week; managers and directors read everyone's. Weeks start on Sunday.
type Row = { member_id: string; week: string; category: string; target: number; done: number; notes: string };
type Draft = Record<string, { target: string; done: string; notes: string }>;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const weekStart = (offsetWeeks = 0) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - d.getDay() + offsetWeeks * 7); return iso(d); };
const pct = (done: number, target: number) => (target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0);

export const CrmBdTracker: React.FC<CrmOffersProps> = () => {
  const { user } = useAuth();
  const [week, setWeek] = useState<0 | -1>(0);
  const [cats, setCats] = useState<string[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [me, setMe] = useState('');
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const wk = weekStart(week);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/crm/bd-weekly?from=${weekStart(-1)}&to=${weekStart(0)}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'Could not load the tracker');
      setCats(j.categories); setMembers(j.members); setRows(j.rows); setCanEdit(!!j.canEdit); setMe(j.me);
    } catch (e: any) { toast.error(e.message || 'Could not load the tracker'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const mine = useMemo(() => rows.filter((r) => r.member_id === me && r.week.slice(0, 10) === wk), [rows, me, wk]);
  useEffect(() => {
    const d: Draft = {};
    for (const c of cats) { const r = mine.find((x) => x.category === c); d[c] = { target: String(r?.target ?? 0), done: String(r?.done ?? 0), notes: r?.notes ?? '' }; }
    setDraft(d);
  }, [cats, mine]);

  const save = async () => {
    setSaving(true);
    try {
      const items = cats.map((c) => ({ category: c, target: Number(draft[c]?.target) || 0, done: Number(draft[c]?.done) || 0, notes: draft[c]?.notes || '' }));
      const r = await fetch('/api/crm/bd-weekly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week: wk, items }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'Could not save');
      toast.success('Week saved');
      await load();
    } catch (e: any) { toast.error(e.message || 'Could not save'); }
    finally { setSaving(false); }
  };

  const others = members.filter((m) => m.id !== me);
  const Card = ({ name, list }: { name: string; list: Row[] }) => {
    const t = list.reduce((s, r) => s + r.target, 0), d = list.reduce((s, r) => s + r.done, 0);
    return (
      <div className="bg-white rounded-2xl border border-brand-black/10 p-5 space-y-3">
        <div className="flex justify-between items-center"><h3 className="font-bold">{name}</h3>
          <span className={`text-xs font-bold ${t > 0 && d >= t ? 'text-emerald-600' : 'text-brand-gray'}`}>{t > 0 && d >= t ? 'All targets hit!' : `Total: ${d} / ${t}`}</span></div>
        {cats.map((c) => {
          const r = list.find((x) => x.category === c);
          return (
            <div key={c}>
              <div className="flex justify-between text-xs"><span className="font-semibold">{c}</span><span className="text-brand-gray">{r ? `${r.done} / ${r.target}` : '—'}</span></div>
              <div className="h-2 rounded-full bg-brand-black/5 mt-1"><div className="h-2 rounded-full bg-brand-red" style={{ width: `${r ? pct(r.done, r.target) : 0}%` }} /></div>
              {r?.notes && <p className="text-xs text-brand-gray mt-1 whitespace-pre-wrap" dir="auto">{r.notes}</p>}
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) return <div className="p-8 text-sm text-brand-gray flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading…</div>;
  const tot = (id: string) => rows.filter((r) => r.member_id === id && r.week.slice(0, 10) === wk);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold flex items-center gap-2"><Target size={20} className="text-brand-red" /> BD Tracker</h2>
          <p className="text-xs text-brand-gray">Weekly targets of the Business Development team. Week starting Sunday {wk}.</p></div>
        <div className="flex rounded-xl border border-brand-black/10 overflow-hidden text-xs font-bold">
          {([0, -1] as const).map((w) => <button key={w} onClick={() => setWeek(w)} className={`px-4 py-2 ${week === w ? 'bg-brand-red text-white' : 'bg-white'}`}>{w === 0 ? 'This week' : 'Last week'}</button>)}
        </div>
      </div>

      {canEdit && (
        <div className="bg-white rounded-2xl border border-brand-black/10 p-5 space-y-4">
          <h3 className="font-bold">My week</h3>
          {cats.map((c) => (
            <div key={c} className="grid grid-cols-1 md:grid-cols-[1.4fr_90px_90px_2fr] gap-3 items-start">
              <div className="text-sm font-semibold pt-2">{c}</div>
              <label className="text-[10px] uppercase font-bold text-brand-gray">Target
                <input type="number" min={0} className="input-field mt-1" value={draft[c]?.target ?? '0'} onChange={(e) => setDraft({ ...draft, [c]: { ...draft[c], target: e.target.value } })} /></label>
              <label className="text-[10px] uppercase font-bold text-brand-gray">Done
                <input type="number" min={0} className="input-field mt-1" value={draft[c]?.done ?? '0'} onChange={(e) => setDraft({ ...draft, [c]: { ...draft[c], done: e.target.value } })} /></label>
              <label className="text-[10px] uppercase font-bold text-brand-gray">Milestones / notes
                <textarea rows={2} dir="auto" className="input-field mt-1" value={draft[c]?.notes ?? ''} onChange={(e) => setDraft({ ...draft, [c]: { ...draft[c], notes: e.target.value } })} /></label>
            </div>
          ))}
          <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">{saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save week</button>
        </div>
      )}

      {!canEdit && members.length === 0 && <p className="text-sm text-brand-gray">No Business Development members yet.</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(canEdit ? others : members).map((m) => <Card key={m.id} name={m.name} list={tot(m.id)} />)}
      </div>
      {canEdit && others.length > 0 && <p className="text-[11px] text-brand-gray flex items-center gap-1"><CheckCircle2 size={12} /> Your colleagues' cards are read-only.</p>}
    </div>
  );
};
