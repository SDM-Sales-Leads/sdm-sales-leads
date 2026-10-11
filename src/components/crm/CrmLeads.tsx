import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Lead, Contact, Company, LeadStatus, LeadPriority, LostReason, CommentNote, Attachment, TimelineEvent, PlotRecord } from './types';
import { CrmPlotRecommendations } from './CrmPlotRecommendations';
import { ColumnSelector } from './ColumnSelector';
import { crmService, normalizePhone } from './crmService';
import DOMPurify from 'dompurify';
import { useAuth } from '../../services/AuthContext';
import { parseCSV } from '../../lib/plots';
import { 
  List, 
  Kanban, 
  Calendar, 
  Search, 
  Filter, 
  Plus, 
  MoreVertical, 
  Phone, 
  Mail, 
  MessageSquare, 
  CalendarDays, 
  Bell, 
  FileText, 
  Paperclip, 
  UserCheck, 
  RefreshCw, 
  SlidersHorizontal, 
  Trash2, 
  Edit, 
  Check, 
  CheckSquare, 
  Square, 
  Download, 
  Upload, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  Activity, 
  FileSpreadsheet, 
  UserPlus, 
  AlertTriangle,
  ArrowRight,
  Info,
  ExternalLink,
  Lock,
  CornerDownRight,
  CheckCircle2,
  Bookmark,
  Cpu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Local-calendar helpers (toISOString() is UTC and shifts the day for Egypt, UTC+2/+3)
const pad2 = (n: number) => String(n).padStart(2, '0');
const localISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// 'YYYY-MM-DD' stays as is; a full timestamp becomes its local calendar day ('' when invalid/missing)
const dayOf = (v?: string) => {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : localISO(d);
};
const fmtSize = (v: string | number | undefined) => (Number(v) > 0 ? `${Number(v).toLocaleString('en-US')} sqm` : '—');
const PRIORITY_RANK: Record<string, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
const TERMINAL_STATUSES = ['Won', 'Lost', 'Duplicate', 'Invalid', 'Closed', 'Not Interested'];
const EMAIL_RE = /^[^\s@,;<>()"?&=]+@[^\s@,;<>()"?&=]+\.[^\s@,;<>()"?&=]+$/;
// Only data:/blob:/https: URLs may be used as a link target (blocks javascript: etc. coming from stored data)
const safeUrl = (u?: string) => (u && /^(data:|blob:|https:)/i.test(u.trim()) ? u : undefined);
// Spreadsheet formula injection guard for CSV cells
const csvCell = (v: any) => {
  let str = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
  return `"${str.replace(/"/g, '""')}"`;
};
// Email bodies are untrusted: strip scripts/styles/forms/remote media and non-http links
const sanitizeEmailHtml = (html: string): string =>
  DOMPurify.sanitize(String(html || ''), {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed', 'img', 'video', 'audio', 'link', 'meta'],
    FORBID_ATTR: ['style', 'srcset', 'src'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:)/i,
  });
// Digits for a wa.me link: 00-prefix dropped, Egyptian local 0xxxxxxxxxx -> 20xxxxxxxxxx; '' when not plausible
const waNumber = (phone?: string) => {
  let n = String(phone || '').replace(/[^\d]/g, '');
  if (n.startsWith('00')) n = n.substring(2);
  else if (n.startsWith('0')) n = '20' + n.substring(1);
  return n.length >= 8 && n.length <= 15 ? n : '';
};
// SLA risk = still active and inside the last 25% of its window (registration/assignment -> deadline)
const isSlaAtRisk = (l: Lead, sla: { status: string }) => {
  if (sla.status !== 'active' || !l.slaDeadline) return false;
  const start = new Date(l.assignedDate || l.date).getTime();
  const end = new Date(l.slaDeadline).getTime();
  if (isNaN(start) || isNaN(end) || end <= start) return false;
  return (end - Date.now()) / (end - start) <= 0.25;
};

// Helper to format date and time beautifully
function formatLeadDateTime(dateStr: string): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    
    // Check if the original string was just a YYYY-MM-DD string without time
    if (dateStr.length <= 10) {
      return `${yyyy}-${mm}-${dd}`;
    }
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  } catch (e) {
    return dateStr;
  }
}

// Helper to calculate SLA status
interface SlaStatus {
  status: 'none' | 'active' | 'violated' | 'met' | 'missed';
  text: string;
  isViolated: boolean;
  remainingText: string;
}

function getSlaStatus(lead: Lead): SlaStatus {
  if (!lead.slaDeadline) {
    return { status: 'none', text: 'No SLA Set', isViolated: false, remainingText: 'N/A' };
  }
  
  const now = new Date();
  const deadline = new Date(lead.slaDeadline);
  if (isNaN(deadline.getTime())) {
    return { status: 'none', text: 'No SLA Set', isViolated: false, remainingText: 'N/A' };
  }
  const diffMs = deadline.getTime() - now.getTime();
  const isClosed = TERMINAL_STATUSES.includes(lead.status);
  
  if (isClosed) {
    const lastUpdatedDate = new Date(lead.lastUpdated || lead.date);
    const met = lastUpdatedDate.getTime() <= deadline.getTime();
    if (met) {
      return { 
        status: 'met', 
        text: 'SLA Met', 
        isViolated: false, 
        remainingText: 'SLA Met' 
      };
    } else {
      return { 
        status: 'missed', 
        text: 'SLA Missed', 
        isViolated: true, 
        remainingText: 'SLA Missed' 
      };
    }
  }

  if (diffMs < 0) {
    const absDiff = Math.abs(diffMs);
    const hours = Math.floor(absDiff / (3600 * 1000));
    const mins = Math.floor((absDiff % (3600 * 1000)) / (60 * 1000));
    let overdueText = '';
    if (hours > 24) {
      overdueText = `${Math.floor(hours / 24)}d overdue`;
    } else if (hours > 0) {
      overdueText = `${hours}h ${mins}m overdue`;
    } else {
      overdueText = `${mins}m overdue`;
    }
    return { 
      status: 'violated', 
      text: 'SLA Violated', 
      isViolated: true, 
      remainingText: overdueText 
    };
  } else {
    const hours = Math.floor(diffMs / (3600 * 1000));
    const mins = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000));
    let remainingText = '';
    if (hours > 24) {
      remainingText = `${Math.floor(hours / 24)}d ${hours % 24}h remaining`;
    } else if (hours > 0) {
      remainingText = `${hours}h ${mins}m remaining`;
    } else {
      remainingText = `${mins}m remaining`;
    }
    return { 
      status: 'active', 
      text: 'SLA Active', 
      isViolated: false, 
      remainingText: remainingText 
    };
  }
}

interface CrmLeadsProps {
  leads: Lead[];
  onLeadsUpdated: () => void;
  currentRole: string; // From parent settings switcher
  setActiveSubTab: (tab: string) => void;
}

