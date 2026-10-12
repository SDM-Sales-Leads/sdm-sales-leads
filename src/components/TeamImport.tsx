import React, { useState } from 'react';
import { Upload, Download, Users } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCsv } from './crm/crmCsv';

interface Row { email: string; name: string; role?: string; status: string; temporaryPassword?: string; reportsTo?: string; linkedLeads?: number }

/** One-shot: create the whole sales organisation (people, roles, reporting lines, targets) from a JSON file. */
export const TeamImport: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    let users: any[];
    try { const j = JSON.parse(await file.text()); users = Array.isArray(j) ? j : j.users; if (!Array.isArray(users)) throw new Error(); }
    catch { toast.error('That file is not a team list (expected a JSON array of people).'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/users/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ users }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(out.error || 'Could not create the team'); return; }
      setRows(out.results || []);
      toast.success(`${(out.results || []).filter((r: Row) => r.status === 'created').length} people created`);
      onDone();
    } catch { toast.error('Could not reach the server'); }
    finally { setBusy(false); }
  };

  const save = () => rows && downloadCsv('new-users-temporary-passwords.csv',
    ['Name', 'E-mail', 'Role', 'Reports to', 'Status', 'Temporary password (shown once)', 'Imported leads linked'],
    rows.map((r) => [r.name, r.email, r.role || '', r.reportsTo || '', r.status, r.temporaryPassword || '', r.linkedLeads ?? '']));

  return (
    <div className="bg-white rounded-2xl border border-brand-gray/20 p-5 mb-6">
      <div className="flex items-center gap-2 mb-1"><Users size={16} className="text-brand-red" /><h3 className="text-sm font-extrabold">Import the sales team</h3></div>
      <p className="text-xs text-brand-gray mb-3">Creates every person with their role, reporting line and target from a JSON file. Everyone gets a temporary password (shown once, download it below) and must choose their own at first sign-in. People who already exist are left untouched.</p>
      <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${busy ? 'bg-brand-gray/20' : 'bg-brand-red text-white'}`}>
        <Upload size={14} /> {busy ? 'Creating…' : 'Choose team file'}
        <input type="file" accept=".json,application/json" className="hidden" disabled={busy} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {rows && (
        <div className="mt-4">
          <button onClick={save} className="inline-flex items-center gap-2 text-xs font-bold text-brand-red mb-2"><Download size={14} /> Download passwords (CSV) — keep it safe, shown only now</button>
          <div className="overflow-x-auto"><table className="w-full text-xs text-left">
            <thead><tr className="text-brand-gray uppercase text-[10px]"><th className="py-1 pr-3">Name</th><th className="pr-3">Role</th><th className="pr-3">Reports to</th><th className="pr-3">Status</th><th>Leads linked</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.email} className="border-t border-brand-gray/10"><td className="py-1 pr-3 font-bold">{r.name}</td><td className="pr-3">{r.role || '—'}</td><td className="pr-3">{r.reportsTo || '—'}</td><td className="pr-3">{r.status}</td><td>{r.linkedLeads ?? '—'}</td></tr>)}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
};
