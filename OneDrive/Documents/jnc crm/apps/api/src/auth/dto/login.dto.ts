/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

/**
 * Strict Password Validator:
 * - Must be defined (not null or missing)
 * - Must be a string (rejects arrays, objects, numbers, booleans)
 * - Must not be empty or whitespace-only
 * - Must not exceed 200 characters
 */
export function IsValidPassword(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidPassword',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === null || value === undefined) return false;
          if (typeof value !== 'string') return false;
          if (value.trim().length === 0) return false;
          if (value.length > 200) return false;
          return true;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a non-empty string, not whitespace-only, and max 200 characters`;
        },
      },
    });
  };
}

export class LoginDto {
  @IsOptional()
  @IsString()
  identifier?: string; // Accepts email or employeeCode

  @IsOptional()
  @IsString()
  username?: string; // Backward compatibility alias

  @IsDefined({ message: 'password is required' })
  @IsString({ message: 'password must be a string' })
  @MaxLength(200, { message: 'password must not exceed 200 characters' })
  @Matches(/^(?!\s*$).+/, { message: 'password must not be empty or whitespace only' })
  @IsValidPassword()
  password: string;

  @IsOptional()
  @IsString()
  companyCode?: string; // Optional Org Code / Subdomain slug for direct multi-company routing

  @IsOptional()
  @IsBoolean()
  keepSignedIn?: boolean; // Off by default (session cookie, 12h server session, idle logout)
}

export class SelectCompanyDto {
  @IsNotEmpty()
  @IsString()
  selectionToken: string;

  @IsNotEmpty()
  @IsString()
  companyCode: string;

  @IsOptional()
  @IsString({ message: 'password must be a string' })
  @MaxLength(200, { message: 'password must not exceed 200 characters' })
  @IsValidPassword()
  password?: string;
}

export class PlatformLoginDto {
  @IsNotEmpty()
  @IsString()
  email: string;

  @IsDefined({ message: 'password is required' })
  @IsString({ message: 'password must be a string' })
  @MaxLength(200, { message: 'password must not exceed 200 characters' })
  @Matches(/^(?!\s*$).+/, { message: 'password must not be empty or whitespace only' })
  @IsValidPassword()
  password: string;

  @IsOptional()
  @IsBoolean()
  keepSignedIn?: boolean; // Off by default (session cookie, 12h server session, idle logout)
}

export class ForgotPasswordDto {
  @IsNotEmpty()
  @IsString()
  email: string;

  @IsOptional()
  @IsString()
  companyCode?: string;
}

export class ResetPasswordDto {
  @IsNotEmpty()
  @IsString()
  token: string;

  @IsDefined({ message: 'newPassword is required' })
  @IsString({ message: 'newPassword must be a string' })
  @MinLength(12, { message: 'Password must be at least 12 characters long' })
  @MaxLength(200, { message: 'newPassword must not exceed 200 characters' })
  @Matches(/^(?!\s*$).+/, { message: 'newPassword must not be empty or whitespace only' })
  @IsValidPassword()
  newPassword: string;
}

export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ForgotPasswordRequestDto {
  @IsNotEmpty()
  @IsString()
  email: string;
}

export class ForgotPasswordVerifyDto {
  @IsNotEmpty()
  @IsString()
  email: string;

  @IsNotEmpty()
  @IsString()
  code: string;
}

export class ForgotPasswordResetDto {
  @IsNotEmpty()
  @IsString()
  resetTicket: string;

  @IsDefined()
  accountIds: string[];

  @IsDefined({ message: 'newPassword is required' })
  @IsString({ message: 'newPassword must be a string' })
  @MinLength(12, { message: 'Password must be at least 12 characters long' })
  @MaxLength(200, { message: 'newPassword must not exceed 200 characters' })
  @Matches(/^(?!\s*$).+/, { message: 'newPassword must not be empty or whitespace only' })
  @IsValidPassword()
  newPassword: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;
}

export class RequestEmailChangeDto {
  @IsNotEmpty()
  @IsString()
  newEmail: string;
}

export class VerifyEmailChangeDto {
  @IsNotEmpty()
  @IsString()
  newEmail: string;

  @IsNotEmpty()
  @IsString()
  code: string;
}

export class ChangePasswordDto {
  @IsDefined({ message: 'currentPass is required' })
  @IsString({ message: 'currentPass must be a string' })
  @MaxLength(200, { message: 'currentPass must not exceed 200 characters' })
  @Matches(/^(?!\s*$).+/, { message: 'currentPass must not be empty or whitespace only' })
  @IsValidPassword()
  currentPass: string;

  @IsDefined({ message: 'newPass is required' })
  @IsString({ message: 'newPass must be a string' })
  @MinLength(12, { message: 'Password must be at least 12 characters long' })
  @MaxLength(200, { message: 'newPass must not exceed 200 characters' })
  @Matches(/^(?!\s*$).+/, { message: 'newPass must not be empty or whitespace only' })
  @IsValidPassword()
  newPass: string;

  @IsOptional()
  @IsBoolean()
  logoutOthers?: boolean;
}
