import DOMPurify from "dompurify";
import { toast } from 'sonner';
import { Lead, Contact, Company, EmailImportLog, QueueSettings, SalespersonTask, SalespersonActivity, TimelineEvent } from './types';
import { INITIAL_QUEUE_SETTINGS } from './mockData';

// Phone number normalizer
export function normalizePhone(phone: string): string {
  let num = String(phone ?? '').trim().replace(/[^\d+]/g, ''); // strip non-digits except +
  num = num.replace(/^\+/, ''); // remove leading +
  if (num.startsWith('0020') && num.length === 14) num = '0' + num.substring(4);
  else if (num.startsWith('20') && num.length === 12) num = '0' + num.substring(2);
  else if (num.length === 10 && num.startsWith('1')) num = '0' + num;
  return num;
}

type Kind = 'leads' | 'contacts' | 'companies' | 'tasks' | 'activities' | 'email-logs';
const STORE: Record<Kind, string> = {
  leads: 'crm_leads', contacts: 'crm_contacts', companies: 'crm_companies',
  tasks: 'crm_tasks', activities: 'crm_activities', 'email-logs': 'crm_email_logs',
};
const KINDS = Object.keys(STORE) as Kind[];

// The server is the source of truth. Lists are cached for this tab only (see lib/storageGuard.ts).
// `baseline` remembers what the server last confirmed, so a save sends ONLY the rows that changed.
const memory: Partial<Record<Kind, any[]>> = {};
const baseline: Record<Kind, Map<string, string>> = {
  leads: new Map(), contacts: new Map(), companies: new Map(), tasks: new Map(), activities: new Map(), 'email-logs': new Map(),
};
const pending: Record<Kind, number> = { leads: 0, contacts: 0, companies: 0, tasks: 0, activities: 0, 'email-logs': 0 };
const queues: Partial<Record<Kind, Promise<void>>> = {};
const ids: Record<'lead' | 'contact' | 'company', string[]> = { lead: [], contact: [], company: [] };

const stable = (r: any) => { const { _rev, ...rest } = r || {}; return JSON.stringify(rest); };
const changed = () => window.dispatchEvent(new CustomEvent('crm-data-changed'));

function read(kind: Kind): any[] {
  try {
    const raw = localStorage.getItem(STORE[kind]);
    if (raw) { const v = JSON.parse(raw); if (Array.isArray(v)) return v; }
  } catch { /* fall through to memory */ }
  return memory[kind] || [];
}
function write(kind: Kind, rows: any[]) {
  memory[kind] = rows;
  try { localStorage.setItem(STORE[kind], JSON.stringify(rows)); } catch { /* memory copy is used */ }
}
function setBaseline(kind: Kind, rows: any[]) {
  const m = new Map<string, string>();
  rows.forEach((r) => m.set(String(r.id), stable(r)));
  baseline[kind] = m;
}

async function pull(kind: Kind): Promise<any[] | null> {
  try {
    const res = await fetch(`/api/crm/${kind}`);
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? rows : null;
  } catch { return null; }
}

