/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

export const COMPANY_LEGAL_NAME = 'JNC Network Communication' as const;
export const COMPANY_SHORT_NAME = 'JNC' as const;
export const PRODUCT_NAME = 'Syntra CRM' as const;
export const COMPANY_NAME = COMPANY_LEGAL_NAME;

export const BRAND = {
  name: PRODUCT_NAME,
  companyName: COMPANY_LEGAL_NAME,
  shortName: COMPANY_SHORT_NAME,
  get copyright() {
    return `© ${new Date().getFullYear()} JNC Network Communication. Syntra CRM. All rights reserved.`;
  },
} as const;

export const COPYRIGHT_TEXT = BRAND.copyright;

export const BRAND_CONFIG = {
  displayName: PRODUCT_NAME,
  legalNameDefault: COMPANY_LEGAL_NAME,
  logoUrl: '/logo.png',
};

export function getProductName(): string {
  return PRODUCT_NAME;
}

export function getProductLogoUrl(): string {
  return '/logo.png';
}

export function getCompanyLegalName(): string {
  return COMPANY_LEGAL_NAME;
}

export function getCompanyShortName(): string {
  return COMPANY_SHORT_NAME;
}
