/**
 * validationErrorHandler.ts
 *
 * Robust error parsing, humanization, and click-to-jump navigation
 * for API & class-validator errors in forms.
 */

export interface ParsedValidationError {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  domId?: string;
  humanMsg: string;
  rawMessage: string;
}

export interface FieldMappingInfo {
  label: string;
  id: string;
}

export const COMMON_FIELD_MAPPING: Record<string, FieldMappingInfo> = {
  // Product / Project Position fields
  project: { label: 'Finished Product Name', id: 'pos-field-project' },
  projectId: { label: 'Finished Product Name', id: 'pos-field-project' },
  reference: { label: 'Circuit / BOM Tag', id: 'pos-field-reference' },
  quantity: { label: 'Base Quantity', id: 'pos-field-quantity' },
  allocatedQuantity: { label: 'Allocated Quantity', id: 'pos-field-quantity' },
  itemCode: { label: 'Item Code / SKU', id: 'pos-field-itemCode' },
  skuCode: { label: 'Item Code / SKU', id: 'pos-field-itemCode' },
  skuId: { label: 'Component / SKU Selection', id: 'pos-field-itemCode' },
  name: { label: 'Component Name', id: 'pos-field-partValue' },
  partValue: { label: 'Part Value / Specifications', id: 'pos-field-partValue' },
  package: { label: 'Package / Mounting Type', id: 'pos-field-package' },
  packageType: { label: 'Package Type', id: 'pos-field-package' },
  unit: { label: 'Unit of Measure', id: 'pos-field-unit' },
  bomQtyPerUnit: { label: 'BOM Qty Per Unit', id: 'pos-field-bomQtyPerUnit' },
  batchQty: { label: 'Batch Quantity', id: 'pos-field-batchQty' },
  plannedRequirement: { label: 'Planned Requirement', id: 'pos-field-plannedRequirement' },
  openingStock: { label: 'Opening Stock', id: 'pos-field-openingStock' },
  inflow: { label: 'Inflow (+)', id: 'pos-field-inflow' },
  outflow: { label: 'Outflow (-)', id: 'pos-field-outflow' },
  presentStock: { label: 'Present Stock', id: 'pos-field-presentStock' },
  shortage: { label: 'Shortage', id: 'pos-field-shortage' },
  status: { label: 'Stock Status', id: 'pos-field-status' },
  notes: { label: 'Procurement Remarks / Notes', id: 'pos-field-notes' },

  // Edit Component Modal fields
  componentName: { label: 'Component Name', id: 'edit-comp-name' },
  supplier: { label: 'Supplier Name', id: 'edit-comp-supplier' },
  supplierName: { label: 'Supplier Name', id: 'edit-comp-supplier' },
  supplierId: { label: 'Supplier', id: 'edit-comp-supplier' },
  price: { label: 'Unit Price', id: 'edit-comp-price' },
  unitPrice: { label: 'Unit Price', id: 'edit-comp-price' },
  costPrice: { label: 'Cost Price', id: 'edit-comp-price' },
  taxRate: { label: 'GST Tax Rate', id: 'edit-comp-tax' },
  hsnCode: { label: 'HSN Code', id: 'edit-comp-hsn' },
};

/**
 * Splits concatenated error strings (e.g. "property project should not existproperty reference should not exist...")
 * into clean, separate error statements.
 */
