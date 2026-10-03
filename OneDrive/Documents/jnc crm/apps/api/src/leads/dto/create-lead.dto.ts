/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { IsNotEmpty, IsString, IsOptional, IsNumber, IsEmail, IsIn, IsArray } from 'class-validator';

export class CreateLeadDto {
  @IsNotEmpty()
  @IsString()
  customerName: string;

  @IsNotEmpty()
  @IsString()
  customerPhone: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  @IsIn(['indiamart', 'web', 'whatsapp', 'manual'])
  source?: string;

  @IsOptional()
  @IsString()
  productCategory?: string;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  estimatedValue?: number;

  @IsOptional()
  @IsString()
  queryMessage?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  assignedToId?: string;

  @IsOptional()
  @IsString()
  rawPayload?: string;
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
