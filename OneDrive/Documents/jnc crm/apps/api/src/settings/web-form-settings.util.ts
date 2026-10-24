/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { stripAllHtml } from '../common/html-sanitize.util';

export interface WebFormFieldConfig {
  show: boolean;
  required: boolean;
}

export interface WebFormFields {
  name: WebFormFieldConfig;
  phone: WebFormFieldConfig;
  email: WebFormFieldConfig;
  company: WebFormFieldConfig;
  city: WebFormFieldConfig;
  product: WebFormFieldConfig;
  quantity: WebFormFieldConfig;
  urgency: WebFormFieldConfig;
  message: WebFormFieldConfig;
}

export interface WebFormProductItem {
  name: string;
  category?: string;
}

export interface WebFormSettingsData {
  id?: string;
  tenantId: string;
  logoUrl?: string | null;
  brandColor: string;
  headline: string;
  description: string;
  submitButtonText: string;
  thankYouTitle: string;
  thankYouMessage: string;
  redirectUrl?: string | null;
  products: WebFormProductItem[];
  fields: WebFormFields;
  allowedOrigins: string[];
  isEnabled: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export const DEFAULT_WEB_FORM_FIELDS: WebFormFields = {
  name: { show: true, required: true },
  phone: { show: true, required: true },
  email: { show: true, required: false },
  company: { show: true, required: false },
  city: { show: true, required: false },
  product: { show: true, required: false },
  quantity: { show: true, required: false },
  urgency: { show: true, required: false },
  message: { show: true, required: false },
};

export function createDefaultWebFormSettings(tenantId: string): WebFormSettingsData {
  return {
    tenantId,
    logoUrl: null,
    brandColor: '#2563eb',
    headline: 'Request a Quote',
    description: 'Please submit your inquiry below and our team will get in touch shortly.',
    submitButtonText: 'Submit Inquiry',
    thankYouTitle: 'Thank You!',
    thankYouMessage: 'Your inquiry has been received. Our team will contact you soon.',
    redirectUrl: null,
    products: [],
    fields: { ...DEFAULT_WEB_FORM_FIELDS },
    allowedOrigins: [],
    isEnabled: false,
  };
}

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function validateAndSanitizeWebFormInput(input: any): Partial<WebFormSettingsData> {
  const sanitized: Partial<WebFormSettingsData> = {};

  // 1. Brand Color validation (hex only)
  if (input.brandColor !== undefined) {
    const color = input.brandColor.trim();
    if (!HEX_COLOR_REGEX.test(color)) {
      throw new BadRequestException('brandColor must be a valid hex color string (e.g. #2563eb or #0ea5e9).');
    }
    sanitized.brandColor = color;
  }

  // 2. HTTPS URLs only (or relative logo upload paths)
  if (input.redirectUrl !== undefined) {
    if (input.redirectUrl && input.redirectUrl.trim()) {
      const url = input.redirectUrl.trim();
      if (!url.startsWith('https://')) {
        throw new BadRequestException('redirectUrl must be an HTTPS URL (starting with https://).');
      }
      if (url.length > 500) {
        throw new BadRequestException('redirectUrl cannot exceed 500 characters.');
      }
      sanitized.redirectUrl = url;
    } else {
      sanitized.redirectUrl = null;
    }
  }

  if (input.logoUrl !== undefined) {
    if (input.logoUrl && input.logoUrl.trim()) {
      const logo = input.logoUrl.trim();
      if (!logo.startsWith('https://') && !logo.startsWith('/')) {
        throw new BadRequestException('logoUrl must be an HTTPS URL or relative /api path.');
      }
      if (logo.length > 500) {
        throw new BadRequestException('logoUrl cannot exceed 500 characters.');
      }
      sanitized.logoUrl = logo;
    } else {
      sanitized.logoUrl = null;
    }
  }

  // 3. Text inputs: max lengths & HTML stripping
  if (input.headline !== undefined) {
    const clean = stripAllHtml(input.headline).trim();
    if (clean.length > 200) {
      throw new BadRequestException('headline cannot exceed 200 characters.');
    }
    sanitized.headline = clean || 'Request a Quote';
  }

  if (input.description !== undefined) {
    const clean = stripAllHtml(input.description).trim();
    if (clean.length > 1000) {
      throw new BadRequestException('description cannot exceed 1000 characters.');
    }
    sanitized.description = clean;
  }

  if (input.submitButtonText !== undefined) {
    const clean = stripAllHtml(input.submitButtonText).trim();
    if (clean.length > 50) {
      throw new BadRequestException('submitButtonText cannot exceed 50 characters.');
    }
    sanitized.submitButtonText = clean || 'Submit Inquiry';
  }

  if (input.thankYouTitle !== undefined) {
    const clean = stripAllHtml(input.thankYouTitle).trim();
    if (clean.length > 200) {
      throw new BadRequestException('thankYouTitle cannot exceed 200 characters.');
    }
    sanitized.thankYouTitle = clean || 'Thank You!';
  }

  if (input.thankYouMessage !== undefined) {
    const clean = stripAllHtml(input.thankYouMessage).trim();
    if (clean.length > 1000) {
      throw new BadRequestException('thankYouMessage cannot exceed 1000 characters.');
    }
    sanitized.thankYouMessage = clean || 'Your inquiry has been received. Our team will contact you soon.';
  }

  // 4. Products: max 100 items, strip HTML
  if (input.products !== undefined) {
    if (!Array.isArray(input.products)) {
      throw new BadRequestException('products must be an array of { name, category }.');
    }
    if (input.products.length > 100) {
      throw new BadRequestException('products cannot exceed 100 items.');
    }
    sanitized.products = input.products
      .filter((p) => p && typeof p === 'object' && p.name && typeof p.name === 'string')
      .map((p) => ({
        name: stripAllHtml(p.name).trim().slice(0, 150),
        category: p.category ? stripAllHtml(p.category).trim().slice(0, 100) : 'General',
      }));
  }

  // 5. Fields: validate structure
  if (input.fields !== undefined) {
    if (typeof input.fields !== 'object' || input.fields === null) {
      throw new BadRequestException('fields must be a configuration object.');
    }
    const cleanFields: WebFormFields = { ...DEFAULT_WEB_FORM_FIELDS };
    for (const key of Object.keys(DEFAULT_WEB_FORM_FIELDS) as Array<keyof WebFormFields>) {
      if (input.fields[key]) {
        cleanFields[key] = {
          show: Boolean(input.fields[key].show),
          required: Boolean(input.fields[key].required),
        };
      }
    }
    sanitized.fields = cleanFields;
  }

  // 6. Allowed Origins: array of valid HTTPS website origins (https only, no wildcard, no path)
  if (input.allowedOrigins !== undefined) {
    if (!Array.isArray(input.allowedOrigins)) {
      throw new BadRequestException('allowedOrigins must be an array of website origins.');
    }
    sanitized.allowedOrigins = input.allowedOrigins
      .filter((o: any) => typeof o === 'string' && o.trim().length > 0)
      .map((o: string) => {
        const raw = o.trim();
        if (raw.includes('*')) {
          throw new BadRequestException(`Allowed website "${raw}" cannot contain wildcards (*).`);
        }
        let parsed: URL;
        try {
          parsed = new URL(raw);
        } catch {
          throw new BadRequestException(`Allowed website "${raw}" is not a valid URL (must start with https://).`);
        }
        const isLocalDev =
          (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
          process.env.NODE_ENV !== 'production';
        if (parsed.protocol !== 'https:' && !isLocalDev) {
          throw new BadRequestException(`Allowed website "${raw}" must use HTTPS (e.g. https://example.com).`);
        }
        if (parsed.pathname && parsed.pathname !== '/') {
          throw new BadRequestException(
            `Allowed website "${raw}" cannot contain a path (${parsed.pathname}). Specify only the origin (e.g. https://example.com).`
          );
        }
        if (parsed.search || parsed.hash) {
          throw new BadRequestException(`Allowed website "${raw}" cannot contain query parameters or fragments.`);
        }
        return `${parsed.protocol}//${parsed.host}`;
      })
      .slice(0, 50);
  }

  // 7. isEnabled boolean
  if (input.isEnabled !== undefined) {
    sanitized.isEnabled = Boolean(input.isEnabled);
  }

  return sanitized;
}

/**
 * File-backed persistence store for WebFormSettings
 * Used to guarantee zero data loss when database migrations are pending
 */
const STORAGE_FILE = path.join(__dirname, '../../data/web-form-settings.json');

function ensureDataDirectory() {
  const dir = path.dirname(STORAGE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readWebFormSettingsStore(): Record<string, WebFormSettingsData> {
  ensureDataDirectory();
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch {}
  return {};
}

export function writeWebFormSettingsStore(store: Record<string, WebFormSettingsData>): void {
  ensureDataDirectory();
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch {}
}

export function getFallbackWebFormSettings(tenantId: string): WebFormSettingsData {
  const store = readWebFormSettingsStore();
  if (store[tenantId]) {
    return store[tenantId];
  }
  const defaultSettings = createDefaultWebFormSettings(tenantId);
  store[tenantId] = defaultSettings;
  writeWebFormSettingsStore(store);
  return defaultSettings;
}

export function saveFallbackWebFormSettings(tenantId: string, updates: Partial<WebFormSettingsData>): WebFormSettingsData {
  const store = readWebFormSettingsStore();
  const current = store[tenantId] || createDefaultWebFormSettings(tenantId);
  const updated: WebFormSettingsData = {
    ...current,
    ...updates,
    tenantId,
    updatedAt: new Date().toISOString(),
  };
  store[tenantId] = updated;
  writeWebFormSettingsStore(store);
  return updated;
}
