import React, { useState, useEffect } from 'react';
import { useAuth } from '../../services/AuthContext';
import { crmService } from './crmService';
import { adminService } from '../../services/adminService';
import { Lead, Contact, Company, EmailImportLog } from './types';
import { toast } from 'sonner';
import { CrmDashboard } from './CrmDashboard';
import { CrmMyDay } from './CrmMyDay';
import { CrmLeads } from './CrmLeads';
import { CrmContacts } from './CrmContacts';
import { CrmCompanies } from './CrmCompanies';
import { CrmLeadQueue } from './CrmLeadQueue';
import { CrmSalesApprovals } from './CrmSalesApprovals';
import { CrmAssignmentRules } from './CrmAssignmentRules';
import { CrmActivities } from './CrmActivities';
import { CrmReports } from './CrmReports';
import { CrmImportExport } from './CrmImportExport';
import { CrmPlotsInventory } from './CrmPlotsInventory';
import { 
  TrendingUp, 
  Users, 
  Building, 
  Mail, 
  CheckSquare, 
  GitMerge, 
  Share2, 
  Activity, 
  BarChart, 
  Sliders, 
  LayoutDashboard,
  UploadCloud,
  Layers,
  Database
} from 'lucide-react';

interface SalesCrmModuleProps {
  activeSubTab?: string;
  setActiveSubTab?: (tab: string) => void;
}

