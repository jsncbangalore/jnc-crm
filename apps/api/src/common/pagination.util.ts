/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Global Pagination Utility
 * Enforces hard pagination limits to prevent scraping and mass data exfiltration attacks.
 * Max limit is hard-capped at 100 records per request.
 */
export interface PaginationParams {
  page?: any;
  limit?: any;
  [key: string]: any;
}

export interface ParsedPagination {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export const MAX_PAGE_LIMIT = 100;
export const DEFAULT_PAGE_LIMIT = 25;

export function parsePagination(
  params?: PaginationParams,
  defaultLimit: number = DEFAULT_PAGE_LIMIT,
  maxLimit: number = MAX_PAGE_LIMIT,
): ParsedPagination {
  const pageNum = parseInt(String(params?.page ?? 1), 10);
  const page = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;

  const rawLimit = parseInt(String(params?.limit ?? defaultLimit), 10);
  const safeDefault = Math.min(Math.max(1, defaultLimit), maxLimit);
  const clampedLimit = isNaN(rawLimit) || rawLimit < 1 ? safeDefault : Math.min(rawLimit, maxLimit);

  const skip = (page - 1) * clampedLimit;

  return {
    page,
    limit: clampedLimit,
    skip,
    take: clampedLimit,
  };
}
