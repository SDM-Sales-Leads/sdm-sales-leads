import React from 'react';
import { WORKFLOW_DEPARTMENTS } from './departments';
import { WorkflowRequest } from '../../types';
import { WORKING_HOURS_PER_DAY } from '../../constants';
import { toast } from 'sonner';

// SLA helpers: hours are summed from the steps themselves (never from a stored total that can be stale);
// days are rounded UP so a workflow is never shown as shorter than it is. No SLA entered -> "—".
const stepsHours = (steps?: { sla?: number; slaUnit?: string }[]) =>
  (steps || []).reduce((sum, s) => sum + (Number.isFinite(s.sla as number) ? (s.sla as number) * (s.slaUnit === 'Days' ? WORKING_HOURS_PER_DAY : 1) : 0), 0);
const hoursToDays = (h: number) => Math.ceil(h / WORKING_HOURS_PER_DAY);
import { 
  Edit, 
  Trash2, 
  Eye, 
  EyeOff,
  Copy,
  Clock, 
  GitBranch, 
  AlertCircle,
  CheckCircle2,
  MoreVertical,
  Search,
  Filter,
  Loader2,
  Download
} from 'lucide-react';
import { useWorkflowAccess } from './access';
import { settleRender } from './settleRender';
import jsPDF from 'jspdf';
import { domToCanvas } from 'modern-screenshot';
import { WorkflowExportTemplate } from './WorkflowExportTemplate';

interface WorkflowListProps {
  requests: WorkflowRequest[];
  onEdit: (request: WorkflowRequest) => void;
  onView: (request: WorkflowRequest) => void;
  onDelete: (id: string) => void;
  onDuplicate: (request: WorkflowRequest) => void;
  onToggleVisibility: (request: WorkflowRequest) => void;
}

