/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { IsNotEmpty, IsString, IsOptional, IsNumber, IsIn, IsArray, IsBoolean, MaxLength, Min, Max } from 'class-validator';
import { SanitizeText, TrimString, IsValidName, IsValidPhone, IsValidEmail } from '../../common/validation.transformers';

export class CreateLeadDto {
  @SanitizeText()
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @IsValidName()
  customerName: string;

  @TrimString()
  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  @IsValidPhone()
  customerPhone: string;

  @SanitizeText()
  @IsOptional()
  @MaxLength(254)
  @IsValidEmail()
  customerEmail?: string;

  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @IsIn(['indiamart', 'web', 'whatsapp', 'manual'])
  source?: string;

  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  productCategory?: string;

  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  productName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  @Max(100000)
  quantity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000000)
  estimatedValue?: number;

  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  queryMessage?: string;

  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  urgency?: string;

  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyName?: string;

  @IsOptional()
  @IsString()
  assignedToId?: string;

  @IsOptional()
  @IsString()
  rawPayload?: string;

  @IsOptional()
  @IsBoolean()
  forceSave?: boolean;

  @IsOptional()
  @IsBoolean()
  allowDuplicate?: boolean;
}

export class UpdateLeadStatusDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['new', 'contacted', 'qualified', 'quoted', 'won', 'lost'])
  status: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  lostReason?: string;
}

export class CreateLeadActivityDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['call', 'email', 'note', 'meeting', 'reminder', 'task'])
  type: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  scheduledAt?: string;

  @IsOptional()
  isCompleted?: boolean;
}

export class ShareLeadDto {
  @IsNotEmpty()
  @IsString()
  targetUserId: string;
}

export class ImportLeadsDto {
  @IsArray()
  records: any[];
}
