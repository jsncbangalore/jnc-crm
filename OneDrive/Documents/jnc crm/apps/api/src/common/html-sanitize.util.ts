/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Deterministic HTML Sanitization Utility
 * Neutralizes Stored XSS vectors (executable scripts, active tags, event handlers, javascript URIs)
 * across user-supplied input fields, public inquiries, webhook payloads, and notes.
 */
export function sanitizeHtml(input?: string | null): string {
  if (!input || typeof input !== 'string') return '';

  let sanitized = input;
  let previous = '';
  let iterations = 0;

  // Multi-pass loop (up to 5 passes) to eliminate nested bypass techniques
  while (sanitized !== previous && iterations < 5) {
    previous = sanitized;
    iterations++;

    sanitized = sanitized
      // Executable script, iframe, object, embed, style, applet, form, base, meta, link tags
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<object\b[^>]*>(?:[\s\S]*?<\/object>)?/gi, '')
      .replace(/<embed\b[^>]*>(?:<\/embed>)?/gi, '')
      .replace(/<applet\b[^<]*(?:(?!<\/applet>)<[^<]*)*<\/applet>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '')
      .replace(/<base\b[^>]*>/gi, '')
      .replace(/<meta\b[^>]*>/gi, '')
      .replace(/<link\b[^>]*>/gi, '')
      // Active SVG with onload or event handlers
      .replace(/<svg\b[^>]*\bon[a-zA-Z]+\b[^>]*>/gi, '')
      // Inline on* event handlers (onerror, onload, onclick, onmouseover, etc.)
      .replace(/\s*\bon[a-zA-Z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
      .replace(/\/on[a-zA-Z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
      // JavaScript, VBScript and Data HTML URI schemes
      .replace(/javascript\s*:[^"'>\s]*/gi, '')
      .replace(/vbscript\s*:[^"'>\s]*/gi, '')
      .replace(/data\s*:\s*text\/html[^"'>\s]*/gi, '')
      // Unclosed or malformed tags
      .replace(/<script\b[^>]*$/gi, '')
      .replace(/<iframe\b[^>]*$/gi, '')
      .replace(/<object\b[^>]*$/gi, '')
      .replace(/<embed\b[^>]*$/gi, '');
  }

  return sanitized.trim();
}

/**
 * Strips all HTML tags completely, returning plain text.
 * Ideal for lead names, customer phone, city, and plain-text titles.
 */
export function stripAllHtml(input?: string | null): string {
  if (!input || typeof input !== 'string') return '';
  const sanitized = sanitizeHtml(input);
  return sanitized.replace(/<[^>]*>/g, '').trim();
}

/**
 * Recursively traverses payload objects or arrays and sanitizes string fields.
 */
export function sanitizePayload<T>(payload: T, fieldsToSanitize?: string[]): T {
  if (payload === null || payload === undefined) return payload;
  if (typeof payload === 'string') {
    return sanitizeHtml(payload) as unknown as T;
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizePayload(item, fieldsToSanitize)) as unknown as T;
  }
  if (typeof payload === 'object') {
    const copy: any = { ...payload };
    for (const [key, value] of Object.entries(copy)) {
      if (!fieldsToSanitize || fieldsToSanitize.includes(key)) {
        copy[key] = sanitizePayload(value, fieldsToSanitize);
      }
    }
    return copy;
  }
  return payload;
}
