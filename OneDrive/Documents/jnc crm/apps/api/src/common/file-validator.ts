/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

export type AllowedFileCategory = 'document_or_image' | 'spreadsheet';

const ALLOWED_MIME_TYPES: Record<AllowedFileCategory, string[]> = {
  document_or_image: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/avif',
  ],
  spreadsheet: [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
};

const ALLOWED_EXTENSIONS: Record<AllowedFileCategory, string[]> = {
  document_or_image: ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.avif'],
  spreadsheet: ['.csv', '.xlsx', '.xls'],
};

/**
 * Checks for dangerous double extensions (e.g. evil.pdf.exe or payload.php.jpg)
 */
export function checkDoubleExtension(filename: string): void {
  const parts = filename.split('.');
  if (parts.length > 2) {
    // Check if any intermediate part looks like an executable or script extension
    const dangerousExts = ['exe', 'bat', 'cmd', 'sh', 'php', 'js', 'vbs', 'ps1', 'msi', 'com', 'scr', 'pif'];
    for (let i = 1; i < parts.length - 1; i++) {
      if (dangerousExts.includes(parts[i].toLowerCase())) {
        throw new BadRequestException('File rejected: dangerous double extension detected.');
      }
    }
    // Also reject if filename has multiple arbitrary extensions (e.g. invoice.pdf.png)
    if (parts.length > 2) {
      throw new BadRequestException('File rejected: multiple file extensions are not allowed.');
    }
  }
}

/**
 * Validates file buffer magic bytes against expected file type
 */
export function validateMagicBytes(buffer: Buffer, originalname: string): void {
  if (!buffer || buffer.length < 4) {
    throw new BadRequestException('File rejected: file is empty or corrupted.');
  }

  const ext = path.extname(originalname).toLowerCase();

  // PDF: %PDF (0x25 0x50 0x44 0x46)
  if (ext === '.pdf') {
    if (buffer[0] !== 0x25 || buffer[1] !== 0x50 || buffer[2] !== 0x44 || buffer[3] !== 0x46) {
      throw new BadRequestException('File signature mismatch: file is not a valid PDF.');
    }
    return;
  }

  // PNG: \x89PNG (0x89 0x50 0x4E 0x47)
  if (ext === '.png') {
    if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4E || buffer[3] !== 0x47) {
      throw new BadRequestException('File signature mismatch: file is not a valid PNG.');
    }
    return;
  }

  // JPEG: 0xFF 0xD8 0xFF
  if (ext === '.jpg' || ext === '.jpeg') {
    if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
      throw new BadRequestException('File signature mismatch: file is not a valid JPEG.');
    }
    return;
  }

  // XLSX: PK\x03\x04 (0x50 0x4B 0x03 0x04)
  if (ext === '.xlsx') {
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
      throw new BadRequestException('File signature mismatch: file is not a valid Excel document.');
    }
    return;
  }

  // CSV: Plain text (no null bytes in header)
  if (ext === '.csv') {
    const sample = buffer.subarray(0, Math.min(buffer.length, 512));
    if (sample.includes(0x00)) {
      throw new BadRequestException('File signature mismatch: binary data found in CSV file.');
    }
    return;
  }
}

/**
 * Full file validation pipeline
 */
export function validateUploadedFile(
  file: Express.Multer.File,
  category: AllowedFileCategory,
  maxSizeBytes: number = 10 * 1024 * 1024,
): void {
  if (!file) {
    throw new BadRequestException('No file uploaded.');
  }

  if (file.size > maxSizeBytes) {
    throw new BadRequestException(`File size exceeds maximum allowed limit of ${Math.round(maxSizeBytes / (1024 * 1024))}MB.`);
  }

  checkDoubleExtension(file.originalname);

  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ALLOWED_EXTENSIONS[category];
  if (!allowedExts.includes(ext)) {
    throw new BadRequestException(`File extension '${ext}' is not permitted for this route. Allowed: ${allowedExts.join(', ')}`);
  }

  // Validate magic bytes if buffer is available in memory
  if (file.buffer) {
    validateMagicBytes(file.buffer, file.originalname);
  }
}
