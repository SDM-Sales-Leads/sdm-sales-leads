// The "old view": the layout, colours and menu names of the sales team's previous CRM, around the SAME pages as the new view.
// Nothing here has its own logic for leads: every page is the shared component, so both looks do exactly the same things.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../services/AuthContext';
import { Logo } from '../constants';
import { crmService } from './crm/crmService';
import { setViewMode } from '../lib/viewMode';
import { todayISO } from './crm/leadMetrics';

export interface OldNavItem { id: string; tab: string; sub?: string; icon: string; label: string; show: boolean }

export function buildOldNav(p: any): OldNavItem[] {
  const manage = !!(p?.canViewSalesDashboard || p?.canViewSalesRules);
  const crm = !!(p?.canViewSalesCrm || p?.canViewSalesLeads);
  const fin = !!p?.canViewSalesFinance;
  const items: OldNavItem[] = [
    { id: 'day', tab: 'sales-crm', sub: manage ? 'dashboard' : 'my-day', icon: '◧', label: manage ? 'Team Day' : 'My Day', show: crm },
    { id: 'leads', tab: 'sales-crm', sub: 'leads', icon: '☰', label: manage ? 'Leads' : 'My Leads', show: !!p?.canViewSalesLeads },
    { id: 'finance', tab: 'sales-crm', sub: 'finance', icon: '✓', label: 'Won Deals', show: fin },
    { id: 'reports', tab: 'sales-crm', sub: 'reports', icon: '▤', label: fin && !manage ? 'Revenue Reports' : 'Team Reports', show: !!p?.canViewSalesReports },
    { id: 'team-perf', tab: 'sales-crm', sub: 'team-performance', icon: '👥', label: 'Team Performance', show: !!p?.canViewSalesReports },
    { id: 'calendar', tab: 'sales-crm', sub: 'calendar', icon: '▦', label: 'Calendar', show: crm },
    { id: 'achievements', tab: 'sales-crm', sub: 'achievements', icon: '🏅', label: 'Achievements', show: crm && !manage },
    { id: 'guide', tab: 'sales-crm', sub: 'guide', icon: '🎓', label: 'How to use', show: crm },
    { id: 'offers', tab: 'sales-crm', sub: 'offers', icon: '📄', label: 'Offers', show: !!p?.canViewSalesLeads },
    { id: 'contracts', tab: 'sales-crm', sub: 'contracts', icon: '📜', label: 'Contracts', show: !!p?.canViewSalesContracts },
    { id: 'ct-control', tab: 'sales-crm', sub: 'contract-control', icon: '🎛', label: 'Control Centre', show: !!p?.canViewSalesContracts },
    { id: 'ct-blockers', tab: 'sales-crm', sub: 'ct-blockers', icon: '🚧', label: 'Construction', show: !!p?.canViewSalesContracts },
    { id: 'ct-import', tab: 'sales-crm', sub: 'contract-import', icon: '⬆', label: 'Contract Excel', show: !!p?.canViewSalesContracts },
    { id: 'ct-reports', tab: 'sales-crm', sub: 'ct-reports', icon: '📈', label: 'Contract Reports', show: !!p?.canViewSalesContracts },
    { id: 'hierarchy', tab: 'sales-crm', sub: 'hierarchy', icon: '◬', label: 'Hierarchy', show: manage },
    { id: 'targets', tab: 'sales-crm', sub: 'targets', icon: '◎', label: manage ? 'Targets' : 'My Report', show: !!p?.canViewSalesTargets },
    { id: 'ext', tab: 'sales-crm', sub: 'external-sales', icon: '↗', label: 'External Sales', show: !!p?.canViewSalesExternal },
    { id: 'data', tab: 'sales-crm', sub: 'import-export', icon: '⇅', label: 'Excel & Data', show: !!p?.canViewSalesTransfer },
    // functions of the new system, kept reachable so nothing is lost by choosing the old look
    { id: 'contacts', tab: 'sales-crm', sub: 'contacts', icon: '☎', label: 'Contacts', show: !!p?.canViewSalesContacts },
    { id: 'companies', tab: 'sales-crm', sub: 'companies', icon: '🏢', label: 'Corporate Accounts', show: !!p?.canViewSalesCompanies },
    { id: 'queue', tab: 'sales-crm', sub: 'queue', icon: '✉', label: 'Mail Ingestion', show: !!p?.canViewSalesMail },
    { id: 'rules', tab: 'sales-crm', sub: 'rules', icon: '⚙', label: 'Routing Rules', show: !!p?.canViewSalesRules },
    { id: 'activities', tab: 'sales-crm', sub: 'activities', icon: '⌁', label: 'Activities Feed', show: !!p?.canViewSalesActivities },
    { id: 'plots', tab: 'sales-crm', sub: 'plots-inventory', icon: '▧', label: 'Plots Inventory', show: !!p?.canViewSalesPlotsInventory },
    { id: 'duplicates', tab: 'sales-crm', sub: 'duplicates', icon: '⧉', label: 'Duplicates', show: !!(p?.canViewSalesTransfer || p?.canViewSalesRules) },
    { id: 'audit', tab: 'sales-crm', sub: 'audit', icon: '🛡', label: 'Lead Audit Trail', show: !!p?.canViewSalesAudit },
    { id: 'dash', tab: 'dashboard', icon: '◨', label: 'Service Desk Dashboard', show: !!p?.canViewDashboard },
    { id: 'tickets', tab: 'tickets', icon: '🎫', label: 'Tickets', show: !!p?.canViewTickets },
    { id: 'new-ticket', tab: 'new-ticket', icon: '＋', label: 'New Ticket', show: !!p?.canViewTickets },
    { id: 'kb', tab: 'kb', icon: '📚', label: 'Knowledge Base', show: !!p?.canViewKnowledgeBase },
    { id: 'workflow', tab: 'workflow-sla', icon: '⇄', label: 'Workflow & SLA', show: !!p?.canViewWorkflowBuilder },
    { id: 'health', tab: 'health', icon: '♥', label: 'System Health', show: !!p?.canViewAdminPanel },
    { id: 'admin', tab: 'admin', icon: '◫', label: manage ? 'Team & Admin' : 'Admin Panel', show: !!p?.canViewAdminPanel },
  ];
  return items.filter((i) => i.show);
}

