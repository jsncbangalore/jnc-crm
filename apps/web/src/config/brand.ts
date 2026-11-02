/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import logoLightAsset from '../assets/logo.png';
import logoDarkAsset from '../assets/logo-dark.png';
import logoIconAsset from '../assets/logo-icon.png';

export interface BrandFooterLink {
  label: string;
  href: string;
  isExternal?: boolean;
}

export const BRAND = {
  name: 'JNC CRM',
  get copyright() {
    return `© ${new Date().getFullYear()} JNC CRM. All rights reserved.`;
  },
} as const;

export const PRODUCT_NAME = BRAND.name;
export const COMPANY_NAME = BRAND.name;

export const BRAND_ASSETS = {
  logoLight: logoLightAsset,
  logoDark: logoDarkAsset,
  logoIcon: logoIconAsset,
  faviconSvg: '/favicon.svg',
  faviconPng: '/favicon.png',
  favicon32: '/favicon-32x32.png',
} as const;

export const getProductName = (_branding?: { companyDisplayName?: string } | null): string => {
  return BRAND.name;
};

export const getProductLogoUrl = (): string => {
  return (import.meta.env.VITE_PRODUCT_LOGO_URL as string) || BRAND_ASSETS.logoLight;
};

export const getBrandHeadline = (): string => {
  return (import.meta.env.VITE_BRAND_HEADLINE as string) || 'Run your sales, orders and billing in one place.';
};

export const getBrandFeatures = (): string[] => {
  return [
    'Leads and pipeline',
    'Quotations and invoices',
    'Inventory and teams',
  ];
};

export const getBrandLegalLinks = (): BrandFooterLink[] => {
  const links: BrandFooterLink[] = [
    { label: 'Cookie settings', href: '/cookies' },
  ];
  const termsUrl = (import.meta.env.VITE_TERMS_URL as string) || '';
  if (termsUrl) {
    links.push({ label: 'Terms', href: termsUrl, isExternal: termsUrl.startsWith('http') });
  }
  const privacyUrl = (import.meta.env.VITE_PRIVACY_URL as string) || '';
  if (privacyUrl) {
    links.push({ label: 'Privacy', href: privacyUrl, isExternal: privacyUrl.startsWith('http') });
  }
  const supportUrl = (import.meta.env.VITE_SUPPORT_URL as string) || '';
  if (supportUrl) {
    links.push({ label: 'Support', href: supportUrl, isExternal: supportUrl.startsWith('http') });
  }
  return links;
};

export const BRAND_CONFIG = {
  get displayName() {
    return getProductName();
  },
  get legalNameDefault() {
    return COMPANY_NAME;
  },
  get logoUrl() {
    return getProductLogoUrl();
  },
  phone: '',
  email: '',
  website: '',
  address: '',
};