export const SalesCrmModule: React.FC<SalesCrmModuleProps> = ({ 
  activeSubTab: propActiveSubTab,
  setActiveSubTab: propSetActiveSubTab
}) => {
  const { user } = useAuth();
  const currentRole = user?.role || 'Read Only';

  const [localActiveSubTab, localSetActiveSubTab] = useState('dashboard');
  const activeSubTab = propActiveSubTab || localActiveSubTab;
  const setActiveSubTab = propSetActiveSubTab || localSetActiveSubTab;

  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [logs, setLogs] = useState<EmailImportLog[]>([]);
  const lastNetworkFetchRef = React.useRef<number>(0);
  const loadErrorShown = React.useRef(false);

  // Load datasets on mount or local update
  const loadCrmData = async (forceNetworkFetch = false) => {
    // 1. Instant UI Load from Local Cache
    setLeads(crmService.getLeads());
    setContacts(crmService.getContacts());
    setCompanies(crmService.getCompanies());
    setLogs(crmService.getEmailLogs());

    try {
      const allUsers = await adminService.getUsers();
      // Filter users who belong to the "Sales Team" or other sales roles
      const salesTeamUsers = allUsers.filter((u: any) => 
        u.role === 'Sales Team' || 
        u.role === 'Sales Rep' || 
        u.role === 'Sales Team Leader' || 
        u.role === 'Sales Operation'
      );
      
      // Map to crm salesperson objects
      const crmSalesPeople = salesTeamUsers.map((u: any) => ({
        id: String(u.id),
        name: u.name,
        email: u.email || '',
        role: u.role || 'Sales Rep',
        activeLeads: u.activeLeads || 0,
        totalLeads: u.totalLeads || 0,
        leave: u.leave || false,
        active: u.active !== undefined ? u.active : true,
        teamLeaderId: u.teamLeaderId ? String(u.teamLeaderId) : undefined
      }));

      // Store in localStorage so crmService can access it synchronously
      localStorage.setItem('crm_sales_people', JSON.stringify(crmSalesPeople));
    } catch (err) {
      console.error('Failed to sync sales team users from admin panel:', err);
    }

    const timeSinceLastFetch = Date.now() - lastNetworkFetchRef.current;
    // Throttle network fetches to once every 20 seconds unless forceNetworkFetch is true
    if (forceNetworkFetch || timeSinceLastFetch > 20000) {
      lastNetworkFetchRef.current = Date.now();
      const oldIds = new Set(crmService.getLeads().map(l => l.id));
      const { ok } = await crmService.loadAll();
      if (!ok) {
        if (!loadErrorShown.current) { loadErrorShown.current = true; toast.error('Could not load the latest CRM data. Showing what was loaded before.'); }
      } else {
        loadErrorShown.current = false;
      }

      const newLeads = crmService.getLeads();
      setLeads(newLeads);
      setContacts(crmService.getContacts());
      setCompanies(crmService.getCompanies());
      setLogs(crmService.getEmailLogs());

      const added = oldIds.size > 0 ? newLeads.filter(l => !oldIds.has(l.id)) : [];
      if (added.length > 0) {
        const latestNewLeadId = added[0].id;
        window.dispatchEvent(new CustomEvent('crm-notification', {
          detail: {
            id: Date.now().toString(),
            message: `A new sales lead has been created: ${latestNewLeadId}`,
            type: 'lead',
            refId: latestNewLeadId,
            timestamp: new Date().toISOString(),
            read: false
          }
        }));
        toast.success(`A new sales lead has been created: ${latestNewLeadId}`, {
          action: { label: 'View Lead', onClick: () => { setActiveSubTab('leads'); } },
          duration: 5000,
        });
      }
    }
  };

  useEffect(() => {
    loadCrmData(false);

    // Refresh CRM data when window regains focus (zero cost while idle)
    const handleFocus = () => loadCrmData(false);
    // a save that was refused or reloaded from the server changed the cached lists
    const handleChanged = () => {
      setLeads(crmService.getLeads());
      setContacts(crmService.getContacts());
      setCompanies(crmService.getCompanies());
      setLogs(crmService.getEmailLogs());
    };
    window.addEventListener('focus', handleFocus);
    window.addEventListener('crm-data-changed', handleChanged);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('crm-data-changed', handleChanged);
    };
  }, []);

  


  const subTabs = [
    { id: 'dashboard', label: 'Executive Board', icon: LayoutDashboard },
    { id: 'my-day', label: 'My Tasks', icon: CheckSquare },
    { id: 'leads', label: 'Inquiries CRM', icon: Layers },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'companies', label: 'Corporate Accounts', icon: Building },
    { id: 'queue', label: 'Mail Ingestion', icon: Mail },
    { id: 'rules', label: 'Routing Rules', icon: GitMerge },
    { id: 'activities', label: 'Activities Feed', icon: Activity },
    { id: 'reports', label: 'Sales Reports', icon: BarChart },
    { id: 'import-export', label: 'Bulk Transfer', icon: UploadCloud },
  ];

  return (
    <div className="space-y-6" id="sales-crm-module-root">
      {/* Sub-Header Tabs removed in favor of Sidebar sub-navigation as requested */}

      {/* Render active sub component */}
      <div className="min-h-[500px] transition-all">
        {activeSubTab === 'dashboard' && (
          <CrmDashboard leads={leads} />
        )}
        {activeSubTab === 'my-day' && (
          <CrmMyDay 
            leads={leads} 
            onLeadsUpdated={() => loadCrmData(true)} 
            setActiveSubTab={setActiveSubTab}
          />
        )}
        {activeSubTab === 'leads' && (
          <CrmLeads 
            leads={leads} 
            onLeadsUpdated={() => loadCrmData(true)} 
            currentRole={currentRole} 
            setActiveSubTab={setActiveSubTab}
          />
        )}
        {activeSubTab === 'contacts' && (
          <CrmContacts 
            contacts={contacts} 
            leads={leads} 
            onContactsUpdated={() => loadCrmData(true)} 
            currentRole={currentRole} 
            setActiveSubTab={setActiveSubTab}
          />
        )}
        {activeSubTab === 'companies' && (
          <CrmCompanies 
            companies={companies} 
            leads={leads} 
            onCompaniesUpdated={() => loadCrmData(true)} 
            currentRole={currentRole} 
            setActiveSubTab={setActiveSubTab}
          />
        )}
        {activeSubTab === 'queue' && (
          <CrmLeadQueue 
            logs={logs} 
            leads={leads} 
            onLogsUpdated={() => loadCrmData(true)} 
            setActiveSubTab={setActiveSubTab}
          />
        )}
        {activeSubTab === 'rules' && (
          <CrmAssignmentRules 
            onRulesUpdated={() => loadCrmData(true)} 
            currentRole={currentRole} 
          />
        )}
        {activeSubTab === 'activities' && (
          <CrmActivities 
            leads={leads} 
            onLeadsUpdated={() => loadCrmData(true)} 
            currentRole={currentRole} 
          />
        )}
        {activeSubTab === 'reports' && (
          <CrmReports 
            leads={leads} 
          />
        )}
        {activeSubTab === 'plots-inventory' && (
          <CrmPlotsInventory />
        )}
        {activeSubTab === 'import-export' && (
          <CrmImportExport 
            leads={leads} 
            onLeadsUpdated={() => loadCrmData(true)} 
            currentRole={currentRole} 
          />
        )}
      </div>
    </div>
  );
};
