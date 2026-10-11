import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  List, 
  Plus, 
  GitBranch, 
  LayoutDashboard, 
  Building2, 
  Search, 
  Filter, 
  ArrowRight, 
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  Share2,
  FileText,
  Download,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useAuth } from '../services/AuthContext';
import { WorkflowRequest, Role, Department } from '../types';
import { workflowService } from '../services/workflowService';

// Sub-components
import { WorkflowDashboard } from './workflow/WorkflowDashboard';
import { WorkflowList } from './workflow/WorkflowList';
import { WorkflowForm } from './workflow/WorkflowForm';
import { WorkflowDetail } from './workflow/WorkflowDetail';
import { ComparisonDashboard } from './workflow/ComparisonDashboard';

type ViewState = 'dashboard' | 'list' | 'create' | 'edit' | 'detail' | 'comparison' | 'my-department';

export const WorkflowSLAAlignment: React.FC = () => {
  const { user, permissions } = useAuth();
  const [activeView, setActiveView] = useState<ViewState>('dashboard');
  const [requests, setRequests] = useState<WorkflowRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<WorkflowRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);

  const isAdmin = user?.role?.toLowerCase()?.includes('admin') || false;
  const isDeptHead = user?.role?.toLowerCase()?.includes('head') || false;
  const isSales = user?.role?.toLowerCase()?.includes('sales') || false;

  const canCreate = isAdmin || (permissions?.canCreateWorkflow === true && (
    !permissions.allowedDepartmentsToCreate || 
    permissions.allowedDepartmentsToCreate.length === 0 ||
    !user?.department ||
    permissions.allowedDepartmentsToCreate.some(d => d?.toLowerCase() === user.department?.toLowerCase())
  ));

  const canApprove = isAdmin || (permissions?.canApproveWorkflow === true && (
    !permissions.allowedDepartmentsToApprove || 
    permissions.allowedDepartmentsToApprove.length === 0 ||
    !user?.department ||
    permissions.allowedDepartmentsToApprove.some(d => d?.toLowerCase() === user.department?.toLowerCase())
  ));

  useEffect(() => {
    fetchRequests();
  }, []);

  // Leave the edit form when the user may not edit (state change belongs in an effect, not in render)
  useEffect(() => {
    if (activeView === 'edit' && !permissions?.canEditWorkflow) setActiveView('list');
  }, [activeView, permissions?.canEditWorkflow]);

  // Escape closes the delete dialog
  useEffect(() => {
    if (!isDeleting) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isDeleteLoading) setIsDeleting(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDeleting, isDeleteLoading]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const data = await workflowService.getAll();
      setRequests(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError('Failed to fetch workflow requests');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (data: Partial<WorkflowRequest>) => {
    try {
      const newRequest = await workflowService.create(data as Omit<WorkflowRequest, 'id' | 'createdAt' | 'updatedAt'>);
      setRequests(prev => [...prev, newRequest]);
      setActiveView('list');
    } catch (err: any) {
      console.error('Failed to create request:', err);
      toast.error(err?.message || 'Failed to create workflow. Please try again.');
      throw err;
    }
  };

  const handleUpdate = async (id: string, data: Partial<WorkflowRequest>) => {
    try {
      if (!permissions?.canEditWorkflow) {
        console.error('Unauthorized update attempt');
        toast.error('You do not have permission to edit this workflow.');
        return;
      }

      // Optimistic update
      setRequests(prev => prev.map(r => r.id === id ? { ...r, ...data } as WorkflowRequest : r));
      if (selectedRequest?.id === id) setSelectedRequest(prev => prev ? { ...prev, ...data } as WorkflowRequest : null);
      
      const updated = await workflowService.update(id, data);
      
      // Sync with server result
      setRequests(prev => prev.map(r => r.id === id ? updated : r));
      if (selectedRequest?.id === id) setSelectedRequest(updated);
      
      // Only navigate if we are in 'edit' view (the form)
      if (activeView === 'edit') {
        setActiveView('list');
      }
    } catch (err: any) {
      console.error('Failed to update request:', err);
      toast.error(err?.message || 'Failed to update workflow. Please try again.');
      // Revert on error (re-fetch)
      fetchRequests();
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setIsDeleteLoading(true);
      const request = requests.find(r => r.id === id);
      if (!isAdmin && (user?.id == null || String(request?.createdBy) !== String(user.id))) {
        console.error('Unauthorized delete attempt');
        toast.error('Only the creator or an administrator can delete this workflow.');
        setIsDeleting(null);
        setIsDeleteLoading(false);
        return;
      }

      await workflowService.delete(id, user?.id != null ? String(user.id) : undefined, user?.name);
      setRequests(prev => prev.filter(r => r.id !== id));
      setIsDeleting(null);
      setIsDeleteLoading(false);
      setActiveView('list');
      toast.success('Workflow deleted');
    } catch (err: any) {
      console.error('Failed to delete request:', err);
      toast.error(err?.message || 'Failed to delete workflow.');
      setIsDeleting(null);
      setIsDeleteLoading(false);
    }
  };

  const handleDuplicate = async (request: WorkflowRequest) => {
    try {
      // Need to clean the object to create a new one: remove ID, dates, user
      const { id, createdAt, updatedAt, createdBy, createdByName, ...dataToDuplicate } = request;
      const duplicatedData = {
        ...dataToDuplicate,
        title: `${request.title} (Copy)`,
        status: 'Draft' as const
      };
      
      const newRequest = await workflowService.create(duplicatedData);
      setRequests(prev => [...prev, newRequest]);
      toast.success('Workflow duplicated as a draft');
    } catch (err: any) {
      console.error('Failed to duplicate request:', err);
      toast.error(err?.message || 'Failed to duplicate workflow.');
    }
  };

  const handleToggleVisibility = async (request: WorkflowRequest) => {
    try {
      const updatedData = { isHidden: !request.isHidden };
      const updated = await workflowService.update(request.id, updatedData);
      setRequests(prev => prev.map(r => r.id === request.id ? updated : r));
      if (selectedRequest?.id === request.id) setSelectedRequest(updated);
    } catch (err: any) {
      console.error('Failed to toggle visibility:', err);
      toast.error(err?.message || 'Failed to change visibility.');
    }
  };

  const handleStatusChange = async (id: string, status: WorkflowRequest['status']) => {
    try {
      const updated = await workflowService.update(id, { status });
      setRequests(prev => prev.map(r => r.id === id ? updated : r));
      if (selectedRequest?.id === id) setSelectedRequest(updated);
    } catch (err: any) {
      console.error('Failed to update status:', err);
      toast.error(err?.message || 'Failed to update status.');
    }
  };

  const handleAddFeedback = async (id: string, feedback: { recommendedSLA: number; businessJustification: string }) => {
    try {
      const updated = await workflowService.update(id, { salesFeedback: feedback });
      setRequests(prev => prev.map(r => r.id === id ? updated : r));
      if (selectedRequest?.id === id) setSelectedRequest(updated);
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
            onView={(req) => { setSelectedRequest(req); setActiveView('detail'); }}
            onEdit={(req) => { setSelectedRequest(req); setActiveView('edit'); }}
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
        if (!permissions?.canEditWorkflow) return null; // effect above redirects to the list

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
            onEdit={(req) => { setSelectedRequest(req); setActiveView('edit'); }}
            onDelete={(id) => setIsDeleting(id)}
            onUpdate={(updatedReq) => handleUpdate(updatedReq.id, updatedReq)}
            onStatusChange={handleStatusChange}
            onAddFeedback={handleAddFeedback}
          />
        ) : null;
      case 'comparison':
        return (
          <ComparisonDashboard 
            requests={requests} 
            onViewRequest={(req) => { setSelectedRequest(req); setActiveView('detail'); }}
          />
        );
      case 'my-department':
        const deptRequests = user?.department ? requests.filter(r => r.department === user.department) : [];
        return (
          <WorkflowList 
            requests={deptRequests} 
            onView={(req) => { setSelectedRequest(req); setActiveView('detail'); }}
            onEdit={(req) => { setSelectedRequest(req); setActiveView('edit'); }}
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
    <div className="min-h-screen bg-brand-gray/5 p-8">
      {/* Module Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-brand-red font-bold text-xs uppercase tracking-widest">
            <GitBranch size={14} />
            Enterprise Alignment
          </div>
          <h1 className="text-4xl font-bold text-brand-black tracking-tight">Workflow & SLA Alignment</h1>
          <p className="text-brand-gray text-sm">Define, review, and align departmental workflows before CRM implementation.</p>
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
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="w-12 h-12 border-4 border-brand-red/20 border-t-brand-red rounded-full animate-spin" />
            <p className="text-brand-gray font-bold text-sm animate-pulse">Loading workflow data...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-100 p-8 rounded-3xl text-center">
            <AlertTriangle size={48} className="mx-auto text-red-500 mb-4" />
            <h3 className="text-lg font-bold text-red-900 mb-2">Error Loading Data</h3>
            <p className="text-red-700 mb-6">{error}</p>
            <button 
              onClick={fetchRequests}
              className="bg-red-600 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-red-700 transition-all"
            >
              Retry
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
