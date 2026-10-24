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
  IsEmail,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class ResetTenantAdminPasswordDto {
  @IsOptional()
  @IsString({ message: 'newPassword must be a string' })
  @MinLength(12, { message: 'Password must be at least 12 characters long' })
  @MaxLength(200, { message: 'newPassword must not exceed 200 characters' })
  @Matches(/^(?!\s*$).+/, { message: 'newPassword cannot be empty or whitespace only' })
  newPassword?: string;

  @IsOptional()
  @IsEmail()
  adminEmail?: string;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  mustResetPassword?: boolean;

  @IsOptional()
  @IsString()
  appUrl?: string;

  @IsOptional()
  @IsString()
  adminPhone?: string;
}

export class CreatePlatformAdminDto {
  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  password?: string;
}

export class TogglePlatformAdminActiveDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
