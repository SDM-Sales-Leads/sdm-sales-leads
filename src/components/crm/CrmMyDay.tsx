import React, { useState, useEffect } from 'react';
import { useAuth } from '../../services/AuthContext';
import { Lead, TimelineEvent, LeadStatus, LeadPriority } from './types';
import { crmService } from './crmService';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { 
  Calendar, 
  CheckCircle, 
  XCircle, 
  Clock, 
  TrendingUp, 
  ChevronLeft, 
  ChevronRight, 
  ExternalLink,
  Phone,
  MessageSquare,
  Mail,
  MapPin,
  AlertCircle,
  Briefcase,
  Users,
  Search,
  Filter,
  BarChart,
  DollarSign
} from 'lucide-react';

interface CrmMyDayProps {
  leads: Lead[];
  onLeadsUpdated: () => void;
  setActiveSubTab: (tab: string) => void;
}

// Local-calendar helpers (toISOString() is UTC and shifts the day for Egypt, UTC+2/+3)
const pad2 = (n: number) => String(n).padStart(2, '0');
const localISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseLocalDay = (s: string) => new Date(`${s}T00:00:00`);
// 'YYYY-MM-DD' stays as is; a full timestamp becomes its local calendar day ('' when invalid/missing)
const dayOf = (v?: string) => {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : localISO(d);
};

