import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { WORKING_HOURS_PER_DAY } from '../constants';
import { useAuth } from '../services/AuthContext';
import { adminService } from '../services/adminService';
import { ticketService } from '../services/ticketService';
import { workflowService } from '../services/workflowService';
import { Priority, Category, WorkflowRequest } from '../types';
import { motion } from 'motion/react';
import { Send, Paperclip, MapPin, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { crmService } from './crm/crmService';
import { Contact } from './crm/types';

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
// Only raster images are previewed inline (SVG excluded: it can carry script).
const isSafeImage = (at: string) => typeof at === 'string' && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(at);
const slaLabel = (hours?: number) => (hours && hours > 0 ? `${hours}h` : 'n/a');

interface TicketFormProps {
  onSuccess: () => void;
}

export const TicketForm: React.FC<TicketFormProps> = ({ onSuccess }) => {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [slaConfigs, setSlaConfigs] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowRequest[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: '',
    subtype: '',
    priority: 'Medium' as Priority,
    workflowId: '',
    department: undefined as string | undefined,
    crmContactId: '',
    crmContactName: ''
  });

  const [attachments, setAttachments] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  
  // Custom searchable CRM Contact dropdown states
  const [isContactDropdownOpen, setIsContactDropdownOpen] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState('');

  useEffect(() => () => { if (redirectTimer.current) clearTimeout(redirectTimer.current); }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let c: Category[], s: any[], w: WorkflowRequest[];
      try {
        [c, s, w] = await Promise.all([
          adminService.getCategories(),
          adminService.getSLA(),
          workflowService.getAll()
        ]);
      } catch (err: any) {
        if (!cancelled) {
          setLoadError(err?.message || 'Could not load the ticket form.');
          setIsLoading(false);
        }
        return;
      }
      if (cancelled) return;
      setCategories(c);
      setSlaConfigs(s);
      setWorkflows(w.filter(wf => wf.status === 'Finalized'));
      if (c.length > 0) {
        setFormData(prev => ({ ...prev, type: c[0].type, subtype: c[0].subtype }));
      }
      
      try {
        const loadedContacts = crmService.getContacts();
        setContacts(loadedContacts || []);
      } catch (err) {
        console.error('Failed to load CRM contacts:', err);
      }
      
      setIsLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const handleWorkflowSelect = (workflowId: string) => {
    const workflow = workflows.find(w => w.id === workflowId);
    if (workflow) {
      setFormData(prev => ({
        ...prev,
        workflowId,
        title: workflow.title,
        description: workflow.description,
        type: workflow.department, // Using department as type for workflow-based tickets
        subtype: 'Workflow Process',
        department: workflow.department
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        workflowId: '',
        department: undefined
      }));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error('File size must be less than 5 MB');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = ev.target?.result;
        if (typeof data === 'string') setAttachments(prev => [...prev, data]);
      };
      reader.onerror = () => toast.error('Could not read the file.');
      reader.readAsDataURL(file);
    }
    e.target.value = ''; // allow re-picking the same file
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    setStatus(null);

    try {
      // Find department from category if not already set by workflow
      let finalDepartment = formData.department;
      if (!formData.workflowId) {
        const category = categories.find(c => c.type === formData.type && c.subtype === formData.subtype);
        if (category?.department) {
          finalDepartment = category.department;
        }
      }

      await ticketService.createTicket({
        ...formData,
        department: finalDepartment as any,
        requesterId: user.id,
        requesterEmail: user.email,
        attachments
      }, slaConfigs);

      setStatus({ type: 'success', message: 'Ticket created successfully! Redirecting...' });
      redirectTimer.current = setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err: any) {
      console.error('Failed to create ticket:', err);
      setStatus({ type: 'error', message: `Failed to create ticket: ${err.message || 'Unknown error'}` });
      setIsSubmitting(false);
    }
  };

  const types = Array.from(new Set(categories.map(c => c.type)));
  const subtypes = categories.filter(c => c.type === formData.type).map(c => c.subtype);

  if (isLoading) return <div className="p-8" role="status" aria-live="polite">Loading form...</div>;
  if (loadError) return <div className="p-8 text-red-700" role="alert">Could not load the ticket form: {loadError}</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl md:text-3xl font-bold text-brand-black">Create New Ticket</h2>
        <p className="text-brand-gray text-sm">Submit a request for IT assistance</p>
      </div>

      <motion.form 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={handleSubmit} 
        className="bento-card space-y-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {status && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className={`col-span-2 p-4 rounded-xl border flex items-center gap-3 ${
                status.type === 'success' 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {status.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <p className="text-sm font-medium">{status.message}</p>
            </motion.div>
          )}
          <div className="col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold mb-2">Workflow Template (Optional)</label>
              <select 
                className="input-field bg-brand-red/5 border-brand-red/20"
                value={formData.workflowId}
                onChange={e => handleWorkflowSelect(e.target.value)}
              >
                <option value="">None - Standard Ticket</option>
                {workflows.map(w => (
                  <option key={w.id} value={w.id}>{w.title} (SLA: {w.totalSLA && w.totalSLA > 0 ? `${Math.round(w.totalSLA / WORKING_HOURS_PER_DAY)}d` : 'n/a'})</option>
                ))}
              </select>
            </div>

            <div className="relative">
              <label className="block text-sm font-bold mb-2">CRM Contact Association (Optional)</label>
              <div 
                className="input-field bg-brand-black/5 border-brand-black/10 flex items-center justify-between cursor-pointer min-h-[44px]"
                onClick={() => setIsContactDropdownOpen(!isContactDropdownOpen)}
              >
                <span className="truncate">
                  {formData.crmContactName ? `${formData.crmContactName} (${contacts.find(c => c.id === formData.crmContactId)?.company || 'No Company'})` : 'Select CRM Contact...'}
                </span>
                <span className="text-brand-gray text-xs">▼</span>
              </div>
              
              {isContactDropdownOpen && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-brand-gray/20 rounded-xl shadow-xl p-3 space-y-2">
                  <input
                    type="text"
                    placeholder="Search contacts..."
                    value={contactSearchQuery}
                    onChange={e => setContactSearchQuery(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                    autoFocus
                  />
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    <div
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          crmContactId: '',
                          crmContactName: ''
                        }));
                        setIsContactDropdownOpen(false);
                        setContactSearchQuery('');
                      }}
                      className="px-2 py-1.5 hover:bg-brand-gray/10 rounded cursor-pointer text-xs font-semibold text-brand-gray"
                    >
                      None - No CRM Contact
                    </div>
                    {contacts
                      .filter(c => 
                        c.name.toLowerCase().includes(contactSearchQuery.toLowerCase()) || 
                        (c.company || '').toLowerCase().includes(contactSearchQuery.toLowerCase())
                      )
                      .map(c => (
                        <div
                          key={c.id}
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              crmContactId: c.id,
                              crmContactName: c.name
                            }));
                            setIsContactDropdownOpen(false);
                            setContactSearchQuery('');
                          }}
                          className="px-2 py-1.5 hover:bg-brand-red/5 hover:text-brand-red rounded cursor-pointer text-xs flex justify-between"
                        >
                          <span className="font-bold">{c.name}</span>
                          <span className="text-[10px] text-brand-gray">{c.company || 'Private'}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="col-span-2">

            {formData.workflowId && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-4 overflow-hidden"
              >
                <div className="bg-white border border-brand-red/20 rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-brand-red/5 px-4 py-2 border-b border-brand-red/10">
                    <h5 className="text-[10px] font-bold text-brand-red uppercase tracking-wider">Workflow Steps Preview</h5>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-brand-light/50 border-b border-black/5">
                          <th className="px-4 py-2 font-bold text-brand-black">Step</th>
                          <th className="px-4 py-2 font-bold text-brand-black">Description</th>
                          <th className="px-4 py-2 font-bold text-brand-black">Department</th>
                          <th className="px-4 py-2 font-bold text-brand-black">SLA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {(workflows.find(w => w.id === formData.workflowId)?.steps || []).map((step, idx) => (
                          <tr key={step.id} className="hover:bg-brand-light/30 transition-colors">
                            <td className="px-4 py-3 font-medium text-brand-black">
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-red/10 text-brand-red text-[10px] font-bold mr-2">
                                {idx + 1}
                              </span>
                              {step.name}
                            </td>
                            <td className="px-4 py-3 text-brand-gray">{step.description}</td>
                            <td className="px-4 py-3">
                              <span className="bg-brand-black/5 px-2 py-0.5 rounded text-[10px] font-bold text-brand-black">
                                {step.responsibleRole}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-bold text-brand-red">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs">{step.sla != null ? `${step.sla} ${step.slaUnit === 'Days' ? 'd' : 'h'}` : 'n/a'}</span>
                                {step.hasRequirements && step.requirements && (
                                  <span className="text-[9px] text-[#A6192E] font-medium block truncate max-w-[120px]" title={step.requirements}>
                                    Req: {step.requirements}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-bold mb-2">Subject</label>
            <input 
              className="input-field" 
              placeholder="Brief summary of the issue"
              maxLength={200}
              value={formData.title || ''}
              onChange={e => setFormData({...formData, title: e.target.value})}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Type</label>
            <select 
              className="input-field"
              value={formData.type || ''}
              onChange={e => {
                const newType = e.target.value;
                const firstSubtype = categories.find(c => c.type === newType)?.subtype || '';
                setFormData({...formData, type: newType, subtype: firstSubtype});
              }}
            >
              <option value="" disabled>Select Type</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Sub-Type</label>
            <select 
              className="input-field"
              value={formData.subtype || ''}
              onChange={e => setFormData({...formData, subtype: e.target.value})}
              disabled={!formData.type}
            >
              <option value="" disabled>Select Sub-Type</option>
              {subtypes.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Priority</label>
            <select 
              className="input-field"
              value={formData.priority || 'Medium'}
              onChange={e => setFormData({...formData, priority: e.target.value as Priority})}
            >
              <option value="Critical">Critical (SLA: {slaLabel(slaConfigs.find(s => s.priority === 'Critical')?.hours)})</option>
              <option value="High">High (SLA: {slaLabel(slaConfigs.find(s => s.priority === 'High')?.hours)})</option>
              <option value="Medium">Medium (SLA: {slaLabel(slaConfigs.find(s => s.priority === 'Medium')?.hours)})</option>
              <option value="Low">Low (SLA: {slaLabel(slaConfigs.find(s => s.priority === 'Low')?.hours)})</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-bold mb-2">Description</label>
            <textarea 
              className="input-field min-h-[150px] py-3" 
              placeholder="Please provide as much detail as possible..."
              value={formData.description || ''}
              onChange={e => setFormData({...formData, description: e.target.value})}
              required
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-bold mb-2">Attachments (Max 5 MB)</label>
            <div className="flex flex-wrap gap-4">
              <label className="w-24 h-24 border-2 border-dashed border-brand-black/10 rounded-xl flex flex-col items-center justify-center text-brand-gray hover:border-brand-red hover:text-brand-red transition-all cursor-pointer">
                <Paperclip size={24} />
                <span className="text-[10px] mt-1 font-bold">ADD FILE</span>
                <input type="file" className="hidden" onChange={handleFileChange} />
              </label>
              {attachments.map((at, i) => (
                <div key={i} className="w-24 h-24 rounded-xl border border-black/5 overflow-hidden relative group">
                  {isSafeImage(at) ? (
                    <img src={at} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-brand-light text-brand-gray">
                      <Paperclip size={24} />
                    </div>
                  )}
                  <button 
                    type="button"
                    onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                    aria-label={`Remove attachment ${i + 1}`}
                    className="absolute inset-0 bg-brand-red/80 text-white opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center font-bold text-xs"
                  >
                    REMOVE
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-black/5 flex justify-end">
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="btn-primary flex items-center gap-2 px-8 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
            {isSubmitting ? 'Submitting...' : 'Submit Ticket'}
          </button>
        </div>
      </motion.form>
    </div>
  );
};