export const WorkflowList: React.FC<WorkflowListProps> = ({ requests, onEdit, onView, onDelete, onDuplicate, onToggleVisibility }) => {
  const { isAdmin, canEditFor, canCreateFor, canDelete } = useWorkflowAccess();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [filterDept, setFilterDept] = React.useState('All');
  const [isBulkExporting, setIsBulkExporting] = React.useState(false);
  const [completedCount, setCompletedCount] = React.useState(0);


  const filteredRequests = requests.filter(r => {
    const matchesSearch = (r.title?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                         (r.description?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesDept = filterDept === 'All' || r.department === filterDept;
    
    // For non-admins: hide if hidden
    if (!isAdmin && r.isHidden) return false;
    
    return matchesSearch && matchesDept;
  });

  // Export only visible requests (ignoring hidden workflows)
  const requestsToExport = filteredRequests.filter(r => !r.isHidden);

  const handleBulkExportPDF = async () => {
    if (requestsToExport.length === 0) return;
    try {
      setIsBulkExporting(true);
      setCompletedCount(0);

      // wait until the off-screen pages are mounted, fonts and images are ready (no fixed delay)
      await settleRender('[id^="bulk-export-container-"]');

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < requestsToExport.length; i++) {
        const req = requestsToExport[i];
        const containerElement = document.getElementById(`bulk-export-container-${req.id}`);

        if (containerElement) {
          const canvas = await domToCanvas(containerElement, {
            scale: 1.5, // Crisp resolution
            backgroundColor: '#ffffff',
          });

          const imgData = canvas.toDataURL('image/jpeg', 0.95);

          if (i > 0) {
            pdf.addPage();
          }

          pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
        }
        setCompletedCount(i + 1);
      }

      pdf.save(`Bulk_Workflows_Export_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Error exporting bulk PDF:', error);
      toast.error('Failed to export the PDF. Please try again.');
    } finally {
      setIsBulkExporting(false);
      setCompletedCount(0);
    }
  };

  const handleDelete = (id: string) => {
    onDelete(id);
  };

  const getComplexityColor = (level: string) => {
    switch (level) {
      case 'Simple': return 'bg-green-100 text-green-700 border-green-200';
      case 'Medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'Complex': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Draft': return <span className="flex items-center gap-1 text-xs font-bold text-brand-gray bg-brand-gray/10 px-2 py-1 rounded border border-brand-gray/20 uppercase tracking-wider"><Clock size={12} /> Draft</span>;
      case 'Aligned': return <span className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 uppercase tracking-wider"><CheckCircle2 size={12} /> Aligned</span>;
      case 'Finalized': return <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100 uppercase tracking-wider"><CheckCircle2 size={12} /> Finalized</span>;
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-2xl border border-brand-gray/20 shadow-sm items-center justify-between">
        <div className="flex-1 relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray" size={18} />
          <input
            type="text"
            placeholder="Search requests..."
            aria-label="Search requests"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-brand-gray/5 border border-brand-gray/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red transition-all"
          />
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 flex-grow sm:flex-grow-0">
            <Filter size={18} className="text-brand-gray" />
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              aria-label="Filter by department"
              className="bg-transparent focus:outline-none text-sm font-medium w-full"
            >
              <option value="All">All Departments</option>
                {WORKFLOW_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          
          <button
            onClick={handleBulkExportPDF}
            disabled={isBulkExporting || requestsToExport.length === 0}
            className="flex items-center justify-center gap-2 bg-brand-black text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            title="Bulk Export Visible Workflows"
          >
            {isBulkExporting ? (
              <>
                <Loader2 className="animate-spin text-white flex-shrink-0" size={16} />
                <span>Exporting ({completedCount}/{requestsToExport.length})</span>
              </>
            ) : (
              <>
                <Download size={16} className="text-white flex-shrink-0" />
                <span>Bulk Export ({requestsToExport.length})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-brand-gray/20 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-gray/5 border-b border-brand-gray/20">
                <th className="px-6 py-4 text-xs font-bold text-brand-gray uppercase tracking-wider">Request Title</th>
                <th className="px-6 py-4 text-xs font-bold text-brand-gray uppercase tracking-wider">Department</th>
                <th className="px-6 py-4 text-xs font-bold text-brand-gray uppercase tracking-wider">Complexity</th>
                <th className="px-6 py-4 text-xs font-bold text-brand-gray uppercase tracking-wider">Total SLA</th>
                <th className="px-6 py-4 text-xs font-bold text-brand-gray uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-brand-gray uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-gray/10">
              {filteredRequests.map((request) => (
                <tr key={request.id} className={`${request.isHidden ? "opacity-50 grayscale bg-gray-100" : "hover:bg-brand-gray/5"} transition-colors group`}>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span 
                        className="font-bold text-brand-black group-hover:text-brand-red transition-colors cursor-help select-all break-words" 
                        title={request.title}
                      >
                        {request.title}
                      </span>
                      <span className="text-[10px] text-brand-gray font-medium">by {request.createdByName || 'Unknown'} • {new Date(request.createdAt).toLocaleDateString()}</span>
                      <span className="text-xs text-brand-gray truncate max-w-[200px] mt-1">{request.description}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {Array.from(new Set(request.steps?.map(s => s.responsibleRole) || [])).map((dept, idx) => (
                        <span key={idx} className="text-[10px] font-bold text-brand-gray uppercase tracking-widest bg-brand-gray/10 px-1.5 py-0.5 rounded">
                          {dept}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-bold px-2 py-1 rounded border uppercase tracking-wider ${getComplexityColor(request.complexity)}`}>
                      {request.complexity}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-green-600">{stepsHours(request.steps) > 0 ? `SLA: ${hoursToDays(stepsHours(request.steps))}d / ${stepsHours(request.steps)}h` : 'SLA: —'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(request.status)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => onView(request)}
                        className="p-2 text-brand-gray hover:text-brand-red hover:bg-brand-red/10 rounded-lg transition-all"
                        title="View Details"
                      >
                        <Eye size={18} />
                      </button>
                      
                      {canCreateFor(request.department) && (
                      <button 
                        onClick={() => onDuplicate(request)}
                        className="p-2 text-brand-gray hover:text-brand-red hover:bg-brand-red/10 rounded-lg transition-all"
                        title="Duplicate"
                      >
                        <Copy size={18} />
                      </button>
                      )}
                      
                      {isAdmin && (
                        <button 
                          onClick={() => onToggleVisibility(request)}
                          className="p-2 text-brand-gray hover:text-brand-black hover:bg-brand-gray/10 rounded-lg transition-all"
                          title={request.isHidden ? "Show Workflow" : "Hide Workflow"}
                        >
                          {request.isHidden ? <Eye size={18} /> : <EyeOff size={18} />}
                        </button>
                      )}
                      
                      {/* Allow editing workflow to anyone with edit permission */}
                      {canEditFor(request.department) && (
                        <button 
                          onClick={() => onEdit(request)}
                          className="p-2 text-brand-gray hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Edit Workflow"
                        >
                          <Edit size={18} />
                        </button>
                      )}

                      {/* Only allow delete if user is admin or creator */}
                      {canDelete(request) && (
                        <button 
                          onClick={() => handleDelete(request.id)}
                          className="p-2 text-brand-gray hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-brand-gray">
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle size={32} className="text-brand-gray/30" />
                      <p>No workflow requests found matching your criteria.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Hidden Bulk Export Templates - Rendered off-screen for PDF generation */}
      {isBulkExporting && (
        <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
          {requestsToExport.map((req) => (
            <div key={req.id} id={`bulk-export-container-${req.id}`}>
              <WorkflowExportTemplate request={req} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
