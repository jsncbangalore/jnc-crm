/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  IsIn,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  SanitizeText,
  TrimString,
  IsValidName,
  IsValidSku,
  IsValidProductName,
  IsValidUnitRate,
  IsValidGstin,
} from '../../common/validation.transformers';

export class CreateWarehouseDto {
  @SanitizeText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsValidName()
  name: string;

  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(300)
  address?: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;
}

export class RecordMovementDto {
  @IsString()
  @IsNotEmpty()
  skuId: string;

  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @IsString()
  @IsNotEmpty()
  type: string; // IN, OUT, ADJUSTMENT, RETURN

  @IsNumber()
  @Min(0.0001)
  @Max(100000)
  quantity: number;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  reason?: string;

  @TrimString()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  reference?: string;

  @TrimString()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  batchNumber?: string;
}

export class CreateSkuDto {
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @IsValidSku()
  skuCode: string;

  @TrimString()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  code?: string;

  @SanitizeText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @IsValidProductName()
  name: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  unit?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0)
  @Max(100000000)
  @IsValidUnitRate()
  price?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0)
  @Max(100000000)
  @IsValidUnitRate()
  unitPrice?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0)
  @Max(100000000)
  @IsValidUnitRate()
  costPrice?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100000)
  reorderPoint?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100000)
  reorderLevel?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100000)
  reorderQty?: number;

  @IsString()
  @IsOptional()
  warehouseId?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100000)
  initialStock?: number;

  @TrimString()
  @IsString()
  @IsOptional()
  @MaxLength(20)
  hsnCode?: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  packageType?: string;

  @IsString()
  @IsOptional()
  preferredSupplierId?: string;

  @TrimString()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  binCode?: string;

  @IsNumber()
  @IsOptional()
  taxRate?: number;
}

export class UpdateSkuDto {
  @TrimString()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  code?: string;

  @TrimString()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  @IsValidSku()
  skuCode?: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(150)
  @IsValidProductName()
  name?: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  unit?: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  packageType?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0)
  @Max(100000000)
  @IsValidUnitRate()
  price?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0)
  @Max(100000000)
  @IsValidUnitRate()
  unitPrice?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0)
  @Max(100000000)
  @IsValidUnitRate()
  costPrice?: number;

  @IsNumber()
  @IsOptional()
  reorderLevel?: number;

  @IsNumber()
  @IsOptional()
  reorderPoint?: number;

  @IsNumber()
  @IsOptional()
  reorderQty?: number;

  @IsString()
  @IsOptional()
  hsnCode?: string;

  @IsNumber()
  @IsOptional()
  taxRate?: number;

  @IsString()
  @IsOptional()
  supplierName?: string;

  @IsString()
  @IsOptional()
  supplierId?: string;

  @IsNumber()
  @IsOptional()
  quantityOnHand?: number;

  @IsString()
  @IsOptional()
  reasonCode?: string;

  @IsString()
  @IsOptional()
  warehouseId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class BulkDeleteSkusDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}

export class ImportInventoryDto {
  @IsArray()
  records: any[];

  @IsString()
  @IsOptional()
  warehouseCode?: string;
}

export class TransferStockDto {
  @IsString()
  @IsNotEmpty()
  skuId: string;

  @IsString()
  @IsNotEmpty()
  sourceWarehouseId: string;

