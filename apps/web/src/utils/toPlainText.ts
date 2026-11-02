/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { toPlainText as sharedToPlainText } from '@crm/shared-validation';

/**
 * Universal safe plain-text extractor for all UI components.
 * Prevents React Error #31 by guaranteeing string output from any value.
 */
export function toPlainText(val: any, fallback = ''): string {
  return sharedToPlainText(val, fallback);
}

export default toPlainText;
