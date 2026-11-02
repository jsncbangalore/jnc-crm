/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { IsNotEmpty, IsOptional, IsString, IsArray, MaxLength } from 'class-validator';
import { SanitizeText, IsValidName } from '../../common/validation.transformers';

export class CreateProjectDto {
  @SanitizeText()
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @IsValidName()
  name: string;

  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateProjectDto {
  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @IsValidName()
  name?: string;

  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class AssignMembersDto {
  @IsArray()
  @IsString({ each: true })
  memberIds: string[];
}

export class UploadLogDto {
  @SanitizeText()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  taskSummary?: string;
}