interface Props {
  activeTab: string;
  crmSubTab: string;
  go: (tab: string, sub?: string) => void;
  children: React.ReactNode;
}

export const OldViewShell: React.FC<Props> = ({ activeTab, crmSubTab, go, children }) => {
  const { user, permissions, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const nav = useMemo(() => buildOldNav(permissions), [permissions]);
  const current = nav.find((n) => n.tab === activeTab && (n.sub ? n.sub === crmSubTab : true));

  // the old look uses its own font and always the light theme; both are undone when the person switches back
  useEffect(() => {
    const id = 'old-view-font';
    if (!document.getElementById(id)) {
      const l = document.createElement('link');
      l.id = id; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';
      document.head.appendChild(l);
    }
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    root.classList.remove('dark');
    return () => { if (wasDark) root.classList.add('dark'); };
  }, []);

  // Ctrl+K focuses the search box, like the old system
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // search runs only while typing, on the leads already in memory (no server call)
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const digits = t.replace(/\D/g, '');
    const out: any[] = [];
    for (const l of crmService.getLeads() as any[]) {
      if ((l.customerName || '').toLowerCase().includes(t) || (l.companyName || '').toLowerCase().includes(t) ||
          (l.id || '').toLowerCase().includes(t) || (digits.length >= 4 && String(l.phoneNumber || '').replace(/\D/g, '').includes(digits))) {
        out.push(l); if (out.length >= 8) break;
      }
    }
    return out;
  }, [q]);

  // reminders: open leads whose follow-up date is today or earlier (the list is in memory already)
  const due = useMemo(() => {
    const t = todayISO();
    return (crmService.getLeads() as any[]).filter((l) => l.nextFollowUpDate && l.nextFollowUpDate <= t && !['Won', 'Lost'].includes(l.status)).length;
  }, [activeTab, crmSubTab]);

  const openLead = (id: string) => {
    try { localStorage.setItem('selected_lead_id', id); } catch { /* ignore */ }
    setQ(''); go('sales-crm', 'leads');
  };
  const pick = (n: OldNavItem) => { setOpen(false); go(n.tab, n.sub); };

  return (
    <div className="old-skin flex h-screen overflow-hidden" id="old-view-root">
      {open && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`old-side fixed inset-y-0 left-0 z-50 w-64 flex flex-col transition-transform lg:translate-x-0 lg:static ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-5 pt-5 pb-4 border-b border-[#F0F1F3]">
          <Logo height="h-10" />
          <div className="mt-2 text-[10.5px] font-bold tracking-[.16em] uppercase text-[#E01E25]">Sales Team CRM</div>
          <button
            onClick={() => setViewMode(user?.id, 'new')}
            className="mt-3 w-full text-[11px] font-bold border border-[#E6E7EA] rounded-lg py-1.5 hover:border-[#E01E25] hover:text-[#E01E25] transition-colors"
            title="Switch to the new look"
          >
            ⇄ Switch to the new view
          </button>
        </div>
        <nav className="old-nav flex-1 overflow-y-auto py-3">
          {nav.map((n) => (
            <button key={n.id} className={n === current ? 'active' : ''} onClick={() => pick(n)}>
              <span className="w-[18px] text-center opacity-80">{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <div className="px-5 py-3 text-[10.5px] text-[#6C737E] border-t border-[#F0F1F3] leading-relaxed">
          Call center <b>15212</b><br />opportunity@elsewedy.com<br />All week days 9:00 AM – 5:00 PM
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="old-top">
          <button className="lg:hidden text-xl px-2" onClick={() => setOpen(true)} aria-label="Menu">☰</button>
          <div className="old-title truncate">{current?.label || ''}</div>
          <div className="flex-1" />
          <div className="relative hidden sm:block" style={{ flex: '0 1 260px', minWidth: 120 }}>
            <input
              ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search leads…  (Ctrl+K)"
              className="w-full border-[1.5px] border-[#E6E7EA] rounded-[10px] px-3 py-2 text-[13px] bg-[#FAFAF9] outline-none focus:border-[#E01E25]"
            />
            {results.length > 0 && (
              <div className="absolute top-11 left-0 right-0 bg-white border border-[#E6E7EA] rounded-xl shadow-xl z-50 overflow-hidden">
                {results.map((l) => (
                  <button key={l.id} onClick={() => openLead(l.id)} className="block w-full text-left px-3 py-2 text-xs hover:bg-[#FDECED] border-b border-[#F0F1F3] last:border-0">
                    <b>{l.customerName || l.companyName || l.id}</b> <span className="text-[#6C737E]">· {l.phoneNumber || '—'} · {l.status}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="relative text-lg px-2" title="Follow-up reminders" onClick={() => go('sales-crm', 'my-day')}>
            🔔{due > 0 && <span className="absolute -top-1 -right-0.5 bg-[#E01E25] text-white text-[10px] font-bold rounded-full px-1.5">{due > 99 ? '99+' : due}</span>}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#E01E25] text-white font-bold flex items-center justify-center text-sm">{(user?.name || '–').trim().charAt(0).toUpperCase()}</div>
            <div className="leading-tight hidden md:block">
              <div className="text-[13px] font-bold">{user?.name}</div>
              <button className="text-[11px] text-[#6C737E] hover:text-[#E01E25]" onClick={logout}>Sign out</button>
            </div>
          </div>
        </div>
        <main className="flex-1 overflow-y-auto p-4 md:p-7">{children}</main>
      </div>
    </div>
  );
};
