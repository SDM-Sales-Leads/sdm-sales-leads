// Which look a person uses: the new one or the old sales CRM look. Stored per person in this browser (no server calls).
import { useSyncExternalStore } from 'react';

const key = (uid: string | number | undefined) => `sdm_view_mode_${uid ?? 'anon'}`;
const listeners = new Set<() => void>();

export type ViewMode = 'new' | 'old';
export const readViewMode = (uid: string | number | undefined): ViewMode => {
  try { return localStorage.getItem(key(uid)) === 'old' ? 'old' : 'new'; } catch { return 'new'; }
};
export const setViewMode = (uid: string | number | undefined, mode: ViewMode) => {
  try { localStorage.setItem(key(uid), mode); } catch { /* private mode: the choice lasts until reload */ }
  listeners.forEach((f) => f());
};
export const useViewMode = (uid: string | number | undefined): ViewMode =>
  useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => readViewMode(uid),
    () => 'new',
  );
