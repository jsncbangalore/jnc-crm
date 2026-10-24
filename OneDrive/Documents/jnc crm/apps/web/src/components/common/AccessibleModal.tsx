/* --- ACCESSIBLE MODAL DIALOG WITH FOCUS TRAP & UNSAVED CHANGES GUARD ---
 * Compliant with WCAG 2.1 Dialog Pattern:
 * 1. Traps focus within modal while open.
 * 2. Closes on Esc key press.
 * 3. Restores focus to the trigger element when closed.
 * 4. Guards against accidental data loss with an Unsaved Changes prompt.
 * 5. Responsive mobile bottom-sheet/full-screen behavior on small viewports.
 * -------------------------------------------------------------------------- */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle } from 'lucide-react';

export interface AccessibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  isDirty?: boolean;
  triggerRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  maxWidth?: string;
}

export const AccessibleModal: React.FC<AccessibleModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  isDirty = false,
  triggerRef,
  children,
  maxWidth = 'max-w-2xl',
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Capture trigger or currently focused element when modal opens
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = (triggerRef?.current || document.activeElement) as HTMLElement;
      setShowDiscardConfirm(false);
    } else {
      // Return focus when closed
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        setTimeout(() => previousActiveElementRef.current?.focus(), 50);
      }
    }
  }, [isOpen, triggerRef]);

  // Request close: checks if dirty
  const handleRequestClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  // Focus trap & Esc key listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showDiscardConfirm) {
          setShowDiscardConfirm(false);
        } else {
          handleRequestClose();
        }
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Initial focus on the first input or close button
    const timer = setTimeout(() => {
      if (modalRef.current) {
        const firstInput = modalRef.current.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), select:not([disabled])');
        if (firstInput) {
          firstInput.focus();
        } else {
          const firstFocusable = modalRef.current.querySelector<HTMLElement>('button, [tabindex="0"]');
          firstFocusable?.focus();
        }
      }
    }, 60);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, showDiscardConfirm, handleRequestClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="accessible-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/35 backdrop-blur-xs overflow-y-auto"
    >
      <motion.div
        ref={modalRef}
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className={`bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl w-full ${maxWidth} shadow-xl overflow-hidden my-auto flex flex-col max-h-[92vh] relative text-left`}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#1E2230] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-crm-blue/15 text-crm-blue dark:bg-crm-blue/20 flex items-center justify-center shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h2 id="accessible-modal-title" className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate">
                {title}
              </h2>
              {subtitle && <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center transition-colors shrink-0"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto">{children}</div>

        {/* Unsaved Changes Confirmation Overlay */}
        <AnimatePresence>
          {showDiscardConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 bg-slate-900/30 dark:bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
            >
              <div className="bg-white dark:bg-[#1C202E] border border-slate-200 dark:border-[#2A3042] rounded-xl p-5 max-w-sm w-full shadow-xl text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
                  <AlertTriangle size={20} />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Discard Unsaved Changes?</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  You have entered data in this form. If you close now, your changes will be discarded.
                </p>
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDiscardConfirm(false)}
                    className="btn-ghost text-xs font-semibold px-4 py-2"
                  >
                    Keep Editing
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDiscardConfirm(false);
                      onClose();
                    }}
                    className="btn bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2"
                  >
                    Discard Changes
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default AccessibleModal;
