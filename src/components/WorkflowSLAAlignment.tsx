import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BarChart3, 
  List, 
  Plus, 
  GitBranch, 
  LayoutDashboard, 
  Building2, 
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useAuth } from '../services/AuthContext';
import { WorkflowRequest } from '../types';
import { workflowService } from '../services/workflowService';
import { refData, useRefStore } from '../services/refData';
import { useWorkflowAccess } from './workflow/access';
import { stepsHours } from './workflow/sla';

// Sub-components
import { WorkflowDashboard } from './workflow/WorkflowDashboard';
import { WorkflowList } from './workflow/WorkflowList';
import { WorkflowForm } from './workflow/WorkflowForm';
import { WorkflowDetail } from './workflow/WorkflowDetail';
import { ComparisonDashboard } from './workflow/ComparisonDashboard';

type ViewState = 'dashboard' | 'list' | 'create' | 'edit' | 'detail' | 'comparison' | 'my-department';

export const WorkflowSLAAlignment: React.FC = () => {
  const { user, permissions } = useAuth();
  const { isAdmin, canCreate, canEditFor } = useWorkflowAccess();
  const [activeView, setActiveView] = useState<ViewState>('dashboard');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The list comes from the shared cache: instant when it is warm (prefetched or visited before), refreshed quietly
  // when older than 2 minutes. Saves below update the same cache, so every screen sees them at once.
  const wf = useRefStore(refData.workflows);
  const requests = useMemo<WorkflowRequest[]>(() => wf.data ?? [], [wf.data]);
  const selectedRequest = useMemo(() => (selectedId ? requests.find(r => r.id === selectedId) ?? null : null), [requests, selectedId]);
  const showRequest = (req: WorkflowRequest) => { setSelectedId(req.id); setActiveView('detail'); };
  const editRequest = (req: WorkflowRequest) => { setSelectedId(req.id); setActiveView('edit'); };

  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);

  const isDeptHead = user?.role?.toLowerCase()?.includes('head') || false;

  // Leave the edit form when the user may not edit this workflow (state change belongs in an effect, not in render)
  useEffect(() => {
    if (activeView === 'edit' && selectedRequest && !canEditFor(selectedRequest.department)) setActiveView('list');
  }, [activeView, selectedRequest, canEditFor]);

  // Escape closes the delete dialog
  useEffect(() => {
    if (!isDeleting) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isDeleteLoading) setIsDeleting(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDeleting, isDeleteLoading]);

  const handleCreate = async (data: Partial<WorkflowRequest>) => {
    try {
      await workflowService.create(data);
      setActiveView('list');
    } catch (err: any) {
      console.error('Failed to create request:', err);
      toast.error(err?.message || 'Failed to create workflow. Please try again.');
      throw err;
    }
  };

  const handleUpdate = async (id: string, data: Partial<WorkflowRequest>) => {
    const current = requests.find(r => r.id === id);
    if (!canEditFor(current?.department)) {
      toast.error('You do not have permission to edit this workflow.');
      return;
    }
    try {
      // the stored total SLA decides the deadline of tickets made from this workflow: keep it equal to the steps
      const body = data.steps ? { ...data, totalSLA: stepsHours(data.steps) } : data;
      await workflowService.update(id, body); // the cache is updated with the server's answer
      if (activeView === 'edit') setActiveView('list'); // only the edit form closes after saving
    } catch (err: any) {
      console.error('Failed to update request:', err);
      toast.error(err?.message || 'Failed to update workflow. Please try again.');
      throw err;
    }
  };

  // Steps edited on the detail page (canvas: every typed letter changes them): shown at once from the cache, saved
  // once the user pauses (700 ms), one request at a time, the latest version wins.
  const pendingSteps = useRef<{ id: string; steps: WorkflowRequest['steps']; timer: ReturnType<typeof setTimeout> } | null>(null);
  const savingSteps = useRef<Promise<unknown>>(Promise.resolve());
  const flushSteps = () => {
    const p = pendingSteps.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingSteps.current = null;
    savingSteps.current = savingSteps.current.then(async () => {
      try {
        await workflowService.update(p.id, { steps: p.steps, totalSLA: stepsHours(p.steps) }, { quiet: true });
      } catch (err: any) {
        toast.error(err?.message || 'Could not save the workflow steps.');
        refData.workflows.invalidate(); // show what the server really has
      }
    });
  };
  const saveSteps = (id: string, steps: WorkflowRequest['steps']) => {
    const current = requests.find(r => r.id === id);
    if (!canEditFor(current?.department)) { toast.error('You do not have permission to edit this workflow.'); return; }
    refData.workflows.set(prev => (prev || []).map(r => (r.id === id ? { ...r, steps, totalSLA: stepsHours(steps) } : r)));
    if (pendingSteps.current && pendingSteps.current.id !== id) flushSteps();
    if (pendingSteps.current) clearTimeout(pendingSteps.current.timer);
    pendingSteps.current = { id, steps, timer: setTimeout(flushSteps, 700) };
  };
  // leaving the page or the detail view: save what is waiting
  useEffect(() => { if (activeView !== 'detail') flushSteps(); }, [activeView]);
  useEffect(() => () => flushSteps(), []);

  const handleDelete = async (id: string) => {
    try {
      setIsDeleteLoading(true);
      await workflowService.delete(id);
      setIsDeleting(null);
      setSelectedId(null);
      setActiveView('list');
      toast.success('Workflow deleted');
    } catch (err: any) {
      console.error('Failed to delete request:', err);
      toast.error(err?.message || 'Failed to delete workflow.');
      setIsDeleting(null);
    } finally {
      setIsDeleteLoading(false);
    }
  };

  const handleDuplicate = async (request: WorkflowRequest) => {
    try {
      // a copy starts fresh: no id, dates, owner, feedback or visibility setting, and is always a draft
      const { id, createdAt, updatedAt, createdBy, createdByName, salesFeedback, isHidden, ...dataToDuplicate } = request;
      await workflowService.create({ ...dataToDuplicate, title: `${request.title} (Copy)`, status: 'Draft' });
      toast.success('Workflow duplicated as a draft');
    } catch (err: any) {
      console.error('Failed to duplicate request:', err);
      toast.error(err?.message || 'Failed to duplicate workflow.');
    }
  };

  const handleToggleVisibility = async (request: WorkflowRequest) => {
    try {
      await workflowService.update(request.id, { isHidden: !request.isHidden });
    } catch (err: any) {
      console.error('Failed to toggle visibility:', err);
      toast.error(err?.message || 'Failed to change visibility.');
    }
  };

  const handleStatusChange = async (id: string, status: WorkflowRequest['status']) => {
    try {
      await workflowService.update(id, { status });
    } catch (err: any) {
      console.error('Failed to update status:', err);
      toast.error(err?.message || 'Failed to update status.');
    }
  };

  const handleAddFeedback = async (id: string, feedback: { recommendedSLA: number; businessJustification: string }) => {
    try {
      await workflowService.update(id, { salesFeedback: feedback });
    } catch (err: any) {
      console.error('Failed to add feedback:', err);
      toast.error(err?.message || 'Failed to save feedback.');
    }
  };

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <WorkflowDashboard requests={requests} />;
      case 'list':
        return (
          <WorkflowList 
            requests={requests} 
            onView={showRequest}
            onEdit={editRequest}
            onDelete={(id) => setIsDeleting(id)}
            onDuplicate={handleDuplicate}
            onToggleVisibility={handleToggleVisibility}
          />
        );
      case 'create':
        return (
          <WorkflowForm 
            onSubmit={handleCreate} 
            onCancel={() => setActiveView('list')} 
          />
        );
      case 'edit':
        if (!selectedRequest) return null;
        if (!canEditFor(selectedRequest.department)) return null; // effect above redirects to the list

        return (
          <WorkflowForm 
            initialData={selectedRequest}
            onSubmit={(data) => handleUpdate(selectedRequest.id, data)} 
            onCancel={() => setActiveView('list')} 
          />
        );
      case 'detail':
        return selectedRequest ? (
          <WorkflowDetail 
            request={selectedRequest}
            onBack={() => setActiveView('list')}
            onEdit={editRequest}
            onDelete={(id) => setIsDeleting(id)}
            onUpdate={(updatedReq) => saveSteps(updatedReq.id, updatedReq.steps)}
            onStatusChange={handleStatusChange}
            onAddFeedback={handleAddFeedback}
          />
        ) : null;
      case 'comparison':
        return (
          <ComparisonDashboard 
            requests={requests} 
            onViewRequest={showRequest}
          />
        );
      case 'my-department':
        const deptRequests = user?.department ? requests.filter(r => r.department === user.department) : [];
        return (
          <WorkflowList 
            requests={deptRequests} 
            onView={showRequest}
            onEdit={editRequest}
            onDelete={(id) => setIsDeleting(id)}
            onDuplicate={handleDuplicate}
            onToggleVisibility={handleToggleVisibility}
          />
        );
      default:
        return <WorkflowDashboard requests={requests} />;
    }
  };

  return (
    <div className="min-h-screen bg-brand-gray/5 p-4 md:p-8">
      {/* Module Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-brand-red font-bold text-xs uppercase tracking-widest">
            <GitBranch size={14} />
            Enterprise Alignment
          </div>
          <h1 className="text-4xl font-bold text-brand-black tracking-tight">Workflow & SLA Alignment</h1>
          <p className="text-brand-gray text-sm">Define each department's process and its SLA, review it with the team and finalize it. Finalized workflows can be chosen as a template when a ticket is created.</p>
        </div>

        <div className="flex items-center gap-3">
          {canCreate && (
            <button 
              onClick={() => setActiveView('create')}
              className="flex items-center gap-2 bg-brand-red text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-brand-red/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Plus size={18} /> Define New Workflow
            </button>
          )}
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="overflow-x-auto max-w-full pb-2 mb-6 scrollbar-thin">
        <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-brand-gray/10 w-max shadow-sm">
          <TabButton 
            active={activeView === 'dashboard'} 
            onClick={() => setActiveView('dashboard')} 
            icon={<LayoutDashboard size={16} />} 
            label="Dashboard" 
          />
          <TabButton 
            active={activeView === 'list'} 
            onClick={() => setActiveView('list')} 
            icon={<List size={16} />} 
            label="All Requests" 
          />
          {isDeptHead && (
            <TabButton 
              active={activeView === 'my-department'} 
              onClick={() => setActiveView('my-department')} 
              icon={<Building2 size={16} />} 
              label="My Department" 
            />
          )}
          {isAdmin && (
            <TabButton 
              active={activeView === 'comparison'} 
              onClick={() => setActiveView('comparison')} 
              icon={<BarChart3 size={16} />} 
              label="Comparison View" 
            />
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative">
        {!wf.data && wf.loading ? (
          // first ever visit with nothing cached: skeleton of the list, not a full-page spinner
          <div className="space-y-3" role="status" aria-label="Loading workflows">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-16 rounded-2xl bg-white/70 border border-brand-gray/10 animate-pulse" />)}
          </div>
        ) : !wf.data && wf.error ? (
          <div className="bg-red-50 border border-red-100 p-8 rounded-3xl text-center" role="alert">
            <AlertTriangle size={48} className="mx-auto text-red-500 mb-4" />
            <h3 className="text-lg font-bold text-red-900 mb-2">Error Loading Data</h3>
            <p className="text-red-700 mb-6">{wf.error}</p>
            <button 
              onClick={() => refData.workflows.load({ force: true }).catch(() => {})}
              className="inline-flex items-center gap-2 bg-red-600 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-red-700 transition-all"
            >
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleting && (
          <div role="dialog" aria-modal="true" aria-label="Delete workflow" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleting(null)}
              className="absolute inset-0 bg-brand-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-brand-gray/10"
            >
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-600 mb-6">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-2xl font-bold text-brand-black mb-2">Delete Workflow?</h3>
              <p className="text-brand-gray mb-8">This action cannot be undone. All steps and SLA data associated with this workflow will be permanently removed.</p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsDeleting(null)}
                  className="flex-1 px-6 py-3 rounded-xl font-bold text-sm text-brand-gray hover:bg-brand-gray/5 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDelete(isDeleting)}
                  disabled={isDeleteLoading}
                  className={`flex-1 px-6 py-3 rounded-xl font-bold text-sm bg-red-600 text-white shadow-lg shadow-red-200 hover:bg-red-700 transition-all ${isDeleteLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isDeleteLoading ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const TabButton: React.FC<TabButtonProps> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all shrink-0 ${
      active 
        ? 'bg-brand-black text-white shadow-md' 
        : 'text-brand-gray hover:bg-brand-gray/5 hover:text-brand-black'
    }`}
  >
    {icon}
    {label}
  </button>
);
