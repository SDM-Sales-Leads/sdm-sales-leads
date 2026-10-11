import React, { useMemo } from 'react';
import { Lead } from './types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';
import { 
  TrendingUp, 
  Users, 
  Target, 
  Coins, 
  Activity, 
  Award,
  ChevronRight,
  Printer,
  Download
} from 'lucide-react';

interface CrmReportsProps {
  leads: Lead[];
}

const COLORS = ['#D32F2F', '#1976D2', '#388E3C', '#FBC02D', '#7B1FA2', '#E64A19', '#00796B', '#455A64'];

// SLA outcome of one lead: 'met' | 'violated' | null (no/invalid deadline = not measurable)
const slaOutcome = (l: Lead, nowMs: number): 'met' | 'violated' | null => {
  if (!l.slaDeadline) return null;
  const deadline = new Date(l.slaDeadline).getTime();
  if (!Number.isFinite(deadline)) return null;
  if (['Won', 'Lost'].includes(l.status)) {
    const closed = new Date(l.lastUpdated || l.date).getTime();
    if (!Number.isFinite(closed)) return null;
    return closed <= deadline ? 'met' : 'violated';
  }
  return deadline - nowMs < 0 ? 'violated' : 'met';
};
const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) : null);

export const CrmReports: React.FC<CrmReportsProps> = ({ leads }) => {
  // Aggregate KPIs
  const kpis = useMemo(() => {
    const total = leads.length;
    const won = leads.filter(l => l.status === 'Won').length;
    const lost = leads.filter(l => l.status === 'Lost').length;
    const conversionRate = pct(won, total);
    
    const activeOpps = leads.filter(l => !['New', 'Assigned', 'Lost', 'Duplicate', 'Won'].includes(l.status)).length;

    // SLA tracking
    const nowMs = Date.now();
    let slaTotal = 0;
    let slaViolated = 0;
    let slaMet = 0;

    leads.forEach(l => {
      const o = slaOutcome(l, nowMs);
      if (o === null) return;
      slaTotal++;
      if (o === 'met') slaMet++; else slaViolated++;
    });

    const slaComplianceRate = pct(slaMet, slaTotal);

    return {
      total,
      won,
      lost,
      conversionRate,
      activeOpps,
      slaTotal,
      slaViolated,
      slaMet,
      slaComplianceRate
    };
  }, [leads]);

  // Leaders statistics
  const agentLeaderboard = useMemo(() => {
    const map: Record<string, { total: number; won: number; slaTotal: number; slaMet: number }> = {};
    const nowMs = Date.now();
    leads.forEach(l => {
      const agent = l.assignedSalespersonName || 'Unassigned';
      if (!map[agent]) {
        map[agent] = { total: 0, won: 0, slaTotal: 0, slaMet: 0 };
      }
      map[agent].total++;
      if (l.status === 'Won') {
        map[agent].won++;
      }
      const o = slaOutcome(l, nowMs);
      if (o !== null) {
        map[agent].slaTotal++;
        if (o === 'met') map[agent].slaMet++;
      }
    });

    return Object.entries(map).map(([name, data]) => ({
      name,
      total: data.total,
      won: data.won,
      conversion: pct(data.won, data.total),
      slaCompliance: pct(data.slaMet, data.slaTotal),
      slaTotal: data.slaTotal,
      slaMet: data.slaMet
    })).sort((a, b) => (b.slaCompliance ?? -1) - (a.slaCompliance ?? -1));
  }, [leads]);

  // Leads by source statistics
  const leadsBySource = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach(l => {
      const src = l.source || 'Other';
      map[src] = (map[src] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [leads]);

  // Lead Funnel stage distribution
  const funnelData = useMemo(() => {
    const stages = ['New', 'Assigned', 'Contacted', 'Follow Up', 'Meeting Scheduled', 'Negotiation', 'Quotation Sent', 'Won'];
    return stages.map(stage => ({
      stage,
      count: leads.filter(l => l.status === stage).length
    }));
  }, [leads]);

  // Project distribution SLA stats
  const projectSlaStats = useMemo(() => {
    const map: Record<string, { total: number; met: number; violated: number }> = {};
    const nowMs = Date.now();
    leads.forEach(l => {
      const proj = l.project || 'Unknown';
      if (!map[proj]) {
        map[proj] = { total: 0, met: 0, violated: 0 };
      }
      const o = slaOutcome(l, nowMs);
      if (o !== null) {
        map[proj].total++;
        if (o === 'met') map[proj].met++; else map[proj].violated++;
      }
    });

    return Object.entries(map).map(([name, data]) => ({
      name,
      complianceRate: pct(data.met, data.total),
      total: data.total,
      met: data.met,
      violated: data.violated
    })).sort((a, b) => (b.complianceRate ?? -1) - (a.complianceRate ?? -1));
  }, [leads]);

  return (
    <div className="space-y-6 text-xs" id="crm-reports-root">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold text-brand-black flex items-center gap-2">
            <span>Executive Sales Analytics & Reports</span>
            <span className="text-xs bg-brand-red/10 text-brand-red font-bold px-2.5 py-0.5 rounded-full">
              Intelligence suite
            </span>
          </h3>
          <p className="text-xs text-brand-gray/80 mt-1">
            Analyze sales pipeline conversion rates, agent performance leaderboards, lead velocities, and SLA status tracking.
          </p>
        </div>

        <div className="flex gap-2">
          <button onClick={() => window.print()} className="bg-brand-gray/10 hover:bg-brand-gray/20 text-brand-black px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm">
            <Printer size={13} />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Analytical KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white border border-brand-gray/20 p-5 rounded-2xl shadow-xs">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] uppercase font-bold text-brand-gray tracking-wider">Total Pipeline Inquiries</span>
            <span className="w-7 h-7 rounded-lg bg-brand-red/10 text-brand-red flex items-center justify-center">
              <Activity size={14} />
            </span>
          </div>
          <p className="text-2xl font-black text-brand-black font-mono">{kpis.total}</p>
          <div className="flex items-center gap-1.5 text-[10px] text-brand-gray font-bold mt-2">
            <span>All leads on record</span>
          </div>
        </div>

        <div className="bg-white border border-brand-gray/20 p-5 rounded-2xl shadow-xs">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] uppercase font-bold text-brand-gray tracking-wider">Historical Conversion Rate</span>
            <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Target size={14} />
            </span>
          </div>
          <p className="text-2xl font-black text-brand-black font-mono">{kpis.conversionRate === null ? '—' : `${kpis.conversionRate}%`}</p>
          <div className="flex items-center gap-1.5 text-[10px] text-brand-gray font-bold mt-2">
            <span>Ratio of WON contracts to total leads</span>
          </div>
        </div>

        <div className="bg-white border border-brand-gray/20 p-5 rounded-2xl shadow-xs">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] uppercase font-bold text-brand-gray tracking-wider">SLA Compliance Rate</span>
            <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <Coins size={14} />
            </span>
          </div>
          <p className="text-2xl font-black text-brand-black font-mono">{kpis.slaComplianceRate === null ? '—' : `${kpis.slaComplianceRate}%`}</p>
          <div className="flex items-center gap-1.5 text-[10px] text-brand-gray font-bold mt-2">
            <span>SLA compliance of processed inquiries</span>
          </div>
        </div>

        <div className="bg-white border border-brand-gray/20 p-5 rounded-2xl shadow-xs">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] uppercase font-bold text-brand-gray tracking-wider">Active SLA Violations</span>
            <span className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
              <Award size={14} />
            </span>
          </div>
          <p className="text-2xl font-black text-rose-600 font-mono">{kpis.slaViolated}</p>
          <div className="flex items-center gap-1.5 text-[10px] text-brand-gray font-bold mt-2">
            <span>Leads currently in SLA violation status</span>
          </div>
        </div>

      </div>

      {/* Recharts Graphical grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Project SLA Compliance chart */}
        <div className="bg-white border border-brand-gray/20 rounded-2xl p-5 shadow-xs space-y-4">
          <h4 className="font-extrabold text-brand-black text-sm uppercase tracking-wider">Project SLA Compliance Rate (%)</h4>
          <div className="h-64 font-bold">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={projectSlaStats}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={10} tickLine={false} />
                <YAxis fontSize={10} tickLine={false} />
                <Tooltip formatter={(value) => `${Number(value)}% SLA Compliance`} />
                <Bar dataKey="complianceRate" fill="#D32F2F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Lead Sources Pie chart */}
        <div className="bg-white border border-brand-gray/20 rounded-2xl p-5 shadow-xs space-y-4">
          <h4 className="font-extrabold text-brand-black text-sm uppercase tracking-wider">Inbound Leads share by Source channel</h4>
          <div className="h-64 flex flex-col sm:flex-row items-center justify-around font-bold">
            <div className="w-1/2 h-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie
                    data={leadsBySource}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {leadsBySource.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-2">
              {leadsBySource.map((src, idx) => (
                <div key={src.name} className="flex items-center gap-2 text-[10px] font-extrabold">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  <span className="text-brand-gray">{src.name}:</span>
                  <span className="text-brand-black font-mono">{src.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Leaders leaderboard table */}
      <div className="bg-white border border-brand-gray/20 rounded-2xl p-5 shadow-xs space-y-4">
        <h4 className="font-extrabold text-brand-black text-sm uppercase tracking-wider">Sales Representative Performance Leaderboard</h4>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-brand-gray/5 border-b border-brand-gray/15 text-brand-gray text-[10px] font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Representative Name</th>
                <th className="py-3 px-3 text-center">Inquiries Handled</th>
                <th className="py-3 px-3 text-center">Won Contracts</th>
                <th className="py-3 px-3 text-center">Lead Conversion %</th>
                <th className="py-3 px-4 text-right">SLA Compliance Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-gray/10 font-semibold text-brand-black">
              {agentLeaderboard.map((item, index) => (
                <tr key={item.name} className="hover:bg-brand-gray/5 transition-colors">
                  <td className="py-3 px-4 flex items-center gap-2 font-bold">
                    <span className="w-5 h-5 rounded-full bg-brand-red text-white flex items-center justify-center font-black text-[9px]">
                      {index + 1}
                    </span>
                    {item.name}
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-brand-gray">{item.total}</td>
                  <td className="py-3 px-3 text-center font-mono text-emerald-700 font-bold">{item.won}</td>
                  <td className="py-3 px-3 text-center">
                    <span className="bg-emerald-100 text-emerald-800 font-mono text-[10px] font-black px-2 py-0.5 rounded-full">
                      {item.conversion === null ? '—' : `${item.conversion}%`}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`font-mono font-extrabold px-3 py-1 rounded-full text-[10px] ${
                      item.slaCompliance !== null && item.slaCompliance >= 90 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                      item.slaCompliance !== null && item.slaCompliance >= 70 ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                      'bg-rose-100 text-rose-800 border border-rose-300'
                    }`}>
                      {item.slaCompliance === null ? '—' : `${item.slaCompliance}%`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
