import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Plus, Edit2, Check, X, ShieldAlert } from 'lucide-react';
import api from '../services/api';

const AVAILABLE_PAGES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'leads', label: 'Leads Pipeline' },
  { key: 'orders', label: 'Orders & Contracts' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'quotations', label: 'Quotations' },
  { key: 'inventory', label: 'Inventory / BOM' },
  { key: 'suppliers', label: 'Suppliers & Purchases' },
  { key: 'shipments', label: 'Shipments' },
  { key: 'automation', label: 'Automation Rules' },
  { key: 'users', label: 'Users & Teams' },
  { key: 'custom_objects', label: 'Custom Objects' },
  { key: 'audit_logs', label: 'Audit Logs' },
];

export default function TeamsTab() {
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [formName, setFormName] = useState('');
  const [formPages, setFormPages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchTeams = async () => {
    try {
      const { data } = await api.get('/teams');
      setTeams(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
  }, []);

  const openCreate = () => {
    setEditingTeam(null);
    setFormName('');
    setFormPages([]);
    setShowModal(true);
  };

  const openEdit = (team: any) => {
    setEditingTeam(team);
    setFormName(team.name);
    setFormPages(team.allowedPages || []);
    setShowModal(true);
  };

  const togglePage = (pageKey: string) => {
    setFormPages(prev => 
      prev.includes(pageKey) ? prev.filter(k => k !== pageKey) : [...prev, pageKey]
    );
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      if (editingTeam) {
        await api.patch(`/teams/${editingTeam.id}`, { name: formName, allowedPages: formPages });
      } else {
        await api.post('/teams', { name: formName, allowedPages: formPages });
      }
      setShowModal(false);
      fetchTeams();
    } catch (e) {
      alert('Error saving team');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Access Teams</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Group users and restrict which modules they can access in the CRM.
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} className="mr-2" /> Create Team
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <p className="text-slate-500 dark:text-slate-400">Loading teams...</p>
        ) : teams.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-500">No teams created yet.</p>
        ) : (
          teams.map(team => (
            <div key={team.id} className="bg-white dark:bg-[#1E2230] border border-slate-200 dark:border-[#2A3042] rounded-xl p-5 hover:border-crm-violet/50 shadow-sm dark:shadow-none transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-crm-violet/10 rounded-lg text-crm-violet dark:text-crm-violet-light">
                    <Shield size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-lg">{team.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{team.userCount || 0} Members</p>
                  </div>
                </div>
                <button onClick={() => openEdit(team)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                  <Edit2 size={16} />
                </button>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Allowed Modules</p>
                <div className="flex flex-wrap gap-1.5">
                  {team.allowedPages && team.allowedPages.length > 0 ? (
                    team.allowedPages.map((p: string) => {
                      const pageDef = AVAILABLE_PAGES.find(x => x.key === p);
                      return (
                        <span key={p} className="px-2 py-1 bg-slate-100 dark:bg-[#2A3042] text-slate-700 dark:text-slate-300 text-[10px] rounded border border-slate-200 dark:border-[#3A415A]">
                          {pageDef?.label || p}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-xs text-crm-coral flex items-center gap-1">
                      <ShieldAlert size={12} /> No Access Granted
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-2xl p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {editingTeam ? 'Edit Team Access' : 'Create Access Team'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Team Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="input"
                  placeholder="e.g. Sales Team, Inventory Managers"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                  Allowed Modules
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {AVAILABLE_PAGES.map(page => {
                    const isSelected = formPages.includes(page.key);
                    return (
                      <div
                        key={page.key}
                        onClick={() => togglePage(page.key)}
                        className={`cursor-pointer border rounded-xl p-3 flex items-center gap-3 transition-all ${
                          isSelected 
                            ? 'bg-crm-violet/10 border-crm-violet/50 text-slate-900 dark:text-white font-semibold' 
                            : 'bg-slate-50 dark:bg-[#1E2230] border-slate-200 dark:border-[#2A3042] text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-600'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-crm-violet border-crm-violet text-white' : 'border-slate-400 dark:border-slate-500'
                        }`}>
                          {isSelected && <Check size={12} strokeWidth={3} />}
                        </div>
                        <span className="text-sm font-medium leading-tight">{page.label}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  * Note: Sub-Admins and Employees in this team will ONLY be able to open the selected pages above. Super Admins bypass these restrictions automatically.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-[#2A3042]">
                <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
                <button 
                  onClick={handleSave} 
                  disabled={!formName.trim() || saving} 
                  className="btn-primary"
                >
                  {saving ? 'Saving...' : 'Save Team Permissions'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
