import React, { createContext, useContext, useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export type DialogType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

interface DialogOptions {
  type?: DialogType;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface PopupContextType {
  showAlert: (message: string, title?: string, type?: DialogType) => void;
  showConfirm: (message: string, onConfirm: () => void, title?: string, confirmText?: string) => void;
  closeDialog: () => void;
}

const PopupContext = createContext<PopupContextType | undefined>(undefined);

export function PopupProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogOptions | null>(null);

  const showAlert = (message: string, title?: string, type: DialogType = 'info') => {
    setDialog({
      type,
      title: title || (type === 'error' ? 'Notice' : type === 'success' ? 'Success' : 'Information'),
      message,
    });
  };

  const showConfirm = (
    message: string,
    onConfirm: () => void,
    title = 'Please Confirm',
    confirmText = 'Confirm'
  ) => {
    setDialog({
      type: 'confirm',
      title,
      message,
      confirmText,
      cancelText: 'Cancel',
      onConfirm: () => {
        setDialog(null);
        onConfirm();
      },
      onCancel: () => {
        setDialog(null);
      },
    });
  };

  const closeDialog = () => setDialog(null);

  // Auto-override window.alert
  React.useEffect(() => {
    (window as any).alert = (msg: any) => {
      showAlert(String(msg), 'System Notification', 'info');
    };
  }, []);

  return (
    <PopupContext.Provider value={{ showAlert, showConfirm, closeDialog }}>
      {children}

      <AnimatePresence>
        {dialog && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 15 }}
              className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-6 text-center space-y-4"
            >
              <div className="flex justify-center">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    dialog.type === 'success'
                      ? 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 dark:border-emerald-500/30'
                      : dialog.type === 'confirm' || dialog.type === 'warning'
                      ? 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 dark:border-amber-500/30'
                      : dialog.type === 'error'
                      ? 'bg-red-500/10 dark:bg-red-500/15 text-red-600 dark:text-crm-coral border border-red-500/20 dark:border-red-500/30'
                      : 'bg-crm-blue/10 dark:bg-crm-blue/15 text-crm-blue border border-crm-blue/20 dark:border-crm-blue/30'
                  }`}
                >
                  {dialog.type === 'success' ? (
                    <CheckCircle2 size={32} />
                  ) : dialog.type === 'confirm' || dialog.type === 'warning' ? (
                    <AlertTriangle size={28} />
                  ) : dialog.type === 'error' ? (
                    <XCircle size={32} />
                  ) : (
                    <Info size={32} />
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{dialog.title}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed whitespace-pre-line">
                  {dialog.message}
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 pt-2">
                {dialog.type === 'confirm' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (dialog.onCancel) dialog.onCancel();
                        closeDialog();
                      }}
                      className="btn-ghost text-xs px-4 text-slate-600 dark:text-slate-300"
                    >
                      {dialog.cancelText || 'Cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (dialog.onConfirm) dialog.onConfirm();
                      }}
                      className="btn bg-crm-blue hover:bg-crm-blue-hover text-white font-bold text-xs px-5 shadow-glow-blue"
                    >
                      {dialog.confirmText || 'Confirm'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={closeDialog}
                    className="btn bg-crm-blue hover:bg-crm-blue-hover text-white text-xs font-bold px-6 shadow-glow-blue"
                  >
                    Got It
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PopupContext.Provider>
  );
}

export function usePopup() {
  const context = useContext(PopupContext);
  if (!context) {
    throw new Error('usePopup must be used within a PopupProvider');
  }
  return context;
}
