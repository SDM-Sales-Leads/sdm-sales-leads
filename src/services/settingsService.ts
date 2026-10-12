import { SystemSettings } from '../types';
import { fetchWithTimeout } from '../lib/fetchUtils';

// Look & feel only (colours, fonts): public, nothing private. Kept in memory and in localStorage so the next page
// load paints the saved theme at once; stale-while-revalidate like the other reference data (see refData.ts).
const KEY = 'sdm-ui-settings-v1';
const REFRESH_AFTER = 2 * 60_000;
const MAX_AGE = 10 * 60_000;

let mem: { at: number; data: SystemSettings } | null = null;
let inflight: Promise<SystemSettings> | null = null;

const readStored = (): { at: number; data: SystemSettings } | null => {
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (j && typeof j.at === 'number' && j.data && typeof j.data === 'object') return (mem = j);
  } catch { /* storage unavailable or damaged: fetch instead */ }
  return null;
};
const store = (data: SystemSettings) => {
  mem = { at: Date.now(), data };
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* quota / private mode: memory copy is enough */ }
};

const fetchSettings = (): Promise<SystemSettings> => {
  if (inflight) return inflight;
  const p = (async () => {
    try {
      const response = await fetchWithTimeout('/api/settings', {}, 15000);
      if (!response.ok) throw new Error(`Failed to fetch settings: ${response.status} ${response.statusText}`);
      const data: SystemSettings = await response.json();
      store(data);
      return data;
    } catch (err: any) {
      console.warn('Settings fetch error:', err);
      throw err;
    } finally {
      inflight = null;
    }
  })();
  inflight = p;
  return p;
};

export const settingsService = {
  /** the saved look & feel; answers from the cache when it is younger than 10 minutes */
  async getSettings(): Promise<SystemSettings> {
    const hit = readStored();
    if (hit) {
      const age = Date.now() - hit.at;
      if (age < MAX_AGE) {
        if (age > REFRESH_AFTER) fetchSettings().catch(() => {});
        return hit.data;
      }
    }
    return fetchSettings();
  },

  async updateSettings(settings: SystemSettings, _userId?: string, _userName?: string): Promise<void> {
    // the server takes the actor from the login
    const response = await fetchWithTimeout('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    }, 15000);
    if (!response.ok) {
      let msg = 'Failed to update settings';
      try { const j = await response.json(); if (j?.error) msg = j.error; } catch { /* keep */ }
      throw new Error(msg);
    }
    store(settings);
  },
};
