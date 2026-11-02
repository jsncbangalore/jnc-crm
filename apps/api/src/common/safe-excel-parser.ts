/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { validateUploadedFile } from './file-validator';

export interface SafeExcelParseOptions {
  maxSizeBytes?: number;
  maxRows?: number;
  maxColumns?: number;
}

const BANNED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Safely parses an uploaded Excel/CSV file buffer using SheetJS:
 * 1. Enforces file size limits (default 5MB)
 * 2. Enforces allowed extensions & magic bytes via validateUploadedFile
 * 3. Enforces max rows (default 5000) and max columns (default 100)
 * 4. Strips prototype pollution keys (__proto__, constructor, prototype)
 * 5. Runs parsing inside try/catch with clean error reporting
 */
export function parseExcelSafely<T = Record<string, any>>(
  file: Express.Multer.File,
  options: SafeExcelParseOptions = {}
): T[] {
  const maxSizeBytes = options.maxSizeBytes || 5 * 1024 * 1024;
  const maxRows = options.maxRows || 5000;
  const maxColumns = options.maxColumns || 100;

  // 1. Validate file extension, size limit, double extension, magic bytes
  validateUploadedFile(file, 'spreadsheet', maxSizeBytes);

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(file.buffer, { type: 'buffer' });
  } catch (err: any) {
    throw new BadRequestException('Failed to parse spreadsheet: invalid or corrupted file.');
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }

  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    return [];
  }

  let rawRows: any[];
  try {
    rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  } catch (err: any) {
    throw new BadRequestException('Failed to process spreadsheet sheet data: ' + err.message);
  }

  if (!Array.isArray(rawRows)) {
    return [];
  }

  if (rawRows.length > maxRows) {
    throw new BadRequestException(`Spreadsheet exceeds maximum allowed rows limit of ${maxRows} (found ${rawRows.length} rows).`);
  }

  const sanitizedRows: T[] = [];

  for (const row of rawRows) {
    if (typeof row !== 'object' || row === null) continue;

    const rowKeys = Object.keys(row);
    if (rowKeys.length > maxColumns) {
      throw new BadRequestException(`Spreadsheet row exceeds maximum allowed columns limit of ${maxColumns} (found ${rowKeys.length} columns).`);
    }

    // Create a prototype-less object to prevent any prototype pollution
    const cleanRow: any = Object.create(null);

    for (const key of rowKeys) {
      const trimmedKey = String(key).trim();
      // Explicitly ignore prototype pollution keys
      if (BANNED_KEYS.has(trimmedKey.toLowerCase())) {
        continue;
      }
      cleanRow[trimmedKey] = row[key];
    }

    sanitizedRows.push(cleanRow as T);
  }

  return sanitizedRows;
}
