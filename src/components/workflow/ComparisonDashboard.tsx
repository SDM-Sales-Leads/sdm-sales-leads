import React, { useMemo, useState } from 'react';
import { WorkflowRequest } from '../../types';
import { WORKING_HOURS_PER_DAY } from '../../constants';

// SLA helpers: hours are summed from the steps themselves (never from a stored total that can be stale);
// days are rounded UP so a workflow is never shown as shorter than it is. No SLA entered -> "—".
const stepsHours = (steps?: { sla?: number; slaUnit?: string }[]) =>
  (steps || []).reduce((sum, s) => sum + (Number.isFinite(s.sla as number) ? (s.sla as number) * (s.slaUnit === 'Days' ? WORKING_HOURS_PER_DAY : 1) : 0), 0);
const hoursToDays = (h: number) => Math.ceil(h / WORKING_HOURS_PER_DAY);
import { 
  ArrowRight, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Building2, 
  BarChart3, 
  Layers, 
  Share2,
  AlertCircle,
  ChevronRight,
  Search,
  Filter,
  Download
} from 'lucide-react';
import { motion } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  Cell
} from 'recharts';

interface ComparisonDashboardProps {
  requests: WorkflowRequest[];
  onViewRequest: (request: WorkflowRequest) => void;
}

// CSV cell: quoted, and neutralised when it starts with = + - @ (spreadsheet formula injection)
const csvCell = (v: unknown) => {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return `"${t.replace(/"/g, '""')}"`;
};

