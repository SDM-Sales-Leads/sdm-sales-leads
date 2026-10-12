// External sales = deals closed outside the system. Own tiny client (the leads core owns crmService.ts).
// Same save protocol as crmService.flush(): POST { upserts, deletes }, rows carry _rev for the optimistic lock,
// the server answers { saved, conflicts, rejected }.
import type { ExternalSale } from './types';

export type ExternalSaleRow = ExternalSale & { _rev?: string; rejectReason?: string };

async function errorText(res: Response, fallback: string) {
  try { const j = await res.json(); if (j?.error) return String(j.error); } catch { /* keep fallback */ }
  return fallback;
}

export const externalSalesService = {
  async list(): Promise<ExternalSaleRow[]> {
    const res = await fetch('/api/crm/external-sales');
    if (!res.ok) throw new Error(await errorText(res, 'Could not load external sales'));
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  },

  /** throws an Error with the server's reason when anything was refused */
  async save(upserts: ExternalSaleRow[], deletes: string[] = []): Promise<void> {
    let res: Response;
    try {
      res = await fetch('/api/crm/external-sales', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upserts, deletes }),
      });
    } catch { throw new Error('Could not reach the server. Your change was not saved.'); }
    if (!res.ok) throw new Error(await errorText(res, 'Your change was not saved.'));
    const out = await res.json();
    if (out.conflicts?.length) throw new Error('Someone else changed this record at the same time. The latest version was reloaded: please repeat your action.');
    if (out.rejected?.length) throw new Error(`Not allowed: ${out.rejected[0]?.reason || 'change refused'}`);
  },

  newId: () => 'EX-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(),
};
