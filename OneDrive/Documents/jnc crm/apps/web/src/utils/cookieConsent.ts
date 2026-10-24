/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  POLICY_VERSION,
  COOKIE_CONSENT_KEY,
  STORAGE_INVENTORY,
  StorageItemCategory,
} from '../config/storage-inventory';

export type ConsentChoice = 'necessary_only' | 'all' | 'custom';

export interface CookieConsentRecord {
  choice: ConsentChoice;
  preferences: boolean;
  policyVersion: string;
  savedAt: string;
}

export const COOKIE_CONSENT_EVENT = 'crm:cookie-consent-updated';
export const COOKIE_OPEN_PANEL_EVENT = 'crm:open-cookie-panel';

// 12 months validity (365 days)
export const CONSENT_VALIDITY_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Returns the currently active, valid consent record or null if:
 * 1. No decision has been saved yet
 * 2. The policy version has changed
 * 3. The record is older than 12 months
 */
export function getConsent(): CookieConsentRecord | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const validChoices: ConsentChoice[] = ['necessary_only', 'all', 'custom'];
    if (!validChoices.includes(parsed.choice)) return null;
    if (typeof parsed.preferences !== 'boolean') return null;
    if (parsed.policyVersion !== POLICY_VERSION) return null;

    const savedTime = new Date(parsed.savedAt).getTime();
    if (Number.isNaN(savedTime)) return null;

    const age = Date.now() - savedTime;
    if (age < 0 || age > CONSENT_VALIDITY_MS) {
      return null;
    }

    return {
      choice: parsed.choice,
      preferences: parsed.preferences,
      policyVersion: parsed.policyVersion,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Replaces any existing consent record with a new validated record.
 * Immediately clears optional storage if preferences are not accepted.
 */
export function setConsent(choice: ConsentChoice, preferences?: boolean): CookieConsentRecord {
  const resolvedPreferences =
    choice === 'necessary_only' ? false : choice === 'all' ? true : Boolean(preferences);

  const record: CookieConsentRecord = {
    choice,
    preferences: resolvedPreferences,
    policyVersion: POLICY_VERSION,
    savedAt: new Date().toISOString(),
  };

  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(record));
      if (!record.preferences) {
        clearOptional();
      }
      window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: record }));
    }
  } catch {
    // Ignore storage quota/security errors
  }

  return record;
}

/**
 * Checks whether the application has consent to write storage for a given category.
 * Strictly checks that active consent exists and permits preferences.
 */
export function canStore(category: StorageItemCategory): boolean {
  if (category === 'necessary') return true;
  const current = getConsent();
  return Boolean(current?.preferences);
}

/**
 * Immediately clears all optional preferences storage items from the browser.
 */
export function clearOptional(): void {
  try {
    if (typeof window === 'undefined') return;

    // Optional preference keys from inventory
    const optionalKeys = STORAGE_INVENTORY.filter((item) => item.category === 'preferences').map(
      (item) => item.name
    );

    // Also include legacy preference keys for clean migration
    const allKeysToClear = new Set([...optionalKeys, 'theme']);

    for (const key of allKeysToClear) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Resets user consent so that the user is prompted again.
 */
export function resetConsent(): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(COOKIE_CONSENT_KEY);
      clearOptional();
      window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: null }));
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Broadcasts an event requesting the Cookie Preferences Panel to reopen.
 */
export function openCookiePreferencesPanel(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(COOKIE_OPEN_PANEL_EVENT));
  }
}