export const CrmMyDay: React.FC<CrmMyDayProps> = ({
  leads,
  onLeadsUpdated,
  setActiveSubTab
}) => {
  const { user } = useAuth();
  
  // Date and View selection state
  const [selectedDate, setSelectedDate] = useState<string>(
    localISO(new Date())
  );
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // Tasks
  const [tasks, setTasks] = useState<any[]>([]);

  // Salespeople selection (for Admin / Manager / Leader roles)
  const [salespeople, setSalespeople] = useState<any[]>([]);
  const [selectedSalespersonId, setSelectedSalespersonId] = useState<string>('');

  // Interaction Logging State
  const [loggingLead, setLoggingLead] = useState<Lead | null>(null);
  const [interactionType, setInteractionType] = useState<'call' | 'whatsapp' | 'email' | 'meeting' | 'visit'>('call');
  const [interactionNotes, setInteractionNotes] = useState('');
  const [interactionDate, setInteractionDate] = useState('');
  const [interactionTime, setInteractionTime] = useState('');
  const [interactionLocation, setInteractionLocation] = useState('');
  const [interactionProjectName, setInteractionProjectName] = useState('');

  // Follow-up Scheduling State
  const [schedulingLead, setSchedulingLead] = useState<Lead | null>(null);
  const [followUpDate, setFollowUpDate] = useState('');

  // Load salespeople and tasks list on mount
  useEffect(() => {
    const people = crmService.getSalesPeople();
    setSalespeople(people);
    if (user) {
      setSelectedSalespersonId(String(user.id));
    }
    
    // Fetch tasks
    const allTasks = crmService.getTasks();
    setTasks(allTasks);
  }, [user]);

  // Escape closes either modal
  useEffect(() => {
    if (!loggingLead && !schedulingLead) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setLoggingLead(null); setSchedulingLead(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loggingLead, schedulingLead]);

  // Is current user permitted to change salesperson filter?
  const canFilterSalespeople = () => {
    if (!user) return false;
    const superRoles = ['admin', 'sales manager', 'sales operation', 'infrastructure', 'development', 'finance', 'leader'];
    const userRoleLower = (user.role || '').toLowerCase();
    return superRoles.some(r => userRoleLower.includes(r));
  };

  // Determine salespeople options to render
  const getSalespersonOptions = () => {
    if (!user) return [];
    const userRoleLower = (user.role || '').toLowerCase();
    
    // Team Leader can only view themselves and their team members
    if (userRoleLower.includes('leader')) {
      return salespeople.filter(s => String(s.id) === String(user.id) || String(s.teamLeaderId) === String(user.id));
    }
    
    // Other super roles can see all
    return salespeople;
  };

  const salesPersonOptions = getSalespersonOptions();

  // Selected salesperson object
  const activeSalesperson = salespeople.find(s => String(s.id) === String(selectedSalespersonId)) || {
    id: user?.id,
    name: user?.name,
    role: user?.role
  };

  // 1. Filter Leads Assigned to Selected Salesperson
  const salespersonLeads = leads.filter(l => String(l.assignedSalespersonId) === String(selectedSalespersonId));

  // 2. Compute Top Level Analytics
  const totalAssigned = salespersonLeads.length;
  
  const activeLeads = salespersonLeads.filter(l => 
    !['Won', 'Lost', 'Duplicate', 'Invalid', 'Closed'].includes(l.status)
  );
  
  const wonLeads = salespersonLeads.filter(l => l.status === 'Won');
  const lostLeads = salespersonLeads.filter(l => l.status === 'Lost');
  // Conversion = won / (won + lost); no closed leads yet -> n/a (not 0%)
  const closedCount = wonLeads.length + lostLeads.length;
  const winRate: number | null = closedCount > 0 ? Math.round((wonLeads.length / closedCount) * 100) : null;

  // Active pipelines status counts
  const pipelineBreakdown = {
    New: activeLeads.filter(l => l.status === 'New').length,
    Assigned: activeLeads.filter(l => l.status === 'Assigned').length,
    Contacted: activeLeads.filter(l => l.status === 'Contacted').length,
    FollowUp: activeLeads.filter(l => l.status === 'Follow Up').length,
    MeetingScheduled: activeLeads.filter(l => l.status === 'Meeting Scheduled').length,
    Negotiation: activeLeads.filter(l => l.status === 'Negotiation').length,
    QuotationSent: activeLeads.filter(l => l.status === 'Quotation Sent').length,
    WaitingCustomer: activeLeads.filter(l => l.status === 'Waiting Customer').length,
  };

  // Lead Sources Breakdown
  const sources = salespersonLeads.reduce((acc: {[key: string]: number}, lead) => {
    if (!lead.source) return acc;
    acc[lead.source] = (acc[lead.source] || 0) + 1;
    return acc;
  }, {});

  const topSource = Object.entries(sources).sort((a,b) => b[1] - a[1])[0]?.[0] || 'N/A';

  // Common Lost Reasons
  const lostReasons = lostLeads.reduce((acc: {[key: string]: number}, lead) => {
    if (lead.lostReason) {
      acc[lead.lostReason] = (acc[lead.lostReason] || 0) + 1;
    }
    return acc;
  }, {});

  const topLostReason = Object.entries(lostReasons).sort((a,b) => b[1] - a[1])[0]?.[0] || 'N/A';

  // Expected Total Revenue / Budget sum
  const activeBudgetSum = activeLeads.reduce((sum, lead) => sum + (lead.budget || 0), 0);

  // SLA violation status counts
  const slaViolatedCount = activeLeads.filter(l => l.slaStatus === 'Violated').length;

  // 3. Bottom Part: Filter Lead Schedule for the Selected Date
  const getWorkScheduledForDate = () => {
    // Collect all leads that have something scheduled for selectedDate
    const leadsWithWork = salespersonLeads.filter(lead => {
      if (lead.nextFollowUpDate === selectedDate) return true;
      if (lead.expectedClosingDate && dayOf(lead.expectedClosingDate) === selectedDate) return true;
      
      if (lead.timeline && Array.isArray(lead.timeline)) {
        const hasEventOnDate = lead.timeline.some(event => {
          if (['Meeting', 'Visit', 'Call', 'WhatsApp', 'Email'].includes(event.type)) {
            const eventDate = dayOf(event.timestamp);
            return eventDate === selectedDate;
          }
          return false;
        });
        if (hasEventOnDate) return true;
      }

      // Check explicit tasks
      const hasTasks = tasks.some(t => t.leadId === lead.id && t.dueDate && dayOf(t.dueDate) === selectedDate && String(t.salespersonId) === String(activeSalesperson.id));
      if (hasTasks) return true;

      return false;
    });
    return leadsWithWork;
  };

  const scheduleLeads = getWorkScheduledForDate();

  // Helper to retrieve the specific activities scheduled for a lead on the selected date
  const getLeadTasksForDate = (lead: Lead) => {
    const dailyTasks: { type: string; title: string; time?: string; details?: string }[] = [];

    // Explicit tasks
    const leadTasks = tasks.filter(t => t.leadId === lead.id && t.dueDate && dayOf(t.dueDate) === selectedDate && String(t.salespersonId) === String(activeSalesperson.id));
    leadTasks.forEach(task => {
      let eventTime = 'All day';
      try {
        eventTime = new Date(task.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (e) {}
      dailyTasks.push({
        type: 'Task',
        title: task.title,
        time: eventTime,
        details: task.description
      });
    });

    if (lead.nextFollowUpDate === selectedDate) {
      dailyTasks.push({
        type: 'Follow-Up',
        title: 'Scheduled Next Follow-Up',
        details: 'Contact lead to discuss active inquiries'
      });
    }

    if (lead.expectedClosingDate && dayOf(lead.expectedClosingDate) === selectedDate) {
      dailyTasks.push({
        type: 'Deadline',
        title: 'Expected Closing Date',
        details: 'Action required to push negotiation to Won status'
      });
    }

    if (lead.timeline && Array.isArray(lead.timeline)) {
      lead.timeline.forEach(event => {
        if (dayOf(event.timestamp) === selectedDate) {
          if (['Meeting', 'Visit', 'Call', 'WhatsApp', 'Email'].includes(event.type)) {
            let eventTime = 'All day';
            try {
              eventTime = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } catch (e) {}

            dailyTasks.push({
              type: event.type,
              title: `${event.type} Logged/Scheduled: ${event.title}`,
              time: eventTime,
              details: event.description
            });
          }
        }
      });
    }

    return dailyTasks;
  };

  // Handle Date Shifts
  const handlePrevDay = () => {
    const d = parseLocalDay(selectedDate || localISO(new Date()));
    d.setDate(d.getDate() - 1);
    setSelectedDate(localISO(d));
  };

  const handleNextDay = () => {
    const d = parseLocalDay(selectedDate || localISO(new Date()));
    d.setDate(d.getDate() + 1);
    setSelectedDate(localISO(d));
  };

  const handleToday = () => {
    setSelectedDate(localISO(new Date()));
  };

  // Navigates directly to the lead in CRM
  const handleViewLeadDetails = (leadId: string) => {
    localStorage.setItem('crm_selected_lead_id_from_notification', leadId);
    window.dispatchEvent(new CustomEvent('crm-select-lead', { detail: { leadId } }));
    setActiveSubTab('leads');
    toast.success(`Opening Lead ${leadId} details...`);
  };

  // Action: Save Next Follow-up Date
  const handleSaveFollowUpDate = () => {
    if (!schedulingLead) return;
    if (followUpDate && !/^\d{4}-\d{2}-\d{2}$/.test(followUpDate)) {
      toast.error('Choose a valid follow-up date.');
      return;
    }
    
    // Re-read the stored leads right before writing so other edits are not overwritten by a stale prop copy
    const updatedLeads = crmService.getLeads().map(l => {
      if (l.id === schedulingLead.id) {
        // Add log event to timeline
        const timelineEvent: TimelineEvent = {
          id: 'followup_' + Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          type: 'Comment',
          user: user?.name || 'Agent',
          title: `Scheduled Follow-Up Date`,
          description: followUpDate ? `Next action date set to ${followUpDate}` : 'Next action date cleared'
        };

        return {
          ...l,
          nextFollowUpDate: followUpDate || undefined,
          lastUpdated: new Date().toISOString(),
          status: l.status === 'New' || l.status === 'Assigned' ? 'Follow Up' : l.status,
          timeline: [...(l.timeline || []), timelineEvent]
        };
      }
      return l;
    });

    crmService.saveLeads(updatedLeads);
    onLeadsUpdated();
    setSchedulingLead(null);
    setFollowUpDate('');
    toast.success(`Scheduled follow-up date for lead ${schedulingLead.id}`);
  };

  // Action: Open Log Interaction Form
  const openLogInteraction = (lead: Lead) => {
    setLoggingLead(lead);
    setInteractionType('call');
    setInteractionDate(localISO(new Date()));
    
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    setInteractionTime(`${hours}:${mins}`);
    setInteractionNotes('');
    setInteractionLocation('');
    setInteractionProjectName('');
  };

  // Action: Submit Logged Interaction
  const handleSaveInteraction = () => {
    if (!loggingLead) return;
    const when = new Date(`${interactionDate}T${interactionTime}:00`);
    if (!interactionDate || !interactionTime || isNaN(when.getTime())) {
      toast.error('Enter a valid date and time for the interaction.');
      return;
    }
    if (!user) {
      toast.error('You must be signed in to log an interaction.');
      return;
    }

    let desc = interactionNotes;
    let taskTitle = `${interactionType.charAt(0).toUpperCase() + interactionType.slice(1)} - ${loggingLead.customerName}`;

    if (interactionType === 'meeting') {
      desc += interactionLocation ? `\nLocation: ${interactionLocation}` : '';
    } else if (interactionType === 'visit') {
      desc += interactionProjectName ? `\nProject: ${interactionProjectName}` : '';
    }

    const timelineEvent: TimelineEvent = {
      id: 'inter_' + Math.random().toString(36).substr(2, 9),
      timestamp: when.toISOString(),
      type: (interactionType === 'call' ? 'Call' : 
             interactionType === 'email' ? 'Email' :
             interactionType === 'whatsapp' ? 'WhatsApp' :
             interactionType === 'meeting' ? 'Meeting' : 'Visit') as any,
      user: user?.name || 'Agent',
      title: taskTitle,
      description: desc
    };

    const updatedLeads = crmService.getLeads().map(l => {
      if (l.id === loggingLead.id) {
        let nextStatus = l.status;
        if (interactionType === 'call' || interactionType === 'whatsapp' || interactionType === 'email') {
          if (l.status === 'Assigned' || l.status === 'New') nextStatus = 'Contacted';
        } else if (interactionType === 'meeting') {
          // never reopen a closed lead or move one already past the meeting stage backwards
          if (['New', 'Assigned', 'Contacted', 'Follow Up', 'No Answer', 'Waiting Customer'].includes(l.status)) nextStatus = 'Meeting Scheduled';
        }

        return {
          ...l,
          status: nextStatus,
          lastUpdated: new Date().toISOString(),
          timeline: [...(l.timeline || []), timelineEvent]
        };
      }
      return l;
    });

    // Pushes to activity log as well
    const activities = crmService.getActivities();
    activities.unshift({
      id: 'act_' + Math.random().toString(36).substr(2, 9),
      salespersonId: String(user.id),
      salespersonName: user.name || '—',
      type: (interactionType === 'call' ? 'Call' : interactionType === 'email' ? 'Email' : interactionType === 'whatsapp' ? 'WhatsApp' : interactionType === 'meeting' ? 'Meeting' : 'Visit') as any,
      leadId: loggingLead.id,
      leadName: loggingLead.customerName,
      timestamp: when.toISOString(),
      notes: desc,
    });
    crmService.saveActivities(activities);

    crmService.saveLeads(updatedLeads);
    onLeadsUpdated();
    setLoggingLead(null);
    toast.success(`Logged ${interactionType} interaction for lead ${loggingLead.id}`);
  };

  return (
    <div className="space-y-6" id="crm-my-day-workspace">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bento-card">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-brand-black dark:text-white">My Tasks</h2>
          <p className="text-xs text-brand-gray dark:text-white/60 mt-1">
            Focus workspace for {activeSalesperson.name} ({activeSalesperson.role || 'Sales Rep'}). Streamline today's interactions, follow-ups, and conversions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex bg-brand-gray/10 dark:bg-white/10 rounded-xl p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-brand-black text-brand-black dark:text-white shadow-sm' : 'text-brand-gray dark:text-white/60 hover:text-brand-black dark:hover:text-white'}`}
            >
              List View
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${viewMode === 'calendar' ? 'bg-white dark:bg-brand-black text-brand-black dark:text-white shadow-sm' : 'text-brand-gray dark:text-white/60 hover:text-brand-black dark:hover:text-white'}`}
            >
              Calendar View
            </button>
          </div>

          {/* Salesperson Selector for Admins / Team Leaders */}
        {canFilterSalespeople() && salesPersonOptions.length > 1 && (
          <div className="flex items-center gap-2 bg-brand-gray/5 dark:bg-white/5 px-3 py-1.5 rounded-xl border border-brand-gray/10 dark:border-white/10">
            <Users size={14} className="text-brand-gray dark:text-white/40" />
            <select
              value={selectedSalespersonId}
              onChange={(e) => setSelectedSalespersonId(e.target.value)}
              className="bg-transparent text-brand-black dark:text-white text-xs font-bold focus:outline-none border-none cursor-pointer pr-4"
            >
              {salesPersonOptions.map((person) => (
                <option key={person.id} value={person.id} className="bg-white dark:bg-brand-black text-brand-black dark:text-white">
                  {person.name} ({person.role || 'Sales Rep'})
                </option>
              ))}
            </select>
          </div>
        )}
        </div>
      </div>

      {/* TOP ROW: ANALYSIS AND PERFORMANCE CARDS (User-Specific Only) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* CARD 1: TOTAL LEADS & PIPELINE PROGRESS */}
        <div className="bento-card relative overflow-hidden" id="card-total-leads">
          <div className="absolute top-0 right-0 w-24 h-24 bg-brand-red/5 rounded-full -mr-8 -mt-8"></div>
          <span className="text-[10px] font-extrabold text-brand-gray dark:text-white/40 uppercase tracking-wider block mb-2">
            My CRM Leads
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-brand-black dark:text-white">{totalAssigned}</span>
            <span className="text-xs text-brand-gray dark:text-white/60">Assigned Total</span>
          </div>
          
          <div className="mt-4 space-y-2">
            <div className="flex justify-between items-center text-[10px] font-semibold">
              <span className="text-brand-gray dark:text-white/60">Active Pipeline</span>
              <span className="text-brand-red font-bold">{activeLeads.length} Leads</span>
            </div>
            
            {/* Tiny Progress Bar Distribution */}
            <div className="h-1.5 w-full bg-brand-gray/10 dark:bg-white/10 rounded-full flex overflow-hidden">
              <div 
                className="bg-sky-500 h-full" 
                title={`New: ${pipelineBreakdown.New + pipelineBreakdown.Assigned}`}
                style={{ width: `${totalAssigned > 0 ? ((pipelineBreakdown.New + pipelineBreakdown.Assigned) / totalAssigned) * 100 : 0}%` }}
              ></div>
              <div 
                className="bg-indigo-500 h-full" 
                title={`Contacted: ${pipelineBreakdown.Contacted}`}
                style={{ width: `${totalAssigned > 0 ? (pipelineBreakdown.Contacted / totalAssigned) * 100 : 0}%` }}
              ></div>
              <div 
                className="bg-amber-500 h-full" 
                title={`Follow Up: ${pipelineBreakdown.FollowUp}`}
                style={{ width: `${totalAssigned > 0 ? (pipelineBreakdown.FollowUp / totalAssigned) * 100 : 0}%` }}
              ></div>
              <div 
                className="bg-emerald-500 h-full" 
                title={`Won: ${wonLeads.length}`}
                style={{ width: `${totalAssigned > 0 ? (wonLeads.length / totalAssigned) * 100 : 0}%` }}
              ></div>
            </div>
            
            <div className="flex gap-2 text-[8px] font-extrabold justify-between text-brand-gray dark:text-white/40 uppercase mt-1">
              <span className="text-sky-500">Unworked ({pipelineBreakdown.New + pipelineBreakdown.Assigned})</span>
              <span className="text-amber-500">FollowUp ({pipelineBreakdown.FollowUp})</span>
              <span className="text-emerald-500">Won ({wonLeads.length})</span>
            </div>
          </div>
        </div>

        {/* CARD 2: PIPELINE VALUE & SOURCE STRENGTH */}
        <div className="bento-card relative overflow-hidden" id="card-pipeline-value">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -mr-8 -mt-8"></div>
          <span className="text-[10px] font-extrabold text-brand-gray dark:text-white/40 uppercase tracking-wider block mb-2">
            Active Pipeline Value
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {activeBudgetSum > 0 ? activeBudgetSum.toLocaleString('en-US') : '—'}
            </span>
            {activeBudgetSum > 0 && <span className="text-[10px] font-bold text-brand-gray dark:text-white/60">USD/EGP</span>}
          </div>

          <div className="mt-5 pt-3 border-t border-brand-gray/10 dark:border-white/10 space-y-1 text-[10px] font-semibold text-brand-gray dark:text-white/60">
            <div className="flex justify-between">
              <span>Top Sourcing Channel:</span>
              <span className="font-extrabold text-brand-black dark:text-white">{topSource}</span>
            </div>
            <div className="flex justify-between">
              <span>Average Size target:</span>
              <span className="font-extrabold text-brand-black dark:text-white">
                {(() => {
                  // Only leads that state a size count; none -> n/a
                  const sized = activeLeads.filter(l => Number(l.requiredSize) > 0);
                  return sized.length > 0
                    ? `${Math.round(sized.reduce((acc, l) => acc + Number(l.requiredSize), 0) / sized.length).toLocaleString('en-US')} sqm`
                    : '—';
                })()}
              </span>
            </div>
          </div>
        </div>

        {/* CARD 3: SUCCESS & WIN RATE */}
        <div className="bento-card relative overflow-hidden" id="card-win-rate">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full -mr-8 -mt-8"></div>
          <span className="text-[10px] font-extrabold text-brand-gray dark:text-white/40 uppercase tracking-wider block mb-2">
            Sales Success Metrics
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400">{winRate === null ? '—' : `${winRate}%`}</span>
            <span className="text-xs text-brand-gray dark:text-white/60">Conversion Rate</span>
          </div>

          <div className="mt-5 pt-3 border-t border-brand-gray/10 dark:border-white/10 flex justify-between text-[10px] font-extrabold text-center">
            <div className="flex-1 border-r border-brand-gray/10 dark:border-white/10">
              <span className="text-emerald-500 block text-base">{wonLeads.length}</span>
              <span className="text-[8px] uppercase text-brand-gray dark:text-white/40">Closed Won</span>
            </div>
            <div className="flex-1">
              <span className="text-rose-500 block text-base">{lostLeads.length}</span>
              <span className="text-[8px] uppercase text-brand-gray dark:text-white/40">Closed Lost</span>
            </div>
          </div>
        </div>

        {/* CARD 4: PIPELINE COMPLIANCE & RISK */}
        <div className="bento-card relative overflow-hidden" id="card-risk-analysis">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full -mr-8 -mt-8"></div>
          <span className="text-[10px] font-extrabold text-brand-gray dark:text-white/40 uppercase tracking-wider block mb-2">
            Compliance & Loss Risks
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-rose-600 dark:text-rose-400">{slaViolatedCount}</span>
            <span className="text-xs text-brand-gray dark:text-white/60">SLA Violations</span>
          </div>

          <div className="mt-5 pt-3 border-t border-brand-gray/10 dark:border-white/10 space-y-1 text-[10px] font-semibold text-brand-gray dark:text-white/60">
            <div className="flex justify-between">
              <span>Main Reason for Loss:</span>
              <span className="font-extrabold text-rose-500">{topLostReason}</span>
            </div>
            <div className="flex justify-between">
              <span>High / Urgent Priority:</span>
              <span className="font-extrabold text-brand-black dark:text-white">
                {activeLeads.filter(l => l.priority === 'High' || l.priority === 'Urgent').length} Leads
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* BOTTOM SECTION: CALENDAR DATE SELECTOR & AGENDA WORKSPACE */}
      <div className="bento-card" id="crm-my-day-agenda-container">
        
        {/* DATE CONTROL PANEL */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6 pb-6 border-b border-brand-gray/10 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Calendar className="text-brand-red" size={20} />
            <h3 className="font-extrabold text-sm uppercase text-brand-black dark:text-white tracking-wide">
              Scheduled Workspace
            </h3>
          </div>

          {/* Arrows and Date Input Picker */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevDay}
              className="p-2 border border-brand-gray/20 dark:border-white/10 rounded-xl hover:bg-brand-gray/5 dark:hover:bg-white/5 text-brand-black dark:text-white"
              title="Previous Day"
            >
              <ChevronLeft size={16} />
            </button>
            
            <button
              onClick={handleToday}
              className="px-3 py-2 text-xs font-bold bg-brand-gray/10 dark:bg-white/10 text-brand-black dark:text-white rounded-xl hover:bg-brand-gray/15 dark:hover:bg-white/15"
            >
              Today
            </button>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 border border-brand-gray/20 dark:border-white/10 rounded-xl bg-transparent text-xs font-bold focus:outline-none focus:border-brand-red text-brand-black dark:text-white"
            />

            <button
              onClick={handleNextDay}
              className="p-2 border border-brand-gray/20 dark:border-white/10 rounded-xl hover:bg-brand-gray/5 dark:hover:bg-white/5 text-brand-black dark:text-white"
              title="Next Day"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* AGENDA CONTENT */}
        {viewMode === 'calendar' ? (
          <div className="bento-card overflow-hidden overflow-x-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-brand-black dark:text-white">
                {parseLocalDay(selectedDate || localISO(new Date())).toLocaleString('default', { month: 'long', year: 'numeric' })}
              </h3>
            </div>
            <div className="grid grid-cols-7 gap-px bg-brand-gray/20 dark:bg-white/10 border border-brand-gray/20 dark:border-white/10 rounded-xl overflow-hidden min-w-[700px]">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="bg-brand-gray/5 dark:bg-brand-black/50 p-2 text-center text-[10px] font-extrabold text-brand-gray dark:text-white/60 uppercase tracking-wider">
                  {day}
                </div>
              ))}
              {(() => {
                const currentMonthDate = parseLocalDay(selectedDate || localISO(new Date()));
                const year = currentMonthDate.getFullYear();
                const month = currentMonthDate.getMonth();
                
                const firstDayOfMonth = new Date(year, month, 1);
                const lastDayOfMonth = new Date(year, month + 1, 0);
                const startingDayOfWeek = firstDayOfMonth.getDay();
                const daysInMonth = lastDayOfMonth.getDate();

                const calendarDays = [];
                for (let i = 0; i < startingDayOfWeek; i++) {
                  calendarDays.push(null);
                }
                for (let i = 1; i <= daysInMonth; i++) {
                  calendarDays.push(`${year}-${pad2(month + 1)}-${pad2(i)}`);
                }
                while (calendarDays.length % 7 !== 0) {
                  calendarDays.push(null);
                }

                return calendarDays.map((dateStr, idx) => {
                  if (!dateStr) {
                    return <div key={`empty-${idx}`} className="bg-white dark:bg-brand-black p-2 min-h-[100px]" />;
                  }

                  const dayNum = parseInt(dateStr.split('-')[2], 10);
                  const isSelected = dateStr === selectedDate;
                  const isToday = dateStr === localISO(new Date());

                  const cellTasks = tasks.filter(t => t.dueDate && dayOf(t.dueDate) === dateStr && String(t.salespersonId) === String(activeSalesperson.id));
                  const cellLeadsWithEvents = salespersonLeads.filter(lead => {
                    if (lead.nextFollowUpDate === dateStr) return true;
                    if (lead.expectedClosingDate && dayOf(lead.expectedClosingDate) === dateStr) return true;
                    if (lead.timeline && Array.isArray(lead.timeline)) {
                      return lead.timeline.some(e => ['Meeting', 'Visit', 'Call', 'WhatsApp', 'Email'].includes(e.type) && dayOf(e.timestamp) === dateStr);
                    }
                    return false;
                  });

                  const totalItems = cellTasks.length + cellLeadsWithEvents.length;

                  return (
                    <div 
                      key={dateStr} 
                      onClick={() => {
                        setSelectedDate(dateStr);
                        setViewMode('list');
                      }}
                      className={`bg-white dark:bg-brand-black p-2 min-h-[100px] border-t border-brand-gray/10 dark:border-white/5 relative cursor-pointer hover:bg-brand-gray/5 dark:hover:bg-white/5 transition-colors group ${isSelected ? 'ring-2 ring-inset ring-brand-red' : ''}`}
                    >
                      <span className={`text-[10px] font-bold inline-flex items-center justify-center w-6 h-6 rounded-full ${isToday ? 'bg-brand-red text-white' : isSelected ? 'bg-brand-gray/20 dark:bg-white/20 text-brand-black dark:text-white' : 'text-brand-gray dark:text-white/60'}`}>
                        {dayNum}
                      </span>
                      
                      {totalItems > 0 && (
                        <div className="mt-2 flex flex-col gap-1">
                          {cellTasks.slice(0, 2).map((t, i) => (
                            <div key={`t-${i}`} className="text-[9px] truncate bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                              {t.title}
                            </div>
                          ))}
                          {cellLeadsWithEvents.slice(0, 2 - Math.min(cellTasks.length, 2)).map((l, i) => (
                            <div key={`l-${i}`} className="text-[9px] truncate bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                              {l.customerName}
                            </div>
                          ))}
                          {totalItems > 2 && (
                            <div className="text-[9px] text-brand-gray dark:text-white/40 font-bold px-1">+ {totalItems - 2} more</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        ) : scheduleLeads.length === 0 ? (
          <div className="py-16 text-center space-y-4" id="empty-agenda-view">
            <div className="w-16 h-16 bg-brand-gray/5 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto text-brand-gray dark:text-white/30">
              <Clock size={32} />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h4 className="font-bold text-sm text-brand-black dark:text-white">All Clear for {parseLocalDay(selectedDate || localISO(new Date())).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}!</h4>
              <p className="text-xs text-brand-gray dark:text-white/60 leading-relaxed">
                There are no scheduled customer meetings, site visits, expected close dates, or set follow-ups for this date. Use the inquiries CRM tab to schedule upcoming client activities.
              </p>
            </div>
            <button
              onClick={() => setActiveSubTab('leads')}
              className="btn-primary text-xs font-extrabold px-4 py-2 mt-2"
            >
              Inspect Inquiries CRM
            </button>
          </div>
        ) : (
          <div className="space-y-4" id="agenda-leads-list">
            <span className="text-[10px] font-extrabold text-brand-gray dark:text-white/40 uppercase tracking-widest block mb-1">
              {scheduleLeads.length} Lead File{scheduleLeads.length > 1 ? 's' : ''} Requiring Action
            </span>

            <div className="grid grid-cols-1 gap-4">
              {scheduleLeads.map((lead) => {
                const leadTasks = getLeadTasksForDate(lead);
                
                return (
                  <div 
                    key={lead.id}
                    className="border border-brand-gray/15 dark:border-white/5 rounded-2xl bg-brand-gray/5 dark:bg-white/5 hover:border-brand-red/30 transition-all p-5 flex flex-col md:flex-row justify-between gap-4"
                  >
                    {/* LEFT COLUMN: LEAD MAIN DETAILS */}
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-extrabold text-brand-red">{lead.id}</span>
                        <h4 className="font-bold text-sm text-brand-black dark:text-white">{lead.customerName}</h4>
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                          lead.priority === 'Urgent' ? 'bg-red-100 text-red-700' :
                          lead.priority === 'High' ? 'bg-orange-100 text-orange-700' :
                          lead.priority === 'Normal' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {lead.priority}
                        </span>
                        <span className="bg-brand-black text-white/80 dark:bg-white/10 dark:text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full">
                          {lead.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-brand-gray dark:text-white/60 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Phone size={12} className="text-brand-gray/50" />
                          <span>{lead.phoneNumber || '—'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Briefcase size={12} className="text-brand-gray/50" />
                          <span>{lead.project || '—'} ({Number(lead.requiredSize) > 0 ? `${lead.requiredSize} sqm` : 'size n/a'})</span>
                        </div>
                        {Number(lead.budget) > 0 && (
                          <div className="flex items-center gap-1.5">
                            <DollarSign size={12} className="text-brand-gray/50" />
                            <span>Budget: {lead.budget.toLocaleString()} USD/EGP</span>
                          </div>
                        )}
                      </div>

                      {/* SCHEDULED ACTIVITIES ON THIS DATE */}
                      <div className="bg-white dark:bg-brand-black/20 rounded-xl p-3 border border-brand-gray/10 dark:border-white/10 space-y-2 mt-1">
                        <span className="text-[9px] font-extrabold text-brand-gray dark:text-white/40 uppercase tracking-wider block">
                          Day's Scheduled Focus:
                        </span>
                        <div className="space-y-2">
                          {leadTasks.map((task, idx) => (
                            <div key={idx} className="flex gap-2 text-[11px] leading-relaxed">
                              {task.type === 'Follow-Up' && <Clock className="text-amber-500 mt-0.5 flex-shrink-0" size={13} />}
                              {task.type === 'Deadline' && <AlertCircle className="text-rose-500 mt-0.5 flex-shrink-0" size={13} />}
                              {task.type === 'Meeting' && <Calendar className="text-indigo-500 mt-0.5 flex-shrink-0" size={13} />}
                              {task.type === 'Visit' && <MapPin className="text-amber-600 mt-0.5 flex-shrink-0" size={13} />}
                              {task.type === 'Call' && <Phone className="text-emerald-500 mt-0.5 flex-shrink-0" size={13} />}
                              {task.type === 'WhatsApp' && <MessageSquare className="text-green-500 mt-0.5 flex-shrink-0" size={13} />}
                              {task.type === 'Email' && <Mail className="text-blue-500 mt-0.5 flex-shrink-0" size={13} />}
                              
                              <div className="flex-1">
                                <span className="font-extrabold text-brand-black dark:text-white">{task.title}</span>
                                {task.time && <span className="text-[10px] text-brand-gray dark:text-white/40 ml-2">({task.time})</span>}
                                {task.details && <p className="text-[10px] text-brand-gray dark:text-white/60 mt-0.5 italic">{task.details}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* RIGHT COLUMN: ACTION ACTIONS */}
                    <div className="flex flex-row md:flex-col justify-end items-end gap-2 flex-wrap md:w-48">
                      <button
                        onClick={() => handleViewLeadDetails(lead.id)}
                        className="btn-secondary text-[10px] font-extrabold px-3 py-1.5 w-full flex items-center justify-center gap-1"
                        title="Open lead file details in CRM"
                      >
                        <ExternalLink size={12} />
                        <span>Open Lead CRM</span>
                      </button>

                      <button
                        onClick={() => openLogInteraction(lead)}
                        className="bg-brand-red text-white hover:opacity-90 transition-all font-extrabold text-[10px] px-3 py-1.5 rounded-xl w-full flex items-center justify-center gap-1 shadow-sm"
                      >
                        <Calendar size={12} />
                        <span>Log Interaction</span>
                      </button>

                      <button
                        onClick={() => {
                          setSchedulingLead(lead);
                          setFollowUpDate(lead.nextFollowUpDate || selectedDate);
                        }}
                        className="bg-brand-gray/10 hover:bg-brand-gray/20 dark:bg-white/10 dark:hover:bg-white/20 text-brand-black dark:text-white transition-all font-extrabold text-[10px] px-3 py-1.5 rounded-xl w-full flex items-center justify-center gap-1"
                      >
                        <Clock size={12} />
                        <span>Reschedule FollowUp</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* -------------------- INTERACTIONS LOGGER MODAL -------------------- */}
      {loggingLead && (
        <div className="fixed inset-0 bg-brand-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-brand-black border border-brand-gray/20 dark:border-white/10 rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
          >
            <div className="p-5 border-b border-brand-gray/15 dark:border-white/10 flex justify-between items-center bg-brand-gray/5 dark:bg-white/5">
              <div>
                <h4 className="font-bold text-sm uppercase tracking-wide text-brand-black dark:text-white">
                  Log Day Interaction
                </h4>
                <p className="text-[10px] text-brand-gray dark:text-white/60 mt-0.5">Lead: {loggingLead.customerName} ({loggingLead.id})</p>
              </div>
              <button onClick={() => setLoggingLead(null)} aria-label="Close" className="text-brand-gray dark:text-white/60 hover:text-brand-red">
                <XCircle size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              
              {/* INTERACTION TYPE PICKER */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Interaction Type</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['call', 'whatsapp', 'email', 'meeting', 'visit'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setInteractionType(type)}
                      className={`py-2 px-1 text-[9px] font-extrabold rounded-lg border text-center uppercase tracking-wider transition-all ${
                        interactionType === type
                          ? 'bg-brand-red text-white border-brand-red'
                          : 'bg-brand-gray/5 dark:bg-white/5 border-brand-gray/15 dark:border-white/10 text-brand-gray dark:text-white/60 hover:bg-brand-gray/10 dark:hover:bg-white/10'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* DATE & TIME */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Date</label>
                  <input
                    type="date"
                    value={interactionDate}
                    onChange={(e) => setInteractionDate(e.target.value)}
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-red text-brand-black"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Time</label>
                  <input
                    type="time"
                    value={interactionTime}
                    onChange={(e) => setInteractionTime(e.target.value)}
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-red text-brand-black"
                  />
                </div>
              </div>

              {/* MEETING / VISIT ADDITIONS */}
              {interactionType === 'meeting' && (
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Location / Meeting Link</label>
                  <input
                    type="text"
                    value={interactionLocation}
                    onChange={(e) => setInteractionLocation(e.target.value)}
                    placeholder="e.g. Physical office, Zoom, MS Teams link"
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-red text-brand-black"
                  />
                </div>
              )}

              {interactionType === 'visit' && (
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Project Name</label>
                  <input
                    type="text"
                    value={interactionProjectName}
                    onChange={(e) => setInteractionProjectName(e.target.value)}
                    placeholder="e.g. PI Parks Industrial Area"
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-red text-brand-black"
                  />
                </div>
              )}

              {/* SUMMARY NOTES */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Consensus Notes / Feedback</label>
                <textarea
                  value={interactionNotes}
                  onChange={(e) => setInteractionNotes(e.target.value)}
                  placeholder="Detail results of interaction, client feedback or next negotiation steps..."
                  className="w-full h-24 bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-red text-brand-black resize-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-brand-gray/10">
                <button
                  type="button"
                  onClick={() => setLoggingLead(null)}
                  className="px-4 py-2 text-xs font-bold text-brand-gray hover:bg-brand-gray/5 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveInteraction}
                  className="btn-primary text-xs"
                >
                  Submit Interaction
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* -------------------- RESCHEDULE FOLLOWUP MODAL -------------------- */}
      {schedulingLead && (
        <div className="fixed inset-0 bg-brand-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-brand-black border border-brand-gray/20 dark:border-white/10 rounded-2xl w-full max-w-sm shadow-xl overflow-hidden"
          >
            <div className="p-5 border-b border-brand-gray/15 dark:border-white/10 flex justify-between items-center bg-brand-gray/5 dark:bg-white/5">
              <div>
                <h4 className="font-bold text-sm uppercase tracking-wide text-brand-black dark:text-white">
                  Schedule Follow-Up Date
                </h4>
                <p className="text-[10px] text-brand-gray dark:text-white/60 mt-0.5">Lead: {schedulingLead.customerName}</p>
              </div>
              <button onClick={() => setSchedulingLead(null)} aria-label="Close" className="text-brand-gray dark:text-white/60 hover:text-brand-red">
                <XCircle size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Choose Next Action Date</label>
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-red text-brand-black"
                />
                <p className="text-[10px] text-brand-gray/80 mt-1.5">
                  Setting this will schedule this lead file under the corresponding "My Day" agenda.
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-brand-gray/10">
                <button
                  type="button"
                  onClick={() => setSchedulingLead(null)}
                  className="px-4 py-2 text-xs font-bold text-brand-gray hover:bg-brand-gray/5 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveFollowUpDate}
                  className="btn-primary text-xs"
                >
                  Save Date
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
};
