import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Plus,
  Download,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
} from 'lucide-react';
import Papa from 'papaparse';
import { leadsApi } from '../../services/api';

export interface ImportLeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const SAMPLE_LEADS = [
  {
    company_name: 'Apex Solar Ltd',
    contact_name: 'Aarav Sharma',
    phone: '+91 98765 43210',
    email: 'aarav@apexsolar.dev.local',
    product_interest: 'Solar Inverters',
    city: 'Bengaluru',
    estimated_value: '185000',
    urgency: 'high',
  },
];

export const ImportLeadsModal: React.FC<ImportLeadsModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [previewSummary, setPreviewSummary] = useState<{
    totalCount: number;
    duplicateCount: number;
    validCount: number;
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoadingPreview(true);
    setImportStatus(null);

    // Call server preview
    leadsApi
      .previewSpreadsheet(file)
      .then((res) => {
        setPreviewRows(res.data.rows || []);
        setPreviewSummary({
          totalCount: res.data.totalCount || 0,
          duplicateCount: res.data.duplicateCount || 0,
          validCount: res.data.validCount || 0,
        });
      })
      .catch((err) => {
        // Fallback to client-side PapaParse
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            leadsApi
              .previewJson(results.data)
              .then((jsonRes) => {
                setPreviewRows(jsonRes.data.rows || []);
                setPreviewSummary({
                  totalCount: jsonRes.data.totalCount || 0,
                  duplicateCount: jsonRes.data.duplicateCount || 0,
                  validCount: jsonRes.data.validCount || 0,
                });
              })
              .catch((jErr) => {
                alert('Failed to parse file: ' + (jErr?.response?.data?.message || jErr.message));
              });
          },
        });
      })
      .finally(() => {
        setLoadingPreview(false);
      });
  };

  const handleLoadSampleLeads = async () => {
    setLoadingPreview(true);
    try {
      const res = await leadsApi.previewJson(SAMPLE_LEADS);
      setPreviewRows(res.data.rows || []);
      setPreviewSummary({
        totalCount: res.data.totalCount || 0,
        duplicateCount: res.data.duplicateCount || 0,
        validCount: res.data.validCount || 0,
      });
    } catch (err: any) {
      alert('Failed to preview sample leads: ' + err.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCommitImport = async () => {
    if (!previewRows || previewRows.length === 0) return;
    setCommitting(true);
    setImportStatus(null);
    try {
      const res = await leadsApi.commitImport(previewRows);
      setImportStatus(`Successfully imported ${res.data.createdCount || previewRows.length} leads!`);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      alert('Failed to commit import: ' + (err?.response?.data?.message || err.message));
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Bulk Lead Import (Excel / CSV)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Automatic 30-day deduplication and round-robin sales assignment
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="md:col-span-2 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-crm-blue rounded-xl p-5 flex flex-col items-center justify-center gap-1.5 cursor-pointer bg-slate-50 dark:bg-slate-900/40 hover:bg-crm-blue/5 transition-all text-center"
            >
              <Upload size={24} className="text-crm-blue" />
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  {fileName ? fileName : 'Click to browse or drag & drop spreadsheet'}
                </p>
                <p className="text-[11px] text-slate-500">Supports .CSV, .XLSX, .XLS files (up to 50MB)</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv, .xlsx, .xls, text/csv"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            <div className="flex flex-col gap-2 justify-center bg-slate-50 dark:bg-[#1E2230] p-3 rounded-xl border border-slate-200 dark:border-[#2A3042]">
              <button
                type="button"
                onClick={handleLoadSampleLeads}
                className="px-3 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-300 text-xs font-bold rounded-lg border border-purple-500/20 flex items-center justify-center gap-1.5"
              >
                <Plus size={13} /> Load Sample Template
              </button>
              <button
                type="button"
                onClick={() => {
                  const csv = Papa.unparse(SAMPLE_LEADS);
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.setAttribute('download', 'leads_template.csv');
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="px-3 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 flex items-center justify-center gap-1.5"
              >
                <Download size={13} /> Download CSV Template
              </button>
            </div>
          </div>

          {/* Loading state */}
          {loadingPreview && (
            <div className="flex items-center justify-center py-8 text-xs text-slate-500 gap-2">
              <RefreshCw size={14} className="animate-spin text-crm-blue" />
              <span>Analyzing spreadsheet rows & detecting duplicates...</span>
            </div>
          )}

          {/* Preview summary badges */}
          {previewSummary && (
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold border border-slate-200 dark:border-slate-700">
                Total Rows: {previewSummary.totalCount}
              </span>
              <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
                Valid New: {previewSummary.validCount}
              </span>
              {previewSummary.duplicateCount > 0 && (
                <span className="px-2.5 py-1 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">
                  Duplicates: {previewSummary.duplicateCount}
                </span>
              )}
            </div>
          )}

          {/* Table preview */}
          {previewRows.length > 0 && (
            <div className="border border-slate-200 dark:border-[#2A3042] rounded-lg overflow-x-auto max-h-60">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-[#1E2230] text-[10px] font-bold uppercase text-slate-500 sticky top-0">
                  <tr>
                    <th className="p-2">Row</th>
                    <th className="p-2">Contact</th>
                    <th className="p-2">Company</th>
                    <th className="p-2">Phone</th>
                    <th className="p-2">Product</th>
                    <th className="p-2">Value</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {previewRows.slice(0, 50).map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                      <td className="p-2 font-mono text-[10px]">{r.rowIndex || idx + 1}</td>
                      <td className="p-2 font-bold text-slate-900 dark:text-white">{r.customerName}</td>
                      <td className="p-2 text-slate-500">{r.companyName || '-'}</td>
                      <td className="p-2 font-mono text-[11px]">{r.customerPhone}</td>
                      <td className="p-2 text-slate-600 dark:text-slate-300">{r.productCategory || r.productName || '-'}</td>
                      <td className="p-2 font-semibold text-emerald-600">₹{r.estimatedValue || '0'}</td>
                      <td className="p-2">
                        {r.isDuplicate ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-bold">
                            Duplicate
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold">
                            Valid
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {importStatus && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg text-xs text-emerald-600 dark:text-emerald-400 font-bold">
              {importStatus}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between text-xs shrink-0">
          <span className="text-[11px] text-slate-400">
            {previewRows.length > 0 ? `${previewRows.length} rows loaded for import` : 'No file selected'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={committing}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCommitImport}
              disabled={committing || previewRows.length === 0}
              className="px-4 py-1.5 rounded-lg bg-crm-blue hover:bg-crm-blue/90 text-white font-bold disabled:opacity-50 flex items-center gap-1.5"
            >
              {committing ? 'Importing...' : `Commit Import (${previewRows.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