export function splitConcatenatedMessages(raw: string): string[] {
  if (!raw || typeof raw !== 'string') return [];

  // Handle standard delimiters first
  if (raw.includes('\n')) {
    return raw.split('\n').map((s) => s.trim()).filter(Boolean);
  }
  if (raw.includes(',') && !raw.includes('should not exist') && !raw.includes('must be')) {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  // Insert delimiters between common validation keywords and adjacent word starts
  // e.g. "existproperty", "existprojectId", "emptyprojectId", "stringskuId", etc.
  const normalized = raw
    .replace(/(exist|empty|string|boolean|number|defined|valid|constraints|longer|shorter)([a-zA-Z])/g, '$1; $2')
    .replace(/([a-z])(property\s+[a-zA-Z0-9_]+)/g, '$1; $2');

  return normalized
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

/**
 * Maps a single message to a friendly human message and identifies the matching field ID.
 */
export function humanizeValidationMessage(
  rawMsg: string,
  customDict: Record<string, FieldMappingInfo> = {}
): ParsedValidationError {
  const dict = { ...COMMON_FIELD_MAPPING, ...customDict };
  let detectedKey = '';
  let fieldLabel = 'Input Field';
  let domId: string | undefined = undefined;

  // Search for matching field name in the message
  for (const [key, info] of Object.entries(dict)) {
    const regex = new RegExp(`\\b${key}\\b`, 'i');
    if (regex.test(rawMsg)) {
      detectedKey = key;
      fieldLabel = info.label;
      domId = info.id;
      break;
    }
  }

  // Create friendly, understandable explanation
  let humanMsg = rawMsg;
  if (/should not exist/i.test(rawMsg)) {
    humanMsg = `The field "${fieldLabel}" is not recognized or not allowed. Please verify form inputs.`;
  } else if (/should not be empty|is required/i.test(rawMsg)) {
    humanMsg = `Please enter or select a valid "${fieldLabel}". This field is required.`;
  } else if (/must be a number conforming/i.test(rawMsg)) {
    humanMsg = `Please enter a valid numeric number for "${fieldLabel}".`;
  } else if (/must be a number/i.test(rawMsg)) {
    humanMsg = `"${fieldLabel}" must be a valid number.`;
  } else if (/must be an integer/i.test(rawMsg)) {
    humanMsg = `"${fieldLabel}" must be a whole number without decimals.`;
  } else if (/must be a string/i.test(rawMsg)) {
    humanMsg = `"${fieldLabel}" must be text.`;
  } else if (/must be a valid email/i.test(rawMsg)) {
    humanMsg = `Please enter a valid email address for "${fieldLabel}".`;
  }

  return {
    id: `${detectedKey || 'err'}-${Math.random().toString(36).substring(2, 9)}`,
    fieldKey: detectedKey,
    fieldLabel,
    domId,
    humanMsg,
    rawMessage: rawMsg,
  };
}

/**
 * Parses any backend error object / string into a formatted array of errors.
 */
export function parseValidationErrors(
  err: any,
  customDict: Record<string, FieldMappingInfo> = {}
): ParsedValidationError[] {
  if (!err) return [];

  // Extract raw message payload
  const backendMsg = err?.response?.data?.message ?? err?.response?.data?.error ?? err?.message;

  const rawMessages: string[] = [];

  if (Array.isArray(backendMsg)) {
    backendMsg.forEach((item) => {
      if (typeof item === 'string') {
        rawMessages.push(...splitConcatenatedMessages(item));
      } else if (item && typeof item === 'object') {
        const text = Object.values(item.constraints || {}).join('; ') || item.message || JSON.stringify(item);
        rawMessages.push(...splitConcatenatedMessages(text));
      }
    });
  } else if (typeof backendMsg === 'string') {
    rawMessages.push(...splitConcatenatedMessages(backendMsg));
  } else if (typeof err === 'string') {
    rawMessages.push(...splitConcatenatedMessages(err));
  } else {
    rawMessages.push('An unexpected error occurred while processing your request.');
  }

  if (rawMessages.length === 0) {
    rawMessages.push('An unexpected error occurred. Please verify form details.');
  }

  return rawMessages.map((msg) => humanizeValidationMessage(msg, customDict));
}

/**
 * Smoothly scrolls to, focuses, and illuminates an error field with an animated ring.
 */
export function jumpToErrorField(domId?: string): boolean {
  if (!domId) return false;

  const targetEl = document.getElementById(domId);
  if (!targetEl) return false;

  // Smoothly scroll to center of viewport or modal
  targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Focus the input
  try {
    targetEl.focus({ preventScroll: true });
  } catch {
    targetEl.focus();
  }

  // Highlight effect with glowing ring
  const highlightClasses = [
    'ring-4',
    'ring-rose-500',
    'ring-offset-2',
    'dark:ring-offset-[#181B26]',
    'border-rose-500',
    'animate-pulse',
  ];

  targetEl.classList.add(...highlightClasses);

  setTimeout(() => {
    targetEl.classList.remove(...highlightClasses);
  }, 2500);

  return true;
}
