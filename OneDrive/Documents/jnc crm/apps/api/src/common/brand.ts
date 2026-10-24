/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

export const BRAND_CONFIG = {
  get displayName(): string {
    return (process.env.PRODUCT_NAME || '').trim() || 'CRM';
  },
  get legalNameDefault(): string {
    return (process.env.PRODUCT_NAME || '').trim() || 'CRM';
  },
  get logoUrl(): string {
    return (process.env.PRODUCT_LOGO_URL || '').trim();
  },
};

export function getProductName(): string {
  return (process.env.PRODUCT_NAME || '').trim() || 'CRM';
}

export function getProductLogoUrl(): string {
  return (process.env.PRODUCT_LOGO_URL || '').trim();
}
