import React, { useState, useMemo } from 'react';
import { Lead } from './types';
import { crmService } from './crmService';
import { 
  ShieldAlert, 
  CheckCircle, 
  XCircle, 
  HelpCircle, 
  User, 
  Clock, 
  AlertCircle,
  TrendingUp,
  FileText
} from 'lucide-react';
import { motion } from 'motion/react';

interface CrmSalesApprovalsProps {
  leads: Lead[];
  onLeadsUpdated: () => void;
  currentRole: string;
}

export const CrmSalesApprovals: React.FC<CrmSalesApprovalsProps> = ({ leads, onLeadsUpdated, currentRole }) => {
  // No approval-request store exists in the backend yet: show real (empty) data, never seeded demo requests.
  // Shape a future backend must provide: { id, type, requester, submittedDate, leadId, details, status }
  type ApprovalReq = { id: string; type: string; requester: string; submittedDate: string; leadId: string; details: string; status: 'Pending' | 'Approved' | 'Rejected'; targetSalespersonId?: string; targetSalespersonName?: string };
  const [approvals, setApprovals] = useState<ApprovalReq[]>([]);

  const hasOverridePermission = 
    currentRole === 'System Administrator' || 
    currentRole === 'Sales Manager' || 
    currentRole === 'Sales Operations Manager' || 
    (currentRole?.toLowerCase() || '').includes('admin');

  const handleAction = (reqId: string, status: 'Approved' | 'Rejected') => {
    if (!hasOverridePermission) {
      alert('Unauthorized. Only Sales Operations Managers and Administrators have operational override authorization.');
      return;
    }

    setApprovals(prev => prev.map(a => {
      if (a.id === reqId) {
        return { ...a, status };
      }
      return a;
    }));

    // Reassignment: re-read leads right before saving so nothing else is overwritten, and use the request's own target
    const req = approvals.find(a => a.id === reqId);
    if (req && status === 'Approved' && req.type === 'Lead Assignment Override') {
      const target = req.targetSalespersonName;
      if (!target) {
        alert('This request has no target salesperson; assign the lead manually.');
        return;
      }
      const crmLeads = crmService.getLeads();
      const updated = crmLeads.map(l => {
        if (l.id !== req.leadId) return l;
        return {
          ...l,
          assignedSalespersonId: req.targetSalespersonId || l.assignedSalespersonId,
          assignedSalespersonName: target,
          lastUpdated: new Date().toISOString(),
          timeline: [
            {
              id: 'act_' + Math.random().toString(36).substr(2, 9),
              timestamp: new Date().toISOString(),
              type: 'Assignment' as const,
              title: 'Sales Operations Transfer Approved',
              description: `Lead assigned agent overridden to ${target} following approval of ${req.id}.`,
              user: currentRole
            },
            ...(l.timeline || [])
          ]
        };
      });
      crmService.saveLeads(updated);
      onLeadsUpdated();
    }
  };

  return (
    <div className="space-y-6" id="crm-sales-approvals-root">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold text-brand-black flex items-center gap-2">
            <span>Sales Operations Approval Authority</span>
            <span className="text-xs bg-brand-red/10 text-brand-red font-bold px-2.5 py-0.5 rounded-full">
              Audit Pending ({approvals.filter(a => a.status === 'Pending').length})
            </span>
          </h3>
          <p className="text-xs text-brand-gray/80 mt-1">
            Auditing log for lead transfers, merge conflicts, status overrides, and high-value project approvals requiring executive checkoffs.
          </p>
        </div>
      </div>

      {/* Access alert info */}
      {!hasOverridePermission && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex gap-3">
          <AlertCircle size={18} className="text-amber-600 flex-shrink-0" />
          <p className="font-semibold leading-normal">
            Operational Audit mode: You are logged in with a standard role. Approvals and override actions are read-only.
          </p>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-brand-gray/20 shadow-sm overflow-hidden text-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-gray/5 border-b border-brand-gray/15 text-brand-gray text-[10px] font-bold uppercase tracking-wider">
                <th className="py-4 px-4">Request ID</th>
                <th className="py-4 px-3">Transaction Category</th>
                <th className="py-4 px-3">Submitted By</th>
                <th className="py-4 px-3">Associated ID</th>
                <th className="py-4 px-3">Reasoning Summary</th>
                <th className="py-4 px-3">Status</th>
                <th className="py-4 px-4 text-right">Authorize</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-gray/10 text-xs font-semibold text-brand-black">
              {approvals.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-brand-gray font-semibold">No approval requests.</td></tr>
              )}
              {approvals.map((req) => {
                let statusColor = 'bg-yellow-100 text-yellow-800';
                if (req.status === 'Approved') statusColor = 'bg-emerald-100 text-emerald-800';
                if (req.status === 'Rejected') statusColor = 'bg-rose-100 text-rose-800';

                return (
                  <tr key={req.id} className="hover:bg-brand-gray/5 transition-all">
                    <td className="py-4 px-4 font-bold font-mono text-brand-red">{req.id}</td>
                    <td className="py-4 px-3 font-bold text-brand-black">{req.type}</td>
                    <td className="py-4 px-3 text-brand-gray font-semibold flex items-center gap-1">
                      <User size={12} className="text-brand-gray" />
                      {req.requester}
                    </td>
                    <td className="py-4 px-3 font-mono font-bold text-indigo-600">{req.leadId}</td>
                    <td className="py-4 px-3 text-brand-gray font-medium max-w-xs truncate" title={req.details}>
                      {req.details}
                    </td>
                    <td className="py-4 px-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black ${statusColor}`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      {req.status === 'Pending' ? (
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => handleAction(req.id, 'Approved')}
                            disabled={!hasOverridePermission}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-2.5 py-1 rounded-lg font-bold text-[10px]"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleAction(req.id, 'Rejected')}
                            disabled={!hasOverridePermission}
                            className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white px-2.5 py-1 rounded-lg font-bold text-[10px]"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-brand-gray font-bold text-[10px]">Processed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
