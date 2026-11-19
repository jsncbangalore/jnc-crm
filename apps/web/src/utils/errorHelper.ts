/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { toPlainText } from '@crm/shared-validation';
import { generateSupportCode } from './supportCode';
export { toPlainText };

export interface ParsedApiError {
  statusCode: number;
  code: string;
  message: string;
  fieldErrors: Record<string, string>;
  requestId?: string;
  supportCode?: string;
  rawDetails: string;
}

const HTTP_STATUS_MESSAGES: Record<number, string> = {
  401: 'Session expired. Please sign in again.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested resource could not be found.',
  409: 'A record with this information already exists.',
  413: 'The uploaded file or request is too large. Please reduce the size and try again.',
  422: 'The submitted data could not be processed. Please check the values and try again.',
  429: 'Too many attempts. Please wait a few minutes.',
  500: 'We could not complete your request right now. Please try again in a few minutes.',
  502: 'The system is being updated. Please try again in a few minutes.',
  503: 'The system is being updated. Please try again in a few minutes.',
  504: 'The request timed out. Please try again in a few minutes.',
};

/**
 * Sanitizes any raw string into a clean, human-readable sentence.
 * Guarantees no raw JSON, brackets, undefined, or technical jargon leaks to the user.
 */
export function sanitizeUserMessage(raw: unknown, defaultMessage = 'An error occurred. Please try again.'): string {
  if (!raw) return defaultMessage;
  if (typeof raw !== 'string') {
    if (Array.isArray(raw)) {
      const first = raw.find((item) => typeof item === 'string' && item.trim().length > 0);
      return first ? sanitizeUserMessage(first, defaultMessage) : defaultMessage;
    }
    return defaultMessage;
  }

  let text = raw.trim();
  if (text.startsWith('{') || text.startsWith('[') || text.startsWith('[object')) {
    return defaultMessage;
  }

  // Remove technical phrases
  text = text
    .replace(/property\s+["']?[\w.-]+["']?\s+should not exist/gi, 'An unrecognized field was submitted.')
    .replace(/should not exist/gi, 'is not recognized')
    .replace(/must be a valid text string/gi, 'requires a valid text entry')
    .replace(/must be a valid string/gi, 'requires a valid text entry')
    .replace(/must be a valid number/gi, 'requires a valid number entry')
    .replace(/must be a number/gi, 'requires a valid number entry')
    .replace(/must be a valid date/gi, 'requires a valid date')
    .replace(/must be a /gi, 'requires a ')
    .replace(/must be an? /gi, 'requires a ')
    .replace(/\bundefined\b/gi, '')
    .replace(/\[object\s+\w+\]/gi, '')
    .replace(/\bvalid\s+valid\b/gi, 'valid')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return defaultMessage;
  if (!text.endsWith('.') && !text.endsWith('!') && !text.endsWith('?')) {
    text += '.';
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Parses any API error response into a structured, user-friendly format.
 */
export function parseApiError(err: any): ParsedApiError {
  const status = err?.response?.status || (err?.request ? 0 : 500);
  const data = err?.response?.data;
  const requestId = data?.requestId || err?.response?.headers?.['x-request-id'] || undefined;
  const code = String(data?.code || (status === 0 ? 'NETWORK_ERROR' : 'ERROR'));

  const fieldErrors: Record<string, string> = {};

  // Extract field errors if available
  if (Array.isArray(data?.fieldErrors)) {
    for (const item of data.fieldErrors) {
      if (item && typeof item === 'object' && item.field) {
        fieldErrors[String(item.field)] = sanitizeUserMessage(item.message);
      }
    }
  } else if (data?.fieldErrors && typeof data.fieldErrors === 'object') {
    for (const [key, val] of Object.entries(data.fieldErrors)) {
      if (val) {
        fieldErrors[key] = sanitizeUserMessage(val);
      }
    }
  }

  const supportCode = data?.supportCode || err?.response?.headers?.['x-support-code'] || generateSupportCode(requestId);

  // Determine top-level message
  let topMessage = '';
  if (code === 'UNKNOWN_FIELD') {
    topMessage = 'The submitted form contains unrecognized parameters. Please refresh and try again.';
  } else if (code === 'SCHEMA_OUT_OF_DATE' || code === 'SERVER_UPDATE_PENDING' || status === 503) {
    topMessage = 'The system is being updated. Please try again in a few minutes.';
  } else if (Object.keys(fieldErrors).length > 0) {
    topMessage = 'Please correct the highlighted fields and try again.';
  } else if (HTTP_STATUS_MESSAGES[status]) {
    topMessage = HTTP_STATUS_MESSAGES[status];
  } else if (status >= 500) {
    topMessage = 'We could not complete your request right now. Please try again in a few minutes.';
  } else if (status === 0) {
    topMessage = 'Could not reach the server. Check your internet and try again.';
  } else if (typeof data?.message === 'string') {
    topMessage = sanitizeUserMessage(data.message);
  } else {
    topMessage = 'We could not complete your request right now. Please try again in a few minutes.';
  }

  // Construct raw details for "Copy details" button
  const detailsLines: string[] = [
    `Status: ${status || 'Network Error'}`,
    `Code: ${code}`,
    `Message: ${topMessage}`,
  ];
  if (supportCode) detailsLines.push(`Support Code: ${supportCode}`);
  if (Object.keys(fieldErrors).length > 0) {
    detailsLines.push('Field Errors:');
    for (const [f, m] of Object.entries(fieldErrors)) {
      detailsLines.push(`  - ${f}: ${m}`);
    }
  }

  return {
    statusCode: status,
    code,
    message: topMessage,
    fieldErrors,
    requestId,
    supportCode,
    rawDetails: detailsLines.join('\n'),
  };
}
