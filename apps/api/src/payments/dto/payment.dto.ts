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
  IsIn,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PaymentAllocationDto {
  @IsString({ message: 'Please provide a valid document ID.' })
  @IsOptional()
  documentId?: string;

  @IsString({ message: 'Please provide a valid invoice ID.' })
  @IsOptional()
  invoiceId?: string;

  @IsString({ message: 'Please provide a valid bill ID.' })
  @IsOptional()
  billId?: string;

  @IsNumber({}, { message: 'Allocated amount requires a valid number entry.' })
  @Min(0.01, { message: 'Allocated amount should be greater than zero.' })
  amount: number;
}

export class RecordPaymentDto {
  @IsString({ message: 'Party type should be "customer" or "supplier".' })
  @IsIn(['customer', 'supplier'], { message: 'Party type should be either "customer" or "supplier".' })
  @IsOptional()
  partyType?: 'customer' | 'supplier';

  @IsString({ message: 'Please provide a valid party ID.' })
  @IsOptional()
  partyId?: string;

  @IsString({ message: 'Please provide a valid customer ID.' })
  @IsOptional()
  customerId?: string;

  @IsString({ message: 'Please provide a valid supplier ID.' })
  @IsOptional()
  supplierId?: string;

  @IsString({ message: 'Please provide a valid order ID.' })
  @IsOptional()
  orderId?: string;

  @IsString({ message: 'Please provide a valid invoice ID.' })
  @IsOptional()
  invoiceId?: string;

  @IsNumber({}, { message: 'Payment amount requires a valid number entry.' })
  @Min(0.01, { message: 'Payment amount should be greater than zero.' })
  amount: number;

  @IsString({ message: 'Payment type requires a valid text entry.' })
  @IsOptional()
  paymentType?: string;

  @IsString({ message: 'Payment method requires a valid text entry.' })
  @IsOptional()
  paymentMethod?: string;

  @IsString({ message: 'Transaction reference requires a valid text entry.' })
  @IsOptional()
  transactionRef?: string;

  @IsString({ message: 'Payment reference requires a valid text entry.' })
  @IsOptional()
  reference?: string;

  @IsOptional()
  paymentDate?: string | Date;

  @IsString({ message: 'Notes require a valid text entry.' })
  @IsOptional()
  notes?: string;

  @IsArray({ message: 'Allocations require a list of allocation records.' })
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  @IsOptional()
  allocations?: PaymentAllocationDto[];

  @IsBoolean({ message: 'Auto allocate requires a true/false selection.' })
  @IsOptional()
  autoAllocate?: boolean;

  @IsBoolean({ message: 'Allow advance requires a true/false selection.' })
  @IsOptional()
  allowAdvance?: boolean;

  @IsBoolean({ message: 'Is advance requires a true/false selection.' })
  @IsOptional()
  isAdvance?: boolean;

  @IsBoolean({ message: 'Confirm duplicate requires a true/false selection.' })
  @IsOptional()
  confirmDuplicate?: boolean;

  @IsBoolean({ message: 'Confirmed large payment requires a true/false selection.' })
  @IsOptional()
  confirmedLargePayment?: boolean;

  @IsString({ message: 'Typed confirmation requires a valid text entry.' })
  @IsOptional()
  typedConfirmation?: string;

  @IsString({ message: 'Idempotency key requires a valid text entry.' })
  @IsOptional()
  idempotencyKey?: string;
}