  @IsString()
  @IsNotEmpty()
  destinationWarehouseId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateProjectStockDto {
  @IsString()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  skuId?: string;

  @IsNumber()
  @IsOptional()
  allocatedQuantity?: number;

  @IsString()
  @IsOptional()
  project?: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  itemCode?: string;

  @IsString()
  @IsOptional()
  skuCode?: string;

  @IsString()
  @IsOptional()
  partValue?: string;

  @IsString()
  @IsOptional()
  package?: string;

  @IsString()
  @IsOptional()
  packageType?: string;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsNumber()
  @IsOptional()
  bomQtyPerUnit?: number;

  @IsNumber()
  @IsOptional()
  batchQty?: number;

  @IsNumber()
  @IsOptional()
  plannedRequirement?: number;

  @IsNumber()
  @IsOptional()
  openingStock?: number;

  @IsNumber()
  @IsOptional()
  inflow?: number;

  @IsNumber()
  @IsOptional()
  outflow?: number;

  @IsNumber()
  @IsOptional()
  presentStock?: number;

  @IsNumber()
  @IsOptional()
  shortage?: number;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateProjectStockDto {
  @IsString()
  @IsOptional()
  project?: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  itemCode?: string;

  @IsString()
  @IsOptional()
  skuCode?: string;

  @IsString()
  @IsOptional()
  partValue?: string;

  @IsString()
  @IsOptional()
  package?: string;

  @IsString()
  @IsOptional()
  packageType?: string;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsNumber()
  @IsOptional()
  bomQtyPerUnit?: number;

  @IsNumber()
  @IsOptional()
  batchQty?: number;

  @IsNumber()
  @IsOptional()
  plannedRequirement?: number;

  @IsNumber()
  @IsOptional()
  openingStock?: number;

  @IsNumber()
  @IsOptional()
  inflow?: number;

  @IsNumber()
  @IsOptional()
  outflow?: number;

  @IsNumber()
  @IsOptional()
  presentStock?: number;

  @IsNumber()
  @IsOptional()
  shortage?: number;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @IsOptional()
  allocatedQuantity?: number;

  @IsNumber()
  @IsOptional()
  consumedQuantity?: number;
}

export class AssignProjectStockDto {
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @IsString()
  @IsNotEmpty()
  skuId: string;

  @IsNumber()
  quantity: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class BulkImportProjectStockDto {
  @IsArray()
  rows: any[];
}

export class AllocateProjectStockDto {
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @IsString()
  @IsNotEmpty()
  skuId: string;

  @IsNumber()
  quantity: number;

  @IsString()
  @IsOptional()
  warehouseId?: string;
}

export class CreatePurchaseBillDto {
  @IsString({ message: 'Supplier ID requires a valid text entry.' })
  @IsOptional()
  supplierId?: string;

  @IsString({ message: 'Bill number requires a valid text entry.' })
  @IsOptional()
  billNumber?: string;

  @IsString({ message: 'Invoice number requires a valid text entry.' })
  @IsOptional()
  invoiceNumber?: string;

  @IsString({ message: 'Vendor name requires a valid text entry.' })
  @IsOptional()
  vendorName?: string;

  @IsValidGstin({ message: 'Vendor GSTIN requires a valid 15-character GSTIN with a valid checksum digit.' })
  @IsOptional()
  vendorGstin?: string;

  @IsValidGstin({ message: 'Supplier GSTIN requires a valid 15-character GSTIN with a valid checksum digit.' })
  @IsOptional()
  supplierGstin?: string;

  @IsString({ message: 'Vendor address requires a valid text entry.' })
  @IsOptional()
  vendorAddress?: string;

  @IsDateString({}, { message: 'Invoice date requires a valid date format (YYYY-MM-DD).' })
  @IsOptional()
  invoiceDate?: string;

  @IsDateString({}, { message: 'Issue date requires a valid date format (YYYY-MM-DD).' })
  @IsOptional()
  issueDate?: string;

  @IsDateString({}, { message: 'Due date requires a valid date format (YYYY-MM-DD).' })
  @IsOptional()
  dueDate?: string;

  @IsString({ message: 'Project requires a valid text entry.' })
  @IsOptional()
  project?: string;

  @IsNumber({}, { message: 'Subtotal requires a valid number entry.' })
  @IsOptional()
  subtotal?: number;

  @IsNumber({}, { message: 'Tax rate requires a valid number entry.' })
  @Min(0, { message: 'Tax rate cannot be negative.' })
  @Max(28, { message: 'Tax rate cannot exceed 28%.' })
  @IsOptional()
  taxRate?: number;

  @IsIn(['cgst_sgst', 'igst'], { message: 'Tax type should be either "cgst_sgst" or "igst".' })
  @IsOptional()
  taxType?: 'cgst_sgst' | 'igst';

  @IsNumber({}, { message: 'CGST requires a valid number entry.' })
  @IsOptional()
  cgst?: number;

  @IsNumber({}, { message: 'SGST requires a valid number entry.' })
  @IsOptional()
  sgst?: number;

  @IsNumber({}, { message: 'IGST requires a valid number entry.' })
  @IsOptional()
  igst?: number;

  @IsNumber({}, { message: 'Total tax requires a valid number entry.' })
  @IsOptional()
  totalTax?: number;

  @IsNumber({}, { message: 'Grand total requires a valid number entry.' })
  @IsOptional()
  grandTotal?: number;

  @IsNumber({}, { message: 'Total amount requires a valid number entry.' })
  @IsOptional()
  totalAmount?: number;

  @IsArray({ message: 'Items requires a list of bill line items.' })
  @IsOptional()
  items?: any[];

  @IsString({ message: 'Document URL requires a valid text entry.' })
  @IsOptional()
  documentUrl?: string;

  @IsString({ message: 'Raw text requires a valid text entry.' })
  @IsOptional()
  rawText?: string;

  @IsString({ message: 'Notes require a valid text entry.' })
  @IsOptional()
  notes?: string;

  @IsOptional()
  softCopyData?: any;
}

export class ScanBillOcrDto {
  @IsString()
  @IsOptional()
  rawText?: string;

  @IsString()
  @IsOptional()
  filename?: string;

  @IsString()
  @IsOptional()
  fileUrl?: string;

  @IsString()
  @IsOptional()
  documentUrl?: string;

  @IsString()
  @IsOptional()
  imageBase64?: string;
}

export class BulkEditComponentsDto {
  @IsArray()
  @IsOptional()
  items?: any[];

  @IsArray()
  @IsOptional()
  positionIds?: string[];

  @IsArray()
  @IsOptional()
  skuIds?: string[];

  @IsOptional()
  updates?: any;

  @IsArray()
  @IsOptional()
  rowUpdates?: any[];

  @IsArray()
  @IsOptional()
  components?: any[];
}

export class RecordPurchaseItemDto {
  @IsString({ message: 'SKU ID is required for each purchase item.' })
  @IsNotEmpty({ message: 'SKU ID cannot be empty.' })
  skuId: string;

  @IsNumber({}, { message: 'Quantity requires a valid number entry.' })
  @Min(1, { message: 'Quantity should be at least 1 unit.' })
  quantity: number;

  @IsNumber({}, { message: 'Unit rate requires a valid number entry.' })
  @Min(0, { message: 'Unit rate cannot be negative.' })
  unitRate: number;
}

export class RecordPurchaseDto {
  @IsString({ message: 'Invoice number requires a valid text entry.' })
  @IsOptional()
  invoiceNumber?: string;

  @IsDateString({}, { message: 'Invoice date requires a valid date format (YYYY-MM-DD).' })
  @IsOptional()
  invoiceDate?: string;

  @IsValidGstin({ message: 'Supplier GSTIN requires a valid 15-character GSTIN with a valid checksum digit.' })
  @IsOptional()
  supplierGstin?: string;

  @IsNumber({}, { message: 'Tax rate requires a valid number entry.' })
  @Min(0, { message: 'Tax rate cannot be negative.' })
  @Max(28, { message: 'Tax rate cannot exceed 28%.' })
  @IsOptional()
  taxRate?: number;

  @IsIn(['cgst_sgst', 'igst'], { message: 'Tax type should be either "cgst_sgst" or "igst".' })
  @IsOptional()
  taxType?: 'cgst_sgst' | 'igst';

  @IsString({ message: 'Document URL requires a valid text entry.' })
  @IsOptional()
  documentUrl?: string;

  @IsNumber({}, { message: 'Amount requires a valid number entry.' })
  @IsOptional()
  amount?: number;

  @IsString({ message: 'Notes require a valid text entry.' })
  @IsOptional()
  notes?: string;

  @IsArray({ message: 'Items requires a list of purchase items.' })
  @ValidateNested({ each: true })
  @Type(() => RecordPurchaseItemDto)
  @IsOptional()
  items?: RecordPurchaseItemDto[];
}

export class ClearAllInventoryDto {
  @IsString()
  @IsNotEmpty()
  confirmPhrase: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RecordProjectStockPurchaseDto {
  @IsNumber({}, { message: 'Quantity purchased requires a valid number entry.' })
  @Min(0.001, { message: 'Quantity purchased should be greater than zero.' })
  quantityPurchased: number;

  @IsNumber({}, { message: 'Unit rate requires a valid number entry.' })
  @Min(0, { message: 'Unit rate cannot be negative.' })
  unitRate: number;

  @IsNumber({}, { message: 'Tax rate requires a valid number entry.' })
  @Min(0, { message: 'Tax rate cannot be negative.' })
  @Max(28, { message: 'Tax rate cannot exceed 28%.' })
  @IsOptional()
  taxRate?: number;

  @IsString({ message: 'Supplier name requires a valid text entry.' })
  @IsOptional()
  supplierName?: string;

  @IsValidGstin({ message: 'Supplier GSTIN requires a valid 15-character GSTIN with a valid checksum digit.' })
  @IsOptional()
  supplierGstin?: string;

  @IsString({ message: 'Invoice number requires a valid text entry.' })
  @IsOptional()
  invoiceNumber?: string;

  @IsDateString({}, { message: 'Invoice date requires a valid date format (YYYY-MM-DD).' })
  @IsOptional()
  invoiceDate?: string;

  @IsString({ message: 'Document data URL requires a valid text entry.' })
  @IsOptional()
  documentDataUrl?: string;

  @IsString({ message: 'Notes require a valid text entry.' })
  @IsOptional()
  notes?: string;
}