async function flush(kind: Kind) {
  const arr = read(kind);
  const base = baseline[kind];
  const present = new Set(arr.map((r) => String(r.id)));
  const upserts = arr.filter((r) => base.get(String(r.id)) !== stable(r));
  const deletes = [...base.keys()].filter((id) => !present.has(id));
  if (!upserts.length && !deletes.length) return;

  const CHUNK = 100;
  for (let i = 0; i < Math.max(1, Math.ceil(upserts.length / CHUNK)); i++) {
    const part = upserts.slice(i * CHUNK, (i + 1) * CHUNK);
    let res: Response;
    try {
      res = await fetch(`/api/crm/${kind}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upserts: part, deletes: i === 0 ? deletes : [] }),
      });
    } catch {
      toast.error('Could not reach the server. Your last change was not saved.');
      return;
    }
    if (!res.ok) {
      let msg = 'Your change was not saved.';
      try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* keep default */ }
      toast.error(msg);
      const fresh = await pull(kind);
      if (fresh) { write(kind, fresh); setBaseline(kind, fresh); changed(); }
      return;
    }
    const out = await res.json();
    const sent = new Map(part.map((r) => [String(r.id), r]));
    const current = read(kind);
    for (const s of out.saved || []) {
      base.set(String(s.id), stable(sent.get(String(s.id)) || {}));
      const row = current.find((r) => String(r.id) === String(s.id));
      if (row) row._rev = s._rev;
    }
    if (i === 0) for (const d of deletes) if (!(out.rejected || []).some((x: any) => x.id === d)) base.delete(d);
    write(kind, current);
    const bad = [...(out.conflicts || []), ...(out.rejected || []).map((x: any) => x.id)];
    if (bad.length) {
      toast.error(out.conflicts?.length
        ? 'Someone else changed this record at the same time. The latest version was reloaded: please repeat your edit.'
        : `Not allowed: ${(out.rejected?.[0]?.reason) || 'change refused'}`);
      const fresh = await pull(kind);
      if (fresh) { write(kind, fresh); setBaseline(kind, fresh); }
      changed();
      return;
    }
  }
}

function queue(kind: Kind) {
  pending[kind]++;
  queues[kind] = (queues[kind] || Promise.resolve())
    .then(() => flush(kind))
    .catch((e) => console.warn('CRM save failed', kind, e))
    .finally(() => { pending[kind]--; });
  return queues[kind]!;
}

async function refill(kind: 'lead' | 'contact' | 'company') {
  if (ids[kind].length >= 3) return;
  try {
    const res = await fetch('/api/crm/ids', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, n: 10 }) });
    if (res.ok) ids[kind].push(...((await res.json()).ids || []));
  } catch { /* offline: temporary ids are used */ }
}
function takeId(kind: 'lead' | 'contact' | 'company'): string {
  const next = ids[kind].shift();
  if (ids[kind].length < 3) refill(kind);
  if (next) return next;
  const p = kind === 'lead' ? 'LD' : kind === 'contact' ? 'CON' : 'COM';
  return `${p}-T${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const saved = (kind: Kind) => (rows: any[]) => { write(kind, rows); void queue(kind); };

export const crmService = {
  /** Load everything this user may see. Skips a list while a save of it is still running. */
  loadAll: async (): Promise<{ ok: boolean }> => {
    const results = await Promise.all(KINDS.map(async (k) => [k, pending[k] > 0 ? null : await pull(k)] as const));
    let ok = true;
    for (const [k, rows] of results) {
      if (rows) { write(k, rows); setBaseline(k, rows); } else if (pending[k] === 0) ok = false;
    }
    try {
      const res = await fetch('/api/crm/queue-settings');
      if (res.ok) localStorage.setItem('crm_queue_settings', JSON.stringify(await res.json()));
    } catch { ok = false; }
    refill('lead'); refill('contact'); refill('company');
    changed();
    return { ok };
  },

  // Getters (from this tab's cache; call loadAll first)
  getLeads: (): Lead[] => read('leads'),
  getContacts: (): Contact[] => read('contacts'),
  getCompanies: (): Company[] => read('companies'),
  getEmailLogs: (): EmailImportLog[] => read('email-logs'),
  getTasks: (): SalespersonTask[] => read('tasks'),
  getActivities: (): SalespersonActivity[] => read('activities'),
  getQueueSettings: (): QueueSettings => {
    try { const d = localStorage.getItem('crm_queue_settings'); if (d) return JSON.parse(d); } catch { /* default */ }
    return INITIAL_QUEUE_SETTINGS;
  },
  getSalesPeople: () => {
    try { const d = localStorage.getItem('crm_sales_people'); if (d) return JSON.parse(d); } catch { /* none */ }
    return [] as any[];
  },

  // Save helpers: pass the whole list as before; only changed rows travel to the server
  saveLeads: (leads: Lead[]) => saved('leads')(leads),
  saveContacts: (contacts: Contact[]) => saved('contacts')(contacts),
  saveCompanies: (companies: Company[]) => saved('companies')(companies),
  saveEmailLogs: (logs: EmailImportLog[]) => saved('email-logs')(logs),
  saveTasks: (tasks: SalespersonTask[]) => saved('tasks')(tasks),
  saveActivities: (activities: SalespersonActivity[]) => saved('activities')(activities),
  saveSalesPeople: (people: any[]) => {
    try { localStorage.setItem('crm_sales_people', JSON.stringify(people)); } catch { /* ignore */ }
  },
  saveQueueSettings: (settings: QueueSettings) => {
    localStorage.setItem('crm_queue_settings', JSON.stringify(settings));
    fetch('/api/crm/queue-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
    }).then(async (r) => {
      if (!r.ok) { let m = 'Routing settings were not saved.'; try { m = (await r.json()).error || m; } catch { /* default */ } toast.error(m); }
    }).catch(() => toast.error('Could not reach the server. Routing settings were not saved.'));
  },
  /** wait until every pending save has reached the server */
  whenSaved: async () => { await Promise.all(KINDS.map((k) => queues[k]).filter(Boolean)); },

  // Audit Log (the server records WHO from the login, not from this call)
  addActivityLog: (_user: string, action: string, details: string, type: 'auth' | 'ticket' | 'workflow' | 'admin' | 'system') => {
    fetch('/api/activity-logs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, details, type }),
    }).catch(() => { /* audit is best effort */ });
  },

  // Lead Lifecycle Operations
  createLead: (leadData: Partial<Lead>, createdBy: string): Lead => {
    // Sanitize user inputs
    if (leadData.description) leadData.description = DOMPurify.sanitize(leadData.description);
    if (leadData.comments) leadData.comments = leadData.comments.map(c => ({...c, comment: DOMPurify.sanitize(c.comment)}));

    const leads = crmService.getLeads();
    const contacts = crmService.getContacts();
    const companies = crmService.getCompanies();

    const normalizedPhone = leadData.phoneNumber ? leadData.phoneNumber.replace(/\D/g, '') : '';
    
    // ids come from a server sequence (handed out in advance), so two people never get the same one
    const newId = takeId('lead');

    const newLead: Lead = {
      id: newId,
      emailId: leadData.emailId,
      date: leadData.date || new Date().toISOString(),
      source: leadData.source || 'Manual Entry',
      project: leadData.project || '',
      customerName: leadData.customerName || '',
      phoneNumber: leadData.phoneNumber || '',
      email: leadData.email || '',
      companyName: leadData.companyName,
      requiredSize: leadData.requiredSize ?? '',
      budget: leadData.budget,
      priority: leadData.priority || 'Normal',
      status: leadData.status || 'New',
      description: leadData.description || '',
      comments: leadData.comments || [],
      attachments: leadData.attachments || [],
      lastUpdated: new Date().toISOString(),
      expectedClosingDate: leadData.expectedClosingDate || '',
      timeline: [
        {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          type: 'Creation',
          user: createdBy,
          title: 'Lead Registered',
          description: `Lead registered under CRM and linked to contact ${leadData.customerName}.`,
        }
      ],
    };

    leads.push(newLead);
    crmService.saveLeads(leads);

    // Trigger Assignment Engine if status is New/Pending Routing and auto assignment is enabled
    const settings = crmService.getQueueSettings();
    if (settings.assignmentMethod !== 'Manual Assignment Only') {
      crmService.routeLeadAutomatically(newLead.id);
    }
    
    return newLead;
  },

  updateLead: (id: string, updates: Partial<Lead>, user: string): Lead => {
    const leads = crmService.getLeads();
    const idx = leads.findIndex(l => l.id === id);
    if (idx === -1) throw new Error('Lead not found');

    const original = leads[idx];
    const updated: Lead = {
      ...original,
      ...updates,
      timeline: [...(updates.timeline ?? original.timeline ?? [])],
      lastUpdated: new Date().toISOString()
    };

    // Append timeline changes for key fields
    if (updates.status && updates.status !== original.status) {
      updated.timeline.push({
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        type: 'Status Change',
        user,
        title: 'Status Updated',
        description: `Status changed from ${original.status} to ${updates.status}`
      });
    }

    leads[idx] = updated;
    crmService.saveLeads(leads);
    crmService.addActivityLog(user, 'Update Lead', `Updated CRM Sales Lead ${id} details`, 'ticket');
    return updated;
  },

  parseEmailAndCreateLead: (emailLog: Partial<EmailImportLog>, user: string): { success: boolean, leadId?: string, error?: string, isDuplicate?: boolean } => {
    const leads = crmService.getLeads();
    const text = emailLog.bodyPreview || '';

    let parsedName = '';
    let parsedPhone = '';
    let parsedEmail = '';
    let parsedCompany = '';
    let parsedProject = '';
    let parsedPlotType = '';
    let parsedInquiryType = '';
    let parsedSize: string | number = '';
    let parsedBudget: number | undefined;
    let parsedSource = '';
    let parsedPriority = '';
    let parsedComment = '';

    const nameMatch = text.match(/(?:Customer Name|Name|صاحب شركة|customer_name)\s*[:\/\t]*\s*([^\n]+)/i);
    parsedName = nameMatch ? nameMatch[1].trim() : '';

    const phoneMatch = text.match(/(?:Customer Number|Phone Number|Phone|Mobile|customer_number|الهاتف|رقم)\s*[:\/\t]*\s*([^\n]+)/i);
    parsedPhone = phoneMatch ? phoneMatch[1].trim() : '';

    const emailMatch = text.match(/(?:Email|البريد الالكتروني|البريد)\s*[:\/\t]*\s*([^\n]+)/i);
    parsedEmail = emailMatch ? emailMatch[1].trim() : '';

    const companyMatch = text.match(/(?:Company Name|Company|company_name|الشركة)\s*[:\/\t]*\s*([^\n]+)/i);
    parsedCompany = companyMatch ? companyMatch[1].trim() : '';

    const projectMatch = text.match(/(?:Project Name|Project|project_name|المشروع)\s*[:\/\t]*\s*([^\n]+)/i);
    parsedProject = projectMatch ? projectMatch[1].trim() : '';

    const commentMatch = text.match(/(?:Comment|Message|الوصف|التفاصيل|الرسالة)\s*[:\/\t]*\s*([^\n]+)/i);
    parsedComment = commentMatch ? commentMatch[1].trim() : '';

    const plotTypeMatch = text.match(/(?:Plot Type|plot_type|Type|نوع)\s*[:\/\t]*\s*([^\n]+)/i);
    parsedPlotType = plotTypeMatch ? plotTypeMatch[1].trim() : '';

    const sizeMatch = text.match(/(?:Required Size|Required Land Size|required_size|Size|المساحة)\s*[:\/\t]*\s*([^\n]+)/i);
    if (sizeMatch) parsedSize = sizeMatch[1].trim();

    const budgetMatch = text.match(/(?:Budget|الميزانية)\s*[:\/\t]*\s*(\d+)/i);
    if (budgetMatch) parsedBudget = parseInt(budgetMatch[1]);

    const priorityMatch = text.match(/(?:Priority|الأهمية)\s*[:\/\t]*\s*([^\n]+)/i);
    parsedPriority = priorityMatch ? priorityMatch[1].trim() : '';

    const inquiryTypeMatch = text.match(/(?:Inquiry Type|inquiry_type|نوع الاستفسار)\s*[:\/\t]*\s*([^\n]+)/i);
    parsedInquiryType = inquiryTypeMatch ? inquiryTypeMatch[1].trim() : '';
    const sourceMatch = text.match(/(?:Lead Source|Source|المصدر)\s*[:\/\t]*\s*([^\n]+)/i);
    parsedSource = sourceMatch ? sourceMatch[1].trim() : '';

    let project = '';
    if (parsedProject) {
      const pLower = parsedProject.toLowerCase();
      if (pLower.includes('أكتوبر') || pLower.includes('october')) {
        project = 'Industria October';
      } else if (pLower.includes('شرق') || pLower.includes('east')) {
        project = 'Industria East';
      } else if (pLower.includes('غرب') || pLower.includes('west')) {
        project = 'Industria West';
      } else if (pLower.includes('سادات') || pLower.includes('sadat')) {
        project = 'Industria Sadat';
      } else if (pLower.includes('عاشر') || pLower.includes('ramadan') || pLower.includes('10')) {
        project = 'Industria 10th of Ramadan';
      } else if (pLower.includes('سخنة') || pLower.includes('sokhna')) {
        project = 'Sokhna';
      } else if (pLower.includes('علمين') || pLower.includes('alamein')) {
        project = 'Industria New Alamein';
      } else {
        project = parsedProject.trim();
      }
    }

    const tempNormPhone = parsedPhone ? parsedPhone.replace(/\D/g, '') : '';
    
    // Smart Deduplication
    if (emailLog.id) {
       const existingByEmailId = leads.find(l => l.emailId === emailLog.id);
       if (existingByEmailId) {
         return { success: true, leadId: existingByEmailId.id, isDuplicate: true };
       }
    }

    if (tempNormPhone && parsedName) {
       // Check if there's a lead with the exact same Name + Phone + Project
       const existingByDetails = leads.find(l => 
         l.phoneNumber && l.phoneNumber.replace(/\D/g, '') === tempNormPhone && 
         l.customerName === parsedName.trim() &&
         l.project === project
       );
       if (existingByDetails) {
         // Optionally update the existing lead's emailId if it was missing
         if (emailLog.id && !existingByDetails.emailId) {
             existingByDetails.emailId = emailLog.id;
             crmService.saveLeads(leads);
         }
         return { success: true, leadId: existingByDetails.id, isDuplicate: true };
       }
    }
    
    // Check by description/notes to catch exact same email content
    if (parsedComment && parsedComment.length > 10) {
       const existingByComment = leads.find(l => l.description && l.description.includes(parsedComment));
       if (existingByComment) {
         return { success: true, leadId: existingByComment.id, isDuplicate: true };
       }
    }

    if (!parsedName && !parsedPhone) {
        return { success: false, error: 'Missing customer name or phone' };
    }

    if (!parsedName && !parsedPhone) {
        return { success: false, error: 'Missing customer name or phone' };
    }

    try {
      const newLead = crmService.createLead({
        emailId: emailLog.id,
        customerName: parsedName.trim(),
        phoneNumber: parsedPhone,
        email: parsedEmail.trim(),
        companyName: parsedCompany.trim(),
        project,
        requiredSize: parsedSize,
        budget: parsedBudget,
        source: parsedSource,
        priority: 'Normal',
        description: parsedComment,
        date: new Date().toISOString().split('T')[0],
        status: 'New'
      }, 'System Administrator');
      
      const logs = crmService.getEmailLogs();
      const newLogId = emailLog.id || 'eml_' + Math.random().toString(36).substr(2, 9);
      const existingLogIndex = logs.findIndex(l => l.id === newLogId);
      
      const newLog: EmailImportLog = {
        id: newLogId,
        receivedTime: new Date().toISOString(),
        sender: emailLog.sender || 'web@elsewedydevelopment.com',
        subject: emailLog.subject || 'Website Inquiry Form',
        status: 'Success',
        parsedLeadId: newLead.id,
        bodyPreview: text,
      };

      if (existingLogIndex !== -1) {
        logs[existingLogIndex] = newLog;
      } else {
        logs.unshift(newLog);
      }
      crmService.saveEmailLogs(logs);

      return { success: true, leadId: newLead.id };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  // The server applies the routing rules (method, caps, leave, daily limit) and never re-routes an assigned lead.
  routeLeadAutomatically: (leadId: string): void => {
    if (crmService.getQueueSettings().assignmentMethod === 'Manual Assignment Only') return;
    void (queues.leads || Promise.resolve()).then(async () => {
      try {
        const res = await fetch('/api/crm/leads/route', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId }),
        });
        if (!res.ok) return;
        const out = await res.json();
        if (!out.assigned || !out.lead) return;
        const rows = read('leads');
        const i = rows.findIndex((r) => r.id === leadId);
        if (i === -1) return;
        rows[i] = out.lead;
        write('leads', rows);
        baseline.leads.set(String(leadId), stable(out.lead));
        changed();
      } catch { /* the lead stays in the queue for a manager */ }
    });
  },

  // Merge duplicate leads
  mergeLeads: (primaryId: string, duplicateId: string, user: string): Lead => {
    const leads = crmService.getLeads();
    const primaryIdx = leads.findIndex(l => l.id === primaryId);
    const duplicateIdx = leads.findIndex(l => l.id === duplicateId);

    if (primaryIdx === -1 || duplicateIdx === -1) throw new Error('Primary or Duplicate lead not found');

    const primary = { ...leads[primaryIdx] };
    const duplicate = { ...leads[duplicateIdx], timeline: [...(leads[duplicateIdx].timeline || [])] };

    // Merge comments, timeline events
    const mergedComments = [...primary.comments, ...duplicate.comments, {
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      user,
      comment: `System Merge Action: Merged details from duplicate lead record ${duplicateId}. Details included: Required size: ${duplicate.requiredSize}sqm, project: ${duplicate.project}.`,
      isPrivate: false,
    }];

    const mergedTimeline: TimelineEvent[] = [...primary.timeline, ...duplicate.timeline, {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'Approval' as const,
      user,
      title: `Merged with Lead ${duplicateId}`,
      description: `Lead ${duplicateId} merged into primary record ${primaryId}. Duplicate lead record flagged as Closed/Duplicate.`
    }];

    primary.comments = mergedComments;
    primary.timeline = mergedTimeline;
    primary.lastUpdated = new Date().toISOString();

    // Mark duplicate lead as closed/duplicate
    duplicate.status = 'Duplicate';
    duplicate.lastUpdated = new Date().toISOString();
    duplicate.timeline.push({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'Status Change',
      user,
      title: 'Flagged as Duplicate',
      description: `Merged into primary record ${primaryId}. Closed automatically.`
    });

    leads[primaryIdx] = primary;
    leads[duplicateIdx] = duplicate;
    crmService.saveLeads(leads);

    crmService.addActivityLog(user, 'Merge Leads', `Merged duplicate CRM Lead ${duplicateId} into ${primaryId}`, 'ticket');

    return primary;
  }
};