export const ComparisonDashboard: React.FC<ComparisonDashboardProps> = ({ requests, onViewRequest }) => {
  const [search, setSearch] = useState('');
  const shownRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? requests.filter(r => (r.title || '').toLowerCase().includes(q) || (r.department || '').toLowerCase().includes(q) || (r.category || '').toLowerCase().includes(q)) : requests;
  }, [requests, search]);

  const exportReport = () => {
    const rows = [['Request Title', 'Department', 'Dept SLA (days)', 'Sales SLA (days)', 'Gap (days)', 'Status']];
    shownRequests.forEach(r => {
      const h = stepsHours(r.steps);
      const dept = h > 0 ? hoursToDays(h) : null;
      const sales = r.salesFeedback ? r.salesFeedback.recommendedSLA : null;
      rows.push([r.title, r.department, dept ?? 'n/a', sales ?? 'n/a', dept !== null && sales !== null ? Math.abs(dept - sales) : 'n/a', r.status] as any);
    });
    const blob = new Blob(['\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sla_alignment_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const stats = useMemo(() => {
    const total = requests.length;
    const aligned = requests.filter(r => r.status === 'Aligned').length;
    const finalized = requests.filter(r => r.status === 'Finalized').length;
    const draft = requests.filter(r => r.status === 'Draft').length;
    
    const highSLAGaps = requests.filter(r => {
      if (!r.salesFeedback) return false;
      const totalHours = stepsHours(r.steps);
      if (totalHours <= 0) return false; // no step SLA entered: nothing to compare
      return Math.abs(hoursToDays(totalHours) - r.salesFeedback.recommendedSLA) > 3;
    }).length;

    const complexWorkflows = requests.filter(r => (r.steps || []).length > 5 || r.complexity === 'Complex').length;

    return { total, aligned, finalized, draft, highSLAGaps, complexWorkflows };
  }, [requests]);

  const chartData = useMemo(() => {
    // only workflows that have BOTH a department SLA and a Sales recommendation can be compared
    return requests.filter(r => r.salesFeedback && stepsHours(r.steps) > 0).map(r => {
      const deptSLA = hoursToDays(stepsHours(r.steps));
      const salesSLA = r.salesFeedback!.recommendedSLA;
      return {
        name: (r.title || '').length > 15 ? (r.title || '').substring(0, 15) + '...' : (r.title || ''),
        deptSLA,
        salesSLA,
        gap: Math.abs(deptSLA - salesSLA)
      };
    }).sort((a, b) => b.gap - a.gap).slice(0, 10);
  }, [requests]);

  return (
    <div className="space-y-8">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-brand-gray/10 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-red/10 flex items-center justify-center">
              <Layers size={24} className="text-brand-red" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-brand-gray uppercase tracking-widest">Total Requests</div>
              <div className="text-2xl font-bold text-brand-black">{stats.total}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-brand-gray">
            <span className="text-green-500 font-bold">{stats.finalized}</span> Finalized
            <span className="text-brand-gray/40">•</span>
            <span className="text-blue-500 font-bold">{stats.aligned}</span> Aligned
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-brand-gray/10 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center">
              <AlertTriangle size={24} className="text-red-600" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-brand-gray uppercase tracking-widest">High SLA Gaps</div>
              <div className="text-2xl font-bold text-brand-black">{stats.highSLAGaps}</div>
            </div>
          </div>
          <div className="text-xs text-brand-gray">
            Gaps {'>'} 3 days between Dept & Sales
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-brand-gray/10 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-yellow-100 flex items-center justify-center">
              <TrendingUp size={24} className="text-yellow-600" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-brand-gray uppercase tracking-widest">Complex Workflows</div>
              <div className="text-2xl font-bold text-brand-black">{stats.complexWorkflows}</div>
            </div>
          </div>
          <div className="text-xs text-brand-gray">
            Workflows with {'>'} 5 steps or High complexity
          </div>
        </div>

        <div className="bg-brand-black p-6 rounded-3xl shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-brand-red/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
          <div className="flex items-center gap-4 mb-4 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
              <CheckCircle2 size={24} className="text-brand-red" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-brand-gray uppercase tracking-widest">Alignment Rate</div>
              <div className="text-2xl font-bold text-white">
                {stats.total > 0 ? `${Math.round(((stats.finalized + stats.aligned) / stats.total) * 100)}%` : '—'}
              </div>
            </div>
          </div>
          <div className="text-xs text-brand-gray relative z-10">
            Target: 100% before CRM implementation
          </div>
        </div>
      </div>

      {/* SLA Comparison Chart */}
      <div className="bg-white p-8 rounded-3xl border border-brand-gray/10 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-brand-black flex items-center gap-2">
              <BarChart3 size={20} className="text-brand-red" />
              SLA Alignment Gap Analysis
            </h2>
            <p className="text-xs text-brand-gray">Comparing Department SLA vs. Sales Recommended SLA (Top 10 Gaps)</p>
          </div>
          <button onClick={exportReport} className="flex items-center gap-2 text-brand-red font-bold text-xs hover:underline">
            <Download size={14} /> Export Report
          </button>
        </div>

        {chartData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-brand-gray italic">
            No workflow has both step SLAs and a Sales recommendation yet.
          </div>
        ) : (
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis 
                dataKey="name" 
                angle={-45} 
                textAnchor="end" 
                interval={0} 
                height={80}
                tick={{ fontSize: 10, fontWeight: 600, fill: '#141414' }}
              />
              <YAxis tick={{ fontSize: 10, fontWeight: 600, fill: '#141414' }} />
              <Tooltip 
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                cursor={{ fill: '#f5f5f5' }}
              />
              <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '20px' }} />
              <Bar name="Dept SLA (Days)" dataKey="deptSLA" fill="#141414" radius={[4, 4, 0, 0]} barSize={24} />
              <Bar name="Sales SLA (Days)" dataKey="salesSLA" fill="#E21D24" radius={[4, 4, 0, 0]} barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>

      {/* Comparison Table */}
      <div className="bg-white rounded-3xl border border-brand-gray/10 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-brand-gray/10 flex items-center justify-between bg-brand-gray/5">
          <h2 className="text-lg font-bold text-brand-black flex items-center gap-2">
            <AlertCircle size={20} className="text-brand-red" />
            Critical SLA Discrepancies
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray" />
              <input 
                type="text" 
                placeholder="Search requests..." 
                aria-label="Search requests"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-1.5 bg-white border border-brand-gray/20 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-red/20"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-gray/5 border-b border-brand-gray/10">
                <th className="px-6 py-4 text-[10px] font-bold text-brand-gray uppercase tracking-widest">Request Title</th>
                <th className="px-6 py-4 text-[10px] font-bold text-brand-gray uppercase tracking-widest">Department</th>
                <th className="px-6 py-4 text-[10px] font-bold text-brand-gray uppercase tracking-widest">Dept SLA</th>
                <th className="px-6 py-4 text-[10px] font-bold text-brand-gray uppercase tracking-widest">Sales SLA</th>
                <th className="px-6 py-4 text-[10px] font-bold text-brand-gray uppercase tracking-widest text-center">Gap</th>
                <th className="px-6 py-4 text-[10px] font-bold text-brand-gray uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-brand-gray uppercase tracking-widest">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-gray/10">
              {shownRequests.map((request) => {
                const totalHours = stepsHours(request.steps);
                const deptSLA = totalHours > 0 ? hoursToDays(totalHours) : null;
                const salesSLA = request.salesFeedback ? request.salesFeedback.recommendedSLA : null;
                // a gap exists only when both sides have a number (no feedback is not a "gap" equal to the dept SLA)
                const gap = deptSLA !== null && salesSLA !== null ? Math.abs(deptSLA - salesSLA) : null;
                const isCritical = gap !== null && gap > 3;

                return (
                  <tr key={request.id} className="hover:bg-brand-gray/5 transition-colors group">
                    <td className="px-6 py-4">
                      <div 
                        className="font-bold text-brand-black text-sm cursor-help select-all break-words hover:text-brand-red transition-colors duration-200" 
                        title={request.title}
                      >
                        {request.title}
                      </div>
                      <div className="text-[10px] text-brand-gray">{request.category}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs font-bold text-brand-black">
                        <Building2 size={14} className="text-brand-red" />
                        {request.department}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-bold text-brand-black">{deptSLA !== null ? `${deptSLA} Days` : '—'}</div>
                      <div className="text-[10px] text-brand-gray">{(request.steps || []).length} Steps</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-bold text-brand-black">{salesSLA !== null && salesSLA > 0 ? `${salesSLA} Days` : 'N/A'}</div>
                      <div className="text-[10px] text-brand-gray">{request.salesFeedback ? 'Feedback Received' : 'Pending Sales'}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {gap === null ? (
                        <span className="text-xs text-brand-gray">—</span>
                      ) : (
                      <div className={`inline-flex items-center justify-center px-2 py-1 rounded-lg text-xs font-bold ${
                        isCritical ? 'bg-red-100 text-red-600' : 
                        gap > 0 ? 'bg-yellow-100 text-yellow-600' : 
                        'bg-green-100 text-green-600'
                      }`}>
                        {gap > 0 ? `+${gap}d` : 'Aligned'}
                      </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        request.status === 'Finalized' ? 'bg-green-100 text-green-700' :
                        request.status === 'Aligned' ? 'bg-blue-100 text-blue-700' :
                        'bg-brand-gray/10 text-brand-gray'
                      }`}>
                        {request.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => onViewRequest(request)}
                        aria-label={`Open ${request.title}`}
                        className="p-2 text-brand-gray hover:text-brand-red hover:bg-brand-red/5 rounded-lg transition-all"
                      >
                        <ArrowRight size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {shownRequests.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-brand-gray italic">No requests found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
