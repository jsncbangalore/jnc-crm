/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Readable } from 'stream';

export interface StorageUploadResult {
  url: string;
  storageKey: string;
  filename: string;
  originalName: string;
  tenantId: string;
  byteSize: number;
  mimeType: string;
}

export interface StorageFileStream {
  stream: Readable;
  byteSize: number;
  mimeType: string;
  filename: string;
  storageKey: string;
}

export interface IStorageService {
  uploadPurchaseDocument(
    tenantId: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<StorageUploadResult>;

  getPurchaseDocumentStream(
    tenantId: string,
    filename: string,
  ): Promise<StorageFileStream>;

  deletePurchaseDocument(
    tenantId: string,
    filename: string,
  ): Promise<boolean>;
}