export const CrmLeads: React.FC<CrmLeadsProps> = ({ leads, onLeadsUpdated, currentRole, setActiveSubTab }) => {
  const { user } = useAuth();
  const isAdmin = (currentRole?.toLowerCase() || '').includes('admin') || (user?.role?.toLowerCase() || '').includes('admin');
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'calendar'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  
  // Advanced filters
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [plots, setPlots] = useState<PlotRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const fetchPlots = async (retryCount = 0) => {
      try {
        const response = await fetch(`/api/plots-csv?t=${Date.now()}`);
        if (!response.ok) {
           throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }
        const csvText = await response.text();
        const parsed = parseCSV(csvText);
        const mapped: PlotRecord[] = parsed.map((row: any, index: number) => {
          const areaSqM = parseFloat((row['Area'] || '0').replace(/,/g, '')) || 0;
          return {
            id: index + 1,
            projectName: (row['Project Name'] || '').trim() || 'Unknown Project',
            landType: (row['Land Type'] || '').trim() || 'General',
            status: (row['Status'] || 'Unknown').toUpperCase().trim(),
            sector: (row['Sector'] || '').trim() || 'General',
            areaSqM: areaSqM,
            unitCode: (row['Unit Code'] || '').trim() || 'N/A',
            clientName: (row['Client Name'] || row['Company Name'] || '').trim() || 'N/A',
            companyName: (row['Company Name'] || '').trim() || 'N/A',
            salesContractDate: (row['Sales contract date'] || '').trim() || '',
            yearOfSale: (row['Year of Sale'] || '').trim() || '',
            rfPrice: (row['RF Price'] || '').trim() || '',
            cashValue: (row['Cash Value (A)'] || '').trim() || '',
            quarterOfSale: (row['Quarter of sale'] || '').trim() || '',
            salesRep: (row['SOLD BY'] || '').trim() || 'N/A',
            leadSource: (row['lead source'] || '').trim() || 'N/A'
          };
        });
        if (!cancelled) setPlots(mapped);
      } catch (e: any) {
        console.error("Failed to fetch plots in CrmLeads", e.message || e);
        if (retryCount < 3 && !cancelled) {
            retryTimer = setTimeout(() => fetchPlots(retryCount + 1), 2000);
        }
      }
    };
    fetchPlots();
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
  }, []);

  // Keep the open lead panel in sync with the latest data (it is a copy; other edits would otherwise be shown stale)
  useEffect(() => {
    setSelectedLead(prev => {
      if (!prev) return prev;
      const fresh = leads.find(l => l.id === prev.id);
      if (fresh) return fresh === prev ? prev : fresh;
      return leads.length > 0 ? null : prev; // deleted elsewhere
    });
  }, [leads]);

  useEffect(() => {
    const checkAndSelectLead = () => {
      const targetLeadId = localStorage.getItem('crm_selected_lead_id_from_notification');
      if (targetLeadId && leads && leads.length > 0) {
        const foundLead = leads.find(l => String(l.id) === String(targetLeadId));
        if (foundLead) {
          setSelectedLead(foundLead);
          setFilterStatus('All');
          setSearchTerm('');
          setFilterProject('All');
          setFilterPriority('All');
          setFilterSource('All');
          setFilterSalesperson('All');
          localStorage.removeItem('crm_selected_lead_id_from_notification');
        }
      }
    };

    checkAndSelectLead();

    const handleSelectLeadEvent = (e: any) => {
      if (e.detail && e.detail.leadId && leads && leads.length > 0) {
        const foundLead = leads.find(l => String(l.id) === String(e.detail.leadId));
        if (foundLead) {
          setSelectedLead(foundLead);
          setFilterStatus('All');
          setSearchTerm('');
          setFilterProject('All');
          setFilterPriority('All');
          setFilterSource('All');
          setFilterSalesperson('All');
          localStorage.removeItem('crm_selected_lead_id_from_notification');
        }
      }
    };

    window.addEventListener('crm-select-lead', handleSelectLeadEvent);
    return () => {
      window.removeEventListener('crm-select-lead', handleSelectLeadEvent);
    };
  }, [leads]);
  const [filterProject, setFilterProject] = useState<string>('All');
  const [filterPriority, setFilterPriority] = useState<string>('All');
  const [filterSource, setFilterSource] = useState<string>('All');
  const [filterSalesperson, setFilterSalesperson] = useState<string>('All');
  const [showFilters, setShowFilters] = useState(false);
  const [savedView, setSavedView] = useState<string>('All');

  // Column management
  const [visibleColumns, setVisibleColumns] = useState<string[]>(['id', 'date', 'customer', 'project', 'size', 'slaStatus', 'priority', 'status', 'assigned']);
  
  const columns = {
    id: visibleColumns.includes('id'),
    date: visibleColumns.includes('date'),
    customer: visibleColumns.includes('customer'),
    project: visibleColumns.includes('project'),
    size: visibleColumns.includes('size'),
    slaStatus: visibleColumns.includes('slaStatus'),
    priority: visibleColumns.includes('priority'),
    status: visibleColumns.includes('status'),
    assigned: visibleColumns.includes('assigned'),
  };

  const columnsList = [
    { key: 'id', label: 'Id' },
    { key: 'date', label: 'Date' },
    { key: 'customer', label: 'Customer' },
    { key: 'project', label: 'Project' },
    { key: 'size', label: 'Size' },
    { key: 'slaStatus', label: 'SLA Status' },
    { key: 'priority', label: 'Priority' },
    { key: 'status', label: 'Status' },
    { key: 'assigned', label: 'Assigned' },
  ];

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);
  const [deleteConfirmLeadId, setDeleteConfirmLeadId] = useState<string | null>(null);
  const [deleteConfirmBulk, setDeleteConfirmBulk] = useState<boolean>(false);

  // Selected leads for bulk actions
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<string>('');

  // Source Email View states
  const [showSourceEmailModal, setShowSourceEmailModal] = useState<boolean>(false);
  const [sourceEmailData, setSourceEmailData] = useState<{
    subject: string;
    sender: string;
    receivedTime?: string;
    bodyHtml?: string;
    bodyText?: string;
  } | null>(null);
  const [loadingSourceEmail, setLoadingSourceEmail] = useState<boolean>(false);
  const [reparsingLead, setReparcingLead] = useState<boolean>(false);

  // Form states
  // No pre-filled project / size: the user must state them (nothing invented)
  const EMPTY_LEAD_FORM = {
    customerName: '',
    phoneNumber: '',
    email: '',
    companyName: '',
    project: '',
    requiredSize: '' as number | '',
    source: 'Manual Entry',
    priority: 'Normal' as LeadPriority,
    description: '',
  };
  const [newLeadForm, setNewLeadForm] = useState(EMPTY_LEAD_FORM);

  const [assigneeId, setAssigneeId] = useState('');
  const [primaryLeadMergeId, setPrimaryLeadMergeId] = useState('');
  const [duplicateLeadMergeId, setDuplicateLeadMergeId] = useState('');
  const [lostReason, setLostReason] = useState<LostReason>('Not Interested');
  const [lostComment, setLostComment] = useState('');

  // Interaction logs (calls, visits, reminders, email, whatsapp)
  const [showInteractionModal, setShowInteractionModal] = useState<string | null>(null); // 'call' | 'visit' | 'whatsapp' | 'email' | 'meeting' | 'reminder'
  const [interactionNotes, setInteractionNotes] = useState('');
  const [interactionDate, setInteractionDate] = useState(localISO(new Date()));
  const [interactionTime, setInteractionTime] = useState('10:00');
  const [interactionLocation, setInteractionLocation] = useState('');
  const [interactionProjectName, setInteractionProjectName] = useState('');
  const [interactionSiteEmail, setInteractionSiteEmail] = useState('');
  const [callOutcome, setCallOutcome] = useState('Contacted');

  // WhatsApp & Email Template modals
  const [showWhatsappTemplateModal, setShowWhatsappTemplateModal] = useState(false);
  const [whatsappTemplateText, setWhatsappTemplateText] = useState('');
  const [showEmailTemplateModal, setShowEmailTemplateModal] = useState(false);
  const [emailTemplateText, setEmailTemplateText] = useState('');

  // New comments
  const [newCommentText, setNewCommentText] = useState('');
  const [commentPrivate, setCommentPrivate] = useState(false);

  // Drag and drop or sorting
  const [sortField, setSortField] = useState<keyof Lead>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const reminderTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { reminderTimers.current.forEach(clearTimeout); }, []);

  // CRM calendar month (current month by default)
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });

  // Retrieve salespeople for select options
  const salespeople = useMemo(() => {
    const allReps = crmService.getSalesPeople();
    
    // Dynamically calculate the activeLeads and totalLeads based on the CURRENT list of leads
    const mappedReps = allReps.map((s: any) => {
      // An active/live lead is any lead that is assigned to this salesperson and is not in a closed/inactive status
      const activeLeadsCount = leads.filter(l => 
        (String(l.assignedSalespersonId) === String(s.id) || (l.assignedSalespersonName && l.assignedSalespersonName === s.name)) &&
        !['Won', 'Lost', 'Duplicate', 'Invalid', 'Closed', 'Not Interested'].includes(l.status)
      ).length;

      const totalLeadsCount = leads.filter(l => 
        String(l.assignedSalespersonId) === String(s.id) || (l.assignedSalespersonName && l.assignedSalespersonName === s.name)
      ).length;

      return {
        ...s,
        activeLeads: activeLeadsCount,
        totalLeads: totalLeadsCount
      };
    });

    if (user?.role === 'Sales Team Leader') {
      return mappedReps.filter((s: any) => s.id === String(user.id) || s.teamLeaderId === String(user.id));
    }
    if (user?.role === 'Sales Rep') {
      return mappedReps.filter((s: any) => s.id === String(user.id));
    }
    return mappedReps;
  }, [leads, user]);

  // Handle auto-selection of a lead from other tabs
  useEffect(() => {
    const targetId = localStorage.getItem('selected_lead_id');
    if (targetId) {
      const found = leads.find(l => l.id === targetId);
      if (found) {
        setSelectedLead(found);
      }
      localStorage.removeItem('selected_lead_id');
    }
  }, [leads]);

  // Handle column sort
  const handleSort = (field: keyof Lead) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Reset all filters
  const resetFilters = () => {
    setFilterStatus('All');
    setFilterProject('All');
    setFilterPriority('All');
    setFilterSource('All');
    setFilterSalesperson('All');
    setSearchTerm('');
    setSavedView('All');
  };

  // Saved Views Loader
  const handleSavedViewChange = (view: string) => {
    if (view === 'All') {
      resetFilters();
    } else if (view === 'My Open Leads') {
      resetFilters();
      // Filter leads assigned to current user, assuming user index/name match
      setFilterSalesperson(user?.name || '');
      setFilterStatus('OpenLeads'); // Internal flag
    } else if (view === 'SLA Violated') {
      resetFilters();
    } else if (view === 'SLA Within Limit') {
      resetFilters();
    } else if (view === 'Unassigned') {
      resetFilters();
      setFilterSalesperson('Unassigned');
    } else if (view === 'SLA At Risk') {
      resetFilters();
    }
    // resetFilters() clears savedView, so the chosen view is set last
    setSavedView(view);
  };

  // Process and Filter Leads
  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      // Role-based visibility
      if (user) {
        if (user.role === 'Sales Rep') {
          if (l.assignedSalespersonId !== String(user.id)) return false;
        } else if (user.role === 'Sales Team Leader') {
          const isAssignedToMe = l.assignedSalespersonId === String(user.id);
          const assignedRep = salespeople.find((s: any) => s.id === l.assignedSalespersonId);
          const isMyTeam = assignedRep && assignedRep.teamLeaderId === String(user.id);
          
          // Also show unassigned leads? Team Leaders probably should see unassigned leads to claim or assign them.
          // Let's allow unassigned leads for Team Leaders.
          if (!isAssignedToMe && !isMyTeam && l.assignedSalespersonId) return false;
        }
      }

      // Global Search
      const text = `${l.id} ${l.customerName || ''} ${l.phoneNumber || ''} ${l.email || ''} ${l.companyName || ''} ${l.project || ''} ${l.source || ''} ${l.assignedSalespersonName || ''} ${l.description || ''}`.toLowerCase();
      const q = searchTerm.trim().toLowerCase();
      const qDigits = q.replace(/\D/g, '');
      // phone search also works across formats (+20 / 0020 / 01x)
      const matchesSearch = !q || text.includes(q) || (qDigits.length >= 5 && normalizePhone(l.phoneNumber || '').includes(normalizePhone(qDigits)));

      // Status filters
      let matchesStatus = true;
      if (filterStatus === 'OpenLeads') {
        matchesStatus = !TERMINAL_STATUSES.includes(l.status);
      } else if (filterStatus !== 'All') {
        matchesStatus = l.status === filterStatus;
      }

      // Project filter
      const matchesProject = filterProject === 'All' || l.project === filterProject;

      // Priority filter
      const matchesPriority = filterPriority === 'All' || l.priority === filterPriority;

      // Source filter
      const matchesSource = filterSource === 'All' || l.source === filterSource;

      // Salesperson filter
      let matchesSalesperson = true;
      if (filterSalesperson === 'Unassigned') {
        matchesSalesperson = !l.assignedSalespersonId;
      } else if (filterSalesperson !== 'All') {
        matchesSalesperson = l.assignedSalespersonName === filterSalesperson;
      }

      // Saved view custom conditions
      let matchesSavedView = true;
      if (savedView === 'SLA Violated') {
        const slaInfo = getSlaStatus(l);
        matchesSavedView = slaInfo.isViolated;
      } else if (savedView === 'SLA Within Limit') {
        const slaInfo = getSlaStatus(l);
        matchesSavedView = !slaInfo.isViolated && slaInfo.status !== 'none';
      } else if (savedView === 'SLA At Risk') {
        matchesSavedView = isSlaAtRisk(l, getSlaStatus(l));
      }

      return matchesSearch && matchesStatus && matchesProject && matchesPriority && matchesSource && matchesSalesperson && matchesSavedView;
    }).sort((a, b) => {
      // Comparable value per field: priority by rank, size numerically, text case-insensitively; missing = always last
      const key = (l: Lead): string | number | null => {
        const v: any = l[sortField];
        if (sortField === 'priority') return PRIORITY_RANK[l.priority] ?? 99;
        if (sortField === 'requiredSize') { const n = Number(v); return isNaN(n) || v === '' ? null : n; }
        if (v === undefined || v === null || v === '') return null;
        if (typeof v === 'string') return v.toLowerCase();
        if (typeof v === 'number') return v;
        return null;
      };
      const valA = key(a);
      const valB = key(b);
      if (valA === null && valB === null) return 0;
      if (valA === null) return 1;
      if (valB === null) return -1;
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [user, salespeople, leads, searchTerm, filterStatus, filterProject, filterPriority, filterSource, filterSalesperson, savedView, sortField, sortDirection]);

  // Project List
  const projects = useMemo(() => {
    return Array.from(new Set(leads.map(l => l.project).filter(Boolean))).sort();
  }, [leads]);

  // Sources list
  const sources = useMemo(() => {
    return Array.from(new Set(leads.map(l => l.source).filter(Boolean))).sort();
  }, [leads]);

  // View Source Ingested Email helper
  const handleViewInboundEmail = async (lead: Lead) => {
    if (!lead.emailId) return;
    
    setShowSourceEmailModal(true);
    setLoadingSourceEmail(true);
    setSourceEmailData(null);
    
    try {
      const res = await fetch(`/api/crm/webmail/body?id=${encodeURIComponent(lead.emailId)}`);
      const data = await res.json();
      
      if (data.success) {
        const matchingLog = crmService.getEmailLogs().find(log => log.id === lead.emailId);
        setSourceEmailData({
          subject: data.subject || matchingLog?.subject || '—',
          sender: matchingLog?.sender || '—',
          receivedTime: matchingLog?.receivedTime || lead.date,
          bodyHtml: data.body
        });
      } else {
        throw new Error("Could not fetch via API");
      }
    } catch (e) {
      // Mail server unavailable: fall back to the locally stored import log (shown as plain text below)
      const matchingLog = crmService.getEmailLogs().find(log => log.id === lead.emailId || log.parsedLeadId === lead.id);
      if (matchingLog) {
        setSourceEmailData({
          subject: matchingLog.subject,
          sender: matchingLog.sender,
          receivedTime: matchingLog.receivedTime,
          bodyText: matchingLog.bodyPreview
        });
      } else {
        setSourceEmailData({
          subject: '—',
          sender: '—',
          receivedTime: lead.date,
          bodyText: lead.description || 'No email content or logs found for this lead.'
        });
      }
    } finally {
      setLoadingSourceEmail(false);
    }
  };

  // Reparse lead with full HTML EWS body
  const handleReparseLead = async (lead: Lead) => {
    if (!lead.id) return;
    setReparcingLead(true);
    try {
      const res = await fetch('/api/crm/reparse-lead', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ leadId: lead.id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`Lead "${data.lead.customerName}" successfully reparsed and updated!\n` +
              `All extracted parameters have been synchronized with Contacts and Corporate Accounts.`);
        setShowSourceEmailModal(false);
        onLeadsUpdated(); // reload leads, contacts, and companies
        setSelectedLead(data.lead); // update active lead details view
      } else {
        alert(data.error || "Failed to reparse lead.");
      }
    } catch (err: any) {
      console.error(err);
      alert("Error reparsing lead: " + err.message);
    } finally {
      setReparcingLead(false);
    }
  };

  // Bulk Actions
  const handleSelectLead = (id: string) => {
    if (selectedLeadIds.includes(id)) {
      setSelectedLeadIds(selectedLeadIds.filter(item => item !== id));
    } else {
      setSelectedLeadIds([...selectedLeadIds, id]);
    }
  };

  const handleSelectAll = () => {
    if (selectedLeadIds.length === filteredLeads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(filteredLeads.map(l => l.id));
    }
  };

  const confirmBulkDelete = () => {
    // Re-read the stored leads right before writing so a stale prop copy cannot overwrite newer edits
    const remaining = crmService.getLeads().filter(l => !selectedLeadIds.includes(l.id));
    crmService.saveLeads(remaining);
    setSelectedLeadIds([]);
    setBulkAction('');
    setDeleteConfirmBulk(false);
    onLeadsUpdated();
  };

  const executeBulkAction = () => {
    if (selectedLeadIds.length === 0 || !bulkAction) return;

    if (bulkAction === 'delete') {
      if (!isAdmin) {
        alert("Unauthorized: Only Administrators can bulk delete lead records.");
        return;
      }
      setDeleteConfirmBulk(true);
    } else if (bulkAction === 'assign') {
      setShowAssignModal(true);
    } else if (bulkAction === 'won') {
      if (currentRole === 'Read Only') return;
      const toWin = crmService.getLeads().filter(l => selectedLeadIds.includes(l.id) && !['Won', 'Duplicate', 'Invalid'].includes(l.status));
      if (toWin.length === 0) { alert('None of the selected leads can be marked as Won.'); return; }
      if (!window.confirm(`Mark ${toWin.length} lead(s) as Won?`)) return;
      const winIds = new Set(toWin.map(l => l.id));
      const updated = crmService.getLeads().map(l => {
        if (winIds.has(l.id)) {
          return {
            ...l,
            status: 'Won' as LeadStatus,
            lastUpdated: new Date().toISOString(),
            timeline: [...(l.timeline || []), {
              id: Math.random().toString(36).substr(2, 9),
              timestamp: new Date().toISOString(),
              type: 'Status Change' as const,
              user: user?.name || 'Bulk Operation',
              title: 'Won Deal',
              description: 'Marked as Won Deal via bulk operator action.'
            }]
          };
        }
        return l;
      });
      crmService.saveLeads(updated);
      setSelectedLeadIds([]);
      setBulkAction('');
      onLeadsUpdated();
    }
  };

  // Create Lead
  const handleCreateLead = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newLeadForm.customerName.trim();
    const phone = normalizePhone(newLeadForm.phoneNumber || '');
    if (!name) { alert('Customer name is required.'); return; }
    if (phone.replace(/\D/g, '').length < 8) { alert('Enter a valid mobile number.'); return; }
    if (!newLeadForm.project) { alert('Choose the target project.'); return; }
    // Duplicate check against the freshest stored leads (same phone, not already marked Duplicate)
    const dup = crmService.getLeads().find(l => l.status !== 'Duplicate' && l.phoneNumber && normalizePhone(l.phoneNumber) === phone);
    if (dup && !window.confirm(`A lead with this phone number already exists (${dup.id} - ${dup.customerName}). Create another lead anyway?`)) return;
    try {
      const size = Number(newLeadForm.requiredSize);
      crmService.createLead({
        ...newLeadForm,
        customerName: name,
        // size is optional: when not stated it is stored as 'n/a' instead of an invented number
        requiredSize: size > 0 ? size : 'n/a'
      }, user?.name || 'Administrator');
      setShowCreateModal(false);
      setNewLeadForm(EMPTY_LEAD_FORM);
      onLeadsUpdated();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Assign Salesperson
  const handleAssignSalesperson = () => {
    const selectedRep = salespeople.find((s: any) => String(s.id) === String(assigneeId));
    if (!selectedRep) return;

    const idsToAssign = selectedLeadIds.length > 0 ? selectedLeadIds : (selectedLead ? [selectedLead.id] : []);
    if (idsToAssign.length === 0) return;

    // Respect the queue settings: leave / inactive users and the per-person cap need an explicit OK
    const settings = crmService.getQueueSettings();
    const cap = Number(selectedRep.cap) > 0 ? Number(selectedRep.cap) : Number(settings?.maxLeadsPerSalesperson) || 0;
    const warnings: string[] = [];
    if (selectedRep.leave) warnings.push(`${selectedRep.name} is on leave.`);
    if (selectedRep.active === false) warnings.push(`${selectedRep.name} is inactive.`);
    if (cap > 0 && selectedRep.activeLeads + idsToAssign.length > cap) {
      warnings.push(`${selectedRep.name} would exceed the limit of ${cap} active leads (${selectedRep.activeLeads} now, +${idsToAssign.length}).`);
    }
    if (warnings.length > 0 && !window.confirm(`${warnings.join('\n')}\n\nAssign anyway?`)) return;

    // Re-read the stored leads right before writing (no stale-array overwrite)
    const updatedLeads = crmService.getLeads().map(l => {
      if (idsToAssign.includes(l.id)) {
        const timelineEvent: TimelineEvent = {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          type: 'Assignment',
          user: user?.name || 'Administrator',
          title: `Assigned to ${selectedRep.name}`,
          description: `Assigned manually by ${user?.name || 'Administrator'}.`
        };
        return {
          ...l,
          assignedSalespersonId: selectedRep.id,
          assignedSalespersonName: selectedRep.name,
          assignedDate: new Date().toISOString(),
          status: l.status === 'New' ? 'Assigned' as LeadStatus : l.status,
          lastUpdated: new Date().toISOString(),
          timeline: [...(l.timeline || []), timelineEvent]
        };
      }
      return l;
    });

    // Lead counts per salesperson are derived from the leads themselves; the stored salespeople list is NOT rewritten here
    // (the list shown is role-filtered, saving it would have dropped the other people).
    crmService.saveLeads(updatedLeads);

    setShowAssignModal(false);
    setSelectedLeadIds([]);
    setAssigneeId('');
    if (selectedLead) {
      const refreshed = updatedLeads.find(l => l.id === selectedLead.id);
      setSelectedLead(refreshed || null);
    }
    onLeadsUpdated();
  };

  // Merge Duplicates
  const handleMergeDuplicate = () => {
    if (!primaryLeadMergeId || !duplicateLeadMergeId || primaryLeadMergeId === duplicateLeadMergeId) return;
    if (!window.confirm(`Merge ${duplicateLeadMergeId} into ${primaryLeadMergeId}? ${duplicateLeadMergeId} will be closed as Duplicate.`)) return;
    try {
      crmService.mergeLeads(primaryLeadMergeId, duplicateLeadMergeId, user?.name || 'System CRM');
      setShowMergeModal(false);
      setPrimaryLeadMergeId('');
      setDuplicateLeadMergeId('');
      onLeadsUpdated();
      alert('Duplicate leads successfully merged. Primary record updated, secondary record closed as Duplicate.');
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Auto Purge Duplicates across entire leads collection
  const handleAutoPurgeDuplicates = () => {
    if (!isAdmin) {
      alert("Unauthorized: Only Administrators can bulk purge duplicate records.");
      return;
    }

    // Safer rule: a repeat is the same phone/email AND the same project; the earliest record is kept and
    // won / assigned-and-worked leads are never removed automatically.
    const seen = new Set<string>();
    const freshLeads = crmService.getLeads();
    const sorted = [...freshLeads].sort((x, y) => String(x.date || '').localeCompare(String(y.date || '')));
    const dropIds = new Set<string>();

    for (const lead of sorted) {
      const cleanPhone = lead.phoneNumber ? normalizePhone(lead.phoneNumber) : '';
      const cleanEmail = lead.email ? lead.email.trim().toLowerCase() : '';
      const proj = (lead.project || '').trim().toLowerCase();
      const keys = [cleanPhone && `p:${cleanPhone}|${proj}`, cleanEmail && `e:${cleanEmail}|${proj}`].filter(Boolean) as string[];
      const isDup = keys.some(k => seen.has(k));
      if (isDup && lead.status !== 'Won') {
        dropIds.add(lead.id);
      } else {
        keys.forEach(k => seen.add(k));
      }
    }
    const leadsToKeep = freshLeads.filter(l => !dropIds.has(l.id));
    const purgedCount = dropIds.size;

    if (purgedCount === 0) {
      alert("No duplicate leads found (same phone or email on the same project).");
      return;
    }

    if (window.confirm(`Found ${purgedCount} duplicate lead records across phone numbers/emails. Purge all duplicates now?`)) {
      crmService.saveLeads(leadsToKeep);
      onLeadsUpdated();
      setShowMergeModal(false);
      alert(`Successfully purged ${purgedCount} duplicate records from CRM database.`);
    }
  };

  // Purge ALL Leads permanently from DB & Server
  const handlePurgeAllDatabaseLeads = async () => {
    if (!isAdmin) {
      alert("Unauthorized: Only Administrators can purge all database leads.");
      return;
    }

    const typed = window.prompt("CRITICAL WARNING: this permanently deletes ALL sales leads from the database, server, and cloud storage and CANNOT be undone.\n\nType DELETE ALL to confirm.");
    if (typed === 'DELETE ALL') {
      try {
        const res = await fetch('/api/crm/leads/purge-all', { method: 'POST' });
        if (res.ok) {
          localStorage.removeItem('crm_leads');
          crmService.saveLeads([]);
          onLeadsUpdated();
          alert("All sales leads have been completely wiped from database and server storage.");
        } else {
          const errData = await res.json().catch(() => ({}));
          alert("Failed to purge leads: " + (errData.error || 'Server error'));
        }
      } catch (err: any) {
        alert("Network error purging leads: " + err.message);
      }
    }
  };

  // Close Lead as Lost
  const handleMarkAsLost = () => {
    if (!selectedLead) return;
    if (!lostComment.trim()) {
      alert('A comment is mandatory when closing a lead as Lost.');
      return;
    }

    const updatedLeads = crmService.getLeads().map(l => {
      if (l.id === selectedLead.id) {
        return {
          ...l,
          status: 'Lost' as LeadStatus,
          lostReason,
          lostComment: lostComment.trim(),
          lastUpdated: new Date().toISOString(),
          timeline: [...(l.timeline || []), {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            type: 'Status Change' as const,
            user: user?.name || 'Agent',
            title: 'Lead Closed as Lost',
            description: `Lost reason: ${lostReason}. Comments: ${lostComment.trim()}`
          }]
        };
      }
      return l;
    });

    crmService.saveLeads(updatedLeads);
    setShowLostModal(false);
    setLostComment('');
    
    const refreshed = updatedLeads.find(l => l.id === selectedLead.id);
    setSelectedLead(refreshed || null);
    onLeadsUpdated();
  };

  // Add Comment/Note
  const handleAddComment = () => {
    if (!selectedLead || !newCommentText.trim()) return;

    const newComment: CommentNote = {
      id: Math.random().toString(36).substr(2, 9),
      date: localISO(new Date()),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      user: user?.name || 'User',
      comment: newCommentText.trim(),
      isPrivate: commentPrivate
    };

    const updatedLeads = crmService.getLeads().map(l => {
      if (l.id === selectedLead.id) {
        return {
          ...l,
          comments: [...(l.comments || []), newComment],
          lastUpdated: new Date().toISOString(),
          timeline: [...(l.timeline || []), {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            type: 'Comment' as const,
            user: user?.name || 'User',
            title: 'New Note Added',
            description: commentPrivate ? 'A private note was added.' : `Note: "${newCommentText.trim().substring(0, 30)}${newCommentText.trim().length > 30 ? '...' : ''}"`
          }]
        };
      }
      return l;
    });

    crmService.saveLeads(updatedLeads);
    setNewCommentText('');
    
    const refreshed = updatedLeads.find(l => l.id === selectedLead.id);
    setSelectedLead(refreshed || null);
    onLeadsUpdated();
  };

  // Browser reminder 30 min before an event (timers are cleared on unmount)
  const scheduleReminder = (title: string, bodyText: string, when: Date) => {
    if (!('Notification' in window) || isNaN(when.getTime())) return;
    Notification.requestPermission().then(permission => {
      if (permission !== 'granted') return;
      const timeDiff = when.getTime() - Date.now();
      const thirtyMins = 30 * 60 * 1000;
      if (timeDiff > thirtyMins) {
        reminderTimers.current.push(setTimeout(() => { new Notification(title, { body: `${bodyText} in 30 minutes.` }); }, timeDiff - thirtyMins));
      } else if (timeDiff > 0) {
        new Notification(title, { body: `${bodyText} very soon.` });
      }
    }).catch(() => {});
  };

  // Log Interaction (call / meeting / follow-up / visit / whatsapp / email)
  const handleLogInteraction = () => {
    if (!selectedLead || !showInteractionModal) return;

    const when = new Date(`${interactionDate}T${interactionTime}:00`);
    if (!interactionDate || !interactionTime || isNaN(when.getTime())) {
      alert('Enter a valid date and time for the interaction.');
      return;
    }
    if (!user) {
      alert('You must be signed in to log an interaction.');
      return;
    }
    if (showInteractionModal === 'visit' && interactionSiteEmail.trim() && !EMAIL_RE.test(interactionSiteEmail.trim())) {
      alert('The site notification email address is not valid.');
      return;
    }

    const interactionType = showInteractionModal;
    let taskTitle = `${interactionType.charAt(0).toUpperCase() + interactionType.slice(1)} - ${selectedLead.customerName}`;
    let desc = interactionNotes.trim();

    if (interactionType === 'call') {
      taskTitle = `Call (${callOutcome}) - ${selectedLead.customerName}`;
      desc = `Call Outcome: ${callOutcome}` + (interactionNotes.trim() ? `\nNotes: ${interactionNotes.trim()}` : '');
    } else if (interactionType === 'meeting') {
      desc += interactionLocation ? `\nLocation: ${interactionLocation}` : '';
      scheduleReminder('Upcoming Meeting Reminder', `You have a meeting with ${selectedLead.customerName} (location: ${interactionLocation || 'not specified'})`, when);
    } else if (interactionType === 'follow-up') {
      // Create a task for the salesperson (assigned rep, else the logged-in user)
      const tasks = crmService.getTasks();
      tasks.push({
        id: 'task_' + Math.random().toString(36).substr(2, 9),
        salespersonId: String(selectedLead.assignedSalespersonId || user.id),
        title: `Follow Up: ${selectedLead.customerName}`,
        description: desc,
        dueDate: when.toISOString(),
        status: 'Pending',
        priority: 'High',
        leadId: selectedLead.id
      });
      crmService.saveTasks(tasks);
      scheduleReminder('Upcoming Follow Up Reminder', `You have a follow up scheduled with ${selectedLead.customerName}`, when);
    } else if (interactionType === 'visit') {
      desc += interactionProjectName ? `\nProject: ${interactionProjectName}` : '';
      desc += interactionSiteEmail.trim() ? `\nSite Email: ${interactionSiteEmail.trim()}` : '';

      // Only open the mail client when a validated site address was entered (all parts URL-encoded)
      if (interactionSiteEmail.trim()) {
        const mailtoSubject = encodeURIComponent(`Site Visit Confirmation: ${interactionProjectName}`);
        const mailtoBody = encodeURIComponent(`Dear Site Team,

This is to confirm a site visit for ${interactionProjectName}.

Customer Name: ${selectedLead.customerName}
Customer Phone: ${selectedLead.phoneNumber}

Date: ${interactionDate}
Time: ${interactionTime}

Best regards,
${user.name || ''}`);
        const cc = user.email && EMAIL_RE.test(user.email) ? `cc=${encodeURIComponent(user.email)}&` : '';
        window.open(`mailto:${encodeURIComponent(interactionSiteEmail.trim())}?${cc}subject=${mailtoSubject}&body=${mailtoBody}`, '_blank', 'noopener,noreferrer');
      }
      scheduleReminder('Upcoming Site Visit Reminder', `You have a site visit for ${selectedLead.customerName} at ${interactionProjectName || 'an unspecified project'}`, when);
    }

    const timelineEvent: TimelineEvent = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: when.toISOString(),
      type: (interactionType === 'call' || interactionType === 'follow-up' ? 'Call' : 
             interactionType === 'email' ? 'Email' :
             interactionType === 'whatsapp' ? 'WhatsApp' :
             interactionType === 'meeting' ? 'Meeting' : 'Visit') as any,
      user: user.name || 'Agent',
      title: taskTitle,
      description: desc || 'No notes entered.'
    };

    // Re-read the stored leads right before writing (no stale-array overwrite)
    const updatedLeads = crmService.getLeads().map(l => {
      if (l.id === selectedLead.id) {
        // Transition status on contact; never reopen or move closed leads
        let nextStatus = l.status;
        const isClosed = TERMINAL_STATUSES.includes(l.status);
        let lostPatch: { lostReason?: LostReason; lostComment?: string } = {};
        if (!isClosed) {
          if (interactionType === 'call') {
            if (callOutcome === 'Asked to Call Back') {
              nextStatus = 'Follow Up';
            } else if (callOutcome === 'Not Interested') {
              // 'Lost' needs a mandatory reason/comment (Lost modal); a call outcome records 'Not Interested' with its reason instead
              nextStatus = 'Not Interested';
              lostPatch = { lostReason: 'Not Interested', lostComment: interactionNotes.trim() || 'Customer not interested (call outcome).' };
            } else if (callOutcome === 'Contacted' && (l.status === 'Assigned' || l.status === 'New')) {
              nextStatus = 'Contacted';
            }
          } else if (interactionType === 'whatsapp' || interactionType === 'email') {
            if (l.status === 'Assigned' || l.status === 'New') nextStatus = 'Contacted';
          } else if (interactionType === 'meeting') {
            if (['New', 'Assigned', 'Contacted', 'Follow Up', 'No Answer', 'Waiting Customer'].includes(l.status)) nextStatus = 'Meeting Scheduled';
          } else if (interactionType === 'follow-up') {
            if (['New', 'Assigned', 'Contacted', 'No Answer', 'Waiting Customer'].includes(l.status)) nextStatus = 'Follow Up';
          }
        }

        return {
          ...l,
          ...lostPatch,
          status: nextStatus,
          lastUpdated: new Date().toISOString(),
          timeline: [...(l.timeline || []), timelineEvent]
        };
      }
      return l;
    });

    // Also save to global activities (attributed to the logged-in user)
    const acts = crmService.getActivities();
    acts.unshift({
      id: 'act_' + Math.random().toString(36).substr(2, 9),
      salespersonId: String(user.id),
      salespersonName: user.name || '—',
      type: (interactionType === 'call' || interactionType === 'follow-up' ? 'Call' : interactionType === 'email' ? 'Email' : interactionType === 'whatsapp' ? 'WhatsApp' : interactionType === 'meeting' ? 'Meeting' : 'Visit') as any,
      leadId: selectedLead.id,
      leadName: selectedLead.customerName,
      timestamp: when.toISOString(),
      notes: desc
    });
    crmService.saveActivities(acts);

    crmService.saveLeads(updatedLeads);
    setShowInteractionModal(null);
    setInteractionNotes('');
    setCallOutcome('Contacted');
    
    const refreshed = updatedLeads.find(l => l.id === selectedLead.id);
    setSelectedLead(refreshed || null);
    onLeadsUpdated();
  };

  // Upload Attachment File Simulation
  const handleAttachmentUploadClick = () => {
    fileInputRef.current?.click();
  };

  const MAX_ATTACHMENT_BYTES = 1.5 * 1024 * 1024; // stored as base64 in the lead record: keep records small

  const handleAttachmentSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    if (!selectedLead || !input.files || input.files.length === 0) return;

    const file = input.files[0];
    input.value = ''; // allow choosing the same file again
    if (file.size > MAX_ATTACHMENT_BYTES) {
      alert(`"${file.name}" is too large (${Math.round(file.size / 1024)} KB). The maximum attachment size is ${Math.round(MAX_ATTACHMENT_BYTES / 1024)} KB.`);
      return;
    }
    const leadId = selectedLead.id;
    const reader = new FileReader();
    reader.onerror = () => alert(`Could not read "${file.name}".`);
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const newAttach: Attachment = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: `${Math.round(file.size / 1024)} KB`,
        uploadedAt: localISO(new Date()),
        uploadedBy: user?.name || 'User',
        dataUrl: base64
      };

      const updatedLeads = crmService.getLeads().map(l => {
        if (l.id === leadId) {
          return {
            ...l,
            attachments: [...(l.attachments || []), newAttach],
            lastUpdated: new Date().toISOString(),
            timeline: [...(l.timeline || []), {
              id: Math.random().toString(36).substr(2, 9),
              timestamp: new Date().toISOString(),
              type: 'Comment' as const,
              user: user?.name || 'User',
              title: 'File Attached',
              description: `Attached file: ${file.name}`
            }]
          };
        }
        return l;
      });

      crmService.saveLeads(updatedLeads);
      const refreshed = updatedLeads.find(l => l.id === leadId);
      setSelectedLead(refreshed || null);
      onLeadsUpdated();
    };
    reader.readAsDataURL(file);
  };

  // WhatsApp Action Triggers
  const handleWhatsappActionClick = () => {
    if (!selectedLead) return;
    const salesPerson = selectedLead.assignedSalespersonName || user?.name || 'Sales Person';
    const initialText = `Hello Mr. ${selectedLead.customerName} this is ${salesPerson} from Elsewedy Industrial Development, I has received your request regarding your interest, please let me know how can I help you.\nyou can call back me on this number any time.\nyours \n${salesPerson}`;
    setWhatsappTemplateText(initialText);
    setShowWhatsappTemplateModal(true);
  };

  const handleWhatsappSend = () => {
    if (!selectedLead) return;

    const cleanPhone = waNumber(selectedLead.phoneNumber);
    if (!cleanPhone) {
      alert('This lead has no valid phone number for WhatsApp.');
      return;
    }

    // Open WhatsApp Web (digits only in the path; the text is URL-encoded)
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappTemplateText)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');

    // Create timeline log event
    const timelineEvent: TimelineEvent = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'WhatsApp' as const,
      user: user?.name || 'Agent',
      title: 'WhatsApp Contact',
      description: whatsappTemplateText
    };

    // Update Lead status if New or Assigned
    let nextStatus = selectedLead.status;
    if (selectedLead.status === 'Assigned' || selectedLead.status === 'New') {
      nextStatus = 'Contacted';
    }

    const updatedLeads = crmService.getLeads().map(l => {
      if (l.id === selectedLead.id) {
        return {
          ...l,
          status: nextStatus,
          lastUpdated: new Date().toISOString(),
          timeline: [...(l.timeline || []), timelineEvent]
        };
      }
      return l;
    });

    // Save Activities
    const acts = crmService.getActivities();
    acts.unshift({
      id: 'act_' + Math.random().toString(36).substr(2, 9),
      salespersonId: String(user?.id || selectedLead.assignedSalespersonId || ''),
      salespersonName: user?.name || selectedLead.assignedSalespersonName || '—',
      type: 'WhatsApp' as any,
      leadId: selectedLead.id,
      leadName: selectedLead.customerName,
      timestamp: new Date().toISOString(),
      notes: whatsappTemplateText
    });
    crmService.saveActivities(acts);

    crmService.saveLeads(updatedLeads);
    setShowWhatsappTemplateModal(false);

    const refreshed = updatedLeads.find(l => l.id === selectedLead.id);
    setSelectedLead(refreshed || null);
    onLeadsUpdated();
  };

  // Email Action Triggers
  const handleEmailActionClick = () => {
    if (!selectedLead) return;
    const salesPerson = selectedLead.assignedSalespersonName || user?.name || 'Sales Person';
    const initialText = `Dear Mr./Ms. ${selectedLead.customerName},\n\nThank you for your interest in Elsewedy Industrial Development.\n\nWe have received your inquiry regarding our industrial projects, and we are pleased to assist you in finding the perfect land size and location for your business operations.\n\nCould you please let us know when would be a suitable time for a brief call to discuss your specifications in more detail? Alternatively, you can reach me directly on my contact number.\n\nYours sincerely,\n\n${salesPerson}\nElsewedy Industrial Development`;
    setEmailTemplateText(initialText);
    setShowEmailTemplateModal(true);
  };

  const handleEmailSend = () => {
    if (!selectedLead) return;

    // Generate .eml file content and download
    // Header values must be single-line (blocks CRLF header injection from stored data)
    const toAddr = String(selectedLead.email || '').replace(/[\r\n]+/g, ' ').trim();
    const emlContent = [
      `To: ${toAddr}`,
      `Subject: Inquiry - Elsewedy Industrial Development`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      emailTemplateText
    ].join('\r\n');

    const blob = new Blob([emlContent], { type: 'message/rfc822' });
    const link = document.createElement('a');
    const emlUrl = URL.createObjectURL(blob);
    link.href = emlUrl;
    link.download = `Email_To_${String(selectedLead.customerName || 'lead').replace(/[^\w\u0600-\u06FF-]+/g, '_')}.eml`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(emlUrl), 10000);

    // Create timeline log event
    const timelineEvent: TimelineEvent = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'Email' as const,
      user: user?.name || 'Agent',
      title: 'Email Sent',
      description: emailTemplateText
    };

    // Update Lead status if New or Assigned
    let nextStatus = selectedLead.status;
    if (selectedLead.status === 'Assigned' || selectedLead.status === 'New') {
      nextStatus = 'Contacted';
    }

    const updatedLeads = crmService.getLeads().map(l => {
      if (l.id === selectedLead.id) {
        return {
          ...l,
          status: nextStatus,
          lastUpdated: new Date().toISOString(),
          timeline: [...(l.timeline || []), timelineEvent]
        };
      }
      return l;
    });

    // Save Activities
    const acts = crmService.getActivities();
    acts.unshift({
      id: 'act_' + Math.random().toString(36).substr(2, 9),
      salespersonId: String(user?.id || selectedLead.assignedSalespersonId || ''),
      salespersonName: user?.name || selectedLead.assignedSalespersonName || '—',
      type: 'Email' as any,
      leadId: selectedLead.id,
      leadName: selectedLead.customerName,
      timestamp: new Date().toISOString(),
      notes: emailTemplateText
    });
    crmService.saveActivities(acts);

    crmService.saveLeads(updatedLeads);
    setShowEmailTemplateModal(false);

    const refreshed = updatedLeads.find(l => l.id === selectedLead.id);
    setSelectedLead(refreshed || null);
    onLeadsUpdated();
  };

  // Direct Status Transition on Detail card
  const handleDirectStatusChange = (status: LeadStatus) => {
    if (!selectedLead) return;
    if (status === selectedLead.status) return;
    if (status === 'Lost') {
      setShowLostModal(true);
      return;
    }
    if (status === 'Assigned' && !selectedLead.assignedSalespersonId && !selectedLead.assignedSalespersonName) {
      alert('Assign a salesperson first; a lead cannot be "Assigned" without one.');
      return;
    }
    if (TERMINAL_STATUSES.includes(selectedLead.status) && !window.confirm(`This lead is ${selectedLead.status}. Re-open it as ${status}?`)) return;
    if (status === 'Won' && !window.confirm('Mark this lead as Won?')) return;
    // Leaving Lost clears the stale lost reason
    const patch: Partial<Lead> = selectedLead.status === 'Lost' ? { status, lostReason: undefined, lostComment: undefined } : { status };
    const updated = crmService.updateLead(selectedLead.id, patch, user?.name || 'Agent');
    setSelectedLead(updated);
    onLeadsUpdated();
  };

  // Direct Priority Change
  const handlePriorityChange = (priority: LeadPriority) => {
    if (!selectedLead) return;
    const updated = crmService.updateLead(selectedLead.id, { priority }, user?.name || 'Agent');
    setSelectedLead(updated);
    onLeadsUpdated();
  };

  // Direct Delete Lead (Admin Only)
  const handleDeleteLead = (id: string) => {
    if (!isAdmin) {
      alert("Unauthorized: Only Administrators can delete leads.");
      return;
    }
    setDeleteConfirmLeadId(id);
  };

  const confirmDeleteLead = () => {
    if (!deleteConfirmLeadId) return;
    const id = deleteConfirmLeadId;
    const remaining = crmService.getLeads().filter(l => l.id !== id);
    crmService.saveLeads(remaining);
    setSelectedLead(null);
    setSelectedLeadIds(selectedLeadIds.filter(itemId => itemId !== id));
    setDeleteConfirmLeadId(null);
    onLeadsUpdated();
  };

  // Duplicate Check logic: Search if phone exists in other records
  const duplicateWarnings = useMemo(() => {
    if (!selectedLead) return [];
    const phone = selectedLead.phoneNumber ? normalizePhone(selectedLead.phoneNumber) : '';
    if (!phone) return []; // blank numbers are not duplicates of each other
    return leads.filter(l => l.id !== selectedLead.id && l.phoneNumber && normalizePhone(l.phoneNumber) === phone && l.status !== 'Duplicate');
  }, [selectedLead, leads]);

  // Private notes are for managers/operations (and their author) only
  const canSeePrivate = (author: string) => isAdmin || author === user?.name || !['Sales Rep', 'Read Only'].includes(user?.role || currentRole);
  const visibleComments = (selectedLead?.comments || []).filter(c => !c.isPrivate || canSeePrivate(c.user));

  // Export to CSV helper
  const exportToCSV = () => {
    const headers = ['Lead ID', 'Date', 'Source', 'Project', 'Customer', 'Phone', 'Email', 'Company', 'Size (sqm)', 'SLA Status', 'Priority', 'Status', 'Salesperson', 'SLA Deadline', 'Lost Reason', 'Lost Comment'];
    const rows = filteredLeads.map(l => [
      l.id,
      l.date,
      l.source,
      l.project,
      l.customerName,
      l.phoneNumber,
      l.email,
      l.companyName || '',
      l.requiredSize,
      getSlaStatus(l).isViolated ? 'Violated' : (l.slaDeadline ? 'Within SLA' : 'No SLA'),
      l.priority,
      l.status,
      l.assignedSalespersonName || 'Unassigned',
      l.slaDeadline || '',
      l.lostReason || '',
      l.lostComment || ''
    ]);

    const formatCSVRow = (arr: any[]) => arr.map(csvCell).join(',');

    const csvContent = [headers.map(csvCell).join(','), ...rows.map(formatCSVRow)].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `CRM_Leads_Report_${localISO(new Date())}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Calendar days for the selected month
  const calendarDays = useMemo(() => {
    const days: { day: number | null; dateStr: string | null }[] = [];
    const { y: year, m: month } = calMonth;
    const firstDayIndex = new Date(year, month, 1).getDay(); // Sunday=0
    const totalDays = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDayIndex; i++) days.push({ day: null, dateStr: null });
    for (let d = 1; d <= totalDays; d++) days.push({ day: d, dateStr: `${year}-${pad2(month + 1)}-${pad2(d)}` });
    return days;
  }, [calMonth]);

  const shiftCalMonth = (delta: number) => setCalMonth(c => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  // Escape closes the top-most open dialog / panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showSourceEmailModal) setShowSourceEmailModal(false);
      else if (deleteConfirmLeadId) setDeleteConfirmLeadId(null);
      else if (deleteConfirmBulk) setDeleteConfirmBulk(false);
      else if (showLostModal) setShowLostModal(false);
      else if (showWhatsappTemplateModal) setShowWhatsappTemplateModal(false);
      else if (showEmailTemplateModal) setShowEmailTemplateModal(false);
      else if (showInteractionModal) setShowInteractionModal(null);
      else if (showMergeModal) setShowMergeModal(false);
      else if (showAssignModal) setShowAssignModal(false);
      else if (showCreateModal) setShowCreateModal(false);
      else if (selectedLead) setSelectedLead(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSourceEmailModal, deleteConfirmLeadId, deleteConfirmBulk, showLostModal, showWhatsappTemplateModal, showEmailTemplateModal, showInteractionModal, showMergeModal, showAssignModal, showCreateModal, selectedLead]);

  return (
    <div className="space-y-6" id="crm-leads-root">
      
      {/* Search and Action Bar */}
      <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center">
        
        {/* Navigation View switcher and Title */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full xl:w-auto">
          <div>
            <h3 className="text-xl font-bold text-brand-black flex items-center gap-2">
              <span>Sales Leads Pipeline</span>
              <span className="text-xs bg-brand-red/10 text-brand-red font-bold px-2 py-0.5 rounded-full">
                {filteredLeads.length} Records
              </span>
            </h3>
          </div>

          <div className="flex bg-brand-gray/10 p-1 rounded-xl items-center self-stretch sm:self-auto">
            <button
              onClick={() => setViewMode('list')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-white text-brand-black shadow-sm' : 'text-brand-gray/80 hover:text-brand-black'}`}
            >
              <List size={14} />
              <span>Grid View</span>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'kanban' ? 'bg-white text-brand-black shadow-sm' : 'text-brand-gray/80 hover:text-brand-black'}`}
            >
              <Kanban size={14} />
              <span>Kanban Board</span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'calendar' ? 'bg-white text-brand-black shadow-sm' : 'text-brand-gray/80 hover:text-brand-black'}`}
            >
              <Calendar size={14} />
              <span>CRM Calendar</span>
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-end">
          <select
            value={savedView}
            onChange={(e) => handleSavedViewChange(e.target.value)}
            className="bg-white border border-brand-gray/25 rounded-xl px-3 py-2 text-xs font-semibold text-brand-black focus:outline-none focus:ring-1 focus:ring-brand-red shadow-sm"
          >
            <option value="All">Saved View: All Leads</option>
            <option value="My Open Leads">My Active Leads</option>
            <option value="SLA Violated">SLA Violated Leads</option>
            <option value="SLA Within Limit">SLA Within Limit</option>
            <option value="Unassigned">Unrouted Queues</option>
            <option value="SLA At Risk">SLA At Risk (last 25% of window)</option>
          </select>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${showFilters ? 'bg-brand-black text-white border-brand-black' : 'bg-white text-brand-gray border-brand-gray/25 hover:bg-brand-gray/5'}`}
          >
            <Filter size={14} />
            <span>Filters</span>
          </button>

          <ColumnSelector 
            columns={columnsList}
            visibleColumns={visibleColumns}
            onChange={setVisibleColumns}
          />

          {isAdmin && (
            <>
              <button
                onClick={exportToCSV}
                className="bg-white hover:bg-brand-gray/5 border border-brand-gray/25 text-brand-black px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
              >
                <Download size={14} />
                <span>Export</span>
              </button>
              <button
                onClick={handlePurgeAllDatabaseLeads}
                className="bg-red-50 hover:bg-red-100 text-brand-red border border-red-200 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                title="Permanently wipe all leads from database and server"
              >
                <Trash2 size={13} />
                <span>Purge Database</span>
              </button>
            </>
          )}

          {currentRole !== 'Read Only' && (
          <button
            onClick={() => setShowMergeModal(true)}
            className="bg-brand-gray/10 hover:bg-brand-gray/20 text-brand-black px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
            title="Merge Duplicate Lead Records"
          >
            <RefreshCw size={13} />
            <span>Merge Duplicates</span>
          </button>
          )}

          {currentRole !== 'Read Only' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-brand-red hover:bg-brand-red-dark text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md hover:scale-[1.01] transition-all"
            >
              <Plus size={14} />
              <span>Inbound Lead</span>
            </button>
          )}
        </div>
      </div>

      {/* Advanced Filters Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white border border-brand-gray/15 p-5 rounded-2xl shadow-sm overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Funnel Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none"
                >
                  <option value="All">All Statuses</option>
                  <option value="New">New / Operations Review</option>
                  <option value="Assigned">Assigned to Rep</option>
                  <option value="Contacted">Contacted</option>
                  <option value="Follow Up">In Follow Up</option>
                  <option value="Meeting Scheduled">Meeting Scheduled</option>
                  <option value="Negotiation">Negotiation</option>
                  <option value="Quotation Sent">Quotation Sent</option>
                  <option value="Won">Closed Won</option>
                  <option value="Lost">Closed Lost</option>
                  <option value="Waiting Customer">Waiting Customer</option>
                  <option value="No Answer">No Answer</option>
                  <option value="Not Interested">Not Interested</option>
                  <option value="Invalid">Invalid</option>
                  <option value="Closed">Closed</option>
                  <option value="Duplicate">Duplicate Record</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Industrial Project</label>
                <select
                  value={filterProject}
                  onChange={(e) => setFilterProject(e.target.value)}
                  className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none"
                >
                  <option value="All">All Projects</option>
                  {projects.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Lead Priority</label>
                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none"
                >
                  <option value="All">All Priorities</option>
                  <option value="Urgent">Urgent (2 Hrs)</option>
                  <option value="High">High (8 Hrs)</option>
                  <option value="Normal">Normal (24 Hrs)</option>
                  <option value="Low">Low (48 Hrs)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Source Channel</label>
                <select
                  value={filterSource}
                  onChange={(e) => setFilterSource(e.target.value)}
                  className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none"
                >
                  <option value="All">All Sources</option>
                  {sources.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Account Manager</label>
                <select
                  value={filterSalesperson}
                  onChange={(e) => setFilterSalesperson(e.target.value)}
                  className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none"
                >
                  <option value="All">All Agents</option>
                  <option value="Unassigned">Unassigned Leads</option>
                  {salespeople.map((s: any) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-between items-center mt-4 pt-4 border-t border-brand-gray/10">
              <span className="text-xs text-brand-gray">Active Filters Yield: <strong>{filteredLeads.length}</strong> / {leads.length} records</span>
              <button
                onClick={resetFilters}
                className="text-brand-red text-xs font-bold hover:underline"
              >
                Clear All Parameters
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>



      {/* Bulk Action Controls Bar */}
      {selectedLeadIds.length > 0 && (
        <div className="bg-brand-black text-white p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4 shadow-md">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-brand-red rounded-full animate-ping" />
            <span className="text-xs font-bold">{selectedLeadIds.length} Leads selected for Bulk Action</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:bg-white focus:text-brand-black"
            >
              <option value="" className="text-brand-black">Select Action...</option>
              {currentRole !== 'Read Only' && currentRole !== 'Sales Rep' && (
                <option value="assign" className="text-brand-black">Bulk Assign Account Manager</option>
              )}
              {currentRole !== 'Read Only' && (
                <option value="won" className="text-brand-black">Bulk Mark as Won</option>
              )}
              {isAdmin && (
                <option value="delete" className="text-brand-black">Bulk Delete Records</option>
              )}
            </select>
            <button
              onClick={executeBulkAction}
              disabled={!bulkAction}
              className="bg-brand-red hover:bg-brand-red-dark disabled:opacity-50 text-white text-xs font-extrabold px-4 py-2 rounded-xl shadow transition-all"
            >
              Execute
            </button>
            <button
              onClick={() => setSelectedLeadIds([])}
              className="text-xs text-white/60 hover:text-white ml-2 font-semibold"
            >
              Clear Choice
            </button>
          </div>
        </div>
      )}

      {/* Search Bar Input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-gray" size={16} />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Global Search across Leads (by name, phone, email, project, CRM Id, salesperson, comments...)"
          className="w-full pl-10 pr-4 py-3 bg-white border border-brand-gray/20 rounded-2xl focus:outline-none focus:ring-1 focus:ring-brand-red focus:border-brand-red shadow-sm text-xs font-medium"
        />
      </div>

      {/* -------------------- 1. LIST VIEW -------------------- */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-2xl border border-brand-gray/20 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-gray/5 border-b border-brand-gray/15 text-brand-gray text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-4 px-4 w-10">
                    <button onClick={handleSelectAll} aria-label="Select all leads" className="focus:outline-none">
                      {selectedLeadIds.length === filteredLeads.length && filteredLeads.length > 0 ? (
                        <CheckSquare size={16} className="text-brand-red" />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                  </th>
                  {columns.id && <th className="py-4 px-3 cursor-pointer" onClick={() => handleSort('id')}>Lead ID</th>}
                  {columns.date && <th className="py-4 px-3 cursor-pointer" onClick={() => handleSort('date')}>Date</th>}
                  {columns.customer && <th className="py-4 px-3 cursor-pointer" onClick={() => handleSort('customerName')}>Customer</th>}
                  {columns.project && <th className="py-4 px-3 cursor-pointer" onClick={() => handleSort('project')}>Project</th>}
                  {columns.size && <th className="py-4 px-3 cursor-pointer text-right" onClick={() => handleSort('requiredSize')}>Size</th>}
                  {columns.slaStatus && <th className="py-4 px-3 cursor-pointer" onClick={() => handleSort('slaDeadline')}>SLA Status</th>}
                  {columns.priority && <th className="py-4 px-3 cursor-pointer" onClick={() => handleSort('priority')}>Priority</th>}
                  {columns.status && <th className="py-4 px-3 cursor-pointer" onClick={() => handleSort('status')}>Funnel Status</th>}
                  {columns.assigned && <th className="py-4 px-3 cursor-pointer" onClick={() => handleSort('assignedSalespersonName')}>Assigned Agent</th>}
                  <th className="py-4 px-4 text-right w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-gray/10 text-xs font-medium text-brand-black">
                {filteredLeads.length > 0 ? (
                  filteredLeads.map((l) => {
                    const isSelected = selectedLeadIds.includes(l.id);
                    
                    // Priority tag colors
                    let pColor = 'bg-brand-gray/10 text-brand-gray';
                    if (l.priority === 'Urgent') pColor = 'bg-rose-100 text-rose-700 font-bold';
                    else if (l.priority === 'High') pColor = 'bg-orange-100 text-orange-700';
                    else if (l.priority === 'Normal') pColor = 'bg-blue-100 text-blue-700';

                    // Status pill color
                    let sColor = 'bg-brand-gray/10 text-brand-gray';
                    if (l.status === 'New') sColor = 'bg-yellow-50 text-yellow-700 border border-yellow-200';
                    else if (l.status === 'Assigned') sColor = 'bg-purple-50 text-purple-700 border border-purple-200';
                    else if (l.status === 'Contacted') sColor = 'bg-indigo-50 text-indigo-700 border border-indigo-200';
                    else if (l.status === 'Won') sColor = 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold';
                    else if (l.status === 'Lost') sColor = 'bg-rose-100 text-rose-800 border border-rose-300';
                    else if (['Meeting Scheduled', 'Negotiation', 'Quotation Sent'].includes(l.status)) sColor = 'bg-blue-50 text-blue-700 border border-blue-200';

                    return (
                      <tr key={l.id} className={`hover:bg-brand-gray/5 transition-all ${isSelected ? 'bg-brand-red/5' : ''}`}>
                        <td className="py-3.5 px-4">
                          <button onClick={() => handleSelectLead(l.id)} aria-label={`Select lead ${l.id}`} className="focus:outline-none">
                            {isSelected ? (
                              <CheckSquare size={16} className="text-brand-red" />
                            ) : (
                              <Square size={16} className="text-brand-gray/60" />
                            )}
                          </button>
                        </td>
                        {columns.id && (
                          <td className="py-3.5 px-3">
                            <span className="font-mono font-bold text-brand-black hover:underline cursor-pointer" onClick={() => setSelectedLead(l)}>
                              {l.id}
                            </span>
                          </td>
                        )}
                        {columns.date && <td className="py-3.5 px-3 text-brand-gray whitespace-nowrap font-mono whitespace-nowrap">{formatLeadDateTime(l.date)}</td>}
                        {columns.customer && (
                          <td className="py-3.5 px-3">
                            <div>
                              <p className="font-bold text-brand-black">{l.customerName}</p>
                              <p className="text-[10px] text-brand-gray/80 font-mono mt-0.5">{l.phoneNumber}</p>
                            </div>
                          </td>
                        )}
                        {columns.project && <td className="py-3.5 px-3 text-brand-gray whitespace-nowrap">{l.project}</td>}
                        {columns.size && <td className="py-3.5 px-3 text-right font-mono whitespace-nowrap">{fmtSize(l.requiredSize)}</td>}
                        {columns.slaStatus && (
                          <td className="py-3.5 px-3">
                            {l.slaDeadline ? (
                              <span className={`whitespace-nowrap px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                getSlaStatus(l).isViolated ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              }`}>
                                {getSlaStatus(l).isViolated ? `Violated (${getSlaStatus(l).remainingText})` : `${getSlaStatus(l).remainingText}`}
                              </span>
                            ) : (
                              <span className="text-brand-gray/50 text-[10px]">No SLA Set</span>
                            )}
                          </td>
                        )}
                        {columns.priority && (
                          <td className="py-3.5 px-3">
                            <span className={`whitespace-nowrap px-2.5 py-1 rounded-full text-[10px] font-semibold ${pColor}`}>
                              {l.priority}
                            </span>
                          </td>
                        )}
                        {columns.status && (
                          <td className="py-3.5 px-3">
                            <span className={`whitespace-nowrap px-2.5 py-1 rounded-full text-[10px] font-bold ${sColor}`}>
                              {l.status}
                            </span>
                          </td>
                        )}
                        {columns.assigned && (
                          <td className="py-3.5 px-3 text-brand-gray whitespace-nowrap">
                            {l.assignedSalespersonName ? (
                              <span className="flex items-center gap-1">
                                <UserCheck size={12} className="text-indigo-600" />
                                <span>{l.assignedSalespersonName}</span>
                              </span>
                            ) : (
                              <span className="text-rose-500 font-bold flex items-center gap-1 text-[10px] bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full w-max">
                                <AlertTriangle size={10} />
                                <span>UNROUTED QUEUE</span>
                              </span>
                            )}
                          </td>
                        )}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedLead(l)}
                              className="p-1.5 hover:bg-brand-gray/15 rounded-lg text-brand-black"
                              title="View Lead Details"
                            >
                              <Info size={14} />
                            </button>
                            {currentRole !== 'Read Only' && currentRole !== 'Sales Rep' && (
                              <button
                                onClick={() => {
                                  setSelectedLead(l);
                                  setShowAssignModal(true);
                                }}
                                className="p-1.5 hover:bg-indigo-50 rounded-lg text-indigo-600"
                                title="Route to Salesperson"
                              >
                                <UserPlus size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-brand-gray text-xs">
                      No matching leads in active database queue. Apply filters or register inbound leads.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* -------------------- 2. KANBAN BOARD VIEW -------------------- */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 overflow-x-auto pb-4">
          
          {/* Operations review */}
          <div className="bg-brand-gray/5 border border-brand-gray/20 rounded-2xl p-4 flex flex-col h-[550px] min-w-[250px]">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-extrabold uppercase text-amber-700 tracking-wider">1. Ops Review</span>
              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {filteredLeads.filter(l => l.status === 'New').length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {filteredLeads.filter(l => l.status === 'New').map(l => {
                const slaInfo = getSlaStatus(l);
                const cardClass = slaInfo.isViolated
                  ? "bg-red-50 border-red-300 p-3.5 rounded-xl border hover:border-red-400 cursor-pointer shadow-sm hover:shadow-md transition-all space-y-2.5 relative text-red-950"
                  : "bg-white p-3.5 rounded-xl border border-brand-gray/15 hover:border-brand-red/30 cursor-pointer shadow-sm hover:shadow-md transition-all space-y-2.5 relative";
                
                return (
                  <div 
                    key={l.id} 
                    onClick={() => setSelectedLead(l)}
                    className={cardClass}
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-[10px] font-bold text-brand-red">{l.id}</span>
                      <span className="bg-rose-100 text-rose-700 text-[9px] font-bold px-1.5 py-0.5 rounded">{l.priority}</span>
                    </div>
                    <div>
                      <h5 className="font-bold text-brand-black text-xs leading-snug">{l.customerName}</h5>
                      <p className="text-[10px] text-brand-gray/80 font-semibold">{l.companyName || 'Private Person'}</p>
                    </div>

                    {/* SLA Status display */}
                    {l.slaDeadline && (
                      <div className={`flex items-center gap-1.5 text-[10px] font-bold py-1 px-2 rounded-lg border w-fit ${slaInfo.isViolated ? 'bg-red-100/50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                        <Clock size={11} className={slaInfo.isViolated ? "text-red-600 animate-pulse" : "text-amber-600"} />
                        <span>{slaInfo.isViolated ? `Violated: ${slaInfo.remainingText}` : `${slaInfo.remainingText}`}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-[10px] pt-2 border-t border-brand-gray/10 text-brand-gray font-mono whitespace-nowrap">
                      <span>{fmtSize(l.requiredSize)}</span>
                      <span className={`font-bold ${slaInfo.isViolated ? 'text-rose-600' : 'text-emerald-700'}`}>{slaInfo.text}</span>
                    </div>
                    {/* Click to fast move */}
                    {currentRole !== 'Read Only' && currentRole !== 'Sales Rep' && (
                      <div className="flex justify-end gap-1 pt-1">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLead(l);
                            setShowAssignModal(true);
                          }}
                          className="text-[9px] bg-brand-black text-white px-2 py-1 rounded font-bold hover:scale-105 transition-all"
                        >
                          Route Agent
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Assigned & Contacted */}
          <div className="bg-brand-gray/5 border border-brand-gray/20 rounded-2xl p-4 flex flex-col h-[550px] min-w-[250px]">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-extrabold uppercase text-purple-700 tracking-wider">2. Assigned / Contacted</span>
              <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {filteredLeads.filter(l => ['Assigned', 'Contacted'].includes(l.status)).length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {filteredLeads.filter(l => ['Assigned', 'Contacted'].includes(l.status)).map(l => {
                const slaInfo = getSlaStatus(l);
                const cardClass = slaInfo.isViolated
                  ? "bg-red-50 border-red-300 p-3.5 rounded-xl border hover:border-red-400 cursor-pointer shadow-sm hover:shadow-md transition-all space-y-2.5 relative text-red-950"
                  : "bg-white p-3.5 rounded-xl border border-brand-gray/15 hover:border-indigo-400/35 cursor-pointer shadow-sm hover:shadow-md transition-all space-y-2.5 relative";
                
                return (
                  <div 
                    key={l.id} 
                    onClick={() => setSelectedLead(l)}
                    className={cardClass}
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-[10px] font-bold text-indigo-600">{l.id}</span>
                      <span className="bg-indigo-50 text-indigo-700 text-[9px] px-1.5 py-0.5 rounded font-bold border border-indigo-200">{l.status}</span>
                    </div>
                    <div>
                      <h5 className="font-bold text-brand-black text-xs leading-snug">{l.customerName}</h5>
                      <p className="text-[10px] text-indigo-600 font-bold flex items-center gap-1 mt-0.5">
                        <UserCheck size={10} />
                        <span>{l.assignedSalespersonName}</span>
                      </p>
                    </div>

                    {/* SLA Status display */}
                    {l.slaDeadline && (
                      <div className={`flex items-center gap-1.5 text-[10px] font-bold py-1 px-2 rounded-lg border w-fit ${slaInfo.isViolated ? 'bg-red-100/50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                        <Clock size={11} className={slaInfo.isViolated ? "text-red-600 animate-pulse" : "text-amber-600"} />
                        <span>{slaInfo.isViolated ? `Violated: ${slaInfo.remainingText}` : `${slaInfo.remainingText}`}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-[10px] pt-2 border-t border-brand-gray/10 text-brand-gray font-mono whitespace-nowrap">
                      <span>{fmtSize(l.requiredSize)}</span>
                      <span className={`font-bold ${slaInfo.isViolated ? 'text-rose-600' : 'text-emerald-700'}`}>{slaInfo.text}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Qualified Meeting & Quotations */}
          <div className="bg-brand-gray/5 border border-brand-gray/20 rounded-2xl p-4 flex flex-col h-[550px] min-w-[250px]">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-extrabold uppercase text-blue-700 tracking-wider">3. In Qualification</span>
              <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {filteredLeads.filter(l => ['Follow Up', 'Meeting Scheduled', 'Negotiation', 'Quotation Sent', 'Waiting Customer', 'No Answer'].includes(l.status)).length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {filteredLeads.filter(l => ['Follow Up', 'Meeting Scheduled', 'Negotiation', 'Quotation Sent', 'Waiting Customer', 'No Answer'].includes(l.status)).map(l => {
                const slaInfo = getSlaStatus(l);
                const cardClass = slaInfo.isViolated
                  ? "bg-red-50 border-red-300 p-3.5 rounded-xl border hover:border-red-400 cursor-pointer shadow-sm hover:shadow-md transition-all space-y-2.5 relative text-red-950"
                  : "bg-white p-3.5 rounded-xl border border-brand-gray/15 hover:border-blue-400/35 cursor-pointer shadow-sm hover:shadow-md transition-all space-y-2.5 relative";
                
                return (
                  <div 
                    key={l.id} 
                    onClick={() => setSelectedLead(l)}
                    className={cardClass}
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-[10px] font-bold text-blue-600">{l.id}</span>
                      <span className="bg-blue-50 text-blue-700 text-[9px] px-1.5 py-0.5 rounded font-bold border border-blue-200">{l.status}</span>
                    </div>
                    <div>
                      <h5 className="font-bold text-brand-black text-xs leading-snug">{l.customerName}</h5>
                      <p className="text-[10px] text-brand-gray/80 font-semibold">{l.assignedSalespersonName}</p>
                    </div>

                    {/* SLA Status display */}
                    {l.slaDeadline && (
                      <div className={`flex items-center gap-1.5 text-[10px] font-bold py-1 px-2 rounded-lg border w-fit ${slaInfo.isViolated ? 'bg-red-100/50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                        <Clock size={11} className={slaInfo.isViolated ? "text-red-600 animate-pulse" : "text-amber-600"} />
                        <span>{slaInfo.isViolated ? `Violated: ${slaInfo.remainingText}` : `${slaInfo.remainingText}`}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-[10px] pt-2 border-t border-brand-gray/10 text-brand-gray font-mono whitespace-nowrap">
                      <span>{fmtSize(l.requiredSize)}</span>
                      <span className={`font-bold ${slaInfo.isViolated ? 'text-rose-600' : 'text-emerald-700'}`}>{slaInfo.text}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Won / Lost Closure */}
          <div className="bg-brand-gray/5 border border-brand-gray/20 rounded-2xl p-4 flex flex-col h-[550px] min-w-[250px]">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-extrabold uppercase text-emerald-700 tracking-wider">4. Closed Deals</span>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {filteredLeads.filter(l => ['Won', 'Lost', 'Not Interested', 'Invalid', 'Closed', 'Duplicate'].includes(l.status)).length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {filteredLeads.filter(l => ['Won', 'Lost', 'Not Interested', 'Invalid', 'Closed', 'Duplicate'].includes(l.status)).map(l => {
                const isWon = l.status === 'Won';
                const slaInfo = getSlaStatus(l);
                
                return (
                  <div 
                    key={l.id} 
                    onClick={() => setSelectedLead(l)}
                    className={`p-3.5 rounded-xl border cursor-pointer shadow-sm hover:shadow-md transition-all space-y-2.5 ${isWon ? 'bg-emerald-50/50 border-emerald-200 hover:border-emerald-400' : 'bg-rose-50/50 border-rose-200 hover:border-rose-400'}`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-[10px] font-bold text-brand-black">{l.id}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold border ${isWon ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-rose-100 text-rose-800 border-rose-300'}`}>
                        {l.status}
                      </span>
                    </div>
                    <div>
                      <h5 className="font-bold text-brand-black text-xs leading-snug">{l.customerName}</h5>
                      <p className="text-[10px] text-brand-gray/80 font-semibold">{l.companyName || 'Private Person'}</p>
                    </div>

                    {/* SLA Outcome display */}
                    {l.slaDeadline && (
                      <div className={`flex items-center gap-1.5 text-[10px] font-bold py-1 px-2 rounded-lg border w-fit ${slaInfo.status === 'missed' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                        <Clock size={11} className={slaInfo.status === 'missed' ? "text-red-500" : "text-emerald-500"} />
                        <span>{slaInfo.status === 'missed' ? "SLA Missed" : "SLA Met"}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-[10px] pt-2 border-t border-brand-gray/10 text-brand-gray font-mono whitespace-nowrap">
                      <span>{fmtSize(l.requiredSize)}</span>
                      <span className={`font-bold ${slaInfo.status === 'missed' ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {slaInfo.status === 'missed' ? "SLA Missed" : "SLA Met"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* -------------------- 3. CALENDAR VIEW -------------------- */}
      {viewMode === 'calendar' && (
        <div className="bg-white rounded-2xl border border-brand-gray/20 shadow-sm p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-bold text-brand-black text-sm uppercase tracking-wide">CRM Activity and Followups Calendar</h4>
            <div className="flex items-center gap-1.5">
              <button onClick={() => shiftCalMonth(-1)} aria-label="Previous month" className="px-2 py-1 border border-brand-gray/20 rounded-lg text-xs font-bold hover:bg-brand-gray/5">&lsaquo;</button>
              <span className="text-xs bg-brand-red/10 text-brand-red font-bold px-3 py-1 rounded-full uppercase">{new Date(calMonth.y, calMonth.m, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}</span>
              <button onClick={() => shiftCalMonth(1)} aria-label="Next month" className="px-2 py-1 border border-brand-gray/20 rounded-lg text-xs font-bold hover:bg-brand-gray/5">&rsaquo;</button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-bold text-brand-gray uppercase tracking-widest pb-2 border-b border-brand-gray/10">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          <div className="grid grid-cols-7 gap-2 text-left h-96">
            {calendarDays.map((item, idx) => {
              // Retrieve leads that have follow up actions, creation or expected closed on this date
              const dayLeads = item.dateStr ? filteredLeads.filter(l => dayOf(l.date) === item.dateStr || l.nextFollowUpDate === item.dateStr || (l.timeline || []).some(t => dayOf(t.timestamp) === item.dateStr)) : [];
              
              return (
                <div 
                  key={idx} 
                  className={`border border-brand-gray/10 rounded-xl p-2 h-16 flex flex-col justify-between overflow-hidden relative group transition-all hover:bg-brand-red/5 ${!item.day ? 'bg-brand-gray/5 opacity-50' : 'bg-white'}`}
                >
                  <span className="text-xs font-bold text-brand-gray group-hover:text-brand-black">{item.day}</span>
                  {dayLeads.length > 0 && (
                    <div className="space-y-0.5 max-h-8 overflow-hidden">
                      {dayLeads.slice(0, 2).map((dl, lIdx) => (
                        <div 
                          key={`${dl.id}-${idx}-${lIdx}`}
                          onClick={() => setSelectedLead(dl)}
                          className="bg-brand-red text-white text-[8px] font-bold px-1 py-0.5 rounded truncate cursor-pointer hover:scale-102 transition-all block"
                          title={`${dl.customerName} - ${dl.project}`}
                        >
                          {(dl.customerName || '—').split(' ')[0]}
                        </div>
                      ))}
                      {dayLeads.length > 2 && (
                        <span className="text-[8px] font-bold text-brand-gray/70">+{dayLeads.length - 2} more</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* -------------------- INBOUND CREATION MODAL -------------------- */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-brand-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-brand-gray/20 rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-5 border-b border-brand-gray/15 flex justify-between items-center bg-brand-black text-white">
              <h4 className="font-bold text-sm uppercase tracking-wide">Register Inbound CRM Lead</h4>
              <button onClick={() => setShowCreateModal(false)} className="text-white/60 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Customer Name *</label>
                  <input
                    type="text"
                    required
                    value={newLeadForm.customerName}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, customerName: e.target.value })}
                    placeholder="e.g., صاحب شركة / اسلام محمد سماني"
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Mobile Number *</label>
                  <input
                    type="text"
                    required
                    value={newLeadForm.phoneNumber}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, phoneNumber: e.target.value })}
                    placeholder="e.g., 01118485856"
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={newLeadForm.email}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
                    placeholder="e.g., eslam.samany@stefner.com"
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Company Name</label>
                  <input
                    type="text"
                    value={newLeadForm.companyName}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, companyName: e.target.value })}
                    placeholder="e.g., ستيفنر للحديد"
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Target Project</label>
                  <select
                    value={newLeadForm.project}
                    required
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, project: e.target.value })}
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none"
                  >
                    <option value="">Select project...</option>
                    {(() => {
                      // Configured canonical projects first, else the standard list; plus any project already used by a lead
                      const configured = crmService.getQueueSettings()?.canonicalProjects;
                      const base = configured && configured.length > 0 ? configured : ['Industria East', 'Industria West', 'Industria Sadat', 'Industria Sokhna'];
                      return Array.from(new Set([...base, ...projects])).map(p => <option key={p} value={p}>{p}</option>);
                    })()}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Size Required (sqm)</label>
                  <input
                    type="number"
                    value={newLeadForm.requiredSize}
                    min={0}
                    placeholder="optional"
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, requiredSize: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none"
                  />
                </div>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Lead Channel Source</label>
                  <select
                    value={newLeadForm.source}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, source: e.target.value })}
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none"
                  >
                    <option value="Website">Website</option>
                    <option value="Email">Email Server</option>
                    <option value="Call Center">Call Center</option>
                    <option value="Manual Entry">Manual Operator Entry</option>
                    <option value="WhatsApp">WhatsApp Inbound</option>
                    <option value="Facebook">Facebook Ads</option>
                    <option value="LinkedIn">LinkedIn Inbound</option>
                    <option value="Brokers">Broker Network</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Priority Alignment</label>
                  <select
                    value={newLeadForm.priority}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, priority: e.target.value as LeadPriority })}
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none"
                  >
                    <option value="Urgent">Urgent (2 Working Hours)</option>
                    <option value="High">High (8 Working Hours)</option>
                    <option value="Normal">Normal (24 Working Hours)</option>
                    <option value="Low">Low (48 Working Hours)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Inquiry Description Comments</label>
                <textarea
                  value={newLeadForm.description}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, description: e.target.value })}
                  rows={3}
                  placeholder="Insert any detailed comment or description..."
                  className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl p-3 focus:outline-none"
                />
              </div>

              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex gap-3 text-yellow-800">
                <Info size={16} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  <strong>Automatic Duplicate Detection:</strong> Phone number is used as the unique record key. If this mobile exists in Contacts, the lead is appended to that contact history automatically.
                </p>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-brand-gray/10">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="bg-brand-gray/10 hover:bg-brand-gray/20 text-brand-black px-4 py-2 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-brand-red hover:bg-brand-red-dark text-white px-5 py-2 rounded-xl font-bold shadow"
                >
                  Confirm Lead Intake
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* -------------------- ROUTING ASSIGNMENT MODAL -------------------- */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-brand-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-brand-gray/20 rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
          >
            <div className="p-5 border-b border-brand-gray/15 flex justify-between items-center bg-brand-black text-white">
              <h4 className="font-bold text-sm uppercase tracking-wide">Assign / Reassign Salesperson</h4>
              <button onClick={() => setShowAssignModal(false)} className="text-white/60 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-brand-gray">Select an account manager to route the selected CRM Lead(s).</p>
              
              <div>
                <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Select Agent</label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2.5 text-xs focus:outline-none"
                >
                  <option value="">Select salesperson...</option>
                  {salespeople.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.activeLeads} active leads / {s.leave ? 'On Leave' : 'Online'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-4">
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="bg-brand-gray/10 hover:bg-brand-gray/20 text-brand-black px-4 py-2 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignSalesperson}
                  disabled={!assigneeId}
                  className="bg-brand-red hover:bg-brand-red-dark disabled:opacity-50 text-white px-5 py-2 rounded-xl font-bold shadow"
                >
                  Assign Agent
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* -------------------- MERGE RECORD MODAL -------------------- */}
      {showMergeModal && (
        <div className="fixed inset-0 bg-brand-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-brand-gray/20 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden"
          >
            <div className="p-5 border-b border-brand-gray/15 flex justify-between items-center bg-brand-black text-white">
              <h4 className="font-bold text-sm uppercase tracking-wide">Merge Duplicate CRM Leads</h4>
              <button onClick={() => setShowMergeModal(false)} className="text-white/60 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-brand-gray">Combine the timeline and specifications of two duplicate lead records. The duplicate record will be marked closed, and the primary record updated.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Primary Record ID</label>
                  <select
                    value={primaryLeadMergeId}
                    onChange={(e) => setPrimaryLeadMergeId(e.target.value)}
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  >
                    <option value="">Select primary...</option>
                    {leads.filter(l => l.status !== 'Duplicate').map(l => (
                      <option key={l.id} value={l.id}>{l.id} - {l.customerName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Duplicate Record ID</label>
                  <select
                    value={duplicateLeadMergeId}
                    onChange={(e) => setDuplicateLeadMergeId(e.target.value)}
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  >
                    <option value="">Select duplicate...</option>
                    {leads.filter(l => l.id !== primaryLeadMergeId).map(l => (
                      <option key={l.id} value={l.id}>{l.id} - {l.customerName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-between items-center gap-2.5 pt-4 border-t border-brand-gray/10">
                {isAdmin ? (
                  <button
                    onClick={handleAutoPurgeDuplicates}
                    className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-2 rounded-xl font-bold text-xs shadow flex items-center justify-center gap-1.5"
                    title="Automatically scan and delete duplicate lead records by phone/email"
                  >
                    <RefreshCw size={13} className="animate-spin-slow" />
                    <span>Auto-Purge All Duplicates</span>
                  </button>
                ) : <div />}
                <div className="flex justify-end gap-2.5 w-full sm:w-auto">
                  <button
                    onClick={() => setShowMergeModal(false)}
                    className="bg-brand-gray/10 hover:bg-brand-gray/20 text-brand-black px-4 py-2 rounded-xl font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleMergeDuplicate}
                    disabled={!primaryLeadMergeId || !duplicateLeadMergeId}
                    className="bg-brand-red hover:bg-brand-red-dark disabled:opacity-50 text-white px-5 py-2 rounded-xl font-bold shadow"
                  >
                    Confirm Record Merge
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* -------------------- DETAIL OVERLAY PANEL -------------------- */}
      <AnimatePresence>
        {selectedLead && !showAssignModal && (
          <>
            {/* Backdrop for clicking outside */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-brand-black/40 backdrop-blur-xs z-30"
              onClick={() => setSelectedLead(null)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl z-40 border-l border-brand-gray/20 flex flex-col h-full overflow-hidden"
            >
            
            {/* Header */}
            <div className="p-5 border-b border-brand-gray/15 bg-brand-black text-white flex justify-between items-center">
              <div>
                <span className="font-mono text-xs font-bold text-brand-red">{selectedLead.id}</span>
                <h4 className="font-bold text-base leading-snug mt-0.5">{selectedLead.customerName}</h4>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    onClick={() => handleDeleteLead(selectedLead.id)}
                    className="p-1.5 hover:bg-rose-600/30 text-rose-400 hover:text-rose-200 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold mr-2"
                    title="Delete Sales Lead"
                  >
                    <Trash2 size={16} />
                    <span>Delete</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedLead(null)}
                  className="p-1.5 hover:bg-white/10 rounded-lg text-white"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Inner Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              
              {/* SLA / Priority strip */}
              {(() => {
                const slaInfo = getSlaStatus(selectedLead);
                const stripBgClass = slaInfo.isViolated 
                  ? "bg-red-50 border-red-200 text-red-950" 
                  : "bg-brand-gray/5 border-brand-gray/15 text-brand-black";
                return (
                  <div className={`border rounded-xl p-4 space-y-3 transition-all ${stripBgClass}`}>
                    <div className="flex justify-between items-center flex-wrap gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">Priority:</span>
                        {currentRole !== 'Read Only' ? (
                          <select
                            value={selectedLead.priority}
                            onChange={(e) => handlePriorityChange(e.target.value as LeadPriority)}
                            className="bg-rose-100 text-rose-700 text-[10px] font-bold px-2.5 py-1 rounded-xl border border-rose-300 focus:outline-none cursor-pointer"
                          >
                            <option value="Low">Low</option>
                            <option value="Normal">Normal</option>
                            <option value="High">High</option>
                            <option value="Urgent">Urgent</option>
                          </select>
                        ) : (
                          <span className="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{selectedLead.priority}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">SLA Status:</span>
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-extrabold border ${
                          slaInfo.status === 'violated' || slaInfo.status === 'missed'
                            ? 'bg-red-200/60 text-red-800 border-red-300 animate-pulse'
                            : slaInfo.status === 'met'
                            ? 'bg-emerald-200/60 text-emerald-800 border-emerald-300'
                            : 'bg-amber-100 text-amber-800 border-amber-200'
                        }`}>
                          {slaInfo.text} ({slaInfo.remainingText})
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2.5 border-t border-current/10 text-[11px]">
                      <div>
                        <span className="font-extrabold uppercase tracking-wider text-[9px] block opacity-70 mb-0.5">Lead Registered:</span>
                        <span className="font-mono font-semibold">{formatLeadDateTime(selectedLead.date)}</span>
                      </div>
                      <div>
                        <span className="font-extrabold uppercase tracking-wider text-[9px] block opacity-70 mb-0.5">SLA Deadline Date & Time:</span>
                        <span className="font-mono font-semibold">
                          {selectedLead.slaDeadline ? formatLeadDateTime(selectedLead.slaDeadline) : 'Pending'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Duplicate Warnings */}
              {duplicateWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex flex-col gap-2 text-amber-800">
                  <div className="flex gap-2 items-center">
                    <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
                    <span className="font-bold text-xs">Warning: {duplicateWarnings.length} Potential Duplicate Records Detected!</span>
                  </div>
                  <p className="text-[10px] leading-relaxed">
                    Other lead files exist with the identical phone number ({selectedLead.phoneNumber}). Consider merging these accounts.
                  </p>
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => {
                        setPrimaryLeadMergeId(selectedLead.id);
                        setDuplicateLeadMergeId(duplicateWarnings[0].id);
                        setShowMergeModal(true);
                      }}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1 rounded text-[10px]"
                    >
                      Merge with {duplicateWarnings[0].id}
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Actions Bar */}
              {currentRole !== 'Read Only' && (
                <div className="space-y-2">
                  <span className="text-[10px] font-extrabold text-brand-gray uppercase tracking-wider block mb-2">Communication Actions</span>
                  <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
                    <button
                      onClick={() => setShowInteractionModal('call')}
                      className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 p-2.5 rounded-xl flex flex-col items-center gap-1 font-bold shadow-sm"
                    >
                      <Phone size={16} />
                      <span>Log Call</span>
                    </button>

                    <button
                      onClick={handleEmailActionClick}
                      className="bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 p-2.5 rounded-xl flex flex-col items-center gap-1 font-bold shadow-sm"
                    >
                      <Mail size={16} />
                      <span>Send Mail</span>
                    </button>

                    <button
                      onClick={handleWhatsappActionClick}
                      className="bg-green-50 hover:bg-green-100 border border-green-200 text-green-800 p-2.5 rounded-xl flex flex-col items-center gap-1 font-bold text-center shadow-sm"
                    >
                      <MessageSquare size={16} />
                      <span>WhatsApp</span>
                    </button>

                    <button
                      onClick={() => setShowInteractionModal('meeting')}
                      className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 p-2.5 rounded-xl flex flex-col items-center gap-1 font-bold shadow-sm"
                    >
                      <CalendarDays size={16} />
                      <span>Meeting</span>
                    </button>

                    <button
                      onClick={() => setShowInteractionModal('follow-up')}
                      className="bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-800 p-2.5 rounded-xl flex flex-col items-center gap-1 font-bold shadow-sm"
                    >
                      <Clock size={16} />
                      <span>Follow Up</span>
                    </button>

                    <button
                      onClick={() => setShowInteractionModal('visit')}
                      className="bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 p-2.5 rounded-xl flex flex-col items-center gap-1 font-bold shadow-sm"
                    >
                      <Activity size={16} />
                      <span>Site Visit</span>
                    </button>

                    <button
                      onClick={() => handleAttachmentUploadClick()}
                      className="bg-brand-gray/10 hover:bg-brand-gray/20 text-brand-black p-2.5 rounded-xl flex flex-col items-center gap-1 font-bold shadow-sm"
                    >
                      <Paperclip size={16} />
                      <span>Attach File</span>
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleAttachmentSelected}
                      className="hidden"
                    />
                  </div>
                </div>
              )}

              {/* Status Update flow */}
              {currentRole !== 'Read Only' && (
                <div>
                  <span className="text-[10px] font-extrabold text-brand-gray uppercase tracking-wider block mb-2">Stage Status Progression</span>
                  <div className="flex flex-wrap gap-1.5 bg-brand-gray/5 border border-brand-gray/15 p-2 rounded-xl">
                    {(['New', 'Assigned', 'Contacted', 'Follow Up', 'Meeting Scheduled', 'Negotiation', 'Quotation Sent', 'Won', 'Lost'] as LeadStatus[]).map((st) => (
                      <button
                        key={st}
                        onClick={() => handleDirectStatusChange(st)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${selectedLead.status === st ? 'bg-brand-red border-brand-red text-white' : 'bg-white border-brand-gray/25 text-brand-gray hover:text-brand-black'}`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* CRM Details Grid */}
              <div className="grid grid-cols-2 gap-4 bg-white border border-brand-gray/15 rounded-xl p-4">
                <div>
                  <span className="text-brand-gray text-[10px] font-bold uppercase tracking-wider block mb-0.5">Customer Name</span>
                  <span className="font-extrabold text-brand-black text-xs">{selectedLead.customerName}</span>
                </div>
                <div>
                  <span className="text-brand-gray text-[10px] font-bold uppercase tracking-wider block mb-0.5">Project</span>
                  <span className="font-extrabold text-brand-black text-xs">{selectedLead.project}</span>
                </div>
                <div>
                  <span className="text-brand-gray text-[10px] font-bold uppercase tracking-wider block mb-0.5">Contact Number</span>
                  <span className="font-mono text-brand-black font-bold text-xs">{selectedLead.phoneNumber}</span>
                </div>
                <div>
                  <span className="text-brand-gray text-[10px] font-bold uppercase tracking-wider block mb-0.5">Customer Email</span>
                  <span className="text-brand-black text-xs">{selectedLead.email || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-brand-gray text-[10px] font-bold uppercase tracking-wider block mb-0.5">Corporate Company</span>
                  <span className="text-brand-black text-xs font-bold">{selectedLead.companyName || 'Private Inquiry'}</span>
                </div>
                <div>
                  <span className="text-brand-gray text-[10px] font-bold uppercase tracking-wider block mb-0.5">Target Land Size</span>
                  <span className="font-mono text-brand-black text-xs font-bold">{fmtSize(selectedLead.requiredSize)}</span>
                </div>
                <div>
                  <span className="text-brand-gray text-[10px] font-bold uppercase tracking-wider block mb-0.5">SLA Status</span>
                  <span className={`font-mono text-xs font-extrabold px-2 py-0.5 rounded-md ${getSlaStatus(selectedLead).isViolated ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
                    {getSlaStatus(selectedLead).isViolated ? `VIOLATED: ${getSlaStatus(selectedLead).remainingText}` : `ACTIVE: ${getSlaStatus(selectedLead).remainingText}`}
                  </span>
                </div>
                <div>
                  <span className="text-brand-gray text-[10px] font-bold uppercase tracking-wider block mb-0.5">Inquiry Channel Source</span>
                  <div className="flex flex-col gap-1">
                    <span className="text-brand-black text-xs font-semibold">{selectedLead.source}</span>
                    {selectedLead.emailId && (
                      <button
                        onClick={() => handleViewInboundEmail(selectedLead)}
                        className="text-brand-red hover:underline text-[10px] font-bold flex items-center gap-1.5 w-fit mt-1 text-left"
                      >
                        <Mail size={12} className="inline" />
                        <span>View Ingested Email</span>
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-brand-gray text-[10px] font-bold uppercase tracking-wider block mb-0.5">Account Manager</span>
                  <span className="text-indigo-600 text-xs font-bold flex items-center gap-1">
                    <UserCheck size={12} />
                    {selectedLead.assignedSalespersonName || 'Unassigned Queue'}
                  </span>
                </div>
              </div>

              <CrmPlotRecommendations 
                  plots={plots} 
                  project={selectedLead.project} 
                  requiredSize={selectedLead.requiredSize}
                  onNavigateToInventory={() => setActiveSubTab('plots-inventory')}
              />

              {/* Description Comments */}
              <div>
                <span className="text-[10px] font-extrabold text-brand-gray uppercase tracking-wider block mb-2">Original Inquiry Comments</span>
                <p className="bg-brand-gray/5 border border-brand-gray/15 p-3.5 rounded-xl text-brand-black leading-relaxed">
                  {selectedLead.description || 'No original descriptions loaded.'}
                </p>
              </div>

              {/* Attachments Section */}
              {selectedLead.attachments?.length > 0 && (
                <div>
                  <span className="text-[10px] font-extrabold text-brand-gray uppercase tracking-wider block mb-2">Attachments</span>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedLead.attachments?.map((att, attIdx) => (
                      <div key={`${att.id}-${attIdx}`} className="flex items-center justify-between p-2.5 bg-brand-gray/5 border border-brand-gray/15 rounded-lg">
                        <div className="flex flex-col min-w-0">
                          {safeUrl(att.dataUrl) ? (
                            <a
                              href={safeUrl(att.dataUrl)}
                              download={att.name}
                              className="truncate font-semibold text-brand-red hover:underline text-xs"
                              title="Click to Download"
                            >
                              {att.name}
                            </a>
                          ) : (
                            <span className="truncate font-semibold text-brand-black" title={att.name}>{att.name}</span>
                          )}
                          <span className="text-[9px] text-brand-gray font-mono whitespace-nowrap">{att.size}</span>
                        </div>
                        {safeUrl(att.dataUrl) && (
                          <a
                            href={safeUrl(att.dataUrl)}
                            download={att.name}
                            className="text-brand-red hover:text-brand-red-dark text-[10px] font-bold underline"
                          >
                            Download
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CRM Sales Notes / Comments Feed */}
              <div className="space-y-3">
                <span className="text-[10px] font-extrabold text-brand-gray uppercase tracking-wider block">CRM Sales Notes ({visibleComments.length})</span>
                
                {/* Notes List */}
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {visibleComments.map((cmt, cmtIdx) => (
                    <div key={`${cmt.id}-${cmtIdx}`} className={`p-3 rounded-xl border ${cmt.isPrivate ? 'bg-rose-50/50 border-rose-200' : 'bg-brand-gray/5 border-brand-gray/15'}`}>
                      <div className="flex justify-between items-center text-[10px] text-brand-gray font-semibold mb-1">
                        <span className="font-bold text-brand-black">{cmt.user} {cmt.isPrivate && <span className="bg-rose-200 text-rose-800 text-[8px] px-1 py-0.5 rounded ml-1 font-extrabold">PRIVATE</span>}</span>
                        <span>{cmt.date} {cmt.time}</span>
                      </div>
                      <p className="text-brand-black font-medium leading-relaxed">{cmt.comment}</p>
                    </div>
                  ))}
                </div>

                {/* Notes input */}
                {currentRole !== 'Read Only' && (
                  <div className="space-y-2 bg-brand-gray/5 p-3.5 rounded-xl border border-brand-gray/15">
                    <textarea
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      placeholder="Add a new CRM note, meeting feedback or call logs..."
                      rows={2}
                      className="w-full bg-white border border-brand-gray/20 rounded-lg p-2.5 focus:outline-none"
                    />
                    <div className="flex justify-between items-center">
                      <label className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-brand-gray cursor-pointer">
                        <input
                          type="checkbox"
                          checked={commentPrivate}
                          onChange={() => setCommentPrivate(!commentPrivate)}
                          className="rounded text-brand-red focus:ring-brand-red"
                        />
                        <span>Private note (Manager/Operations only)</span>
                      </label>
                      <button
                        onClick={handleAddComment}
                        className="bg-brand-black text-white text-xs font-bold px-4 py-1.5 rounded-lg shadow hover:scale-101 transition-all"
                      >
                        Submit Note
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* TIMELINE TRACKER */}
              <div className="space-y-4">
                <span className="text-[10px] font-extrabold text-brand-gray uppercase tracking-wider block">Lead Timeline Logs</span>
                <div className="relative border-l border-brand-gray/20 pl-4 ml-2 space-y-4">
                  {(selectedLead.timeline || []).map((event, evIdx) => {
                    return (
                      <div key={`${event.id}-${evIdx}`} className="relative">
                        {/* Event icon dot */}
                        <div className="absolute -left-[21px] top-0.5 bg-white border border-brand-gray/30 p-1 rounded-full text-brand-red shadow-sm z-10">
                          <Activity size={8} />
                        </div>
                        <div>
                          <div className="flex justify-between items-center text-[10px] font-bold text-brand-gray">
                            <span className="text-brand-black font-extrabold uppercase">{event.type} — {event.title}</span>
                            <span className="font-mono">{new Date(event.timestamp).toLocaleString()}</span>
                          </div>
                          <p className="text-brand-gray mt-0.5">{event.description}</p>
                          <span className="text-[9px] text-indigo-600 font-bold block mt-0.5">Actor: {event.user}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>

      {/* -------------------- INTERACTION SIMULATION MODALS -------------------- */}
      {showInteractionModal && selectedLead && (
        <div className="fixed inset-0 bg-brand-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-brand-gray/20 rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
          >
            <div className="p-5 border-b border-brand-gray/15 flex justify-between items-center bg-brand-black text-white">
              <h4 className="font-bold text-sm uppercase tracking-wide">
                Log {showInteractionModal.toUpperCase()} Interaction
              </h4>
              <button onClick={() => setShowInteractionModal(null)} className="text-white/60 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Date</label>
                  <input
                    type="date"
                    value={interactionDate}
                    onChange={(e) => setInteractionDate(e.target.value)}
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Time</label>
                  <input
                    type="time"
                    value={interactionTime}
                    onChange={(e) => setInteractionTime(e.target.value)}
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
              </div>

              {showInteractionModal === 'call' && (
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Call Outcome / Status</label>
                  <select
                    value={callOutcome}
                    onChange={(e) => setCallOutcome(e.target.value)}
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs focus:outline-none font-semibold text-brand-black"
                  >
                    <option value="Contacted">Contacted / Reached Customer</option>
                    <option value="Line Busy">Line Busy</option>
                    <option value="No Answer">No Answer / Missed Call</option>
                    <option value="Wrong Number">Wrong Number</option>
                    <option value="Asked to Call Back">Asked to Call Back</option>
                    <option value="Not Interested">Not Interested</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              )}

              {showInteractionModal === 'meeting' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Location / Meeting Link</label>
                    <input
                      type="text"
                      value={interactionLocation}
                      onChange={(e) => setInteractionLocation(e.target.value)}
                      placeholder="e.g. Conference Room A, or Zoom link"
                      className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-brand-gray/5 border border-brand-gray/10 rounded-xl">
                    <div className="text-[10px] flex-1 text-brand-gray font-medium">
                      Need a physical room? Book one via Elsewedy MRB.
                    </div>
                    <a 
                      href="https://mrb.elsewedy.com/Login.aspx" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-brand-red hover:bg-brand-red-dark text-white px-3 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap"
                    >
                      Book Room
                    </a>
                  </div>
                </div>
              )}

              {showInteractionModal === 'visit' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Project Name</label>
                    <input
                      type="text"
                      value={interactionProjectName}
                      onChange={(e) => setInteractionProjectName(e.target.value)}
                      placeholder="e.g. PI Parks"
                      className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Site Notification Email</label>
                    <input
                      type="email"
                      value={interactionSiteEmail}
                      onChange={(e) => setInteractionSiteEmail(e.target.value)}
                      placeholder="site@example.com"
                      className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Interaction Summary Notes</label>
                <textarea
                  value={interactionNotes}
                  onChange={(e) => setInteractionNotes(e.target.value)}
                  placeholder={`Detail notes of your ${showInteractionModal}...`}
                  rows={3}
                  className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl p-3 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-4">
                <button
                  onClick={() => setShowInteractionModal(null)}
                  className="bg-brand-gray/10 hover:bg-brand-gray/20 text-brand-black px-4 py-2 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogInteraction}
                  className="bg-brand-red hover:bg-brand-red-dark text-white px-5 py-2 rounded-xl font-bold shadow"
                >
                  Confirm Logs
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* -------------------- LOST REASON MODAL -------------------- */}
      {showLostModal && selectedLead && (
        <div className="fixed inset-0 bg-brand-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-brand-gray/20 rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
          >
            <div className="p-5 border-b border-brand-gray/15 flex justify-between items-center bg-brand-black text-white">
              <h4 className="font-bold text-sm uppercase tracking-wide">Close Lead as LOST</h4>
              <button onClick={() => setShowLostModal(false)} className="text-white/60 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs font-medium">
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex gap-2 text-rose-800">
                <AlertTriangle size={16} className="text-rose-600 flex-shrink-0" />
                <p className="text-[10px] leading-relaxed">
                  <strong>Mandatory details required:</strong> An enterprise-grade audit trail requires explaining why this opportunity failed.
                </p>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Lost Reason Category *</label>
                <select
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value as LostReason)}
                  className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs focus:outline-none"
                >
                  <option value="Not Interested">Not Interested</option>
                  <option value="Price">Price</option>
                  <option value="Competitor">Competitor</option>
                  <option value="Location">Location</option>
                  <option value="Budget">Budget Limit</option>
                  <option value="Project Size">Project Size Mismatch</option>
                  <option value="No Response">No Response / Uncontactable</option>
                  <option value="Duplicate">Duplicate Lead</option>
                  <option value="Cancelled">Cancelled</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Lost Comment / Explanation *</label>
                <textarea
                  value={lostComment}
                  onChange={(e) => setLostComment(e.target.value)}
                  rows={3}
                  required
                  placeholder="Explain exactly why this deal was lost..."
                  className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl p-3 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-4">
                <button
                  onClick={() => setShowLostModal(false)}
                  className="bg-brand-gray/10 hover:bg-brand-gray/20 text-brand-black px-4 py-2 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMarkAsLost}
                  disabled={!lostComment.trim()}
                  className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl font-bold shadow"
                >
                  Confirm Lead Lost
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* -------------------- WHATSAPP TEMPLATE MODAL -------------------- */}
      {showWhatsappTemplateModal && selectedLead && (
        <div className="fixed inset-0 bg-brand-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-brand-gray/20 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden text-xs"
          >
            <div className="p-5 border-b border-brand-gray/15 flex justify-between items-center bg-green-600 text-white">
              <h4 className="font-bold text-sm uppercase tracking-wide flex items-center gap-2">
                <MessageSquare size={18} />
                <span>Prepare WhatsApp Message</span>
              </h4>
              <button onClick={() => setShowWhatsappTemplateModal(false)} className="text-white/60 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 font-medium">
              <div className="p-3 bg-green-50 border border-green-100 rounded-xl flex gap-2 text-green-800">
                <Info size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] leading-relaxed">
                  Review and customize the message template before sending. Once sent, the message will open in WhatsApp Web and the action will be registered in the Lead timeline history.
                </p>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Recipient</label>
                <div className="p-2.5 bg-brand-gray/5 border border-brand-gray/15 rounded-xl font-bold text-brand-black">
                  {selectedLead.customerName} ({selectedLead.phoneNumber})
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Message Text *</label>
                <textarea
                  value={whatsappTemplateText}
                  onChange={(e) => setWhatsappTemplateText(e.target.value)}
                  rows={8}
                  className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl p-3.5 focus:outline-none font-sans text-brand-black leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-brand-gray/10">
                <button
                  type="button"
                  onClick={() => setShowWhatsappTemplateModal(false)}
                  className="bg-brand-gray/10 hover:bg-brand-gray/20 text-brand-black px-4 py-2 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleWhatsappSend}
                  disabled={!whatsappTemplateText.trim()}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl font-bold shadow flex items-center gap-1.5"
                >
                  <span>Launch WhatsApp Web</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* -------------------- EMAIL TEMPLATE MODAL -------------------- */}
      {showEmailTemplateModal && selectedLead && (
        <div className="fixed inset-0 bg-brand-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-brand-gray/20 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden text-xs"
          >
            <div className="p-5 border-b border-brand-gray/15 flex justify-between items-center bg-blue-600 text-white">
              <h4 className="font-bold text-sm uppercase tracking-wide flex items-center gap-2">
                <Mail size={18} />
                <span>Prepare Corporate Email</span>
              </h4>
              <button onClick={() => setShowEmailTemplateModal(false)} className="text-white/60 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 font-medium">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex gap-2 text-blue-800">
                <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] leading-relaxed">
                  Review and customize this professional email template. Clicking "Download" will download an offline-ready standard <strong>.eml</strong> message file containing headers and body, which automatically opens in corporate email software like Outlook or Mail, pre-addressed.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Recipient Email</label>
                  <div className="p-2.5 bg-brand-gray/5 border border-brand-gray/15 rounded-xl font-bold text-brand-black truncate">
                    {selectedLead.email || 'N/A (Will use contact name)'}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Customer Name</label>
                  <div className="p-2.5 bg-brand-gray/5 border border-brand-gray/15 rounded-xl font-bold text-brand-black">
                    {selectedLead.customerName}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Email Body *</label>
                <textarea
                  value={emailTemplateText}
                  onChange={(e) => setEmailTemplateText(e.target.value)}
                  rows={10}
                  className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl p-3.5 focus:outline-none font-sans text-brand-black leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-brand-gray/10">
                <button
                  type="button"
                  onClick={() => setShowEmailTemplateModal(false)}
                  className="bg-brand-gray/10 hover:bg-brand-gray/20 text-brand-black px-4 py-2 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEmailSend}
                  disabled={!emailTemplateText.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl font-bold shadow flex items-center gap-1.5"
                >
                  <span>Download .EML File</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* -------------------- CUSTOM DELETE CONFIRMATION DIALOGS (ADMIN ONLY) -------------------- */}
      {deleteConfirmLeadId && (
        <div className="fixed inset-0 bg-brand-black/50 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-brand-gray/20 rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
          >
            <div className="p-5 border-b border-brand-gray/15 flex justify-between items-center bg-rose-600 text-white">
              <h4 className="font-bold text-sm uppercase tracking-wide flex items-center gap-2">
                <Trash2 size={18} />
                <span>Confirm Permanent Deletion</span>
              </h4>
              <button onClick={() => setDeleteConfirmLeadId(null)} className="text-white/60 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <p className="text-brand-gray leading-relaxed text-sm">
                Are you absolutely sure you want to permanently delete lead <strong className="text-brand-black font-extrabold font-mono">{deleteConfirmLeadId}</strong>?
              </p>
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 leading-relaxed text-[11px]">
                <strong>Warning:</strong> This operation cannot be undone. All logs, specifications, and comments associated with this sales lead will be permanently deleted from local store.
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmLeadId(null)}
                  className="bg-brand-gray/10 hover:bg-brand-gray/20 text-brand-black px-4 py-2 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteLead}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2 rounded-xl font-bold shadow"
                >
                  Permanently Delete
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {deleteConfirmBulk && (
        <div className="fixed inset-0 bg-brand-black/50 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-brand-gray/20 rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
          >
            <div className="p-5 border-b border-brand-gray/15 flex justify-between items-center bg-rose-600 text-white">
              <h4 className="font-bold text-sm uppercase tracking-wide flex items-center gap-2">
                <Trash2 size={18} />
                <span>Confirm Bulk Deletion</span>
              </h4>
              <button onClick={() => setDeleteConfirmBulk(false)} className="text-white/60 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <p className="text-brand-gray leading-relaxed text-sm">
                Are you absolutely sure you want to permanently delete the <strong className="text-brand-black font-extrabold">{selectedLeadIds.length}</strong> selected sales leads?
              </p>
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 leading-relaxed text-[11px]">
                <strong>Warning:</strong> This operation cannot be undone. These records will be permanently erased from local store.
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmBulk(false)}
                  className="bg-brand-gray/10 hover:bg-brand-gray/20 text-brand-black px-4 py-2 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmBulkDelete}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2 rounded-xl font-bold shadow"
                >
                  Permanently Delete Selected
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* -------------------- INBOUND EMAIL SOURCE VERIFICATION MODAL -------------------- */}
      {showSourceEmailModal && selectedLead && (
        <div className="fixed inset-0 bg-brand-black/50 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-brand-gray/20 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden"
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-brand-gray/15 flex justify-between items-center bg-brand-black text-white">
              <div className="flex items-center gap-2.5">
                <Mail size={18} className="text-brand-red animate-pulse" />
                <div>
                  <h4 className="font-bold text-sm uppercase tracking-wide">Inbound Email Verification</h4>
                  <p className="text-[10px] text-white/60">Lead {selectedLead.id} Ingestion Verification Log</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSourceEmailModal(false)} 
                className="p-1 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-xs overflow-y-auto max-h-[80vh]">
              {loadingSourceEmail ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="animate-spin text-brand-red" size={24} />
                  <span className="text-brand-gray font-semibold text-xs">Retrieving secure email envelope...</span>
                </div>
              ) : sourceEmailData ? (
                <div className="space-y-4">
                  {/* Email Headers */}
                  <div className="p-3 bg-brand-gray/5 border border-brand-gray/15 rounded-xl space-y-1.5 font-sans">
                    <div className="flex justify-between">
                      <span className="text-[10px] uppercase font-bold text-brand-gray w-20">Subject:</span>
                      <span className="text-brand-black font-extrabold flex-1 text-left">{sourceEmailData.subject}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] uppercase font-bold text-brand-gray w-20">From:</span>
                      <span className="text-brand-black font-semibold flex-1 text-left">{sourceEmailData.sender}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] uppercase font-bold text-brand-gray w-20">Date Ingested:</span>
                      <span className="text-brand-gray font-mono flex-1 text-left">
                        {sourceEmailData.receivedTime ? new Date(sourceEmailData.receivedTime).toLocaleString() : 'Pending'}
                      </span>
                    </div>
                  </div>

                  {/* Synchronized Data Verification Checklist */}
                  <div>
                    <span className="text-[10px] font-extrabold text-brand-gray uppercase tracking-wider block mb-2">
                      Synced Parameters Checklist
                    </span>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 text-[11px]">
                      <div className="flex items-start gap-1.5">
                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-brand-gray text-[9px] font-bold block">CONTACT NAME</span>
                          <span className="text-brand-black font-bold">{selectedLead.customerName}</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-brand-gray text-[9px] font-bold block">PHONE NUMBER</span>
                          <span className="text-brand-black font-bold font-mono">{selectedLead.phoneNumber}</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-brand-gray text-[9px] font-bold block">EMAIL ADDRESS</span>
                          <span className="text-brand-black font-bold">{selectedLead.email || 'N/A'}</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-brand-gray text-[9px] font-bold block">PROJECT SITE</span>
                          <span className="text-brand-black font-bold">{selectedLead.project}</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-brand-gray text-[9px] font-bold block">REQUIRED PLOT SIZE</span>
                          <span className="text-brand-black font-bold font-mono">{fmtSize(selectedLead.requiredSize)}</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-brand-gray text-[9px] font-bold block">INGESTION SOURCE</span>
                          <span className="text-brand-black font-bold">{selectedLead.source}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Email Body Content */}
                  <div>
                    <span className="text-[10px] font-extrabold text-brand-gray uppercase tracking-wider block mb-2">
                      Original Inbound Email Body
                    </span>
                    {sourceEmailData.bodyHtml ? (
                      <div className="border border-brand-gray/15 rounded-xl overflow-hidden bg-white shadow-inner">
                        <iframe
                          srcDoc={sanitizeEmailHtml(sourceEmailData.bodyHtml)}
                          title="Original Inbound Email Body Content"
                          className="w-full h-80 bg-white"
                          sandbox=""
                        />
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap bg-brand-gray/5 border border-brand-gray/15 p-4 rounded-xl font-mono text-[11px] max-h-80 overflow-y-auto leading-relaxed text-brand-black shadow-inner">
                        {sourceEmailData.bodyText || 'No email content is available for verification.'}
                      </pre>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-brand-gray">
                  No secure email ingestion records could be located for this lead identifier.
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 pt-2 border-t border-brand-gray/10">
                <button
                  type="button"
                  disabled={reparsingLead}
                  onClick={() => handleReparseLead(selectedLead)}
                  className="bg-brand-red hover:bg-brand-red/90 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow flex items-center gap-1.5"
                >
                  {reparsingLead ? (
                    <RefreshCw className="animate-spin" size={14} />
                  ) : (
                    <Cpu size={14} />
                  )}
                  <span>{reparsingLead ? 'Reparsing & Syncing...' : 'Reparse & Sync Lead'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSourceEmailModal(false)}
                  className="bg-brand-black hover:bg-brand-black/90 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow"
                >
                  Close Verification View
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
};
