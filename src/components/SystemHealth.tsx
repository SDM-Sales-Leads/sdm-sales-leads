import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Activity, Database, Key, RefreshCw, CheckCircle2, AlertCircle, Clock, History, Mail } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useAuth } from '../services/AuthContext';

export const SystemHealth: React.FC = () => {
  const { user } = useAuth();
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPage, setActivityPage] = useState(1);
  const [activityLimit, setActivityLimit] = useState(30);
  const [activeTab, setActiveTab] = useState<'overview' | 'activity'>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [isTestingAI, setIsTestingAI] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [manualKey, setManualKey] = useState('');

  const mounted = useRef(true);
  const notifTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Returns true only when the diagnostics endpoint really answered with data.
  const loadDiagnostics = async (page = activityPage, isInitial: any = false, retryCount = 0): Promise<boolean> => {
    if (isInitial === true && retryCount === 0) setIsLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s client-side timeout
    const retry = async () => {
      await new Promise(r => setTimeout(r, 2000));
      return mounted.current ? loadDiagnostics(page, false, retryCount + 1) : false;
    };
    let ok = false;

    try {
      const [diagRes, actRes] = await Promise.all([
        fetch('/api/admin/diagnostics', { signal: controller.signal }),
        fetch(`/api/admin/activity?page=${page}&limit=${activityLimit}`, { signal: controller.signal })
      ]);
      
      clearTimeout(timeoutId);
      if (!mounted.current) return false;
      
      if (diagRes.ok) {
        const contentType = diagRes.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const data = await diagRes.json();
          if (!mounted.current) return false;
          setDiagnostics(data);
          ok = true;
        }
      } else {
        const errorData = await diagRes.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Diagnostics API error:', errorData.error);
        if (retryCount < 2) return await retry();
        setNotification({ type: 'error', message: `Diagnostics failed: ${errorData.error || 'Server error'}` });
      }
      
      if (actRes.ok) {
        const contentType = actRes.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const data = await actRes.json();
          if (!mounted.current) return false;
          setActivityLogs(Array.isArray(data.logs) ? data.logs : []);
          setActivityTotal(data.total || 0);
          setActivityPage(data.page || 1);
        }
      } else {
        const errorData = await actRes.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Activity API error:', errorData.error);
        setNotification({ type: 'error', message: `Activity log failed: ${errorData.error || 'Server error'}` });
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (!mounted.current) return false;
      if (retryCount < 2) return await retry();
      if (err.name === 'AbortError') {
        console.error('Diagnostics request timed out');
        setNotification({ type: 'error', message: 'Diagnostics request timed out. Use Refresh to try again.' });
      } else {
        console.error('Failed to load diagnostics', err);
        setNotification({ type: 'error', message: 'Failed to load system diagnostics' });
      }
      if (notifTimer.current) clearTimeout(notifTimer.current);
      notifTimer.current = setTimeout(() => mounted.current && setNotification(null), 5000);
    } finally {
      if (mounted.current && retryCount >= 0) setIsLoading(false);
    }
    return ok;
  };

  useEffect(() => {
    mounted.current = true;
    loadDiagnostics(activityPage, true);
    // Auto-refresh disabled for cost efficiency. Use the Refresh button manually.
    return () => {
      mounted.current = false;
      if (notifTimer.current) clearTimeout(notifTimer.current);
    };
  }, []);

  const handleAction = async (action: () => Promise<any>, successMsg: string) => {
    setNotification(null);
    try {
      await action();
      if (mounted.current) setNotification({ type: 'success', message: successMsg });
    } catch (err: any) {
      if (mounted.current) setNotification({ type: 'error', message: `Action failed: ${err?.message || 'Unknown error'}` });
    }
    if (notifTimer.current) clearTimeout(notifTimer.current);
    notifTimer.current = setTimeout(() => mounted.current && setNotification(null), 5000);
  };

  const handleForceSync = async () => {
    setIsSyncing(true);
    await handleAction(async () => {
      const res = await fetch('/api/admin/sync', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id != null ? String(user.id) : undefined, userName: user?.name })
      });
      if (!res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const data = await res.json();
          throw new Error(data.error || 'Sync failed');
        } else {
          throw new Error('Sync failed with non-JSON error');
        }
      }
    }, "Cloud synchronization completed successfully!");
    setIsSyncing(false);
    loadDiagnostics();
  };

  const handleTestAI = async () => {
    setIsTestingAI(true);
    await handleAction(async () => {
      const res = await fetch('/api/admin/diagnostics?ping=true');
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const data = await res.json();
          setDiagnostics(data);
          if (data?.environment?.aiStatus !== 'Operational') {
            throw new Error(data?.environment?.aiError || 'AI Service is not operational');
          }
        } else {
          throw new Error('AI Service returned non-JSON response');
        }
      } else {
        throw new Error('Failed to reach diagnostics endpoint');
      }
    }, "AI connection test completed!");
    setIsTestingAI(false);
  };

  const handleRefresh = async () => {
    await handleAction(async () => {
      if (!(await loadDiagnostics())) throw new Error('diagnostics endpoint did not return data');
    }, "System diagnostics refreshed!");
  };

  const handleSaveKey = async () => {
    if (!manualKey.trim()) return;
    await handleAction(async () => {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiKey: manualKey.trim() })
      });
      if (!res.ok) throw new Error('Failed to save key');
      setShowKeyInput(false);
      setManualKey('');
      await loadDiagnostics();

    }, "Gemini API Key updated successfully!");
  };

  // Process logs for chart
  const rawLogs = diagnostics?.database?.logs || [];
  const chartData = rawLogs.slice().reverse().map((log: any) => ({
    time: new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    status: log.status === 'up' ? 1 : 0,
    fullTime: new Date(log.timestamp).toLocaleString()
  }));

  // Only real connection events are plotted; a line needs at least two of them (no invented points).

  const handlePageChange = (newPage: number) => {
    setActivityPage(newPage);
    loadDiagnostics(newPage);
  };

  const totalPages = Math.ceil(activityTotal / activityLimit);

  if (isLoading && !diagnostics) return <div className="p-8" role="status" aria-live="polite">Loading System Health...</div>;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-brand-black">System Health</h2>
          <p className="text-brand-gray">Real-time infrastructure and database monitoring</p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <div className="flex bg-black/5 p-1 rounded-xl mr-2">
            <button 
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'overview' ? 'bg-white shadow-sm text-brand-black' : 'text-brand-gray hover:text-brand-black'}`}
            >
              Overview
            </button>
            <button 
              onClick={() => setActiveTab('activity')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'activity' ? 'bg-white shadow-sm text-brand-black' : 'text-brand-gray hover:text-brand-black'}`}
            >
              User Activity
            </button>
          </div>
          <button 
            onClick={handleRefresh}
            className="flex-1 sm:flex-none btn-secondary flex items-center justify-center gap-2"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button 
            onClick={handleForceSync}
            disabled={isSyncing || diagnostics?.database?.type !== 'cloud'}
            className={`flex-1 sm:flex-none btn-primary flex items-center justify-center gap-2 ${
              isSyncing || diagnostics?.database?.type !== 'cloud' ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <Database size={18} className={isSyncing ? 'animate-pulse' : ''} />
            {isSyncing ? 'Syncing...' : 'Check data store'}
          </button>
        </div>
      </div>

      {notification && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl border flex items-center gap-3 ${
            notification.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <p className="text-sm font-medium">{notification.message}</p>
        </motion.div>
      )}

      {activeTab === 'overview' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl">
              <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Database</p>
              <p className="text-xl font-bold text-emerald-900">{!diagnostics ? '—' : diagnostics.database?.connected ? 'Operational' : 'Offline'}</p>
            </div>
            <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl">
              <p className="text-[10px] font-bold text-indigo-600 uppercase mb-1">AI Service</p>
              <p className={`text-xl font-bold ${diagnostics?.environment?.aiStatus === 'Operational' ? 'text-indigo-900' : 'text-amber-700'}`}>
                {diagnostics?.environment?.aiStatus || '—'}
              </p>
            </div>
            <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl">
              <p className="text-[10px] font-bold text-amber-600 uppercase mb-1">Email (SMTP)</p>
              <p className={`text-xl font-bold ${diagnostics?.email?.status === 'Operational' ? 'text-amber-900' : 'text-brand-gray'}`}>
                {diagnostics?.email?.status || '—'}
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
              <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">Storage Mode</p>
              <p className="text-xl font-bold text-slate-900 uppercase">{diagnostics?.database?.type || '—'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Connection Status */}
            <div className="bento-card">
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-lg ${diagnostics?.database?.connected ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                  <Activity size={20} />
                </div>
                <h3 className="font-bold">Database Status</h3>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-brand-gray">Storage Type</span>
                  <span className="text-sm font-bold uppercase">{diagnostics?.database?.type || '—'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-brand-gray">Connection</span>
                  <span className={`text-sm font-bold flex items-center gap-1 ${diagnostics?.database?.connected ? 'text-emerald-600' : 'text-red-600'}`}>
                    {diagnostics?.database?.connected ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    {!diagnostics ? 'Unknown' : diagnostics.database?.connected ? 'Operational' : 'Disconnected'}
                  </span>
                </div>
                {diagnostics?.database?.error && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-[10px] text-red-600 font-mono break-all">
                    {diagnostics.database.error}
                  </div>
                )}
              </div>
            </div>

            {/* Environment Keys */}
            <div className="bento-card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
                    <Key size={20} />
                  </div>
                  <h3 className="font-bold">AI Service Health</h3>
                </div>
                {!diagnostics?.environment?.hasGeminiKey && (
                  <button 
                    onClick={() => setShowKeyInput(!showKeyInput)}
                    className="text-[10px] font-bold text-brand-red hover:underline"
                  >
                    {showKeyInput ? 'Cancel' : 'Fix Missing Key'}
                  </button>
                )}
              </div>
              <div className="space-y-4">
                {showKeyInput ? (
                  <div className="space-y-2">
                    <input 
                      type="password"
                      className="input-field text-xs"
                      placeholder="Paste Gemini API Key here..."
                      value={manualKey}
                      onChange={(e) => setManualKey(e.target.value)}
                    />
                    <button 
                      onClick={handleSaveKey}
                      className="w-full btn-primary py-2 text-[10px]"
                    >
                      Save & Sync Key
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-brand-gray">API Key Status</span>
                      <span className={`text-sm font-bold ${diagnostics?.environment?.hasGeminiKey ? 'text-emerald-600' : 'text-red-600'}`}>
                        {diagnostics?.environment?.hasGeminiKey ? 'Configured' : 'Missing'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-brand-gray">Current Status</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold flex items-center gap-1 ${
                          diagnostics?.environment?.aiStatus === 'Operational' ? 'text-emerald-600' : 
                          diagnostics?.environment?.aiStatus === 'Degraded' ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {diagnostics?.environment?.aiStatus === 'Operational' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                          {diagnostics?.environment?.aiStatus || 'Unknown'}
                        </span>
                        <button 
                          onClick={handleTestAI}
                          disabled={isTestingAI || !diagnostics?.environment?.hasGeminiKey}
                          className="p-1 hover:bg-slate-100 rounded transition-colors disabled:opacity-50"
                          title="Run Live Connection Test"
                        >
                          <RefreshCw size={12} className={isTestingAI ? 'animate-spin' : ''} />
                        </button>
                      </div>
                    </div>
                    {diagnostics?.environment?.aiError && (
                      <div className="p-2 bg-red-50 border border-red-100 rounded text-[9px] text-red-600 font-mono overflow-auto max-h-20">
                        <p className="font-bold mb-1">Last Error:</p>
                        {diagnostics.environment.aiError}
                        {diagnostics.environment.lastAIErrorAt && (
                          <p className="mt-1 opacity-60 italic">Detected at: {new Date(diagnostics.environment.lastAIErrorAt).toLocaleTimeString()}</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Email Service */}
            <div className="bento-card">
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-lg ${diagnostics?.email?.status === 'Operational' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                  <Mail size={20} />
                </div>
                <h3 className="font-bold">Email Service</h3>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-brand-gray">SMTP Host</span>
                  <span className="text-sm font-bold truncate max-w-[120px]">{diagnostics?.email?.host || '—'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-brand-gray">Status</span>
                  <span className={`text-sm font-bold flex items-center gap-1 ${
                    diagnostics?.email?.status === 'Operational' ? 'text-emerald-600' : 
                    diagnostics?.email?.status === 'Not Configured' ? 'text-brand-gray' : 'text-red-600'
                  }`}>
                    {diagnostics?.email?.status === 'Operational' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    {diagnostics?.email?.status || '—'}
                  </span>
                </div>
                {diagnostics?.email?.error && (
                  <div className="p-2 bg-red-50 border border-red-100 rounded text-[9px] text-red-600 font-mono overflow-auto max-h-20">
                    {diagnostics.email.error}
                  </div>
                )}
              </div>
            </div>

            {/* Cloud Records */}
            <div className="bento-card md:col-span-3">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                  <Database size={20} />
                </div>
                <h3 className="font-bold">Cloud Data Integrity</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {Object.entries(diagnostics?.database?.collections || {}).map(([name, count]: [any, any]) => (
                  <div key={name} className="p-3 bg-slate-50 rounded-xl border border-black/5">
                    <p className="text-[10px] text-brand-gray uppercase font-bold mb-1">{name}</p>
                    <div className="flex items-end justify-between">
                      <p className="text-2xl font-bold text-brand-black">{count}</p>
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mb-1" />
                    </div>
                  </div>
                ))}
                {Object.keys(diagnostics?.database?.collections || {}).length === 0 && (
                  <div className="col-span-full text-center py-8 text-brand-gray text-sm italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No cloud data synchronized yet
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Connection History Chart */}
          <div className="bento-card">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-brand-red/10 text-brand-red">
                  <History size={20} />
                </div>
                <h3 className="font-bold">Connection Uptime History</h3>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider">
                <div className="flex items-center gap-1 text-emerald-600">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" /> Online
                </div>
                <div className="flex items-center gap-1 text-red-600">
                  <div className="w-2 h-2 rounded-full bg-red-500" /> Offline
                </div>
              </div>
            </div>
            
            {chartData.length < 2 ? (
              <div className="h-64 w-full flex items-center justify-center text-brand-gray text-sm italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                Not enough connection events recorded to draw a history yet
              </div>
            ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorStatus" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis 
                    dataKey="time" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    minTickGap={30}
                  />
                  <YAxis 
                    domain={[0, 1.2]} 
                    ticks={[0, 1]} 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    tickFormatter={(val) => val === 1 ? 'UP' : 'DOWN'}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                    formatter={(value: any) => [value === 1 ? 'Operational' : 'Disconnected', 'Status']}
                  />
                  <Area 
                    type="stepAfter" 
                    dataKey="status" 
                    stroke="#10b981" 
                    strokeWidth={3} 
                    fillOpacity={1} 
                    fill="url(#colorStatus)" 
                    animationDuration={1000}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            )}
          </div>

          {/* Detailed Logs */}
          <div className="bento-card">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
                <Clock size={20} />
              </div>
              <h3 className="font-bold">Recent Connection Events</h3>
            </div>
            <div className="space-y-3">
              {diagnostics?.database?.logs?.map((log: any, i: number) => (
                <div key={i} className="flex items-start gap-4 p-3 rounded-xl border border-black/5 hover:bg-slate-50 transition-colors">
                  <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${log.status === 'up' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-xs font-bold uppercase ${log.status === 'up' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {log.status === 'up' ? 'Connection Restored' : 'Connection Lost'}
                      </span>
                      <span className="text-[10px] text-brand-gray">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-brand-black">{log.message}</p>
                  </div>
                </div>
              ))}
              {(!diagnostics?.database?.logs || diagnostics.database.logs.length === 0) && (
                <div className="text-center py-8 text-brand-gray text-sm italic">
                  No connection events recorded yet
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="bento-card">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
              <History size={20} />
            </div>
            <h3 className="font-bold">User Activity Logs</h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-black/5">
                  <th className="pb-3 font-semibold">Time</th>
                  <th className="pb-3 font-semibold">User</th>
                  <th className="pb-3 font-semibold">Action</th>
                  <th className="pb-3 font-semibold">Type</th>
                  <th className="pb-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {activityLogs.map((log: any, i: number) => (
                  <tr key={log.id ?? i} className="hover:bg-black/5 transition-colors">
                    <td className="py-4 text-xs text-brand-gray">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-brand-red/10 flex items-center justify-center text-brand-red text-[10px] font-bold">
                          {(log.userName || '?').charAt(0)}
                        </div>
                        <span className="font-medium">{log.userName || '—'}</span>
                      </div>
                    </td>
                    <td className="py-4 font-bold text-xs">{log.action}</td>
                    <td className="py-4">
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${
                        log.type === 'auth' ? 'bg-blue-100 text-blue-700' :
                        log.type === 'ticket' ? 'bg-emerald-100 text-emerald-700' :
                        log.type === 'workflow' ? 'bg-purple-100 text-purple-700' :
                        log.type === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {log.type}
                      </span>
                    </td>
                    <td className="py-4 text-xs text-brand-gray max-w-xs truncate" title={log.details}>
                      {log.details}
                    </td>
                  </tr>
                ))}
                {activityLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-brand-gray italic">No activity logs found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-6 border-t border-black/5">
              <p className="text-xs text-brand-gray">
                Showing <span className="font-bold text-brand-black">{(activityPage - 1) * activityLimit + 1}</span> to <span className="font-bold text-brand-black">{Math.min(activityPage * activityLimit, activityTotal)}</span> of <span className="font-bold text-brand-black">{activityTotal}</span> actions
              </p>
              <div className="flex gap-2">
                <button 
                  onClick={() => handlePageChange(activityPage - 1)}
                  disabled={activityPage === 1}
                  aria-label="Previous page"
                  className="p-2 rounded-lg border border-black/5 hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <Clock size={14} className="rotate-180" />
                </button>
                <div className="flex items-center gap-1">
                  {[...Array(Math.min(5, totalPages))].map((_, i) => {
                    let pageNum = activityPage;
                    if (activityPage <= 3) pageNum = i + 1;
                    else if (activityPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                    else pageNum = activityPage - 2 + i;
                    
                    if (pageNum <= 0 || pageNum > totalPages) return null;

                    return (
                      <button
                        key={pageNum}
                        aria-label={`Page ${pageNum}`}
                        onClick={() => handlePageChange(pageNum)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                          activityPage === pageNum 
                            ? 'bg-brand-black text-white shadow-md' 
                            : 'hover:bg-black/5 text-brand-gray hover:text-brand-black'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button 
                  onClick={() => handlePageChange(activityPage + 1)}
                  disabled={activityPage === totalPages}
                  aria-label="Next page"
                  className="p-2 rounded-lg border border-black/5 hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <Clock size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
