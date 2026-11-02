/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { ValidationError } from 'class-validator';

export interface FormattedValidationResult {
  hasUnknownField: boolean;
  unknownFields: string[];
  fieldErrors: Array<{ field: string; message: string }>;
  topMessage: string;
}

const KNOWN_FIELD_NAMES: Record<string, string> = {
  invoiceDate: 'Invoice date',
  supplierGstin: 'Supplier GSTIN',
  vendorGstin: 'Vendor GSTIN',
  customerGstin: 'Customer GSTIN',
  gstin: 'GSTIN',
  pan: 'PAN',
  taxRate: 'Tax rate',
  taxType: 'Tax type',
  documentUrl: 'Document URL',
  documentDataUrl: 'Document attachment',
  invoiceNumber: 'Invoice number',
  billNumber: 'Bill number',
  partyId: 'Party',
  partyType: 'Party type',
  customerId: 'Customer',
  supplierId: 'Supplier',
  orderId: 'Order',
  amount: 'Amount',
  unitRate: 'Unit rate',
  quantity: 'Quantity',
  quantityPurchased: 'Quantity purchased',
  subtotal: 'Subtotal',
  grandTotal: 'Grand total',
  skuId: 'SKU item',
  email: 'Email address',
  phone: 'Phone number',
  password: 'Password',
  confirmPassword: 'Password confirmation',
  name: 'Name',
  companyName: 'Company name',
  notes: 'Notes',
  reference: 'Reference number',
  transactionRef: 'Payment reference',
  paymentMethod: 'Payment method',
  paymentType: 'Payment type',
  paymentDate: 'Payment date',
  items: 'Items list',
  address: 'Address',
};

export function humanizeField(property: string): string {
  if (KNOWN_FIELD_NAMES[property]) return KNOWN_FIELD_NAMES[property];
  const words = property.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatValidationErrors(errors: ValidationError[]): FormattedValidationResult {
  const unknownFields: string[] = [];
  const fieldErrors: Array<{ field: string; message: string }> = [];

  function walk(err: ValidationError, parentPath = '') {
    const currentPath = parentPath ? `${parentPath}.${err.property}` : err.property;

    if (err.constraints) {
      for (const [key, rawMsg] of Object.entries(err.constraints)) {
        if (key === 'whitelistValidation' || rawMsg.includes('should not exist')) {
          unknownFields.push(currentPath);
          continue;
        }

        const fieldName = humanizeField(err.property);
        let sentence = '';

        if (key === 'isNotEmpty') {
          sentence = `${fieldName} is required.`;
        } else if (key === 'isDateString') {
          sentence = `${fieldName} requires a valid date (YYYY-MM-DD).`;
        } else if (key === 'isValidGstin') {
          sentence = `${fieldName} requires a valid 15-character GSTIN with a valid checksum digit.`;
        } else if (key === 'isNumber') {
          sentence = `${fieldName} requires a valid number entry.`;
        } else if (key === 'isString') {
          sentence = `${fieldName} requires a valid text entry.`;
        } else if (key === 'min') {
          sentence = `${fieldName} is below the minimum allowed value.`;
        } else if (key === 'max') {
          sentence = `${fieldName} exceeds the maximum allowed value.`;
        } else if (key === 'isIn') {
          sentence = `${fieldName} contains an invalid selection.`;
        } else if (key === 'isEmail') {
          sentence = `${fieldName} requires a valid email address.`;
        } else {
          let cleaned = rawMsg.trim();
          if (!cleaned.endsWith('.')) cleaned += '.';
          cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
          sentence = cleaned;
        }

        sentence = sentence
          .replace(/must be a valid text string\./gi, 'requires a valid text entry.')
          .replace(/must be a valid string\./gi, 'requires a valid text entry.')
          .replace(/must be a text string\./gi, 'requires a valid text entry.')
          .replace(/must be a string\./gi, 'requires a valid text entry.')
          .replace(/must be a valid number\./gi, 'requires a valid number entry.')
          .replace(/must be a number\./gi, 'requires a valid number entry.')
          .replace(/must be a valid date/gi, 'requires a valid date')
          .replace(/must be a /gi, 'requires a ')
          .replace(/must be an? /gi, 'requires a ')
          .replace(/\bvalid\s+valid\b/gi, 'valid')
          .replace(/\bvalid\s+valid\b/gi, 'valid');

        fieldErrors.push({
          field: currentPath,
          message: sentence,
        });
      }
    }

    if (err.children && err.children.length > 0) {
      for (const child of err.children) {
        walk(child, currentPath);
      }
    }
  }

  for (const err of errors) {
    walk(err);
  }

  const hasUnknownField = unknownFields.length > 0;
  const topMessage = hasUnknownField
    ? 'The submitted form contains unrecognized parameters. Please refresh and try again.'
    : fieldErrors.length > 0
      ? 'Please correct the highlighted fields and try again.'
      : 'Validation failed. Please check the submitted fields.';

  return {
    hasUnknownField,
    unknownFields,
    fieldErrors,
    topMessage,
  };
}
