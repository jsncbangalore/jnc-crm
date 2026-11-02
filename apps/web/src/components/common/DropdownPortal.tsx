/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useEffect, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LAYERS } from '../../constants/layers';

export interface DropdownPortalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  className?: string;
  preferredPlacement?: 'bottom-start' | 'bottom-end';
  id?: string;
  'aria-labelledby'?: string;
}

export default function DropdownPortal({
  isOpen,
  onClose,
  triggerRef,
  children,
  className = '',
  preferredPlacement = 'bottom-start',
  id,
  'aria-labelledby': ariaLabelledby,
}: DropdownPortalProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; maxHeight: number }>({
    top: 0,
    left: 0,
    maxHeight: 400,
  });

  // Calculate position with automatic flip and shift
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !isOpen) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8;
    const estimatedHeight = menuRef.current?.offsetHeight || 260;
    const estimatedWidth = menuRef.current?.offsetWidth || 240;

    // Vertical positioning (flip if close to bottom)
    let top = rect.bottom + 6;
    let flipAbove = false;

    if (top + estimatedHeight > viewportHeight - padding) {
      // Check if there is more space above
      const spaceAbove = rect.top - padding;
      const spaceBelow = viewportHeight - rect.bottom - padding;
      if (spaceAbove > spaceBelow && spaceAbove > 100) {
        top = Math.max(padding, rect.top - estimatedHeight - 6);
        flipAbove = true;
      }
    }

    const maxHeight = flipAbove
      ? Math.max(120, rect.top - padding - 12)
      : Math.max(120, viewportHeight - top - padding);

    // Horizontal positioning (shift if close to edges)
    let left: number;
    if (preferredPlacement === 'bottom-end') {
      left = rect.right - estimatedWidth;
    } else {
      left = rect.left;
    }

    // Shift inside viewport
    if (left + estimatedWidth > viewportWidth - padding) {
      left = viewportWidth - estimatedWidth - padding;
    }
    if (left < padding) {
      left = padding;
    }

    setCoords({
      top: Math.round(top),
      left: Math.round(left),
      maxHeight: Math.round(maxHeight),
    });
  }, [triggerRef, isOpen, preferredPlacement]);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  // Recalculate on window resize or scroll
  useEffect(() => {
    if (!isOpen) return;
    const handleScrollOrResize = () => updatePosition();
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

  // Click outside to close (supports mouse and touch)
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent | MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, onClose, triggerRef]);

  // Keyboard navigation: Escape closes and returns focus to trigger, arrows move between items, Tab leaves
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        triggerRef.current?.focus();
        return;
      }

      if (e.key === 'Tab') {
        // Tab naturally leaves the menu; close it
        onClose();
        return;
      }

      if (!menuRef.current) return;

      const menuItems = Array.from(
        menuRef.current.querySelectorAll<HTMLElement>(
          '[role="menuitem"], a, button:not([disabled])'
        )
      );

      if (menuItems.length === 0) return;

      const currentIndex = menuItems.indexOf(document.activeElement as HTMLElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex =
          currentIndex >= 0 && currentIndex < menuItems.length - 1
            ? currentIndex + 1
            : 0;
        menuItems[nextIndex]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex =
          currentIndex > 0
            ? currentIndex - 1
            : menuItems.length - 1;
        menuItems[prevIndex]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        menuItems[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        menuItems[menuItems.length - 1]?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, triggerRef]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          id={id}
          role="menu"
          aria-labelledby={ariaLabelledby}
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -4 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            maxHeight: coords.maxHeight,
            zIndex: LAYERS.DROPDOWN,
          }}
          className={`overflow-y-auto rounded-2xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-2xl p-2 outline-none ${className}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
