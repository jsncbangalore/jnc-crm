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
} from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
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
  quantity: number;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  batchNumber?: string;
}

export class CreateSkuDto {
  @IsString()
  @IsNotEmpty()
  skuCode: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsNumber()
  @IsOptional()
  unitPrice?: number;

  @IsNumber()
  @IsOptional()
  costPrice?: number;

  @IsNumber()
  @IsOptional()
  reorderPoint?: number;

  @IsNumber()
  @IsOptional()
  reorderLevel?: number;

  @IsNumber()
  @IsOptional()
  reorderQty?: number;

  @IsString()
  @IsOptional()
  warehouseId?: string;

  @IsNumber()
  @IsOptional()
  initialStock?: number;

  @IsString()
  @IsOptional()
  hsnCode?: string;

  @IsString()
  @IsOptional()
  packageType?: string;

  @IsString()
  @IsOptional()
  preferredSupplierId?: string;

  @IsString()
  @IsOptional()
  binCode?: string;

  @IsNumber()
  @IsOptional()
  taxRate?: number;
}

export class UpdateSkuDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  skuCode?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsString()
  @IsOptional()
  packageType?: string;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsNumber()
  @IsOptional()
  unitPrice?: number;

  @IsNumber()
  @IsOptional()
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
  @IsString()
  @IsOptional()
  supplierId?: string;

  @IsString()
  @IsOptional()
  billNumber?: string;

  @IsString()
  @IsOptional()
  invoiceNumber?: string;

  @IsString()
  @IsOptional()
  vendorName?: string;

  @IsString()
  @IsOptional()
  vendorGstin?: string;

  @IsString()
  @IsOptional()
  vendorAddress?: string;

  @IsString()
  @IsOptional()
  invoiceDate?: string;

  @IsString()
  @IsOptional()
  project?: string;

  @IsNumber()
  @IsOptional()
  subtotal?: number;

  @IsNumber()
  @IsOptional()
  taxRate?: number;

  @IsNumber()
  @IsOptional()
  cgst?: number;

  @IsNumber()
  @IsOptional()
  sgst?: number;

  @IsNumber()
  @IsOptional()
  igst?: number;

  @IsNumber()
  @IsOptional()
  totalTax?: number;

  @IsNumber()
  @IsOptional()
  grandTotal?: number;

  @IsNumber()
  @IsOptional()
  totalAmount?: number;

  @IsArray()
  @IsOptional()
  items?: any[];

  @IsString()
  @IsOptional()
  documentUrl?: string;

  @IsString()
  @IsOptional()
  rawText?: string;

  @IsString()
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

export class RecordPurchaseDto {
  @IsString()
  @IsOptional()
  invoiceNumber?: string;

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @IsOptional()
  items?: any[];
}

export class ClearAllInventoryDto {
  @IsString()
  @IsNotEmpty()
  confirmPhrase: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

