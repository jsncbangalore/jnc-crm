import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateIf, MaxLength, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';
import { ALL_ROLES, UserRole } from '../../auth/roles';
import { SanitizeText, TrimString, IsValidContactName, IsValidEmail, IsValidPhone } from '../../common/validation.transformers';

export class CreateUserDto {
  @SanitizeText()
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(60)
  @IsValidContactName(60)
  name: string;

  @TrimString()
  @MaxLength(254)
  @IsValidEmail()
  email: string;

  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @IsValidPhone()
  phone?: string;

  @IsIn(ALL_ROLES as readonly string[], { message: 'Please select an authorized system role.' })
  role: UserRole;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((o) => o.teamId !== null && o.teamId !== undefined)
  @IsUUID('4', { message: 'Please select a valid team.' })
  teamId?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((o) => o.warehouseId !== null && o.warehouseId !== undefined)
  @IsUUID('4', { message: 'Please select a valid warehouse.' })
  warehouseId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pages?: string[];

  @IsOptional()
  @IsString()
  homePage?: string | null;
}
