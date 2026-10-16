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
    'image/x-icon',
    'image/vnd.microsoft.icon',
  ],
  spreadsheet: [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
};

const ALLOWED_EXTENSIONS: Record<AllowedFileCategory, string[]> = {
  document_or_image: ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.ico'],
  spreadsheet: ['.csv', '.xlsx', '.xls'],
};

const DANGEROUS_EXTENSIONS = [
  'exe', 'bat', 'cmd', 'sh', 'php', 'js', 'vbs', 'ps1', 'msi', 'com', 'scr', 'pif',
  'html', 'htm', 'xhtml', 'svg', 'xml', 'jsp', 'asp', 'aspx', 'cgi', 'pl', 'py', 'jar',
];

/**
 * Checks for dangerous double extensions (e.g. invoice.pdf.html or payload.php.png)
 */
export function checkDoubleExtension(filename: string): void {
  if (!filename) {
    throw new BadRequestException('File rejected: missing filename.');
  }

  const parts = filename.split('.');
  if (parts.length > 2) {
    // Check all extensions
    for (let i = 1; i < parts.length; i++) {
      const extPart = parts[i].toLowerCase().trim();
      if (DANGEROUS_EXTENSIONS.includes(extPart)) {
        throw new BadRequestException(`File rejected: dangerous extension '.${extPart}' detected in multi-part filename.`);
      }
    }
  }

  // Also check single dangerous extensions
  const lastExt = path.extname(filename).toLowerCase().replace('.', '');
  if (DANGEROUS_EXTENSIONS.includes(lastExt)) {
    throw new BadRequestException(`File rejected: extension '.${lastExt}' is dangerous and not allowed.`);
  }
}

/**
 * Validates file buffer magic bytes against expected file type and quarantines malicious active payloads
 */
export function validateMagicBytes(buffer: Buffer, originalname: string): void {
  if (!buffer || buffer.length < 4) {
    throw new BadRequestException('File rejected: file is empty or corrupted (under 4 bytes).');
  }

  const ext = path.extname(originalname).toLowerCase();

  // 1. PDF: starts with %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (ext === '.pdf') {
    if (
      buffer.length < 5 ||
      buffer[0] !== 0x25 ||
      buffer[1] !== 0x50 ||
      buffer[2] !== 0x44 ||
      buffer[3] !== 0x46 ||
      buffer[4] !== 0x2d
    ) {
      throw new BadRequestException('File signature mismatch: file does not match %PDF- magic bytes.');
    }
    return;
  }

  // 2. PNG: starts with 89 50 4E 47 0D 0A 1A 0A
  if (ext === '.png') {
    const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (buffer.length < 8) {
      throw new BadRequestException('File signature mismatch: PNG file is smaller than header size.');
    }
    for (let i = 0; i < pngHeader.length; i++) {
      if (buffer[i] !== pngHeader[i]) {
        throw new BadRequestException('File signature mismatch: file does not match PNG magic bytes (89 50 4E 47 0D 0A 1A 0A).');
      }
    }
    return;
  }

  // 3. JPEG: starts with FF D8 FF
  if (ext === '.jpg' || ext === '.jpeg') {
    if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
      throw new BadRequestException('File signature mismatch: file does not match JPEG magic bytes (FF D8 FF).');
    }
    return;
  }

  // 4. XLSX / ZIP: starts with PK\x03\x04 (50 4B 03 04)
  if (ext === '.xlsx') {
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
      throw new BadRequestException('File signature mismatch: file does not match XLSX/ZIP magic bytes (50 4B 03 04).');
    }
    return;
  }

  // 5. CSV: Valid UTF-8 text containing zero null bytes (\0) and rejecting HTML/scripts
  if (ext === '.csv') {
    // Check for binary data (null bytes anywhere in buffer)
    if (buffer.includes(0x00)) {
      throw new BadRequestException('File signature mismatch: binary data/null bytes found in CSV file.');
    }

    const textContent = buffer.toString('utf-8');

    // Reject HTML/Script injections in CSV
    if (
      /<!doctype\s+html/i.test(textContent) ||
      /<html\b/i.test(textContent) ||
      /<script\b/i.test(textContent) ||
      /<svg\b/i.test(textContent) ||
      /\bonload\s*=/i.test(textContent) ||
      /\bonerror\s*=/i.test(textContent)
    ) {
      throw new BadRequestException('File rejected: active HTML/script payload detected in CSV file.');
    }
    return;
  }

  // 6. Favicon / ICO
  if (ext === '.ico') {
    if (buffer[0] !== 0x00 || buffer[1] !== 0x00 || buffer[2] !== 0x01 || buffer[3] !== 0x00) {
      throw new BadRequestException('File signature mismatch: file does not match ICO magic bytes.');
    }
    return;
  }

  // 7. WEBP: RIFF....WEBP
  if (ext === '.webp') {
    if (
      buffer.length < 12 ||
      buffer.subarray(0, 4).toString('ascii') !== 'RIFF' ||
      buffer.subarray(8, 12).toString('ascii') !== 'WEBP'
    ) {
      throw new BadRequestException('File signature mismatch: file does not match WEBP magic bytes.');
    }
    return;
  }
}

/**
 * Inspects any SVG payload or buffer for embedded scripts or active handlers
 */
export function inspectSvgSafety(buffer: Buffer): void {
  const content = buffer.toString('utf-8');
  if (
    /<script\b/i.test(content) ||
    /\bon[a-zA-Z]+\s*=/i.test(content) ||
    /javascript\s*:/i.test(content) ||
    /<foreignObject\b/i.test(content)
  ) {
    throw new BadRequestException('File rejected: SVG contains active script or event handlers.');
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

  // Check SVG content safety if applicable
  if (ext === '.svg' && file.buffer) {
    inspectSvgSafety(file.buffer);
  }

  // Validate magic bytes if buffer is available in memory
  if (file.buffer) {
    validateMagicBytes(file.buffer, file.originalname);
  }
}
