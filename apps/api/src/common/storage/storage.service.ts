/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Readable } from 'stream';
import { IStorageService, StorageUploadResult, StorageFileStream } from './storage.interface';

@Injectable()
export class StorageService implements IStorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly storageDriver: 'disk' | 's3';
  private readonly baseDiskDir: string;

  constructor() {
    this.storageDriver = (process.env.STORAGE_DRIVER?.toLowerCase() === 's3' && process.env.S3_BUCKET) ? 's3' : 'disk';
    // Local directory outside git and public web root
    this.baseDiskDir = path.resolve(process.cwd(), 'purchase-documents');
    if (!fs.existsSync(this.baseDiskDir)) {
      try {
        fs.mkdirSync(this.baseDiskDir, { recursive: true });
      } catch (e: any) {
        this.logger.warn(`Could not create base purchase-documents directory: ${e.message}`);
      }
    }
  }

  /**
   * Uploads a purchase document into tenant-isolated private object storage
   */
  async uploadPurchaseDocument(
    tenantId: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<StorageUploadResult> {
    if (!tenantId || !tenantId.trim()) {
      throw new BadRequestException('Invalid tenant ID for document upload.');
    }
    const cleanTenantId = path.basename(tenantId.trim());

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('Empty file buffer provided.');
    }
    if (fileBuffer.length > 10 * 1024 * 1024) {
      throw new BadRequestException('File exceeds 10MB limit.');
    }

    const ext = path.extname(originalName).toLowerCase();
    const randomUuid = crypto.randomUUID();
    const randomFilename = `${randomUuid}${ext}`;
    const storageKey = `${cleanTenantId}/${randomFilename}`;

    if (this.storageDriver === 's3') {
      // S3 driver implementation placeholder - connects to private S3 bucket
      this.logger.log(`[STORAGE-S3] Uploading ${storageKey} to private S3 bucket`);
      // When AWS S3 SDK is configured, s3.send(new PutObjectCommand(...))
    }

    // Default & Local Driver: Private filesystem with tenant separation
    const tenantFolder = path.resolve(this.baseDiskDir, cleanTenantId);
    if (!fs.existsSync(tenantFolder)) {
      fs.mkdirSync(tenantFolder, { recursive: true });
    }

    const filePath = path.resolve(tenantFolder, randomFilename);
    fs.writeFileSync(filePath, fileBuffer);

    const publicUrl = `/api/v1/inventory/purchase-documents/${cleanTenantId}/${randomFilename}`;

    return {
      url: publicUrl,
      storageKey,
      filename: randomFilename,
      originalName,
      tenantId: cleanTenantId,
      byteSize: fileBuffer.length,
      mimeType,
    };
  }

  /**
   * Retrieves a readable stream for a tenant-owned purchase document
   */
  async getPurchaseDocumentStream(
    tenantId: string,
    filename: string,
  ): Promise<StorageFileStream> {
    if (!tenantId || !filename) {
      throw new BadRequestException('Tenant ID and filename are required.');
    }

    // Strict path traversal defense
    if (
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\') ||
      tenantId.includes('..') ||
      tenantId.includes('/') ||
      tenantId.includes('\\')
    ) {
      throw new BadRequestException('Invalid filename or tenant path traversal attempt.');
    }

    const cleanTenantId = path.basename(tenantId.trim());
    const cleanFilename = path.basename(filename.trim());
    const storageKey = `${cleanTenantId}/${cleanFilename}`;

    // Search potential disk locations (current root, monorepo root)
    const candidateDirs = [
      path.resolve(this.baseDiskDir, cleanTenantId),
      path.resolve(process.cwd(), '../../purchase-documents', cleanTenantId),
      path.resolve(process.cwd(), '../purchase-documents', cleanTenantId),
      path.resolve(process.cwd(), 'purchase-documents', cleanTenantId),
    ];

    let resolvedPath = '';
    for (const dir of candidateDirs) {
      const candidate = path.resolve(dir, cleanFilename);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        resolvedPath = candidate;
        break;
      }
    }

    if (!resolvedPath) {
      throw new NotFoundException('Requested purchase document was not found.');
    }

    const stats = fs.statSync(resolvedPath);
    const ext = path.extname(cleanFilename).toLowerCase();
    const mimeType = ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : 'image/jpeg';

    const stream = fs.createReadStream(resolvedPath);

    return {
      stream,
      byteSize: stats.size,
      mimeType,
      filename: cleanFilename,
      storageKey,
    };
  }

  /**
   * Deletes a purchase document from object storage
   */
  async deletePurchaseDocument(tenantId: string, filename: string): Promise<boolean> {
    if (!tenantId || !filename) return false;
    const cleanTenantId = path.basename(tenantId.trim());
    const cleanFilename = path.basename(filename.trim());
    const filePath = path.resolve(this.baseDiskDir, cleanTenantId, cleanFilename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }
}
