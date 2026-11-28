import React, { useEffect, useState, useCallback } from 'react';
import { Sparkles, BookmarkPlus, Trash2, Check, Loader2 } from 'lucide-react';
import { presetsApi } from '../../services/api';

export interface SavedPresetItem {
  id: string;
  module: string;
  name: string;
  payload: Record<string, any>;
  createdBy?: string;
  updatedAt?: string;
}

interface SavedPresetPickerProps {
  moduleName: 'quotation' | 'invoice' | 'order' | 'lead' | 'purchase_bill';
  onApplyPreset: (payload: Record<string, any>, presetName?: string) => void;
  getCurrentPayload: () => Record<string, any>;
  defaultSuggestedName?: () => string;
}

export default function SavedPresetPicker({
  moduleName,
  onApplyPreset,
  getCurrentPayload,
  defaultSuggestedName,
}: SavedPresetPickerProps) {
  const [presets, setPresets] = useState<SavedPresetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadPresets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await presetsApi.list(moduleName);
      const items = res.data?.items || [];
      setPresets(Array.isArray(items) ? items : []);
    } catch {
      // Fallback safely to empty
    } finally {
      setLoading(false);
    }
  }, [moduleName]);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  const handleSelectChange = (id: string) => {
    setSelectedId(id);
    if (!id) return;
    const found = presets.find((p) => p.id === id);
    if (found) {
      onApplyPreset(found.payload, found.name);
      setFeedback(`Loaded preset "${found.name}" — fields filled automatically!`);
      setTimeout(() => setFeedback(null), 3500);
    }
  };

  const handleSavePreset = async () => {
    const cleanName = presetName.trim() || (defaultSuggestedName ? defaultSuggestedName() : '') || `${moduleName} preset`;
    setSaving(true);
    try {
      const payload = getCurrentPayload();
      const res = await presetsApi.save({
        module: moduleName,
        name: cleanName,
        payload,
      });
      const saved: SavedPresetItem | undefined = res.data?.item;
      if (saved) {
        setPresets((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)]);
        setSelectedId(saved.id);
      } else {
        await loadPresets();
      }
      setShowSaveInput(false);
      setPresetName('');
      setFeedback(`Saved "${cleanName}" for instant 1-click auto-fill next time!`);
      setTimeout(() => setFeedback(null), 4000);
    } catch {
      setFeedback('Could not save preset right now.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await presetsApi.remove(id);
      setPresets((prev) => prev.filter((p) => p.id !== id));
      if (selectedId === id) setSelectedId('');
    } catch {}
  };

  return (
    <div
      data-testid={`saved-preset-picker-${moduleName}`}
      className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/25 border border-indigo-200/80 dark:border-indigo-800/40 space-y-2 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Sparkles size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
            Quick Auto-Fill Saved Data:
          </span>
          <select
            aria-label="Select saved preset to auto-fill"
            value={selectedId}
            onChange={(e) => handleSelectChange(e.target.value)}
            disabled={loading}
            className="input text-xs py-1 px-2.5 h-8 flex-1 min-w-[180px] max-w-xs bg-white dark:bg-[#141722]"
          >
            <option value="">
              {loading
                ? 'Loading saved templates...'
                : presets.length === 0
                ? 'No saved presets yet — fill once & save'
                : `Select from ${presets.length} saved option(s)...`}
            </option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!showSaveInput ? (
            <button
              type="button"
              onClick={() => {
                setPresetName(defaultSuggestedName ? defaultSuggestedName() : '');
                setShowSaveInput(true);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[11px] shadow-2xs transition-colors cursor-pointer"
            >
              <BookmarkPlus size={13} />
              <span>Save Current Data</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset label (e.g. Standard AMC)"
                className="input text-xs py-1 px-2 h-8 w-44 bg-white dark:bg-[#141722]"
              />
              <button
                type="button"
                onClick={handleSavePreset}
                disabled={saving}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSaveInput(false)}
                className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[11px] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700/80 dark:text-indigo-300/80 mr-1">
            1-Click Fill:
          </span>
          {presets.slice(0, 6).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelectChange(p.id)}
              className={`group inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                selectedId === p.id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-[#181B26] text-slate-700 dark:text-slate-200 border-indigo-200 dark:border-indigo-800/50 hover:border-indigo-500'
              }`}
              title={`Click to auto-fill all fields from "${p.name}"`}
            >
              <span>{p.name}</span>
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => handleDelete(p.id, e)}
                className="opacity-50 hover:opacity-100 hover:text-rose-500"
                title="Remove preset"
              >
                <Trash2 size={10} />
              </span>
            </button>
          ))}
        </div>
      )}

      {feedback && (
        <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
          {feedback}
        </p>
      )}
    </div>
  );
}
