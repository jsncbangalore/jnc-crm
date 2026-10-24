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
  MaxLength,
} from 'class-validator';
import {
  SanitizeText,
  TrimString,
  IsValidName,
  IsValidPhone,
  IsValidEmail,
  IsValidPin,
  IsValidGstin,
  IsValidPan,
  IsValidIfsc,
  IsValidBankAccount,
  IsValidHttpsUrl,
} from '../../common/validation.transformers';

export class UpdateBrandingDto {
  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @IsValidName()
  companyDisplayName?: string;

  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @IsValidPhone()
  companyPhone?: string;

  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  companyLogoUrl?: string | null;
}

export class UpdateCompanyProfileDto {
  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @IsValidName()
  name?: string;

  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @IsValidPhone()
  phone?: string;

  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(254)
  @IsValidEmail()
  email?: string;

  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(6)
  @IsValidPin()
  pincode?: string;

  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @IsValidHttpsUrl()
  website?: string;

  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(15)
  @IsValidGstin()
  gstin?: string;

  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @IsValidPan()
  pan?: string;

  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lutBondNo?: string;

  @IsOptional()
  @IsString()
  lutValidity?: string;

  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  invoicePrefix?: string;

  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  invoiceTerms?: string;

  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(18)
  @IsValidBankAccount()
  bankAccountNumber?: string;

  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(11)
  @IsValidIfsc()
  bankIfsc?: string;

  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankBranch?: string;

  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankUpi?: string;

  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @IsValidName()
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

  @IsOptional()
  @IsBoolean()
  requireTwoFactor?: boolean;
}

export class DetectMailProviderDto {
  @IsEmail()
  email: string;
}

export class TestMailAccountDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  smtpHost?: string;

  @IsOptional()
  @IsNumber()
  smtpPort?: number;

  @IsOptional()
  @IsString()
  encryption?: 'starttls' | 'ssl';

  @IsOptional()
  @IsString()
  smtpUser?: string;

  @IsOptional()
  @IsString()
  smtpPass?: string;

  @IsOptional()
  @IsBoolean()
  sendTestEmail?: boolean;
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
  @IsString()
  encryption?: 'starttls' | 'ssl';

  @IsOptional()
  @IsBoolean()
  isSecure?: boolean;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsBoolean()
  useForAllPurposes?: boolean;
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
  @IsString()
  encryption?: 'starttls' | 'ssl';

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

export class UpdateWebFormSettingsDto {
  @IsOptional()
  @IsString()
  logoUrl?: string | null;

  @IsOptional()
  @IsString()
  brandColor?: string;

  @IsOptional()
  @IsString()
  headline?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  submitButtonText?: string;

  @IsOptional()
  @IsString()
  thankYouTitle?: string;

  @IsOptional()
  @IsString()
  thankYouMessage?: string;

  @IsOptional()
  @IsString()
  redirectUrl?: string | null;

  @IsOptional()
  products?: Array<{ name: string; category?: string }>;

  @IsOptional()
  fields?: Record<string, { show: boolean; required: boolean }>;

  @IsOptional()
  allowedOrigins?: string[];

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
