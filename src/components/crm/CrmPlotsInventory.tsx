import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Package, 
  Layers, 
  Search, 
  SlidersHorizontal, 
  X, 
  Info, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  ExternalLink, 
  TrendingUp, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle,
  FileSpreadsheet,
  ArrowUpDown,
  Filter,
  Settings,
  RefreshCw,
  MapPin
} from 'lucide-react';
import { parseCSV, csvCell, safeHttpUrl } from '../../lib/plots';

// Interfaces
interface PlotRecord {
  id: string | number;
  projectName: string;
  landType: string;
  status: string;
  sector: string;
  areaSqM: number;
  unitCode: string;
  clientName: string;
  companyName: string;
  salesContractDate: string;
  yearOfSale: string;
  rfPrice: string;
  cashValue: string;
  quarterOfSale?: string;
  salesRep?: string;
  leadSource?: string;
}

export const CrmPlotsInventory: React.FC = () => {
  // Analytical Tabs state
  const [activeTab, setActiveTab] = useState<'breakdown' | 'landbank'>('breakdown');
  
  // Data loading states
  const [projectData, setProjectData] = useState<PlotRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Google Sheets Live sync config states
  const [sheetConfigUrl, setSheetConfigUrl] = useState<string>('');
  const [lastSyncedTime, setLastSyncedTime] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [showConfigForm, setShowConfigForm] = useState<boolean>(false);
  const [newSheetUrl, setNewSheetUrl] = useState<string>('');
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Global Operational Filters states
  const [selectedQuarter, setSelectedQuarter] = useState<string>('All');
  const [selectedYear, setSelectedYear] = useState<string>('All');
  const [selectedProject, setSelectedProject] = useState<string>('All');
  const [selectedSector, setSelectedSector] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedSalesRep, setSelectedSalesRep] = useState<string>('All');
  const [selectedLeadSource, setSelectedLeadSource] = useState<string>('All');
  const [areaRangePreset, setAreaRangePreset] = useState<string>('All');

  // Global Filter: Area Range state
  const [minAreaSqM, setMinAreaSqM] = useState<string>('');
  const [maxAreaSqM, setMaxAreaSqM] = useState<string>('');
  const [isAreaFilterOpen, setIsAreaFilterOpen] = useState<boolean>(false);
  const [tempMinArea, setTempMinArea] = useState<string>('');
  const [tempMaxArea, setTempMaxArea] = useState<string>('');

  // Modals state
  const [selectedSectorUnits, setSelectedSectorUnits] = useState<{
    projectName: string;
    sectorName: string;
    units: PlotRecord[];
  } | null>(null);

  const [selectedSoldProject, setSelectedSoldProject] = useState<{
    projectName: string;
    units: PlotRecord[];
  } | null>(null);

  const [selectedPlotDetail, setSelectedPlotDetail] = useState<PlotRecord | null>(null);

  // Fetch sheet config on mount
  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/plots-config");
      if (res.ok) {
        const data = await res.json();
        setSheetConfigUrl(data.sheetUrl || '');
        setNewSheetUrl(data.sheetUrl || '');
        setLastSyncedTime(data.lastSynced || '');
      }
    } catch (e) {
      console.error("Error fetching plots config:", e);
    }
  };

  const fetchCsvData = async (ignoreLoadingState = false) => {
    try {
      if (!ignoreLoadingState) setIsLoading(true);
      const sheetUrl = `/api/plots-csv?t=${Date.now()}`;
      const response = await fetch(sheetUrl);
      if (!response.ok) {
        throw new Error("Could not connect to online spreadsheet proxy");
      }
      const csvText = await response.text();
      const parsed = parseCSV(csvText);
      
      if (parsed.length === 0) {
        throw new Error("No record found in the Google Sheet");
      }

      console.log("Plots Inventory parsed records count:", parsed.length);

      const num = (v: any) => parseFloat(String(v ?? '').replace(/,/g, ''));
      const mapped: PlotRecord[] = parsed.map((row: any, index: number) => {
        const areaSqM = num(row['Area'] || '0');
        const status = (row['Status'] || 'Unknown').toUpperCase().trim();
        const isSoldLike = status === 'SOLD' || status === 'RESERVED' || status === 'CONTRACTED';
        // Sold/reserved plots carry the deal price; everything else the planned list price.
        // Columns may be absent for ordinary sales users -> '' (shown as N/A / hidden).
        const sqmPrice = (row['RF Price'] || (isSoldLike ? row['SqM Cash Price (A)'] : row['SqM Price planned']) || '').trim();
        const cash = ((isSoldLike ? row['Cash Value (A)'] : row['Cash Value planned']) || row['Cash Value (A)'] || '').trim();
        
        return {
          id: index + 1,
          projectName: (row['Project Name'] || '').trim() || 'Unknown Project',
          landType: (row['Land Type'] || '').trim() || 'General',
          status,
          sector: (row['Sector'] || '').trim() || 'General',
          areaSqM: Number.isFinite(areaSqM) ? areaSqM : 0,
          unitCode: (row['Unit Code'] || '').trim() || 'N/A',
          clientName: (row['Client Name'] || row['Company Name'] || '').trim(),
          companyName: (row['Company Name'] || '').trim(),
          salesContractDate: (row['Sales contract date'] || '').trim() || '',
          yearOfSale: (row['Year of Sale'] || '').trim() || '',
          rfPrice: sqmPrice,
          cashValue: cash,
          quarterOfSale: (row['Quarter of sale'] || '').trim() || '',
          salesRep: (row['SOLD BY'] || '').trim(),
          leadSource: (row['lead source'] || '').trim()
        };
      });

      setProjectData(mapped);
      setError(null);
    } catch (err: any) {
      console.error("Error loading plots data:", err);
      // No demo data: keep what we already have (if anything) and tell the user.
      setError(err?.message || "Could not load the plots sheet.");
    } finally {
      if (!ignoreLoadingState) setIsLoading(false);
    }
  };

  const handleForceSync = async () => {
    try {
      setIsSyncing(true);
      setSyncStatusMsg(null);
      const res = await fetch("/api/plots-sync", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        throw new Error(data.error || "Sync failed on the server.");
      }
      const data = await res.json().catch(() => ({} as any));
      setLastSyncedTime(data.lastSynced || new Date().toISOString());
      setSyncStatusMsg({ type: 'success', text: 'Google Sheet synchronized successfully!' });
      await fetchCsvData(true);
    } catch (e: any) {
      console.error("Force sync failed:", e);
      setSyncStatusMsg({ type: 'error', text: e.message || "Failed to sync spreadsheet." });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!safeHttpUrl(newSheetUrl)) {
      setSyncStatusMsg({ type: 'error', text: 'Please enter a valid http(s) spreadsheet URL.' });
      return;
    }
    try {
      setIsSyncing(true);
      setSyncStatusMsg(null);
      const res = await fetch("/api/plots-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: safeHttpUrl(newSheetUrl) })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        throw new Error(data.error || "Failed to update configuration.");
      }
      const data = await res.json().catch(() => ({} as any));
      setSheetConfigUrl(data.sheetUrl || newSheetUrl);
      setShowConfigForm(false);
      await handleForceSync();
    } catch (e: any) {
      console.error("Save config failed:", e);
      setSyncStatusMsg({ type: 'error', text: e.message || "Failed to save spreadsheet URL." });
      setIsSyncing(false);
    }
  };

  // Escape closes whichever detail window is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPlotDetail(null);
        setSelectedSectorUnits(null);
        setSelectedSoldProject(null);
        setIsAreaFilterOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Fetch sheet data on mount
  useEffect(() => {
    fetchConfig();
    fetchCsvData();
  }, []);

  // Listen to projectData load to check if any specific plot should be pre-opened from recommendations
  useEffect(() => {
    if (projectData.length > 0) {
      const savedUnitCode = localStorage.getItem('crm_selected_plot_unit');
      if (savedUnitCode) {
        const foundPlot = projectData.find(p => p.unitCode.toLowerCase().trim() === savedUnitCode.toLowerCase().trim());
        if (foundPlot) {
          setSelectedPlotDetail(foundPlot);
        }
        localStorage.removeItem('crm_selected_plot_unit');
      }
    }
  }, [projectData]);

  // Filter raw data based on operational filters
  const dataWithoutAreaFilter = projectData.filter((record) => {
    if (selectedQuarter !== 'All' && record.quarterOfSale !== selectedQuarter) return false;
    if (selectedYear !== 'All' && record.yearOfSale !== selectedYear) return false;
    if (selectedProject !== 'All' && record.projectName !== selectedProject) return false;
    if (selectedSector !== 'All' && record.sector !== selectedSector) return false;
    if (selectedStatus !== 'All' && record.status !== selectedStatus) return false;
    if (selectedSalesRep !== 'All' && record.salesRep !== selectedSalesRep) return false;
    if (selectedLeadSource !== 'All' && record.leadSource !== selectedLeadSource) return false;
    return true;
  });

  const filteredData = dataWithoutAreaFilter.filter((record) => {
    const area = record.areaSqM;
    const min = minAreaSqM !== '' ? parseFloat(minAreaSqM) : -Infinity;
    const max = maxAreaSqM !== '' ? parseFloat(maxAreaSqM) : Infinity;
    if (!isNaN(min) && area < min) return false;
    if (!isNaN(max) && area > max) return false;
    return true;
  });

  const handleResetFilters = () => {
    setSelectedQuarter('All');
    setSelectedYear('All');
    setSelectedProject('All');
    setSelectedSector('All');
    setSelectedStatus('All');
    setSelectedSalesRep('All');
    setSelectedLeadSource('All');
    setAreaRangePreset('All');
    setMinAreaSqM('');
    setMaxAreaSqM('');
    setTempMinArea('');
    setTempMaxArea('');
    setIsAreaFilterOpen(false);
  };

  // UI Status Badge Helper
  const getStatusBadge = (status: string) => {
    const baseClass = "px-2.5 py-1 text-[11px] font-bold rounded-lg tracking-wider uppercase";
    switch (status) {
      case 'SOLD':
        return <span className={`${baseClass} bg-emerald-500/10 text-emerald-500 border border-emerald-500/20`}>SOLD</span>;
      case 'CONTRACTED':
        return <span className={`${baseClass} bg-blue-500/10 text-blue-500 border border-blue-500/20`}>CONTRACTED</span>;
      case 'RESERVED':
        return <span className={`${baseClass} bg-violet-500/10 text-violet-500 border border-violet-500/20`}>RESERVED</span>;
      case 'ATS':
        return <span className={`${baseClass} bg-amber-500/10 text-amber-500 border border-amber-500/20`}>ATS</span>;
      case 'ON HOLD':
        return <span className={`${baseClass} bg-orange-500/10 text-orange-500 border border-orange-500/20`}>ON HOLD</span>;
      case 'NFS':
        return <span className={`${baseClass} bg-red-500/10 text-red-500 border border-red-500/20`}>NFS</span>;
      default:
        return <span className={`${baseClass} bg-gray-500/10 text-gray-400 border border-gray-500/20`}>{status}</span>;
    }
  };

  // Dynamic drop-down lists extracted from the active data
  const uniqueQuarters = Array.from(new Set(projectData.map(r => r.quarterOfSale || '').filter(val => val && val.trim() !== ''))).sort();
  const uniqueYears = Array.from(new Set(projectData.map(r => r.yearOfSale || '').filter(val => val && val.trim() !== ''))).sort();
  const uniqueProjects = Array.from(new Set(projectData.map(r => r.projectName || '').filter(val => val && val.trim() !== ''))).sort();
  const uniqueSectors = Array.from(new Set(projectData.map(r => r.sector || '').filter(val => val && val.trim() !== ''))).sort();
  const uniqueStatuses = Array.from(new Set(projectData.map(r => r.status || '').filter(val => val && val.trim() !== ''))).sort();
  // Columns the backend strips for ordinary sales users: hide UI that depends on them when absent
  const hasClientCols = projectData.some(r => r.clientName || r.companyName);
  const hasPriceCols = projectData.some(r => r.rfPrice || r.cashValue);
  const hasRepCol = projectData.some(r => r.salesRep);
  const hasSourceCol = projectData.some(r => r.leadSource);
  const uniqueSalesReps = Array.from(new Set(projectData.map(r => r.salesRep || '').filter(val => val && val.trim() !== ''))).sort();
  const uniqueLeadSources = Array.from(new Set(projectData.map(r => r.leadSource || '').filter(val => val && val.trim() !== ''))).sort();

  // CSV Export utility
  const exportToCSV = (filename: string, records: PlotRecord[]) => {
    const headers = [
      "Project Name",
      "Land Type",
      "Sector",
      "Unit Code",
      "Area (m²)",
      "Status",
      "Client Name",
      "Company Name",
      "Sales Contract Date",
      "Year of Sale",
      "RF Price",
      "Cash Value",
      "Quarter of Sale",
      "SOLD BY",
      "lead source"
    ];

    const csvRows = [headers.join(",")];

    for (const record of records) {
      const row = [
        record.projectName,
        record.landType,
        record.sector,
        record.unitCode,
        record.areaSqM,
        record.status,
        record.clientName,
        record.companyName,
        record.salesContractDate,
        record.yearOfSale,
        record.rfPrice,
        record.cashValue,
        record.quarterOfSale,
        record.salesRep,
        record.leadSource
      ].map(csvCell);
      csvRows.push(row.join(","));
    }

    const csvContent = csvRows.join("\n");
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Renders a fully interactive table containing ALL spreadsheet columns
  const renderAllColumnsTable = (units: PlotRecord[]) => {
    return (
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-brand-light/40 px-4 py-3 rounded-xl border border-black/5 gap-2 text-xs text-brand-gray">
          <span className="font-semibold flex items-center gap-1.5">
            <Info size={14} className="text-brand-red shrink-0" />
            <span>← Scroll horizontally to see all spreadsheet columns →</span>
          </span>
          <span className="font-bold text-brand-black">{units.length} active plots matched</span>
        </div>
        <div className="overflow-x-auto border border-black/10 rounded-xl bg-white shadow-sm max-w-full">
          <table className="min-w-full text-left border-collapse text-xs divide-y divide-black/10">
            <thead>
              <tr className="bg-brand-light text-[10px] font-bold text-brand-black uppercase tracking-wider divide-x divide-black/5">
                <th className="py-3.5 px-4 text-center w-12 sticky left-0 bg-brand-light z-10 border-r border-black/10">#</th>
                <th className="py-3.5 px-4 min-w-[110px]">Unit Code</th>
                <th className="py-3.5 px-4 min-w-[120px]">Status</th>
                <th className="py-3.5 px-4 min-w-[160px]">Project Name</th>
                <th className="py-3.5 px-4 min-w-[150px]">Sector</th>
                <th className="py-3.5 px-4 min-w-[150px]">Land Type</th>
                <th className="py-3.5 px-4 text-right min-w-[120px]">Area (m²)</th>
                {hasClientCols && <th className="py-3.5 px-4 min-w-[180px]">Client Name</th>}
                {hasClientCols && <th className="py-3.5 px-4 min-w-[180px]">Company Name</th>}
                <th className="py-3.5 px-4 min-w-[140px]">Sales Contract Date</th>
                <th className="py-3.5 px-4 min-w-[110px]">Year of Sale</th>
                {hasPriceCols && <th className="py-3.5 px-4 text-right min-w-[120px]">RF Price</th>}
                {hasPriceCols && <th className="py-3.5 px-4 text-right min-w-[120px]">Cash Value</th>}
                <th className="py-3.5 px-4 min-w-[120px]">Quarter of Sale</th>
                {hasRepCol && <th className="py-3.5 px-4 min-w-[150px]">SOLD BY</th>}
                {hasSourceCol && <th className="py-3.5 px-4 min-w-[150px]">Lead Source</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 bg-white">
              {units.map((unit, index) => (
                <tr key={unit.id} className="hover:bg-brand-light/60 transition-colors divide-x divide-black/5">
                  <td className="py-3.5 px-4 font-bold text-center text-brand-gray bg-slate-50 sticky left-0 z-10 border-r border-black/10">{index + 1}</td>
                  <td className="py-3.5 px-4 font-bold text-brand-black font-mono whitespace-nowrap">
                    <button 
                      onClick={() => setSelectedPlotDetail(unit)} 
                      className="text-brand-red hover:underline font-bold text-left cursor-pointer focus:outline-none"
                      title="Click to view full details"
                    >
                      {unit.unitCode || 'N/A'}
                    </button>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">{getStatusBadge(unit.status)}</td>
                  <td className="py-3.5 px-4 font-semibold text-brand-black whitespace-nowrap">{unit.projectName || 'N/A'}</td>
                  <td className="py-3.5 px-4 text-brand-black whitespace-nowrap">{unit.sector || 'N/A'}</td>
                  <td className="py-3.5 px-4 text-brand-gray whitespace-nowrap">{unit.landType || 'N/A'}</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-brand-black text-right whitespace-nowrap">{unit.areaSqM.toLocaleString()} m²</td>
                  {hasClientCols && <td className="py-3.5 px-4 text-brand-black whitespace-nowrap">{unit.clientName || 'N/A'}</td>}
                  {hasClientCols && <td className="py-3.5 px-4 text-brand-black whitespace-nowrap">{unit.companyName || 'N/A'}</td>}
                  <td className="py-3.5 px-4 font-mono text-brand-gray whitespace-nowrap">{unit.salesContractDate || 'N/A'}</td>
                  <td className="py-3.5 px-4 font-mono text-brand-gray whitespace-nowrap">{unit.yearOfSale || 'N/A'}</td>
                  {hasPriceCols && <td className="py-3.5 px-4 font-mono text-brand-black text-right whitespace-nowrap">{unit.rfPrice || 'N/A'}</td>}
                  {hasPriceCols && <td className="py-3.5 px-4 font-mono text-brand-black text-right whitespace-nowrap">{unit.cashValue || 'N/A'}</td>}
                  <td className="py-3.5 px-4 font-mono text-brand-gray whitespace-nowrap">{unit.quarterOfSale || 'N/A'}</td>
                  {hasRepCol && <td className="py-3.5 px-4 font-semibold text-brand-black whitespace-nowrap">{unit.salesRep || 'N/A'}</td>}
                  {hasSourceCol && <td className="py-3.5 px-4 text-brand-gray whitespace-nowrap">{unit.leadSource || 'N/A'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Render main view based on active tab
  return (
    <div className="space-y-6">
      {/* Dynamic Data Notification & Sync Center */}
      <div className="flex flex-col p-5 rounded-2xl bg-white border border-black/5 shadow-sm gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-brand-red/10 text-brand-red rounded-xl">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h2 className="font-bold text-brand-black text-base flex flex-wrap items-center gap-2">
                Google Sheets Live Connector
                <span className="text-[10px] bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">LIVE SYNC</span>
                {error && (
                  <span className="text-[10px] bg-rose-500/10 text-rose-600 border border-rose-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Load failed</span>
                )}
              </h2>
              <p className="text-xs text-brand-gray mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  {error 
                    ? `${error} Click Sync to retry.` 
                    : `Connected successfully (${projectData.length} active plots parsed).`
                  }
                </span>
                <span className="text-black/20">|</span>
                <span className="text-black/50">
                  Last Synced: <strong className="text-brand-black font-semibold">{lastSyncedTime ? new Date(lastSyncedTime).toLocaleString() : 'Never'}</strong>
                </span>
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => {
                setShowConfigForm(!showConfigForm);
                setSyncStatusMsg(null);
              }}
              className="px-3.5 py-2.5 bg-brand-light hover:bg-black/5 text-brand-black border border-black/10 rounded-xl font-bold text-xs flex items-center gap-2 transition-all"
              title="Configure Google Sheet Link"
            >
              <Settings size={14} /> Configure Sheet
            </button>

            <button
              onClick={handleForceSync}
              disabled={isSyncing}
              className={`px-3.5 py-2.5 bg-brand-red hover:bg-brand-red/90 text-white rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm ${
                isSyncing ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
              {isSyncing ? "Syncing..." : "Force Sync"}
            </button>

            {safeHttpUrl(sheetConfigUrl) && (
              <a 
                href={safeHttpUrl(sheetConfigUrl)} 
                target="_blank" 
                rel="noopener noreferrer"
                className="px-3.5 py-2.5 bg-brand-light hover:bg-black/5 text-brand-black hover:text-brand-red border border-black/10 rounded-xl font-bold text-xs flex items-center gap-2 transition-all justify-center"
              >
                <ExternalLink size={14} /> Open Spreadsheet
              </a>
            )}
          </div>
        </div>

        {/* Dynamic Config slide-down form */}
        <AnimatePresence>
          {showConfigForm && (
            <motion.form
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleSaveConfig}
              className="overflow-hidden border-t border-black/5 pt-4 mt-2"
            >
              <div className="bg-brand-light p-4 rounded-xl space-y-3 border border-black/5">
                <div>
                  <label className="block text-xs font-bold text-brand-black uppercase tracking-wider mb-1.5">
                    Enter Google Sheet URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                      value={newSheetUrl}
                      onChange={(e) => setNewSheetUrl(e.target.value)}
                      disabled={isSyncing}
                      className="flex-1 px-3 py-2 text-xs bg-white border border-black/10 rounded-lg focus:outline-none focus:border-brand-red font-semibold text-brand-black"
                      required
                    />
                    <button
                      type="submit"
                      disabled={isSyncing}
                      className="px-4 py-2 bg-brand-black hover:bg-black/90 text-white font-bold text-xs rounded-lg transition-all disabled:opacity-55"
                    >
                      Save & Sync
                    </button>
                  </div>
                  <p className="text-[10px] text-brand-gray mt-1.5 leading-relaxed">
                    You can paste any Google Sheet sharing URL (e.g., matching /edit or /export format). The system automatically parses columns such as <strong>Project Name, Status, Sector, Area, SOLD BY</strong>, etc.
                  </p>
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Toast / Sync messages */}
        {syncStatusMsg && (
          <div className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-semibold ${
            syncStatusMsg.type === 'success' 
              ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' 
              : 'bg-red-500/10 text-red-700 border-red-500/20'
          }`}>
            {syncStatusMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span className="flex-1">{syncStatusMsg.text}</span>
            <button onClick={() => setSyncStatusMsg(null)} className="opacity-60 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Advanced Operational Filters Bar */}
      <div className="bento-card">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-black/5">
          <div className="flex items-center gap-2 text-brand-black">
            <Filter className="text-brand-red" size={18} />
            <h3 className="font-bold text-sm uppercase tracking-wider">Operational Filters</h3>
          </div>
          <span className="text-xs bg-brand-red/15 text-brand-red px-3 py-1 rounded-full font-extrabold tracking-wider border border-brand-red/10 animate-pulse">
            {filteredData.length} / {projectData.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Quarter/Year Dropdown */}
          <div className="relative">
            <select
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(e.target.value)}
              className="appearance-none bg-brand-light hover:bg-black/5 text-brand-black px-4 py-2 pr-8 rounded-xl font-bold text-xs border border-black/5 focus:outline-none focus:ring-2 focus:ring-brand-red cursor-pointer transition-all"
            >
              <option value="All">Quarter/Year (All)</option>
              {uniqueQuarters.map(q => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-brand-gray">
              <ChevronRight size={12} className="rotate-90 opacity-60" />
            </div>
          </div>

          {/* Year Dropdown */}
          <div className="relative">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="appearance-none bg-brand-light hover:bg-black/5 text-brand-black px-4 py-2 pr-8 rounded-xl font-bold text-xs border border-black/5 focus:outline-none focus:ring-2 focus:ring-brand-red cursor-pointer transition-all"
            >
              <option value="All">Year (All)</option>
              {uniqueYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-brand-gray">
              <ChevronRight size={12} className="rotate-90 opacity-60" />
            </div>
          </div>

          {/* Project Name Dropdown */}
          <div className="relative">
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="appearance-none bg-brand-light hover:bg-black/5 text-brand-black px-4 py-2 pr-8 rounded-xl font-bold text-xs border border-black/5 focus:outline-none focus:ring-2 focus:ring-brand-red cursor-pointer transition-all"
            >
              <option value="All">Project Name (All)</option>
              {uniqueProjects.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-brand-gray">
              <ChevronRight size={12} className="rotate-90 opacity-60" />
            </div>
          </div>

          {/* Sector Dropdown */}
          <div className="relative">
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="appearance-none bg-brand-light hover:bg-black/5 text-brand-black px-4 py-2 pr-8 rounded-xl font-bold text-xs border border-black/5 focus:outline-none focus:ring-2 focus:ring-brand-red cursor-pointer transition-all"
            >
              <option value="All">Sector (All)</option>
              {uniqueSectors.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-brand-gray">
              <ChevronRight size={12} className="rotate-90 opacity-60" />
            </div>
          </div>

          {/* Property Status Dropdown */}
          <div className="relative">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="appearance-none bg-brand-light hover:bg-black/5 text-brand-black px-4 py-2 pr-8 rounded-xl font-bold text-xs border border-black/5 focus:outline-none focus:ring-2 focus:ring-brand-red cursor-pointer transition-all"
            >
              <option value="All">Property Status (All)</option>
              {uniqueStatuses.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-brand-gray">
              <ChevronRight size={12} className="rotate-90 opacity-60" />
            </div>
          </div>

          {/* Sales Rep Dropdown */}
          {hasRepCol && <div className="relative">
            <select
              value={selectedSalesRep}
              onChange={(e) => setSelectedSalesRep(e.target.value)}
              className="appearance-none bg-brand-light hover:bg-black/5 text-brand-black px-4 py-2 pr-8 rounded-xl font-bold text-xs border border-black/5 focus:outline-none focus:ring-2 focus:ring-brand-red cursor-pointer transition-all"
            >
              <option value="All">Sales Rep (All)</option>
              {uniqueSalesReps.map(sr => (
                <option key={sr} value={sr}>{sr}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-brand-gray">
              <ChevronRight size={12} className="rotate-90 opacity-60" />
            </div>
          </div>}

          {/* Lead Source Dropdown */}
          {hasSourceCol && <div className="relative">
            <select
              value={selectedLeadSource}
              onChange={(e) => setSelectedLeadSource(e.target.value)}
              className="appearance-none bg-brand-light hover:bg-black/5 text-brand-black px-4 py-2 pr-8 rounded-xl font-bold text-xs border border-black/5 focus:outline-none focus:ring-2 focus:ring-brand-red cursor-pointer transition-all"
            >
              <option value="All">Lead Source (All)</option>
              {uniqueLeadSources.map(ls => (
                <option key={ls} value={ls}>{ls}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-brand-gray">
              <ChevronRight size={12} className="rotate-90 opacity-60" />
            </div>
          </div>}

          {/* Area Range Popover Filter */}
          <div className="relative">
            <button
              onClick={() => setIsAreaFilterOpen(!isAreaFilterOpen)}
              className="bg-brand-light hover:bg-black/5 text-brand-black px-4 py-2 rounded-xl font-bold text-xs border border-black/5 flex items-center gap-2 transition-all cursor-pointer select-none"
            >
              <span>
                {minAreaSqM !== '' || maxAreaSqM !== '' 
                  ? `Area: ${minAreaSqM || '0'} - ${maxAreaSqM || '∞'} m²`
                  : 'Area Range'
                }
              </span>
              {isAreaFilterOpen ? <ChevronUp size={12} className="text-brand-gray" /> : <ChevronDown size={12} className="text-brand-gray" />}
            </button>

            <AnimatePresence>
              {isAreaFilterOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setIsAreaFilterOpen(false)} 
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="absolute left-0 mt-2 p-5 bg-white border border-black/10 rounded-2xl shadow-xl z-20 w-[280px] space-y-4"
                  >
                    <div className="grid grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1.5">
                          From (SqM)
                        </label>
                        <input
                          type="number"
                          placeholder="Min..."
                          value={tempMinArea}
                          onChange={(e) => setTempMinArea(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white border border-black/10 rounded-lg focus:outline-none focus:border-brand-red font-semibold text-brand-black"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1.5">
                          To (SqM)
                        </label>
                        <input
                          type="number"
                          placeholder="Max..."
                          value={tempMaxArea}
                          onChange={(e) => setTempMaxArea(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white border border-black/10 rounded-lg focus:outline-none focus:border-brand-red font-semibold text-brand-black"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setMinAreaSqM(tempMinArea);
                        setMaxAreaSqM(tempMaxArea);
                        setIsAreaFilterOpen(false);
                      }}
                      className="w-full py-2.5 bg-brand-red hover:bg-brand-red/90 text-white font-extrabold text-xs rounded-lg transition-all shadow-sm text-center"
                    >
                      Go
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Reset button */}
          <button
            onClick={handleResetFilters}
            className="px-4 py-2 bg-brand-red/10 hover:bg-brand-red hover:text-white text-brand-red transition-all rounded-xl text-xs font-bold border border-brand-red/10 cursor-pointer md:ml-auto"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Dual Tab Switcher */}
      <div className="flex border-b border-black/5 gap-1">
        <button
          onClick={() => setActiveTab('breakdown')}
          className={`flex items-center gap-2.5 px-6 py-3.5 font-bold text-sm border-b-2 transition-all ${
            activeTab === 'breakdown' 
              ? 'border-brand-red text-brand-red font-bold' 
              : 'border-transparent text-brand-gray hover:text-brand-black'
          }`}
        >
          <Package size={18} />
          Available Inventory Breakdown
        </button>
        <button
          onClick={() => setActiveTab('landbank')}
          className={`flex items-center gap-2.5 px-6 py-3.5 font-bold text-sm border-b-2 transition-all ${
            activeTab === 'landbank' 
              ? 'border-brand-red text-brand-red font-bold' 
              : 'border-transparent text-brand-gray hover:text-brand-black'
          }`}
        >
          <Layers size={18} />
          Project Land Bank Analysis
        </button>
      </div>

      {/* Main Analytical Tab Area */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 bg-white/50 backdrop-blur-sm rounded-2xl border border-black/5">
          <div className="w-12 h-12 border-4 border-brand-red/20 border-t-brand-red rounded-full animate-spin"></div>
          <p className="text-xs text-brand-gray font-medium">Re-indexing ledger from Google Cloud Sheets...</p>
        </div>
      ) : projectData.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-black/5 text-xs font-semibold text-brand-gray" role="alert">
          {error || 'No plots were returned by the sheet.'}
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {activeTab === 'breakdown' ? (
            <motion.div
              key="breakdown"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Breakdown Intro */}
              <div className="flex items-center gap-2.5 mb-1">
                <Package className="text-brand-red" size={20} />
                <h3 className="font-bold text-lg text-brand-black">Available Inventory Breakdown</h3>
              </div>
              
              <AvailableInventoryView 
                data={filteredData} 
                unfilteredData={dataWithoutAreaFilter}
                minAreaSqM={minAreaSqM}
                maxAreaSqM={maxAreaSqM} 
                onSectorClick={(projectName, sectorName, units) => {
                  setSelectedSectorUnits({ projectName, sectorName, units });
                }} 
              />
            </motion.div>
          ) : (
            <motion.div
              key="landbank"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Land Bank Header */}
              <div>
                <span className="text-[10px] font-bold tracking-widest text-brand-gray uppercase block">PORTFOLIO LAND BANK LEVELS</span>
                <div className="flex items-center gap-2.5 mt-0.5">
                  <Layers className="text-brand-red" size={22} />
                  <h3 className="font-bold text-2xl text-brand-black">PROJECT LAND BANK ANALYSIS</h3>
                </div>
              </div>

              <LandBankAnalysisView 
                data={filteredData}
                onSoldClick={(projectName, units) => {
                  setSelectedSoldProject({ projectName, units });
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Sector Details Modal */}
      {selectedSectorUnits && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-[92vw] lg:max-w-7xl bg-white rounded-2xl shadow-2xl border border-black/10 flex flex-col max-h-[85vh]"
          >
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-4 border-b border-black/5 bg-brand-light rounded-t-2xl">
              <div>
                <h4 className="font-bold text-lg text-brand-black">{selectedSectorUnits.projectName}</h4>
                <p className="text-xs text-brand-red font-bold">Sector / Land Type: {selectedSectorUnits.sectorName}</p>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => exportToCSV(`${selectedSectorUnits.projectName}_${selectedSectorUnits.sectorName}_Inventory`.replace(/\s+/g, "_"), selectedSectorUnits.units)}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer select-none"
                  title="Download CSV file containing all matching records in this view"
                >
                  <FileSpreadsheet size={14} /> Export to CSV
                </button>
                <button 
                  onClick={() => setSelectedSectorUnits(null)}
                  className="p-1.5 hover:bg-black/5 text-brand-gray hover:text-brand-black rounded-lg transition-all cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Table Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {renderAllColumnsTable(selectedSectorUnits.units)}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-black/5 flex flex-col sm:flex-row gap-4 justify-between items-center bg-brand-light rounded-b-2xl">
              <span className="text-xs text-brand-gray font-medium">
                Total Sector Inventory: <span className="font-bold text-brand-black">{selectedSectorUnits.units.length} Unit(s)</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportToCSV(`${selectedSectorUnits.projectName}_${selectedSectorUnits.sectorName}_Inventory`.replace(/\s+/g, "_"), selectedSectorUnits.units)}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer select-none"
                >
                  <FileSpreadsheet size={14} /> Export CSV
                </button>
                <button 
                  onClick={() => setSelectedSectorUnits(null)}
                  className="btn-primary py-1.5 px-4 text-xs cursor-pointer"
                >
                  Close View
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Sold Units / Pipeline Modal */}
      {selectedSoldProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-[92vw] lg:max-w-7xl bg-white rounded-2xl shadow-2xl border border-black/10 flex flex-col max-h-[85vh]"
          >
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-4 border-b border-black/5 bg-brand-light rounded-t-2xl">
              <div>
                <h4 className="font-bold text-lg text-brand-black">{selectedSoldProject.projectName}</h4>
                <p className="text-xs text-brand-red font-bold">Ledger Archive: Sold, Contracted & Reserved Pipelines</p>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => exportToCSV(`${selectedSoldProject.projectName}_Ledger_Archive`.replace(/\s+/g, "_"), selectedSoldProject.units)}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer select-none"
                  title="Download CSV archive for this project"
                >
                  <FileSpreadsheet size={14} /> Export to CSV
                </button>
                <button 
                  onClick={() => setSelectedSoldProject(null)}
                  className="p-1.5 hover:bg-black/5 text-brand-gray hover:text-brand-black rounded-lg transition-all cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Table Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {renderAllColumnsTable(selectedSoldProject.units)}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-black/5 flex flex-col sm:flex-row gap-4 justify-between items-center bg-brand-light rounded-b-2xl">
              <span className="text-xs text-brand-gray font-medium">
                Total Transaction Volume: <span className="font-bold text-brand-black">
                  {selectedSoldProject.units.reduce((sum, u) => sum + u.areaSqM, 0).toLocaleString()} m²
                </span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportToCSV(`${selectedSoldProject.projectName}_Ledger_Archive`.replace(/\s+/g, "_"), selectedSoldProject.units)}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer select-none"
                >
                  <FileSpreadsheet size={14} /> Export CSV
                </button>
                <button 
                  onClick={() => setSelectedSoldProject(null)}
                  className="btn-primary py-1.5 px-4 text-xs cursor-pointer"
                >
                  Close View
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Plot Details Modal */}
      {selectedPlotDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-black/10 overflow-hidden"
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-5 border-b border-black/5 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-brand-red/10 text-brand-red rounded-2xl">
                  <MapPin size={24} />
                </div>
                <div>
                  <h4 className="font-extrabold text-lg text-brand-black tracking-tight">
                    Unit {selectedPlotDetail.unitCode} Details
                  </h4>
                  <p className="text-xs text-brand-gray font-semibold tracking-wide uppercase mt-0.5">
                    {selectedPlotDetail.projectName}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedPlotDetail(null)}
                className="p-2 hover:bg-black/5 text-brand-gray hover:text-brand-black rounded-xl transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Primary KPI Badges */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-brand-light border border-black/5 rounded-2xl p-4 text-center">
                  <span className="text-[10px] font-bold text-brand-gray uppercase tracking-wider block">Plot Status</span>
                  <div className="mt-2.5 inline-block">
                    {getStatusBadge(selectedPlotDetail.status)}
                  </div>
                </div>
                <div className="bg-brand-light border border-black/5 rounded-2xl p-4 text-center">
                  <span className="text-[10px] font-bold text-brand-gray uppercase tracking-wider block">Plot Size</span>
                  <div className="text-[9px] text-brand-gray/80 mt-1 font-mono">
                    {(selectedPlotDetail.areaSqM / 4200).toFixed(2)} Feddan | {(selectedPlotDetail.areaSqM / 10000).toFixed(2)} Hectare
                  </div>
                  <span className="text-lg font-mono font-black text-brand-black block mt-1">
                    {selectedPlotDetail.areaSqM.toLocaleString()} sqm
                  </span>
                </div>
              </div>

              {/* Detailed Plot Fields */}
              <div className="space-y-4">
                <h5 className="text-[11px] font-extrabold text-brand-black uppercase tracking-widest border-b border-black/5 pb-1">
                  General Information
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-xs">
                  <div>
                    <span className="text-brand-gray font-medium block">Project Name</span>
                    <span className="font-bold text-brand-black text-sm">{selectedPlotDetail.projectName || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-brand-gray font-medium block">Sector</span>
                    <span className="font-bold text-brand-black text-sm">{selectedPlotDetail.sector || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-brand-gray font-medium block">Land Type</span>
                    <span className="font-bold text-brand-black text-sm">{selectedPlotDetail.landType || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-brand-gray font-medium block">Unit Code Reference</span>
                    <span className="font-mono font-bold text-brand-black text-sm">{selectedPlotDetail.unitCode || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Financial & Client Details */}
              <div className="space-y-4">
                <h5 className="text-[11px] font-extrabold text-brand-black uppercase tracking-widest border-b border-black/5 pb-1">
                  Transaction & Client Ledger
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-xs">
                  {hasClientCols && <div>
                    <span className="text-brand-gray font-medium block">Client / Registrant Name</span>
                    <span className="font-bold text-brand-black text-sm">{selectedPlotDetail.clientName || 'N/A'}</span>
                  </div>}
                  {hasClientCols && <div>
                    <span className="text-brand-gray font-medium block">Company Name</span>
                    <span className="font-bold text-brand-black text-sm">{selectedPlotDetail.companyName || 'N/A'}</span>
                  </div>}
                  {hasRepCol && <div>
                    <span className="text-brand-gray font-medium block">Sales Representative</span>
                    <span className="font-bold text-indigo-600 text-sm">{selectedPlotDetail.salesRep || 'N/A'}</span>
                  </div>}
                  {hasSourceCol && <div>
                    <span className="text-brand-gray font-medium block">Lead Source Reference</span>
                    <span className="font-bold text-brand-black text-sm">{selectedPlotDetail.leadSource || 'N/A'}</span>
                  </div>}
                  <div>
                    <span className="text-brand-gray font-medium block">Sales Contract Date</span>
                    <span className="font-mono font-bold text-brand-black">{selectedPlotDetail.salesContractDate || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-brand-gray font-medium block">Year & Quarter of Sale</span>
                    <span className="font-mono font-bold text-brand-black">
                      {selectedPlotDetail.yearOfSale ? `${selectedPlotDetail.yearOfSale} (${selectedPlotDetail.quarterOfSale || 'N/A'})` : 'N/A'}
                    </span>
                  </div>
                  {hasPriceCols && <div>
                    <span className="text-brand-gray font-medium block">RF Price (per sqm)</span>
                    <span className="font-mono font-bold text-emerald-600 text-sm">
                      {selectedPlotDetail.rfPrice ? `${selectedPlotDetail.rfPrice}` : 'N/A'}
                    </span>
                  </div>}
                  {hasPriceCols && <div>
                    <span className="text-brand-gray font-medium block">Calculated Total Cash Value</span>
                    <span className="font-mono font-bold text-emerald-600 text-sm">
                      {selectedPlotDetail.cashValue ? `${selectedPlotDetail.cashValue}` : 'N/A'}
                    </span>
                  </div>}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-black/5 flex justify-end">
              <button 
                onClick={() => setSelectedPlotDetail(null)}
                className="px-5 py-2.5 bg-brand-black hover:bg-black/95 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// VIEW 1: AVAILABLE INVENTORY BREAKDOWN
// ==========================================
interface AvailableInventoryProps {
  data: PlotRecord[];
  unfilteredData?: PlotRecord[];
  minAreaSqM?: string;
  maxAreaSqM?: string;
  onSectorClick: (projectName: string, sectorName: string, units: PlotRecord[]) => void;
}

const AvailableInventoryView: React.FC<AvailableInventoryProps> = ({ data, unfilteredData, minAreaSqM, maxAreaSqM, onSectorClick }) => {
  // Logic: INCLUDE ONLY records where status is NOT 'SOLD', 'CONTRACTED', or 'RESERVED' (e.g., keep ATS, ON HOLD, etc.)
  const availablePlots = data.filter(r => 
    r.status !== 'SOLD' && 
    r.status !== 'CONTRACTED' && 
    r.status !== 'RESERVED'
  );

  // Grouping: Group first by projectName, and then subgroup by sector (or landType if sector empty)
  const grouped: { [project: string]: { [sector: string]: PlotRecord[] } } = {};

  availablePlots.forEach(plot => {
    const proj = plot.projectName;
    const sec = plot.sector || plot.landType || 'General';
    
    if (!grouped[proj]) {
      grouped[proj] = {};
    }
    if (!grouped[proj][sec]) {
      grouped[proj][sec] = [];
    }
    grouped[proj][sec].push(plot);
  });

  const projects = Object.keys(grouped).sort();

  let mergedSuggestions: any[] = [];
    
  // Attempt to find merged plots if area filters are active and unfilteredData is provided
  if (minAreaSqM && maxAreaSqM && unfilteredData) {
    const min = parseFloat(minAreaSqM);
    const max = parseFloat(maxAreaSqM);
    if (!isNaN(min) && !isNaN(max)) {
      const matchesSize = (area: number) => area >= min * 0.7 && area <= max * 1.3;
      const availableUnfiltered = unfilteredData.filter(r => 
        r.status !== 'SOLD' && r.status !== 'CONTRACTED' && r.status !== 'RESERVED'
      );
      
      const groupedUnfiltered: { [project: string]: { [sector: string]: PlotRecord[] } } = {};
      availableUnfiltered.forEach(plot => {
        const proj = plot.projectName;
        const sec = plot.sector || plot.landType || 'General';
        if (!groupedUnfiltered[proj]) groupedUnfiltered[proj] = {};
        if (!groupedUnfiltered[proj][sec]) groupedUnfiltered[proj][sec] = [];
        groupedUnfiltered[proj][sec].push(plot);
      });

      const getUnitNumber = (unitCode: string) => {
        const match = (unitCode || '').match(/(\d+)$/);
        return match ? parseInt(match[1], 10) : NaN;
      };

      for (const proj in groupedUnfiltered) {
        for (const sec in groupedUnfiltered[proj]) {
          const sectorPlots = groupedUnfiltered[proj][sec]
            .map(p => ({ plot: p, num: getUnitNumber(p.unitCode) }))
            .filter(p => !isNaN(p.num))
            .sort((a, b) => a.num - b.num);

          for (let i = 0; i < sectorPlots.length; i++) {
            for (let j = 2; j <= 5; j++) {
              if (i + j <= sectorPlots.length) {
                const combination = sectorPlots.slice(i, i + j);
                
                let isContiguous = true;
                for (let k = 0; k < combination.length - 1; k++) {
                  if (combination[k+1].num - combination[k].num !== 1) {
                    isContiguous = false;
                    break;
                  }
                }

                if (isContiguous) {
                  const plots = combination.map(c => c.plot);
                  const totalArea = plots.reduce((sum, p) => sum + p.areaSqM, 0);
                  if (matchesSize(totalArea)) {
                    mergedSuggestions.push({
                      id: `merged-${plots[0].id}-${j}`,
                      projectName: proj,
                      sectorName: sec,
                      plots: plots,
                      totalAreaSqM: totalArea
                    });
                  }
                }
              }
            }
          }
        }
      }
      
      // Sort and limit
      const targetSize = (min + max) / 2;
      mergedSuggestions = mergedSuggestions
        .sort((a, b) => Math.abs(a.totalAreaSqM - targetSize) - Math.abs(b.totalAreaSqM - targetSize))
        .slice(0, 6);
    }
  }

  if (projects.length === 0 && mergedSuggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-white/40 border border-black/5 rounded-2xl">
        <AlertCircle className="text-brand-gray mb-3" size={32} />
        <h4 className="font-bold text-brand-black">No Available Plots Found</h4>
        <p className="text-xs text-brand-gray mt-1 max-w-md">No single plots or merge combinations match your current area range filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {projects.length === 0 && mergedSuggestions.length > 0 && (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-white/40 border border-black/5 rounded-2xl">
          <AlertCircle className="text-brand-gray mb-3" size={32} />
          <h4 className="font-bold text-brand-black">No Single Plot Found</h4>
          <p className="text-xs text-brand-gray mt-1 max-w-md">No single plot matches your current area range filters, but we found adjacent combinations to merge.</p>
        </div>
      )}

      {mergedSuggestions.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-extrabold text-brand-black tracking-wide uppercase border-b border-black/5 pb-2">
            Recommended Merge Plots
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mergedSuggestions.map(suggestion => (
              <div key={suggestion.id} className="bento-card flex flex-col justify-between border-t-4 border-t-emerald-500">
                <div>
                  <div className="flex justify-between items-center border-b border-black/5 pb-3 mb-4">
                    <h4 className="font-bold text-base text-brand-black uppercase tracking-tight">
                      {suggestion.projectName}
                    </h4>
                  </div>
                  <button
                    onClick={() => onSectorClick(suggestion.projectName, suggestion.sectorName, suggestion.plots)}
                    className="w-full flex flex-col items-start p-3 rounded-xl border border-black/5 bg-emerald-50/50 hover:bg-emerald-50 transition-all cursor-pointer group text-left"
                  >
                    <div className="flex justify-between w-full mb-1">
                      <span className="font-bold text-emerald-800 text-xs">Merge {suggestion.plots.length} Units</span>
                      <ChevronRight size={14} className="opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-emerald-700" />
                    </div>
                    <span className="text-[10px] text-emerald-600/70 block mb-2">{suggestion.sectorName}</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {suggestion.plots.map((p: any) => (
                        <span key={p.id} className="bg-white border border-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                          U-{p.unitCode}
                        </span>
                      ))}
                    </div>
                  </button>
                </div>
                <div className="mt-6 pt-4 border-t border-black/5 flex justify-between items-center">
                  <span className="text-[11px] font-mono text-brand-gray">TOTAL MERGED AREA:</span>
                  <div className="text-right">
                    <span className="font-bold text-brand-black block">{suggestion.totalAreaSqM.toLocaleString()} m²</span>
                    <span className="text-[9px] text-brand-gray/80 font-mono block">
                      {(suggestion.totalAreaSqM / 4200).toFixed(2)} Fed | {(suggestion.totalAreaSqM / 10000).toFixed(2)} Ha
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {projects.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-extrabold text-brand-black tracking-wide uppercase border-b border-black/5 pb-2">
            Available Single Plots
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((projectName) => {
        const sectors = grouped[projectName];
        const sectorNames = Object.keys(sectors).sort();

        // Calculate project totals
        const totalUnits = sectorNames.reduce((sum, s) => sum + sectors[s].length, 0);
        const totalArea = sectorNames.reduce((sum, s) => sum + sectors[s].reduce((sumArea, p) => sumArea + p.areaSqM, 0), 0);

        return (
          <div key={projectName} className="bento-card flex flex-col justify-between">
            <div>
              {/* Project Name Header */}
              <div className="flex justify-between items-center border-b border-black/5 pb-3 mb-4">
                <h4 className="font-bold text-base text-brand-black uppercase tracking-tight">
                  {projectName}
                </h4>
                <span className="text-[10px] bg-brand-red/10 text-brand-red font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {totalUnits} Available
                </span>
              </div>

              {/* Sectors list */}
              <div className="space-y-2.5">
                {sectorNames.map((sectorName) => {
                  const plotsInSector = sectors[sectorName];
                  const sectorUnitsCount = plotsInSector.length;
                  const sectorTotalArea = plotsInSector.reduce((sum, p) => sum + p.areaSqM, 0);

                  return (
                    <button
                      key={sectorName}
                      onClick={() => onSectorClick(projectName, sectorName, plotsInSector)}
                      className="w-full flex justify-between items-center p-3 rounded-xl border border-black/5 bg-black/5 hover:bg-brand-red hover:text-white transition-all cursor-pointer group text-left"
                    >
                      <div className="flex flex-col">
                        <span className="text-xs font-bold transition-colors">{sectorName}</span>
                        <span className="text-[9px] text-brand-gray group-hover:text-white/70 uppercase font-bold tracking-wider mt-0.5">
                          Interactive Ledger Row
                        </span>
                      </div>
                      <div className="text-right flex items-center gap-1.5">
                        <div className="flex flex-col">
                          <span className="text-xs font-mono font-bold">{sectorUnitsCount} Units</span>
                          <span className="text-[10px] font-mono text-brand-gray group-hover:text-white/80">{sectorTotalArea.toLocaleString()} m²</span>
                        </div>
                        <ChevronRight size={14} className="opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Project Summary Row */}
            <div className="mt-6 pt-4 border-t border-black/5 flex justify-between text-[11px] font-mono text-brand-gray">
              <span>TOTAL PORTFOLIO:</span>
              <span className="font-bold text-brand-black">{totalArea.toLocaleString()} m² Available</span>
            </div>
          </div>
        );
      })}
          </div>
        </div>
      )}
    </div>
  );
};


// ==========================================
// VIEW 2: PROJECT LAND BANK ANALYSIS
// ==========================================
interface LandBankAnalysisProps {
  data: PlotRecord[];
  onSoldClick: (projectName: string, units: PlotRecord[]) => void;
}

const LandBankAnalysisView: React.FC<LandBankAnalysisProps> = ({ data, onSoldClick }) => {
  // Format SqM into elegant metric suffix notation (e.g. 1.2M, 183.9K)
  const formatSqM = (val: number): string => {
    if (val >= 1000000) {
      return `${(val / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
    }
    if (val >= 1000) {
      return `${(val / 1000).toFixed(1).replace(/\.0$/, '')}K`;
    }
    return val.toFixed(0);
  };

  // 1. "TOTAL AREA (NO NFS)": Sum of areaSqM for all records except those with 'NFS' status
  const dataNoNfs = data.filter(r => r.status !== 'NFS');
  const totalAreaNoNfs = dataNoNfs.reduce((sum, r) => sum + r.areaSqM, 0);

  // 2. "SALES PROGRESS": (Total Sold + Contracted Area / Total Area NO NFS) * 100
  const soldAndContracted = data.filter(r => r.status === 'SOLD' || r.status === 'CONTRACTED');
  const totalSoldAndContractedArea = soldAndContracted.reduce((sum, r) => sum + r.areaSqM, 0);
  const salesProgressPercent = totalAreaNoNfs > 0 
    ? (totalSoldAndContractedArea / totalAreaNoNfs) * 100 
    : 0;

  // 3. "TOTAL REMAINING": Total areaSqM of all unsold/available units (ATS, ON HOLD)
  const availablePlots = data.filter(r => r.status === 'ATS' || r.status === 'ON HOLD' || r.status === 'OFFER');
  const totalRemainingArea = availablePlots.reduce((sum, r) => sum + r.areaSqM, 0);

  // 4. "RESERVED PIPELINE": (Total Reserved Area / Total Area NO NFS) * 100
  const reservedPlots = data.filter(r => r.status === 'RESERVED');
  const totalReservedArea = reservedPlots.reduce((sum, r) => sum + r.areaSqM, 0);
  const reservedPipelinePercent = totalAreaNoNfs > 0 
    ? (totalReservedArea / totalAreaNoNfs) * 100 
    : 0;

  // Group by project name to render Project Cards Grid (Bottom Section)
  const groupedProjects: { [project: string]: PlotRecord[] } = {};
  data.forEach(plot => {
    const proj = plot.projectName;
    if (!groupedProjects[proj]) {
      groupedProjects[proj] = [];
    }
    groupedProjects[proj].push(plot);
  });

  const projects = Object.keys(groupedProjects).sort();

  return (
    <div className="space-y-8">
      {/* Global KPIs Top Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* KPI 1 */}
        <div className="bento-card border-l-4 border-l-brand-red">
          <span className="text-[10px] font-bold tracking-wider text-brand-gray uppercase block">TOTAL AREA (NO NFS)</span>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-2xl font-bold font-mono text-brand-black">{totalAreaNoNfs.toLocaleString()}</span>
            <span className="text-xs text-brand-gray font-mono">m²</span>
          </div>
          <p className="text-[10px] text-brand-gray mt-2 font-medium">Excluding strategic Not For Sale land reserves</p>
        </div>

        {/* KPI 2 */}
        <div className="bento-card border-l-4 border-l-emerald-500">
          <span className="text-[10px] font-bold tracking-wider text-brand-gray uppercase block">SALES PROGRESS</span>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-2xl font-bold font-mono text-emerald-600">{salesProgressPercent.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-black/5 rounded-full h-1.5 mt-3 overflow-hidden">
            <div 
              className="bg-emerald-500 h-1.5 rounded-full" 
              style={{ width: `${Math.min(100, salesProgressPercent)}%` }}
            ></div>
          </div>
          <p className="text-[10px] text-brand-gray mt-2 font-medium">Sold & contracted area ratio</p>
        </div>

        {/* KPI 3 */}
        <div className="bento-card border-l-4 border-l-amber-500">
          <span className="text-[10px] font-bold tracking-wider text-brand-gray uppercase block">TOTAL REMAINING</span>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-2xl font-bold font-mono text-amber-600">{totalRemainingArea.toLocaleString()}</span>
            <span className="text-xs text-brand-gray font-mono">m²</span>
          </div>
          <p className="text-[10px] text-brand-gray mt-2 font-medium">Sum of ATS & On Hold available inventory</p>
        </div>

        {/* KPI 4 */}
        <div className="bento-card border-l-4 border-l-violet-500">
          <span className="text-[10px] font-bold tracking-wider text-brand-gray uppercase block">RESERVED PIPELINE</span>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-2xl font-bold font-mono text-violet-600">{reservedPipelinePercent.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-black/5 rounded-full h-1.5 mt-3 overflow-hidden">
            <div 
              className="bg-violet-500 h-1.5 rounded-full" 
              style={{ width: `${Math.min(100, reservedPipelinePercent)}%` }}
            ></div>
          </div>
          <p className="text-[10px] text-brand-gray mt-2 font-medium">Committed reservation pool ratio</p>
        </div>
      </div>

      {/* Project Cards Grid (Bottom Section) */}
      <div className="space-y-4">
        <h4 className="font-bold text-base text-brand-black flex items-center gap-2">
          <Layers size={18} className="text-brand-red" />
          Project Allocation Breakdown
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((projectName) => {
            const projectPlots = groupedProjects[projectName];
            
            // Stats scoped ONLY to that project
            // 1. "TOTAL AREA (NO NFS)"
            const projPlotsNoNfs = projectPlots.filter(r => r.status !== 'NFS');
            const projTotalAreaNoNfs = projPlotsNoNfs.reduce((sum, r) => sum + r.areaSqM, 0);
            
            // 2. "SOLD AREA" (Committed: SOLD + CONTRACTED)
            const projSoldArea = projectPlots
              .filter(r => r.status === 'SOLD' || r.status === 'CONTRACTED')
              .reduce((sum, r) => sum + r.areaSqM, 0);

            // 3. "REMAINING" (Unsold / available area excluding NFS)
            const projRemainingArea = projectPlots
              .filter(r => r.status !== 'SOLD' && r.status !== 'CONTRACTED' && r.status !== 'NFS')
              .reduce((sum, r) => sum + r.areaSqM, 0);

            // Progress percentage for Sales Progress
            const projProgressPercent = projTotalAreaNoNfs > 0
              ? (projSoldArea / projTotalAreaNoNfs) * 100
              : 0;

            // Sector capacities (Total, Available, Sold)
            const sectorStats: { [sector: string]: { available: number, total: number, sold: number } } = {};
            
            projectPlots.filter(r => r.status !== 'NFS').forEach(plot => {
              const sName = (plot.sector || 'General').toUpperCase().trim();
              if (!sectorStats[sName]) sectorStats[sName] = { available: 0, total: 0, sold: 0 };
              
              sectorStats[sName].total += plot.areaSqM;
              if (plot.status === 'SOLD' || plot.status === 'CONTRACTED') {
                sectorStats[sName].sold += plot.areaSqM;
              } else {
                sectorStats[sName].available += plot.areaSqM;
              }
            });

            // Filter out sectors that have NO available capacity, then sort by available capacity descending
            const sortedSectors = Object.entries(sectorStats)
              .filter(([_, stats]) => stats.available > 0)
              .sort((a, b) => b[1].available - a[1].available);

            return (
              <div 
                key={projectName} 
                className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-black/5 overflow-hidden flex flex-col p-6 space-y-5 relative border-t-4 border-t-brand-red"
              >
                {/* Card Header */}
                <div className="flex justify-between items-center">
                  <h4 className="font-extrabold text-brand-black text-sm tracking-tight uppercase">{projectName}</h4>
                  <div className="group relative">
                    <Info size={14} className="text-slate-400 hover:text-brand-red cursor-help transition-colors" />
                    <div className="absolute bottom-full right-0 mb-2 w-56 p-3 bg-brand-black text-white text-[10px] rounded-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all shadow-xl z-10 leading-normal font-medium">
                      Calculation: Progress = (SOLD + CONTRACTED) / Total Area (NO NFS)
                    </div>
                  </div>
                </div>

                {/* Strategic Asset row */}
                <div className="flex justify-between items-center py-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">STRATEGIC ASSET</span>
                  <span className="bg-brand-red/10 text-brand-red px-2.5 py-0.5 rounded-full font-bold text-[10px]">
                    {projProgressPercent.toFixed(1)}%
                  </span>
                </div>

                {/* SALES PROGRESS Container */}
                <div className="bg-slate-50/50 rounded-xl p-4 border border-black/5 flex flex-col gap-2 shadow-sm">
                  <div className="flex justify-between items-baseline text-xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">SALES PROGRESS</span>
                    <button
                      onClick={() => onSoldClick(projectName, projectPlots.filter(u => u.status === 'SOLD' || u.status === 'CONTRACTED'))}
                      className="text-[11px] font-mono font-bold text-slate-700 hover:text-brand-red transition-all cursor-pointer"
                      title="Click to view ledger of sold plots"
                    >
                      {formatSqM(projSoldArea)} SQM
                    </button>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-black/[0.02]">
                    <div 
                      className="bg-brand-red h-3 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(100, projProgressPercent)}%` }}
                    ></div>
                  </div>
                </div>

                {/* TOTAL AREA Container */}
                <div className="bg-slate-50/50 rounded-xl p-4 border border-black/5 flex flex-col gap-1 shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">TOTAL AREA (NO NFS)</span>
                  <span className="text-xl font-black text-slate-800">{formatSqM(projTotalAreaNoNfs)}</span>
                </div>

                {/* SOLD AREA and REMAINING Two-Column Grid */}
                <div className="grid grid-cols-2 gap-4">
                  {/* SOLD AREA */}
                  <div className="bg-slate-50/50 rounded-xl p-4 border border-black/5 flex flex-col gap-1 shadow-sm">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">SOLD AREA</span>
                    <span className="text-base font-black text-slate-800">{formatSqM(projSoldArea)}</span>
                  </div>
                  {/* REMAINING */}
                  <div className="bg-slate-50/50 rounded-xl p-4 border border-black/5 flex flex-col gap-1 shadow-sm">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">REMAINING</span>
                    <span className="text-base font-black text-brand-red">{formatSqM(projRemainingArea)}</span>
                  </div>
                </div>

                {/* AVAILABLE CAPACITY BY SECTOR Section */}
                <div className="pt-2 space-y-3">
                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">AVAILABLE CAPACITY BY SECTOR</h5>
                  
                  {sortedSectors.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">No available capacity</p>
                  ) : (
                    <div className="space-y-3">
                      {sortedSectors.map(([sectorName, stats]) => {
                        const totalCap = stats.total || 1;
                        const soldPct = (stats.sold / totalCap) * 100;
                        const availablePct = (stats.available / totalCap) * 100;
                        return (
                          <div key={sectorName} className="space-y-1">
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="font-bold text-slate-600 truncate max-w-[170px]" title={sectorName}>
                                {sectorName}
                              </span>
                              <span className="font-bold text-slate-500 font-mono">
                                {formatSqM(stats.available)}
                              </span>
                            </div>
                            <div 
                              className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden flex"
                              title={`Sold: ${formatSqM(stats.sold)} | Available: ${formatSqM(stats.available)}`}
                            >
                              <div 
                                className="bg-brand-red/80 h-1.5 transition-all duration-500" 
                                style={{ width: `${soldPct}%` }}
                              ></div>
                              <div 
                                className="bg-slate-700 h-1.5 transition-all duration-500" 
                                style={{ width: `${availablePct}%` }}
                              ></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
