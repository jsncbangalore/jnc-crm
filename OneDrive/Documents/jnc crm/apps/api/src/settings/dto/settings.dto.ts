/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEmail,
} from 'class-validator';

export class UpdateBrandingDto {
  @IsOptional()
  @IsString()
  companyDisplayName?: string;

  @IsOptional()
  @IsString()
  companyPhone?: string;

  @IsOptional()
  @IsString()
  companyLogoUrl?: string | null;
}

export class UpdateCompanyProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  gstin?: string;

  @IsOptional()
  @IsString()
  pan?: string;

  @IsOptional()
  @IsString()
  lutBondNo?: string;

  @IsOptional()
  @IsString()
  lutValidity?: string;

  @IsOptional()
  @IsString()
  invoicePrefix?: string;

  @IsOptional()
  @IsString()
  invoiceTerms?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  bankIfsc?: string;

  @IsOptional()
  @IsString()
  bankBranch?: string;

  @IsOptional()
  @IsString()
  bankUpi?: string;

  @IsOptional()
  @IsString()
  signatoryName?: string;

  @IsOptional()
  @IsString()
  signatoryDesignation?: string;

  @IsOptional()
  @IsString()
  signatureUrl?: string;

  @IsOptional()
  @IsString()
  stampUrl?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}

export class CreateMailAccountDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  senderName?: string;

  @IsString()
  smtpHost: string;

  @IsOptional()
  @IsNumber()
  smtpPort?: number;

  @IsString()
  smtpUser: string;

  @IsString()
  smtpPass: string;

  @IsOptional()
  @IsBoolean()
  isSecure?: boolean;

  @IsOptional()
  @IsString()
  purpose?: string;
}

export class UpdateMailAccountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  senderName?: string;

  @IsOptional()
  @IsString()
  smtpHost?: string;

  @IsOptional()
  @IsNumber()
  smtpPort?: number;

  @IsOptional()
  @IsString()
  smtpUser?: string;

  @IsOptional()
  @IsString()
  smtpPass?: string;

  @IsOptional()
  @IsBoolean()
  isSecure?: boolean;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
