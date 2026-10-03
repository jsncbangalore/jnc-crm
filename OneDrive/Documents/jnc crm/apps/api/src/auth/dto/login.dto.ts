/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsOptional()
  @IsString()
  identifier?: string; // Accepts email or employeeCode

  @IsOptional()
  @IsString()
  username?: string; // Backward compatibility alias

  @IsNotEmpty()
  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  companyCode?: string; // Optional Org Code / Subdomain slug for direct multi-company routing
}

export class SelectCompanyDto {
  @IsNotEmpty()
  @IsString()
  selectionToken: string;

  @IsNotEmpty()
  @IsString()
  companyCode: string;
}

export class PlatformLoginDto {
  @IsNotEmpty()
  @IsString()
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;
}

export class ForgotPasswordDto {
  @IsNotEmpty()
  @IsString()
  email: string;
}

export class ResetPasswordDto {
  @IsNotEmpty()
  @IsString()
  token: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters long' })
  newPassword: string;
}

export class RefreshTokenDto {
  @IsNotEmpty()
  @IsString()
  refreshToken: string;
}
