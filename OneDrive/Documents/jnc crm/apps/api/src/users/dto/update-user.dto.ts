import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { ALL_ROLES, UserRole } from '../../auth/roles';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Name cannot be empty' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
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
