import React, { useState, useEffect } from 'react';
import { AssignmentMethod, QueueSettings } from './types';
import { crmService } from './crmService';
import { 
  GitMerge, 
  HelpCircle, 
  User, 
  Settings, 
  CheckCircle, 
  AlertCircle,
  TrendingUp,
  UserCheck,
  Shield,
  Layers,
  Sparkles
} from 'lucide-react';
import { motion } from 'motion/react';

interface CrmAssignmentRulesProps {
  onRulesUpdated: () => void;
  currentRole: string;
}

export const CrmAssignmentRules: React.FC<CrmAssignmentRulesProps> = ({ onRulesUpdated, currentRole }) => {
  const [activeStrategy, setActiveStrategy] = useState<AssignmentMethod>('Round Robin');
  const [showSavedToast, setShowSavedToast] = useState(false);

  // Agent workload configs
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    const settings = crmService.getQueueSettings();
    if (settings && settings.assignmentMethod) {
      setActiveStrategy(settings.assignmentMethod);
    }
    
    const realSalespeople = crmService.getSalesPeople();
    const leads = crmService.getLeads();

    setAgents(realSalespeople.map((s: any) => {
      // Calculate activeLeads dynamically
      const activeLeadsCount = leads.filter(l => 
        (String(l.assignedSalespersonId) === String(s.id) || (l.assignedSalespersonName && l.assignedSalespersonName === s.name)) &&
        !['Won', 'Lost', 'Duplicate', 'Invalid', 'Closed', 'Not Interested'].includes(l.status)
      ).length;

      return {
        name: s.name,
        status: s.leave ? 'Away' : (s.active ? 'Online' : 'Offline'),
        // No invented defaults: personal weight/cap only when set; the cap otherwise comes from the queue settings
        weight: typeof s.weight === 'number' && s.weight > 0 ? s.weight : null,
        cap: Number(s.cap) > 0 ? Number(s.cap) : (Number(settings?.maxLeadsPerSalesperson) > 0 ? Number(settings.maxLeadsPerSalesperson) : null),
        activeLeads: activeLeadsCount,
        projects: Array.isArray(s.projects) ? s.projects : []
      };
    }));
  }, []);

  const strategies: { value: AssignmentMethod; title: string; description: string }[] = [
    {
      value: 'Round Robin',
      title: 'Sequential Round Robin',
      description: 'Rotates inbound inquiries sequentially among all active online agents, guaranteeing absolute equality in lead allocation.'
    },
    {
      value: 'Project Based',
      title: 'Project Specialization Matrix',
      description: 'Matches leads to agents who specialize in the requested project (e.g. Industria West, Sokhna 360) first, falling back to Round Robin.'
    },
    {
      value: 'Least Active Leads',
      title: 'Active Capacity Load Balance',
      description: 'Routes new inquiries to whichever online agent has the lowest ratio of (Active Leads / Maximum Allocation Cap).'
    },
    {
      value: 'Priority Based',
      title: 'Priority Multiplier',
      description: 'Distributes leads according to customizable priority weighting mapped dynamically to sales agent conversion histories.'
    },
    {
      value: 'VIP Customer Routing',
      title: 'VIP Account Protection',
      description: 'Reroutes large-scale inquiries or recurring clients to senior account executives automatically.'
    },
    {
      value: 'Manual Assignment Only',
      title: 'Central Inbound Triage',
      description: 'Bypasses the automation queue entirely and locks new leads under a Manual Triage status for manual supervisor dispatch.'
    }
  ];

  const handleSaveStrategy = () => {
    const currentSettings = crmService.getQueueSettings();
    crmService.saveQueueSettings({
      ...currentSettings,
      assignmentMethod: activeStrategy
    });
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3000);
    onRulesUpdated();
  };

  const hasAdminRole = currentRole === 'Admin' || currentRole === 'System Admin' || currentRole === 'System Administrator' || currentRole === 'Sales Manager' || currentRole === 'Sales Operations Manager' || currentRole === 'Sales Operation';

  return (
    <div className="space-y-6" id="crm-assignment-rules-root">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold text-brand-black flex items-center gap-2">
            <span>Enterprise Lead Routing Engine</span>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full">
              Automated ruleset
            </span>
          </h3>
          <p className="text-xs text-brand-gray/80 mt-1">
            Configure how incoming digital leads from Web, Facebook, CRM parsed mailboxes are instantly routed to authorized agents.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
        
        {/* Strategy list */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-brand-gray/20 shadow-sm p-5 space-y-4">
            <h4 className="font-bold text-brand-black text-sm uppercase tracking-wide">Active Routing Strategy</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {strategies.map((strat) => {
                const isActive = activeStrategy === strat.value;
                return (
                  <div
                    key={strat.value}
                    role="radio"
                    aria-checked={isActive}
                    aria-disabled={!hasAdminRole}
                    tabIndex={hasAdminRole ? 0 : -1}
                    onKeyDown={(e) => { if (hasAdminRole && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setActiveStrategy(strat.value); } }}
                    onClick={() => hasAdminRole && setActiveStrategy(strat.value)}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${isActive ? 'border-brand-red bg-brand-red/5' : 'border-brand-gray/15 bg-white hover:bg-brand-gray/5'}`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <h5 className="font-bold text-brand-black">{strat.title}</h5>
                      <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${isActive ? 'border-brand-red bg-brand-red' : 'border-brand-gray/30'}`}>
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                    </div>
                    <p className="text-[10px] text-brand-gray font-semibold leading-relaxed">{strat.description}</p>
                  </div>
                );
              })}
            </div>

            {hasAdminRole ? (
              <div className="flex items-center justify-between pt-4 border-t border-brand-gray/10">
                <span className="text-[10px] text-brand-gray font-bold">Policy updates apply immediately across API integrations.</span>
                <button
                  onClick={handleSaveStrategy}
                  className="bg-brand-red hover:bg-brand-red-dark text-white px-5 py-2 rounded-xl font-bold shadow"
                >
                  Save Active Policy
                </button>
              </div>
            ) : (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 flex items-center gap-2">
                <AlertCircle size={16} />
                <span className="font-semibold">View-only mode. You require Sales Operations permissions to rewrite routing variables.</span>
              </div>
            )}

            {showSavedToast && (
              <div className="p-3 bg-emerald-100 text-emerald-800 rounded-xl border border-emerald-200 font-bold flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-600" />
                <span>Assignment rules updated and persisted to CRM system backend.</span>
              </div>
            )}
          </div>
        </div>

        {/* Workload and Agent Availability Panel */}
        <div className="bg-white rounded-2xl border border-brand-gray/20 shadow-sm p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <h4 className="font-bold text-brand-black text-sm uppercase tracking-wide">Live Agent Workloads</h4>
            
            <div className="space-y-3">
              {agents.length === 0 && <p className="text-brand-gray text-center py-4">No salespeople configured.</p>}
              {agents.map((agent) => {
                const percentage = agent.cap ? Math.min(100, Math.round((agent.activeLeads / agent.cap) * 100)) : 0;
                const isOnline = agent.status === 'Online';
                return (
                  <div key={agent.name} className="p-3 bg-brand-gray/5 border border-brand-gray/15 rounded-xl space-y-2">
                    <div className="flex justify-between items-center font-bold">
                      <span className="text-brand-black font-extrabold flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-brand-gray'}`} />
                        {agent.name}
                      </span>
                      <span className="text-brand-gray font-mono text-[10px]">
                        {agent.activeLeads} / {agent.cap ?? '—'} Active
                      </span>
                    </div>

                    <div className="w-full bg-brand-gray/20 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${percentage > 85 ? 'bg-rose-500' : 'bg-brand-red'}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>

                    <div className="flex justify-between items-center text-[9px] text-brand-gray font-bold uppercase tracking-wider">
                      <span>Projects: {agent.projects.length ? agent.projects.join(', ') : 'all'}</span>
                      <span>Weight: {agent.weight !== null ? `${agent.weight}x` : '—'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-3.5 bg-brand-gray/5 rounded-xl border border-brand-gray/15 text-[10px] text-brand-gray font-semibold leading-relaxed mt-4">
            <p><strong>Note on Weighting:</strong> High multipliers skew automated round robin distributions towards high-converting senior executives.</p>
          </div>
        </div>

      </div>

    </div>
  );
};
