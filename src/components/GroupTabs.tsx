import React, { useMemo } from 'react';
import { useAuth } from '../services/AuthContext';
import { useViewMode } from '../lib/viewMode';
import { buildGroups, groupOf, isHere } from './navGroups';

/** the tabs of the section the person is in (Leads | Calendar | Activity log ...), above the page */
export const GroupTabs: React.FC<{ activeTab: string; crmSubTab: string; go: (tab: string, sub?: string) => void }> = ({ activeTab, crmSubTab, go }) => {
  const { user, permissions } = useAuth();
  const mode = useViewMode(user?.id);
  const groups = useMemo(() => buildGroups(permissions, user?.role), [permissions, user?.role]);
  const g = groupOf(groups, activeTab, crmSubTab);
  if (!g || g.items.length < 2) return null;
  const onDark = mode === 'glass' && activeTab === 'glass-home';
  return (
    <div className={`gtabs ${onDark ? 'on-dark' : ''}`} role="tablist" aria-label={g.label}>
      {g.items.map((i) => (
        <button key={i.id} type="button" role="tab" aria-selected={isHere(i, activeTab, crmSubTab)} className={isHere(i, activeTab, crmSubTab) ? 'on' : ''} onClick={() => go(i.tab, i.sub)}>{i.label}</button>
      ))}
    </div>
  );
};
