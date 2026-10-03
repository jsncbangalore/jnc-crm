/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Neutralizes CSV formula injection characters by prefixing with a single quote (')
 */
export function sanitizeFormulaExport(val: any): any {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.length > 0 && FORMULA_TRIGGERS.some((char) => trimmed.startsWith(char))) {
      return `'${val}`;
    }
  }
  return val;
}

/**
 * Sanitizes an imported cell value to prevent executed spreadsheet formulas
 */
export function sanitizeFormulaImport(val: any): any {
  if (typeof val === 'string') {
    let cleaned = val.trim();
    // Strip leading single quote if placed there to neutralize
    if (cleaned.startsWith("'") && cleaned.length > 1 && FORMULA_TRIGGERS.some((char) => cleaned[1] === char)) {
      return cleaned.substring(1);
    }
    // Neutralize any raw formula start
    if (FORMULA_TRIGGERS.some((char) => cleaned.startsWith(char))) {
      return `'${cleaned}`;
    }
  }
  return val;
}

export function sanitizeRowForExport(row: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(row)) {
    sanitized[key] = sanitizeFormulaExport(val);
  }
  return sanitized;
}

export function sanitizeRowForImport(row: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(row)) {
    sanitized[key] = sanitizeFormulaImport(val);
  }
  return sanitized;
}
