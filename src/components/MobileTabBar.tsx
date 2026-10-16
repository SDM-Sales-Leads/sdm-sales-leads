import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, CheckSquare, LayoutDashboard, Layers, LogOut, MoreHorizontal, Users, X } from 'lucide-react';
import { useAuth } from '../services/AuthContext';
import { buildGlassNav, NavEntry } from './navModel';
import { ViewSwitch } from './ViewSwitch';
import { getLang, setLang } from '../i18n/lang';

/** Phone only: a bottom bar like a mobile app (day, leads, contacts, calendar, more) plus a sheet with every menu. */
export const MobileTabBar: React.FC<{ activeTab: string; crmSubTab: string; go: (tab: string, sub?: string) => void }> = ({ activeTab, crmSubTab, go }) => {
  const { user, permissions, logout } = useAuth();
  const [more, setMore] = useState(false);
  const nav = useMemo(() => buildGlassNav(permissions, user?.role), [permissions, user?.role]);
  const all = useMemo(() => [...nav.general, ...nav.crm].filter((n) => n.show), [nav]);
  const find = (id: string) => all.find((n) => n.id === id);
  const first = find('crm-my-day') || find('crm-dashboard') || find('dashboard');
  const tabs = [
    first && { n: first, label: 'Day', Icon: first.id === 'dashboard' ? LayoutDashboard : CheckSquare },
    find('crm-leads') && { n: find('crm-leads')!, label: 'Leads', Icon: Layers },
    find('crm-contacts') && { n: find('crm-contacts')!, label: 'Contacts', Icon: Users },
    find('crm-calendar') && { n: find('crm-calendar')!, label: 'Calendar', Icon: CalendarDays },
  ].filter(Boolean) as { n: NavEntry; label: string; Icon: any }[];
  const here = (n: NavEntry) => n.tab === activeTab && (n.sub ? n.sub === crmSubTab : true);
  const pick = (n: NavEntry) => { setMore(false); go(n.tab, n.sub); };

  return (
    <>
      <nav className="mobile-tabbar lg:hidden" aria-label="Main">
        {tabs.map(({ n, label, Icon }) => (
          <button key={n.id} type="button" onClick={() => pick(n)} className={here(n) ? 'on' : ''}><Icon size={21} /><span>{label}</span></button>
        ))}
        <button type="button" onClick={() => setMore(true)} className={more ? 'on' : ''}><MoreHorizontal size={21} /><span>More</span></button>
      </nav>
      {more && createPortal(
        <div className="fixed inset-0 z-[9993] bg-black/50 flex items-end lg:hidden" onClick={() => setMore(false)}>
          <div className="bg-white w-full max-h-[85dvh] overflow-y-auto rounded-t-3xl p-4 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><b className="text-base text-brand-black">All menus</b><button type="button" onClick={() => setMore(false)} aria-label="Close" className="p-2"><X size={20} /></button></div>
            {([['General', nav.general], ['Inquiries Sales', nav.crm]] as [string, NavEntry[]][]).map(([name, items]) => (
              <div key={name} className="mb-4">
                <p className="text-[10px] uppercase tracking-widest text-brand-gray font-bold mb-2">{name}</p>
                <div className="grid grid-cols-2 gap-2">
                  {items.filter((n) => n.show).map((n) => { const I = n.icon; return (
                    <button key={n.id} type="button" onClick={() => pick(n)} className={`flex items-center gap-2.5 text-left rounded-xl px-3 py-3 text-[13px] font-semibold border ${here(n) ? 'bg-brand-red text-white border-brand-red' : 'bg-brand-gray/5 border-brand-gray/15 text-brand-black'}`}><I size={17} className="shrink-0" /><span className="leading-tight">{n.label}</span></button>
                  ); })}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <ViewSwitch tone="light" />
              <button type="button" translate="no" onClick={() => setLang(getLang() === 'ar' ? 'en' : 'ar')} className="border border-brand-gray/25 rounded-full px-4 py-2 text-xs font-bold">{getLang() === 'ar' ? 'English' : 'العربية'}</button>
              <button type="button" onClick={logout} className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-brand-red px-3 py-2"><LogOut size={15} /> Sign out</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
};
