import React, { useMemo } from 'react';
import { Lead } from './types';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { 
  Users, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Building, 
  Layers, 
  Percent, 
  ArrowUpRight, 
  ArrowDownRight,
  ShieldCheck,
  UserCheck,
  UserPlus
} from 'lucide-react';

interface CrmDashboardProps {
  leads: Lead[];
}

// Local-calendar day key (YYYY-MM-DD) for a lead date that may be date-only or a full ISO timestamp.
const dayKey = (v?: string): string => {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const msOf = (v?: string): number => {
  if (!v) return NaN;
  const t = new Date(v).getTime();
  return t;
};
const fmtDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = ms / 60000;
  if (mins < 60) return `${Math.max(1, Math.round(mins))} min`;
  if (mins < 60 * 48) return `${(mins / 60).toFixed(1)} h`;
  return `${(mins / 1440).toFixed(1)} days`;
};
const CONTACT_TYPES = ['Call', 'Email', 'Meeting', 'Visit', 'WhatsApp', 'SMS'];

const COLORS = ['#D32F2F', '#1976D2', '#388E3C', '#FBC02D', '#7B1FA2', '#00796B', '#E64A19', '#F57C00'];

export const CrmDashboard: React.FC<CrmDashboardProps> = ({ leads }) => {
  
  const stats = useMemo(() => {
    const total = leads.length;
    const now = new Date();
    const todayStr = dayKey(now.toISOString());
    
    // Today
    const today = leads.filter(l => dayKey(l.date) === todayStr).length;
    
    // This Week (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thisWeek = leads.filter(l => msOf(l.date) >= sevenDaysAgo.getTime()).length;
    
    // This Month (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thisMonth = leads.filter(l => msOf(l.date) >= thirtyDaysAgo.getTime()).length;

    // Statuses
    const won = leads.filter(l => l.status === 'Won').length;
    const lost = leads.filter(l => l.status === 'Lost').length;
    const pending = leads.filter(l => !['Won', 'Lost', 'Duplicate', 'Invalid'].includes(l.status)).length;
    const waitingApproval = leads.filter(l => l.status === 'New').length;
    
    // Assignment
    const assigned = leads.filter(l => l.assignedSalespersonId).length;
    const unassigned = leads.filter(l => !l.assignedSalespersonId).length;

    // Conversion rate
    const closedResolved = won + lost;
    const conversionRate: number | null = closedResolved > 0 ? Math.round((won / closedResolved) * 100) : null;

    // Top Lead Source
    const sourcesMap: Record<string, number> = {};
    leads.forEach(l => {
      const k = l.source || 'Unknown';
      sourcesMap[k] = (sourcesMap[k] || 0) + 1;
    });
    let topSource = 'N/A';
    let topSourceCount = 0;
    Object.entries(sourcesMap).forEach(([src, count]) => {
      if (count > topSourceCount) {
        topSource = src;
        topSourceCount = count;
      }
    });

    // Top Salesperson
    const repsMap: Record<string, number> = {};
    leads.forEach(l => {
      if (l.assignedSalespersonName) {
        repsMap[l.assignedSalespersonName] = (repsMap[l.assignedSalespersonName] || 0) + 1;
      }
    });
    let topRep = 'N/A';
    let topRepCount = 0;
    Object.entries(repsMap).forEach(([rep, count]) => {
      if (count > topRepCount) {
        topRep = rep;
        topRepCount = count;
      }
    });

    // Real averages from the lead timelines (first contact activity / assignment date vs lead creation)
    const respDeltas: number[] = [];
    const assignDeltas: number[] = [];
    leads.forEach(l => {
      const created = (l.timeline || []).find(t => t.type === 'Creation' || t.type === 'Import');
      const t0 = msOf(created?.timestamp || l.date);
      if (!Number.isFinite(t0)) return;
      const contacts = (l.timeline || []).filter(t => CONTACT_TYPES.includes(t.type)).map(t => msOf(t.timestamp)).filter(Number.isFinite);
      if (contacts.length > 0) {
        const d = Math.min(...contacts) - t0;
        if (d >= 0) respDeltas.push(d);
      }
      const ta = msOf(l.assignedDate);
      if (Number.isFinite(ta) && ta - t0 >= 0) assignDeltas.push(ta - t0);
    });
    const avg = (a: number[]) => (a.length ? fmtDuration(a.reduce((x, y) => x + y, 0) / a.length) : '—');
    const avgResponseTime = avg(respDeltas);
    const avgAssignmentTime = avg(assignDeltas);

    return {
      total,
      today,
      thisWeek,
      thisMonth,
      won,
      lost,
      pending,
      assigned,
      unassigned,
      conversionRate,
      topSource,
      topRep,
      avgResponseTime,
      avgAssignmentTime
    };
  }, [leads]);

  // Chart Data: Leads by Project
  const projectChartData = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach(l => {
      const k = l.project || 'Unspecified';
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).map(([name, count]) => ({ name, count }));
  }, [leads]);

  // Chart Data: Leads by Source
  const sourceChartData = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach(l => {
      const k = l.source || 'Unknown';
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [leads]);

  // Chart Data: Leads by Status
  const statusChartData = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach(l => {
      map[l.status] = (map[l.status] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [leads]);

  // Chart Data: Leads by Priority
  const priorityChartData = useMemo(() => {
    const order = ['Urgent', 'High', 'Normal', 'Low'];
    const counts = { Urgent: 0, High: 0, Normal: 0, Low: 0 };
    leads.forEach(l => {
      if (l.priority in counts) {
        counts[l.priority as 'Urgent' | 'High' | 'Normal' | 'Low']++;
      }
    });
    return order.map(name => ({ name, count: counts[name as keyof typeof counts] }));
  }, [leads]);

  // Chart Data: Trend line over last 7 days
  const trendChartData = useMemo(() => {
    const data: Record<string, number> = {};
    // Seed last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const str = dayKey(d.toISOString());
      data[str] = 0;
    }
    // Aggregate leads
    leads.forEach(l => {
      const k = dayKey(l.date);
      if (k in data) {
        data[k]++;
      }
    });
    return Object.entries(data).map(([date, count]) => {
      const parts = date.split('-');
      return { 
        name: `${parts[1]}/${parts[2]}`, 
        Leads: count 
      };
    });
  }, [leads]);

  // Conversion Funnel Data
  const funnelData = useMemo(() => {
    const newLeads = leads.length;
    const assignedLeads = leads.filter(l => l.status !== 'New').length;
    const contactedLeads = leads.filter(l => !['New', 'Assigned'].includes(l.status)).length;
    const qualifiedLeads = leads.filter(l => ['Meeting Scheduled', 'Negotiation', 'Quotation Sent', 'Won'].includes(l.status)).length;
    const wonLeads = leads.filter(l => l.status === 'Won').length;

    return [
      { step: '1. Inbound Leads', count: newLeads, percentage: 100 },
      { step: '2. Approved & Assigned', count: assignedLeads, percentage: newLeads > 0 ? Math.round((assignedLeads / newLeads) * 100) : 0 },
      { step: '3. Actively Contacted', count: contactedLeads, percentage: newLeads > 0 ? Math.round((contactedLeads / newLeads) * 100) : 0 },
      { step: '4. Qualified Meetings', count: qualifiedLeads, percentage: newLeads > 0 ? Math.round((qualifiedLeads / newLeads) * 100) : 0 },
      { step: '5. Closed Won Deals', count: wonLeads, percentage: newLeads > 0 ? Math.round((wonLeads / newLeads) * 100) : 0 },
    ];
  }, [leads]);

  return (
    <div className="space-y-6" id="crm-dashboard-root">
      
      {/* Title block */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-brand-black tracking-tight font-sans">CRM Executive Cockpit</h2>
          <p className="text-sm text-brand-gray/80 mt-0.5">Real-time leads analytics and sales performance statistics for Elsewedy Development.</p>
        </div>
        <div className="bg-white/80 border border-brand-gray/20 rounded-xl px-4 py-2 flex items-center gap-2 text-xs font-semibold text-brand-black shadow-sm">
          <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
          <span>LIVE PIPELINE INTEGRITY SCANNER</span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Inbounds */}
        <div className="bg-white p-5 rounded-2xl border border-brand-gray/15 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-brand-red/5 rounded-bl-full -mr-4 -mt-4 group-hover:scale-110 transition-transform duration-300" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-brand-gray uppercase tracking-widest">Total Inbound Leads</span>
            <div className="p-2.5 bg-brand-red/10 rounded-xl text-brand-red">
              <Users size={20} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-extrabold text-brand-black tracking-tight">{stats.total}</h3>
            <div className="flex items-center gap-4 mt-2 text-xs">
              <span className="flex items-center font-bold text-emerald-600">
                <ArrowUpRight size={14} className="mr-0.5" /> +{stats.today} Today
              </span>
              <span className="text-brand-gray/70">
                {stats.thisWeek} this week
              </span>
            </div>
          </div>
        </div>

        {/* Sales Funnel Yield */}
        <div className="bg-white p-5 rounded-2xl border border-brand-gray/15 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-bl-full -mr-4 -mt-4 group-hover:scale-110 transition-transform duration-300" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-brand-gray uppercase tracking-widest">Conversion Rate</span>
            <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-600">
              <Percent size={20} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-extrabold text-brand-black tracking-tight">{stats.conversionRate === null ? '—' : `${stats.conversionRate}%`}</h3>
            <div className="flex items-center gap-4 mt-2 text-xs">
              <span className="flex items-center font-bold text-emerald-600">
                <CheckCircle size={14} className="mr-0.5 text-emerald-500" /> {stats.won} Won Deals
              </span>
              <span className="text-rose-500 font-bold">
                {stats.lost} Lost
              </span>
            </div>
          </div>
        </div>

        {/* Timing Efficiencies */}
        <div className="bg-white p-5 rounded-2xl border border-brand-gray/15 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full -mr-4 -mt-4 group-hover:scale-110 transition-transform duration-300" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-brand-gray uppercase tracking-widest">Response Times</span>
            <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-600">
              <Clock size={20} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-extrabold text-brand-black tracking-tight">{stats.avgResponseTime}</h3>
            <div className="flex items-center gap-4 mt-2 text-xs">
              <span className="text-emerald-600 font-bold">
                Assignment: {stats.avgAssignmentTime}
              </span>
              <span className="text-emerald-700 font-semibold">
                SLA Compliant
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Auxiliary Mini KPIs Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-brand-black text-white p-4 rounded-2xl shadow-sm">
        <div className="text-center md:border-r border-white/10 last:border-0 p-2">
          <p className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Top Marketing Channel</p>
          <p className="text-base font-extrabold text-brand-red mt-1">{stats.topSource}</p>
        </div>
        <div className="text-center md:border-r border-white/10 last:border-0 p-2">
          <p className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Top Sales Rep</p>
          <p className="text-base font-extrabold text-brand-red mt-1">{stats.topRep}</p>
        </div>
        <div className="text-center md:border-r border-white/10 last:border-0 p-2">
          <p className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Unassigned Backlog</p>
          <p className="text-base font-extrabold text-amber-400 mt-1">{stats.unassigned} Leads</p>
        </div>
        <div className="text-center p-2">
          <p className="text-[10px] uppercase font-bold text-white/50 tracking-wider">This Month Volume</p>
          <p className="text-base font-extrabold text-emerald-400 mt-1">+{stats.thisMonth} Leads</p>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Trend line */}
        <div className="bg-white p-5 rounded-2xl border border-brand-gray/20 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold text-brand-black text-sm uppercase tracking-wide">Lead Intake & Trend</h4>
            <span className="text-xs bg-brand-red/10 text-brand-red px-2.5 py-1 rounded-full font-bold">LAST 7 DAYS</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="Leads" stroke="#D32F2F" strokeWidth={3} activeDot={{ r: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Source Distribution */}
        <div className="bg-white p-5 rounded-2xl border border-brand-gray/20 shadow-sm">
          <h4 className="font-bold text-brand-black text-sm uppercase tracking-wide mb-4">Leads by Channel Source</h4>
          <div className="h-64 flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie
                  data={sourceChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {sourceChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value} Leads`]} />
              </PieChart>
            </ResponsiveContainer>
            {/* Custom centered label */}
            <div className="absolute text-center">
              <span className="text-2xl font-extrabold text-brand-black">{stats.total}</span>
              <p className="text-[10px] uppercase font-bold text-brand-gray tracking-wider">Leads Total</p>
            </div>
          </div>
          {/* Legend Grid */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            {sourceChartData.map((item, index) => (
              <div key={item.name} className="flex items-center gap-1.5 text-xs text-brand-gray/90">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <span className="truncate font-medium">{item.name} ({item.value})</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Secondary Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Project breakdown */}
        <div className="bg-white p-5 rounded-2xl border border-brand-gray/20 shadow-sm">
          <h4 className="font-bold text-brand-black text-sm uppercase tracking-wide mb-4 font-sans">Leads by Industrial Project</h4>
          <div className="h-60">
            {projectChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={projectChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                  <XAxis dataKey="name" stroke="#6b7280" fontSize={10} tickLine={false} />
                  <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#1976D2" radius={[4, 4, 0, 0]}>
                    {projectChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[(index + 1) % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-brand-gray">No project associations found</div>
            )}
          </div>
        </div>

        {/* Status distribution */}
        <div className="bg-white p-5 rounded-2xl border border-brand-gray/20 shadow-sm">
          <h4 className="font-bold text-brand-black text-sm uppercase tracking-wide mb-4 font-sans">Leads by Funnel Status</h4>
          <div className="h-60">
            {statusChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={statusChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                  <XAxis type="number" stroke="#6b7280" fontSize={10} />
                  <YAxis dataKey="name" type="category" stroke="#6b7280" fontSize={9} width={80} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#388E3C" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-brand-gray">No status parameters logged</div>
            )}
          </div>
        </div>

        {/* Priority parameters */}
        <div className="bg-white p-5 rounded-2xl border border-brand-gray/20 shadow-sm">
          <h4 className="font-bold text-brand-black text-sm uppercase tracking-wide mb-4 font-sans">Leads by Business Priority</h4>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={priorityChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                <XAxis dataKey="name" stroke="#6b7280" fontSize={11} tickLine={false} />
                <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#FBC02D" radius={[4, 4, 0, 0]}>
                  <Cell fill="#D32F2F" /> {/* Urgent */}
                  <Cell fill="#E64A19" /> {/* High */}
                  <Cell fill="#FBC02D" /> {/* Normal */}
                  <Cell fill="#388E3C" /> {/* Low */}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Conversion Funnel Card */}
      <div className="bg-white p-6 rounded-2xl border border-brand-gray/20 shadow-sm">
        <h4 className="font-bold text-brand-black text-sm uppercase tracking-wide mb-5">Lead Acquisition & Sales Pipeline Conversion Funnel</h4>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {funnelData.map((step, idx) => (
            <div key={step.step} className="flex flex-col relative">
              <div className="bg-brand-gray/5 border border-brand-gray/25 rounded-2xl p-4 text-center hover:bg-brand-red/5 hover:border-brand-red/35 transition-all h-full flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold text-brand-gray/70 block uppercase mb-1">{step.step}</span>
                  <span className="text-3xl font-extrabold text-brand-black block tracking-tight mt-1">{step.count}</span>
                </div>
                <div className="mt-4">
                  <div className="w-full bg-brand-gray/20 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-brand-red h-full rounded-full" 
                      style={{ width: `${step.percentage}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-extrabold text-brand-black block mt-2">{step.percentage}% Yield Rate</span>
                </div>
              </div>
              {idx < 4 && (
                <div className="hidden md:block absolute top-1/2 -right-4 -translate-y-1/2 z-10 bg-white border border-brand-gray/20 rounded-full p-1.5 shadow-sm">
                  <ArrowUpRight size={14} className="text-brand-gray rotate-45" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
