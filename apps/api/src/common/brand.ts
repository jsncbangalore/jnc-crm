/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

export const BRAND = {
  name: 'Syntra CRM',
  companyName: 'JNC Network Communication',
  get copyright() {
    return `© ${new Date().getFullYear()} JNC Network Communication. Syntra CRM. All rights reserved.`;
  },
} as const;

export const BRAND_CONFIG = {
  get displayName(): string {
    return (process.env.PRODUCT_NAME || '').trim() || BRAND.name;
  },
  get legalNameDefault(): string {
    return (process.env.PRODUCT_NAME || '').trim() || BRAND.name;
  },
  get logoUrl(): string {
    return (process.env.PRODUCT_LOGO_URL || '').trim();
  },
};

export function getProductName(): string {
  return (process.env.PRODUCT_NAME || '').trim() || BRAND.name;
}

export function getProductLogoUrl(): string {
  return (process.env.PRODUCT_LOGO_URL || '').trim();
}
