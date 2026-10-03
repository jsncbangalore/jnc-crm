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

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsNumber()
  @IsOptional()
  costPrice?: number;

  @IsNumber()
  @IsOptional()
  reorderLevel?: number;

  @IsString()
  @IsOptional()
  hsnCode?: string;

  @IsNumber()
  @IsOptional()
  taxRate?: number;

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
  @IsNotEmpty()
  projectId: string;

  @IsString()
  @IsNotEmpty()
  skuId: string;

  @IsNumber()
  allocatedQuantity: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateProjectStockDto {
  @IsNumber()
  @IsOptional()
  allocatedQuantity?: number;

  @IsNumber()
  @IsOptional()
  consumedQuantity?: number;

  @IsString()
  @IsOptional()
  notes?: string;
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
  @IsNotEmpty()
  supplierId: string;

  @IsString()
  @IsNotEmpty()
  billNumber: string;

  @IsNumber()
  totalAmount: number;

  @IsArray()
  @IsOptional()
  items?: any[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  documentUrl?: string;
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
  items?: Array<{ skuId?: string; positionId?: string; skuCode?: string; name?: string }>;

  @IsArray()
  @IsOptional()
  positionIds?: string[];

  @IsArray()
  @IsOptional()
  skuIds?: string[];

  @IsOptional()
  updates?: {
    project?: string;
    supplierName?: string;
    packageType?: string;
    unit?: string;
    unitPrice?: number;
    costPrice?: number;
    taxRate?: number;
    plannedRequirement?: number;
    presentStock?: number;
  };

  @IsArray()
  @IsOptional()
  rowUpdates?: Array<{
    skuId?: string;
    positionId?: string;
    project?: string;
    supplier?: string;
    packageType?: string;
    unit?: string;
    unitPrice?: number;
    taxRate?: number;
    plannedRequirement?: number;
    presentStock?: number;
  }>;

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
