import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateIf, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ALL_ROLES, UserRole } from '../../auth/roles';
import { SanitizeText, TrimString, IsValidName, IsValidEmail, IsValidPhone } from '../../common/validation.transformers';

export class UpdateUserDto {
  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @IsValidName()
  name?: string;

  @TrimString()
  @IsOptional()
  @MaxLength(254)
  @IsValidEmail()
  email?: string;

  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @IsValidPhone()
  phone?: string;

  @IsOptional()
  @IsIn(ALL_ROLES as readonly string[], { message: 'Role must be a valid system role' })
  role?: UserRole;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((o) => o.teamId !== null && o.teamId !== undefined)
  @IsUUID(undefined, { message: 'teamId must be a valid UUID or null' })
  teamId?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((o) => o.warehouseId !== null && o.warehouseId !== undefined)
  @IsUUID(undefined, { message: 'warehouseId must be a valid UUID or null' })
  warehouseId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
