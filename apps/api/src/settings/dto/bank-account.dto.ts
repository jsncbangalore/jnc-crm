/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class CreateBankAccountDto {
  @IsString({ message: 'Label requires a valid text entry.' })
  @IsOptional()
  label?: string;

  @IsString({ message: 'Bank name requires a valid text entry.' })
  @IsNotEmpty({ message: 'Bank name is required.' })
  bankName: string;

  @IsString({ message: 'Holder name requires a valid text entry.' })
  @IsOptional()
  holderName?: string;

  @IsString({ message: 'Account number requires a valid text entry.' })
  @IsNotEmpty({ message: 'Account number is required.' })
  accountNumber: string;

  @IsString({ message: 'IFSC requires a valid text entry.' })
  @IsNotEmpty({ message: 'IFSC is required.' })
  ifsc: string;

  @IsString({ message: 'Branch requires a valid text entry.' })
  @IsOptional()
  branch?: string;

  @IsString({ message: 'UPI ID requires a valid text entry.' })
  @IsOptional()
  upiId?: string;

  @IsBoolean({ message: 'isDefault requires a true/false selection.' })
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean({ message: 'isDocumentDefault requires a true/false selection.' })
  @IsOptional()
  isDocumentDefault?: boolean;
}

export class UpdateBankAccountDto {
  @IsString({ message: 'Label requires a valid text entry.' })
  @IsOptional()
  label?: string;

  @IsString({ message: 'Bank name requires a valid text entry.' })
  @IsOptional()
  bankName?: string;

  @IsString({ message: 'Holder name requires a valid text entry.' })
  @IsOptional()
  holderName?: string;

  @IsString({ message: 'Account number requires a valid text entry.' })
  @IsOptional()
  accountNumber?: string;

  @IsString({ message: 'IFSC requires a valid text entry.' })
  @IsOptional()
  ifsc?: string;

  @IsString({ message: 'Branch requires a valid text entry.' })
  @IsOptional()
  branch?: string;

  @IsString({ message: 'UPI ID requires a valid text entry.' })
  @IsOptional()
  upiId?: string;

  @IsBoolean({ message: 'isDefault requires a true/false selection.' })
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean({ message: 'isDocumentDefault requires a true/false selection.' })
  @IsOptional()
  isDocumentDefault?: boolean;

  @IsBoolean({ message: 'isActive requires a true/false selection.' })
  @IsOptional()
  isActive?: boolean;
}
