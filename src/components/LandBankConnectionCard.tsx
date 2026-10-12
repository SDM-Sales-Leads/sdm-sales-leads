import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Building2, Loader2, RefreshCw, Save } from 'lucide-react';
import { DEFAULT_LAND_BANK_URL, agoText, isOlderThan24h, loadPlots } from '../lib/plotsService';

/** Admin: where the "Hold in Land Bank" links point, and what the Land Bank last published. */
export const LandBankConnectionCard: React.FC = () => {
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ count: number; updatedAt: string | null } | null>(null);
  const [err, setErr] = useState('');

  const check = async () => {
    setErr('');
    try { const s = await loadPlots(true); setInfo({ count: s.count, updatedAt: s.updatedAt }); } catch (e: any) { setErr(e.message || 'Could not read the plot snapshot.'); }
  };
  useEffect(() => {
    let off = false;
    fetch('/api/integration/config').then((r) => r.json()).then((j) => {
      if (off) return;
      const u = (j && (j.landBankUrl || j.config?.landBankUrl)) || DEFAULT_LAND_BANK_URL;
      setUrl(u); setSaved(u);
    }).catch(() => { if (!off) { setUrl(DEFAULT_LAND_BANK_URL); setSaved(DEFAULT_LAND_BANK_URL); } });
    check();
    return () => { off = true; };
  }, []);

  const save = async () => {
    const v = url.trim();
    if (!/^https:\/\/[^\s]+$/i.test(v)) { toast.error('Enter the full https:// address of the Land Bank.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/integration/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ landBankUrl: v }) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.success === false) throw new Error((j && (j.error || j.message)) || `HTTP ${res.status}`);
      setSaved(v); toast.success('Land Bank address saved.');
    } catch (e: any) { toast.error(e.message || 'Could not save.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bento-card">
      <h3 className="font-bold text-xl mb-2 flex items-center gap-2"><Building2 className="text-brand-red" /> Land Bank connection</h3>
      <p className="text-xs text-brand-gray mb-4">Plots are published by the Land Bank system (Admin or Sales Operation users). This address is used for the "Hold in Land Bank" links.</p>
      <label className="text-[10px] font-bold uppercase tracking-wider text-brand-gray">Land Bank address</label>
      <div className="flex gap-2 mt-1">
        <input className="input-field flex-1" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={DEFAULT_LAND_BANK_URL} />
        <button onClick={save} disabled={busy || url.trim() === saved} className="btn-primary flex items-center gap-2 text-xs disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        </button>
      </div>
      <div className="mt-4 p-3 rounded-xl bg-brand-gray/5 text-xs flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-brand-gray">Plot snapshot</div>
          {err ? <span className="text-rose-600 font-semibold">{err}</span>
            : info ? <span className="font-semibold">{info.count.toLocaleString('en-US')} plots · updated {agoText(info.updatedAt)}{isOlderThan24h(info.updatedAt) && <span className="text-amber-700"> (older than 24 h or never published)</span>}</span>
            : <span className="text-brand-gray">Checking…</span>}
        </div>
        <button onClick={check} className="p-2 rounded-xl hover:bg-black/5" aria-label="Check again"><RefreshCw size={14} /></button>
      </div>
    </div>
  );
};
