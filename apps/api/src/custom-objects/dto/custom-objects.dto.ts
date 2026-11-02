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
} from 'class-validator';

export class CreateCustomObjectDto {
  @IsString()
  apiName: string;

  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  pluralLabel?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCustomObjectDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  pluralLabel?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateCustomFieldDto {
  @IsString()
  apiName: string;

  @IsString()
  label: string;

  @IsString()
  fieldType: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isUnique?: boolean;

  @IsOptional()
  picklistValues?: string[] | string;

  @IsOptional()
  @IsString()
  lookupTargetObject?: string;

  @IsOptional()
  @IsNumber()
  displayOrder?: number;
}

export class UpdateCustomFieldDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  fieldType?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isUnique?: boolean;

  @IsOptional()
  picklistValues?: string[] | string;

  @IsOptional()
  @IsString()
  lookupTargetObject?: string;

  @IsOptional()
  @IsNumber()
  displayOrder?: number;
}
