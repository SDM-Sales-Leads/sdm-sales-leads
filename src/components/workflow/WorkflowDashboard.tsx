import React from 'react';
import { WorkflowRequest } from '../../types';
import { WORKING_HOURS_PER_DAY } from '../../constants';

// SLA helpers: hours are summed from the steps themselves (never from a stored total that can be stale);
// days are rounded UP so a workflow is never shown as shorter than it is. No SLA entered -> "—".
const stepsHours = (steps?: { sla?: number; slaUnit?: string }[]) =>
  (steps || []).reduce((sum, s) => sum + (Number.isFinite(s.sla as number) ? (s.sla as number) * (s.slaUnit === 'Days' ? WORKING_HOURS_PER_DAY : 1) : 0), 0);
const hoursToDays = (h: number) => Math.ceil(h / WORKING_HOURS_PER_DAY);
import { 
  GitBranch, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  BarChart3,
  TrendingUp,
  Activity
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';

interface WorkflowDashboardProps {
  requests: WorkflowRequest[];
}

export const WorkflowDashboard: React.FC<WorkflowDashboardProps> = ({ requests }) => {
  const stats = {
    total: requests.length,
    draft: requests.filter(r => r.status === 'Draft').length,
    aligned: requests.filter(r => r.status === 'Aligned').length,
    finalized: requests.filter(r => r.status === 'Finalized').length,
    // average over workflows that actually have step SLAs; null (shown as "—") when there are none
    avgSLA: (() => {
      const hrs = requests.map(r => stepsHours(r.steps)).filter(h => h > 0);
      return hrs.length > 0 ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;
    })(),
    highComplexity: requests.filter(r => r.complexity === 'Complex').length,
    withDependencies: requests.filter(r => (r.dependencies || []).length > 0).length
  };

  // every department that really has requests (the list used to be limited to three hard-coded ones)
  const deptData = Array.from(
    requests.reduce((m, r) => m.set(r.department || 'Unassigned', (m.get(r.department || 'Unassigned') || 0) + 1), new Map<string, number>())
  ).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  const complexityData = [
    { name: 'Simple', value: requests.filter(r => r.complexity === 'Simple').length, color: '#22c55e' },
    { name: 'Medium', value: requests.filter(r => r.complexity === 'Medium').length, color: '#eab308' },
    { name: 'Complex', value: requests.filter(r => r.complexity === 'Complex').length, color: '#A6192E' },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-brand-gray/20 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-brand-red/10 rounded-lg text-brand-red">
              <GitBranch size={24} />
            </div>
            <span className="text-xs font-bold text-brand-gray uppercase tracking-wider">Total Requests</span>
          </div>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-bold text-brand-black">{stats.total}</h3>
            <div className="flex items-center text-green-500 text-sm font-medium">
              <TrendingUp size={16} className="mr-1" />
              <span>{stats.finalized} finalized</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-brand-gray/20 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
              <Clock size={24} />
            </div>
            <span className="text-xs font-bold text-brand-gray uppercase tracking-wider">Avg SLA (Hrs)</span>
          </div>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-bold text-brand-black">{stats.avgSLA === null ? '—' : `${stats.avgSLA}h`}</h3>
            <div className="text-brand-gray text-sm">Per workflow with SLAs</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-brand-gray/20 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-500">
              <AlertCircle size={24} />
            </div>
            <span className="text-xs font-bold text-brand-gray uppercase tracking-wider">Complex Flows</span>
          </div>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-bold text-brand-black">{stats.highComplexity}</h3>
            <div className="text-brand-gray text-sm">Require review</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-brand-gray/20 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
              <CheckCircle2 size={24} />
            </div>
            <span className="text-xs font-bold text-brand-gray uppercase tracking-wider">Aligned</span>
          </div>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-bold text-brand-black">{stats.aligned}</h3>
            <div className="text-brand-gray text-sm">Ready to finalize</div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-brand-gray/20 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h4 className="font-bold text-brand-black flex items-center gap-2">
              <BarChart3 size={18} className="text-brand-red" />
              Requests by Department
            </h4>
          </div>
          <div className="h-64">
            {deptData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-brand-gray italic">No requests yet</div>
            ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={deptData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#666' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#666' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  cursor={{ fill: '#f8f8f8' }}
                />
                <Bar dataKey="count" fill="#A6192E" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-brand-gray/20 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h4 className="font-bold text-brand-black flex items-center gap-2">
              <Activity size={18} className="text-brand-red" />
              Complexity Distribution
            </h4>
          </div>
          <div className="h-64 flex items-center">
            {complexityData.length === 0 ? (
              <div className="w-full text-center text-sm text-brand-gray italic">No requests yet</div>
            ) : (<>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie
                  data={complexityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {complexityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="w-1/3 space-y-2">
              {complexityData.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm text-brand-gray">{item.name}</span>
                  </div>
                  <span className="text-sm font-bold text-brand-black">{item.value}</span>
                </div>
              ))}
            </div>
            </>)}
          </div>
        </div>
      </div>

      {/* Recent Activity / Flags */}
      <div className="bg-white p-6 rounded-2xl border border-brand-gray/20 shadow-sm">
        <h4 className="font-bold text-brand-black mb-4">Critical Alignment Flags</h4>
        <div className="space-y-4">
          {requests.filter(r => stepsHours(r.steps) > 120).map(r => (
            <div key={r.id} className="flex items-center justify-between p-4 bg-red-50 rounded-xl border border-red-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg text-brand-red">
                  <AlertCircle size={18} />
                </div>
                <div>
                  <p className="font-bold text-brand-black text-sm">{r.title}</p>
                  <p className="text-xs text-brand-gray">High SLA detected (over 120h): {stepsHours(r.steps)}h ({hoursToDays(stepsHours(r.steps))} working days)</p>
                </div>
              </div>
              <span className="text-xs font-bold text-brand-red bg-white px-2 py-1 rounded border border-red-200 uppercase">High SLA</span>
            </div>
          ))}
          {requests.filter(r => (r.dependencies || []).length > 2).map(r => (
            <div key={r.id} className="flex items-center justify-between p-4 bg-yellow-50 rounded-xl border border-yellow-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg text-yellow-600">
                  <GitBranch size={18} />
                </div>
                <div>
                  <p className="font-bold text-brand-black text-sm">{r.title}</p>
                  <p className="text-xs text-brand-gray">Multiple dependencies: {(r.dependencies || []).length} departments involved</p>
                </div>
              </div>
              <span className="text-xs font-bold text-yellow-600 bg-white px-2 py-1 rounded border border-yellow-200 uppercase">Complex Dependency</span>
            </div>
          ))}
          {requests.length === 0 && (
            <div className="text-center py-8 text-brand-gray">
              <p>No workflow requests found. Start by creating a new definition.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
