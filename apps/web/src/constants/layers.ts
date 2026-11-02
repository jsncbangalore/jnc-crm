/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Unified Application Layer Scale (Z-Index Hierarchy)
 *
 * All layers are strictly ordered so lower layers can never occlude higher layers:
 * 1. BASE: Content layer (0 - 10)
 * 2. HEADER: Fixed navigation header / navbar (30)
 * 3. DROPDOWN: Portaled popovers, select dropdowns, menus, tooltips (50)
 * 4. MODAL_BACKDROP / MODAL: Overlay dialogs, confirmation modals (100)
 * 5. NOTIFICATION: Global alerts, toast notifications, session conflict banners (200)
 *
 * Invariant: A dropdown (50) NEVER covers a modal (100) or a notification (200).
 */
export const LAYERS = {
  BASE: 1,
  HEADER: 30,
  DROPDOWN: 50,
  MODAL: 100,
  NOTIFICATION: 200,
} as const;

export type LayerName = keyof typeof LAYERS;
