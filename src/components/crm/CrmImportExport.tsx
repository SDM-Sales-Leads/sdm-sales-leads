import React, { useState } from 'react';
import { Lead } from './types';
import { crmService, normalizePhone } from './crmService';
import { parseCSV, csvCell } from '../../lib/plots';
import { 
  Download, 
  Upload, 
  FileSpreadsheet, 
  AlertTriangle, 
  CheckCircle, 
  HelpCircle,
  FileText
} from 'lucide-react';
import { motion } from 'motion/react';

interface CrmImportExportProps {
  leads: Lead[];
  onLeadsUpdated: () => void;
  currentRole: string;
}

export const CrmImportExport: React.FC<CrmImportExportProps> = ({ leads, onLeadsUpdated, currentRole }) => {
  const [dragActive, setDragActive] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; count?: number; skipped?: number; error?: string } | null>(null);

  const handleDownloadTemplate = () => {
    const headers = 'customerName,phoneNumber,email,companyName,project,slaStatus,requiredSize,source,priority,description,assignedSalespersonName\n';
    const sample = 'Khaled Aly,01234567891,khaled@steel.com,Egypt Metallurgy Corp,Industria West,Within SLA,3000,Website,High,Requires premium light manufacturing plot near arterial lanes.,Sara El-Gamal\n';
    
    const blob = new Blob(['\ufeff' + headers + sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'elsewedy_leads_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExportData = () => {
    const headers = 'id,customerName,phoneNumber,email,companyName,project,slaStatus,requiredSize,source,priority,status,assignedSalespersonName,date\n';
    
    const rows = leads.map(l => [
      l.id, l.customerName, l.phoneNumber, l.email, l.companyName, l.project, l.slaStatus,
      l.requiredSize, l.source, l.priority, l.status, l.assignedSalespersonName, l.date
    ].map(csvCell).join(',')).join('\n');

    const blob = new Blob(['\ufeff' + headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `elsewedy_crm_leads_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (currentRole === 'Read Only') {
      setImportResult({ success: false, error: 'Unauthorized. You do not have permissions to import records.' });
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (currentRole === 'Read Only') {
      setImportResult({ success: false, error: 'Unauthorized. You do not have permissions to import records.' });
      e.target.value = '';
      return;
    }
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
    e.target.value = ''; // allow re-importing the same file
  };

  const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
  const MAX_IMPORT_ROWS = 5000;
  const PRIORITIES = ['Urgent', 'High', 'Normal', 'Low'];

  const processFile = (file: File) => {
    if (!/\.csv$/i.test(file.name)) {
      setImportResult({ success: false, error: 'Only .csv files are supported.' });
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setImportResult({ success: false, error: 'File is too large (max 5 MB).' });
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setImportResult({ success: false, error: 'The file could not be read.' });
    reader.onload = (event) => {
      try {
        const csvText = event.target?.result as string;
        if (!csvText) throw new Error('Could not parse file context');

        // Quote-aware parser (commas / line breaks inside quoted cells are kept)
        const rowsIn = parseCSV(csvText);
        if (rowsIn.length === 0) throw new Error('File has no data rows besides header row.');
        if (rowsIn.length > MAX_IMPORT_ROWS) throw new Error(`Too many rows (max ${MAX_IMPORT_ROWS} per file).`);

        const existingLeads = crmService.getLeads();
        const seenKeys = new Set(existingLeads.map(l => `${normalizePhone(l.phoneNumber || '')}|${(l.project || '').toLowerCase()}`));
        const seenEmails = new Set(existingLeads.filter(l => l.email).map(l => `${l.email.trim().toLowerCase()}|${(l.project || '').toLowerCase()}`));
        let nextNum = existingLeads.reduce((m, l) => Math.max(m, parseInt((l.id || '').split('-')[1]) || 0), 1000);
        const nowIso = new Date().toISOString();
        const addedLeads: Lead[] = [];
        let skipped = 0;

        for (const rowData of rowsIn as Record<string, string>[]) {
          if (!rowData.customerName || !rowData.phoneNumber) {
            skipped++;
            continue; // Skip faulty rows
          }

          const cleanPhone = normalizePhone(rowData.phoneNumber);
          if (!cleanPhone) { skipped++; continue; }
          const projKey = (rowData.project || '').toLowerCase();
          const emailKey = rowData.email ? `${rowData.email.trim().toLowerCase()}|${projKey}` : '';
          const isDuplicate = seenKeys.has(`${cleanPhone}|${projKey}`) || (emailKey !== '' && seenEmails.has(emailKey));
          seenKeys.add(`${cleanPhone}|${projKey}`);
          if (emailKey) seenEmails.add(emailKey);

          const size = Number(String(rowData.requiredSize || '').replace(/,/g, ''));
          const prio = PRIORITIES.find(p => p.toLowerCase() === (rowData.priority || '').trim().toLowerCase());
          nextNum++;

          const newLead: Lead = {
            id: 'SL-' + nextNum,
            customerName: rowData.customerName,
            phoneNumber: cleanPhone,
            email: rowData.email || '',
            companyName: rowData.companyName || undefined,
            project: rowData.project || '',
            slaStatus: rowData.slaStatus || undefined,
            requiredSize: Number.isFinite(size) && size > 0 ? size : '',
            source: rowData.source || 'CSV Import',
            priority: (prio as Lead['priority']) || 'Normal',
            status: isDuplicate ? 'Duplicate' : 'New',
            assignedSalespersonName: rowData.assignedSalespersonName || undefined,
            date: nowIso.split('T')[0],
            lastUpdated: nowIso,
            expectedClosingDate: '',
            description: rowData.description || '',
            comments: [],
            attachments: [],
            timeline: [
              {
                id: 'act_' + Math.random().toString(36).substr(2, 9),
                timestamp: nowIso,
                type: 'Import',
                user: 'System Administrator',
                title: 'Record Registered via CSV Import',
                description: `Lead bulk imported. Duplicate scan resolved: ${isDuplicate ? 'DUPLICATE MATCH DETECTED (LOCKED)' : 'UNIQUE ACCOUNT (CLEARED)'}`,
              }
            ]
          };

          addedLeads.push(newLead);
        }

        if (addedLeads.length === 0) {
          throw new Error('No valid leads containing customerName and phoneNumber were detected in the CSV rows.');
        }

        // Save imported leads
        crmService.saveLeads([...addedLeads, ...existingLeads]);

        // Run auto-assignment on unique, unassigned leads
        addedLeads.forEach(l => {
          if (l.status === 'New' && !l.assignedSalespersonName) {
            crmService.routeLeadAutomatically(l.id);
          }
        });

        // Auto add missing contact files (phones compared normalised)
        const existingContacts = crmService.getContacts();
        const knownPhones = new Set(existingContacts.map(c => normalizePhone(c.phoneNumber || '')));
        const newContacts: typeof existingContacts = [];
        addedLeads.forEach(l => {
          if (knownPhones.has(l.phoneNumber)) return;
          knownPhones.add(l.phoneNumber);
          newContacts.push({
            id: 'c_' + Math.random().toString(36).substr(2, 9),
            name: l.customerName,
            phoneNumber: l.phoneNumber,
            email: l.email,
            company: l.companyName,
            preferredLanguage: 'Arabic',
            preferredCommunication: 'Call',
            createdDate: nowIso.split('T')[0],
            createdBy: 'System Importer',
            status: 'Active'
          });
        });
        if (newContacts.length > 0) {
          crmService.saveContacts([...newContacts, ...crmService.getContacts()]);
        }

        setImportResult({ success: true, count: addedLeads.length, skipped });
        onLeadsUpdated();
      } catch (err: any) {
        setImportResult({ success: false, error: err?.message || 'Import failed.' });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 text-xs font-semibold" id="crm-import-export-root">
      
      {/* Title */}
      <div>
        <h3 className="text-xl font-bold text-brand-black flex items-center gap-2">
          <span>Bulk Ingestion and Data Exports</span>
          <span className="text-xs bg-brand-red/10 text-brand-red font-bold px-2.5 py-0.5 rounded-full">
            CSV Supported
          </span>
        </h3>
        <p className="text-xs text-brand-gray/80 mt-1">
          Perform mass lead ingestion, upload customer rosters, download template sheets, and backup the CRM database in normalized CSV formats.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* CSV Bulk Importer */}
        <div className="bg-white rounded-2xl border border-brand-gray/20 shadow-sm p-6 space-y-4">
          <h4 className="font-extrabold text-brand-black text-sm uppercase tracking-wider flex items-center gap-2">
            <Upload size={16} className="text-brand-red" />
            <span>Bulk CSV Importer</span>
          </h4>

          <p className="text-brand-gray font-semibold leading-relaxed">
            Import spreadsheets containing hundreds of inquiries. Each row is normalized, duplicates are auto-flagged, and matching algorithms execute routing in milliseconds.
          </p>

          {/* Drag & Drop Canvas */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${dragActive ? 'border-brand-red bg-brand-red/5' : 'border-brand-gray/25 bg-brand-gray/5'}`}
          >
            <input
              type="file"
              id="csv-file-upload"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
            
            <label htmlFor="csv-file-upload" className="cursor-pointer space-y-3.5 block">
              <FileSpreadsheet className="mx-auto text-brand-gray/40" size={36} />
              <div>
                <span className="text-brand-red hover:underline font-extrabold block">Select file from device</span>
                <span className="text-[10px] text-brand-gray font-bold mt-1 block">or drag and drop spreadsheet CSV here</span>
              </div>
            </label>
          </div>

          {/* Feedback states */}
          {importResult && (
            <div className={`p-4 rounded-xl border flex gap-3 ${importResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
              {importResult.success ? (
                <CheckCircle size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={18} className="text-rose-600 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <span className="font-bold block text-xs">{importResult.success ? 'Bulk Import Completed!' : 'Import Execution Blocked'}</span>
                <p className="text-[11px] leading-relaxed mt-0.5">
                  {importResult.success 
                    ? `Successfully integrated ${importResult.count} leads into the active pipeline${importResult.skipped ? ` (${importResult.skipped} row(s) skipped: missing name or phone)` : ''}. Duplicate scans validated phone keys. Contacts matched and autoassigned.`
                    : importResult.error}
                </p>
              </div>
            </div>
          )}

          {/* Template download link */}
          <div className="pt-2 flex justify-between items-center text-[11px]">
            <span className="text-brand-gray font-bold">First time importing?</span>
            <button
              onClick={handleDownloadTemplate}
              className="text-indigo-600 hover:underline flex items-center gap-1 font-bold"
            >
              <Download size={13} />
              <span>Download Blank Template CSV</span>
            </button>
          </div>
        </div>

        {/* Data Exporter backup */}
        <div className="bg-white rounded-2xl border border-brand-gray/20 shadow-sm p-6 space-y-4 flex flex-col justify-between h-full">
          <div className="space-y-4">
            <h4 className="font-extrabold text-brand-black text-sm uppercase tracking-wider flex items-center gap-2">
              <Download size={16} className="text-brand-gray" />
              <span>Active Database Backup</span>
            </h4>

            <p className="text-brand-gray font-semibold leading-relaxed">
              Generate static exports of the CRM leads database. This file formats customer records, historical allocations, SLA compliance, and assignment outcomes.
            </p>

            <div className="p-4 bg-brand-gray/5 border border-brand-gray/10 rounded-xl space-y-2.5">
              <div className="flex justify-between">
                <span className="text-brand-gray">Active Export Format:</span>
                <span className="text-brand-black font-extrabold font-mono">UTF-8 Normalized CSV</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-gray">Rows count to secure:</span>
                <span className="text-brand-black font-bold font-mono">{leads.length} accounts</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleExportData}
            className="w-full bg-brand-black hover:bg-brand-black/90 text-white font-extrabold py-3 rounded-xl flex items-center justify-center gap-2 shadow mt-6"
          >
            <Download size={15} />
            <span>Export Database Records (.csv)</span>
          </button>
        </div>

      </div>

    </div>
  );
};
