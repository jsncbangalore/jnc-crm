/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
  Max,
  MaxLength,
  IsBoolean,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import {
  SanitizeText,
  TrimString,
  IsValidName,
  IsValidPhone,
  IsValidEmail,
  IsValidGstin,
  IsValidProductName,
  IsValidUnitRate,
  IsValidGstRate,
} from '../../common/validation.transformers';

export class InvoiceLineItemDto {
  @IsString()
  @IsOptional()
  skuId?: string;

  @SanitizeText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @IsValidProductName()
  description: string;

  @TrimString()
  @IsString()
  @IsOptional()
  @MaxLength(20)
  hsnCode?: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  unit?: string;

  @IsNumber()
  @Min(0.0001)
  @Max(100000)
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000000)
  @IsValidUnitRate()
  unitPrice: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @IsValidGstRate()
  taxRate?: number;
}

export class CreateDirectInvoiceDto {
  @IsString()
  @IsOptional()
  docType?: string;

  @IsString()
  @IsOptional()
  companyId?: string;

  @IsString()
  @IsOptional()
  invoiceNumber?: string;

  @IsString()
  @IsOptional()
  invoiceDate?: string;

  @IsString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  poDate?: string;

  @IsString()
  @IsOptional()
  buyerOrderNo?: string;

  @IsString()
  @IsOptional()
  referenceNo?: string;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  @IsString()
  @IsOptional()
  customerEmail?: string;

  @IsString()
  @IsOptional()
  customerAddress?: string;

  @IsString()
  @IsOptional()
  billingAddress?: string;

  @IsString()
  @IsOptional()
  shippingAddress?: string;

  @IsString()
  @IsOptional()
  deliveryAddress?: string;

  @IsString()
  @IsOptional()
  customerGstin?: string;

  @IsString()
  @IsOptional()
  customerState?: string;

  @IsString()
  @IsOptional()
  paymentTerms?: string;

  @IsString()
  @IsOptional()
  paymentStatus?: string;

  @IsString()
  @IsOptional()
  deliverySchedule?: string;

  @IsString()
  @IsOptional()
  lutBondNo?: string;

  @IsString()
  @IsOptional()
  lutValidity?: string;

  @IsBoolean()
  @IsOptional()
  lutAcknowledged?: boolean;

  @IsBoolean()
  @IsOptional()
  isSez?: boolean;

  @IsNumber()
  @IsOptional()
  advancePercent?: number;

  @IsNumber()
  @IsOptional()
  advanceAdjusted?: number;

  @IsNumber()
  @IsOptional()
  balanceDue?: number;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsString()
  @IsOptional()
  transactionRef?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemDto)
  lines?: InvoiceLineItemDto[];

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemDto)
  items?: InvoiceLineItemDto[];

  @IsNumber()
  @IsOptional()
  discount?: number;

  @IsNumber()
  @IsOptional()
  shippingCharges?: number;
}

export class UpdateInvoiceDto {
  @IsString()
  @IsOptional()
  docType?: string;

  @IsString()
  @IsOptional()
  invoiceNumber?: string;

  @IsString()
  @IsOptional()
  invoiceDate?: string;

  @IsString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  poDate?: string;

  @IsString()
  @IsOptional()
  buyerOrderNo?: string;

  @IsString()
  @IsOptional()
  referenceNo?: string;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  @IsString()
  @IsOptional()
  customerEmail?: string;

  @IsString()
  @IsOptional()
  customerAddress?: string;

  @IsString()
  @IsOptional()
  billingAddress?: string;

  @IsString()
  @IsOptional()
  shippingAddress?: string;

  @IsString()
  @IsOptional()
  deliveryAddress?: string;

  @IsString()
  @IsOptional()
  customerGstin?: string;

  @IsString()
  @IsOptional()
  customerState?: string;

  @IsString()
  @IsOptional()
  paymentTerms?: string;

  @IsString()
  @IsOptional()
  paymentStatus?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  deliverySchedule?: string;

  @IsString()
  @IsOptional()
  lutBondNo?: string;

  @IsString()
  @IsOptional()
  lutValidity?: string;

  @IsBoolean()
  @IsOptional()
  lutAcknowledged?: boolean;

  @IsBoolean()
  @IsOptional()
  isSez?: boolean;

  @IsNumber()
  @IsOptional()
  advancePercent?: number;

  @IsNumber()
  @IsOptional()
  advanceAdjusted?: number;

  @IsNumber()
  @IsOptional()
  balanceDue?: number;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsString()
  @IsOptional()
  transactionRef?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @IsOptional()
  lines?: any[];

  @IsArray()
  @IsOptional()
  items?: any[];

  @IsNumber()
  @IsOptional()
  discount?: number;

  @IsNumber()
  @IsOptional()
  shippingCharges?: number;
}

export class CompanyProfileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  gstin?: string;

  @IsString()
  @IsOptional()
  pan?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  bankName?: string;

  @IsString()
  @IsOptional()
  bankBranch?: string;

  @IsString()
  @IsOptional()
  accountNumber?: string;

  @IsString()
  @IsOptional()
  ifscCode?: string;

  @IsString()
  @IsOptional()
  lutArn?: string;

  @IsString()
  @IsOptional()
  termsAndConditions?: string;
}

export class SignatorySettingsDto {
  @IsString()
  @IsOptional()
  companyName?: string;

  @IsString()
  @IsOptional()
  signatoryName?: string;

  @IsString()
  @IsOptional()
  signatoryDesignation?: string;

  @IsString()
  @IsOptional()
  signatureImage?: string | null;

  @IsString()
  @IsOptional()
  stampImage?: string | null;
}

export class GenerateFromOrderDto {
  @IsString()
  @IsOptional()
  paymentTerms?: string;

  @IsString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class VoidInvoiceDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class RecordInvoicePaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsOptional()
  paymentType?: string;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsString()
  @IsOptional()
  transactionRef?: string;

  @IsString()
  @IsOptional()
  paymentDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class EmailInvoiceDto {
  @IsString()
  @IsOptional()
  recipientEmail?: string;

  @IsString()
  @IsOptional()
  customNote?: string;

  @IsString()
  @IsOptional()
  templateType?: string;
}

export class DirectPrintDto {
  @IsString()
  @IsOptional()
  printerName?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  copies?: number;

  @IsString()
  @IsOptional()
  copyType?: string;

  @IsString()
  @IsOptional()
  templateType?: string;

  @IsString()
  @IsOptional()
  paperSize?: string;
}

