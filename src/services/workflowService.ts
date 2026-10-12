import { WorkflowRequest } from '../types';
import { fetchWithTimeout } from '../lib/fetchUtils';
import { refData } from './refData';

// the server explains refusals ("You cannot approve workflows of Finance"): show that, not a generic text
async function fail(res: Response, fallback: string): Promise<never> {
  let msg = fallback;
  try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* keep fallback */ }
  throw new Error(msg);
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const workflowService = {
  /** Cached list (stale-while-revalidate, see refData). Throws when there is nothing cached and the request fails. */
  getAll: (opts: { force?: boolean } = {}): Promise<WorkflowRequest[]> => refData.workflows.load(opts),

  create: async (request: Partial<WorkflowRequest>): Promise<WorkflowRequest> => {
    const res = await fetchWithTimeout('/api/workflow-requests', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    }, 20000);
    if (!res.ok) await fail(res, 'Failed to create workflow request');
    const created: WorkflowRequest = await res.json();
    refData.workflows.set(prev => [created, ...(prev || []).filter(r => r.id !== created.id)]);
    return created;
  },

  /** `quiet`: do not touch the cache with the answer (autosave while the user is still typing: the caller already shows the newest text) */
  update: async (id: string, updates: Partial<WorkflowRequest>, opts: { quiet?: boolean } = {}): Promise<WorkflowRequest> => {
    const res = await fetchWithTimeout(`/api/workflow-requests/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(updates),
    }, 20000);
    if (!res.ok) await fail(res, 'Failed to update workflow request');
    const updated: WorkflowRequest = await res.json();
    if (!opts.quiet) refData.workflows.set(prev => (prev || []).map(r => (r.id === id ? updated : r)));
    return updated;
  },

  // the server takes the actor from the login: no user id / name in the URL
  delete: async (id: string): Promise<void> => {
    const res = await fetchWithTimeout(`/api/workflow-requests/${encodeURIComponent(id)}`, { method: 'DELETE' }, 15000);
    if (!res.ok) await fail(res, 'Failed to delete workflow request');
    refData.workflows.set(prev => (prev || []).filter(r => r.id !== id));
  },
};
