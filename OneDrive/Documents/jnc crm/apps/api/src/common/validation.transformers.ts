/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Transform } from 'class-transformer';
import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import {
  stripHtml,
  removeControlCharacters,
  sanitizeText,
  validatePersonOrCompanyName,
  validatePhone,
  validateEmail,
  validateProductName,
  validateSku,
  validateQuantity,
  validateUnitRate,
  validateGstRate,
  validateAddress,
  validateNotes,
  validatePostalPin,
  validateGstin,
  validatePan,
  validateIfsc,
  validateBankAccount,
  validateDate,
  validateHttpsUrl,
} from '@crm/shared-validation';

/**
 * Transform decorator: trims whitespace, removes control characters, and strips HTML tags.
 */
export function SanitizeText() {
  return Transform(({ value }) => {
    if (typeof value === 'string') {
      return sanitizeText(stripHtml(value));
    }
    return value;
  });
}

/**
 * Transform decorator: trims whitespace and removes control characters (preserves safe markdown/newlines).
 */
export function TrimString() {
  return Transform(({ value }) => {
    if (typeof value === 'string') {
      return removeControlCharacters(value).trim();
    }
    return value;
  });
}

/**
 * Validates person or company name (2-100 chars, letters of any language, digits, space, . , & - ' ( ) / only, at least one letter).
 */
export function IsValidName(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidName',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === undefined || value === null || value === '') return false;
          return validatePersonOrCompanyName(value).valid;
        },
        defaultMessage(args: ValidationArguments) {
          const res = validatePersonOrCompanyName(args.value);
          return res.error || `${args.property} must be 2-100 characters and contain valid letters`;
        },
      },
    });
  };
}

/**
 * Validates mobile phone number (Indian 10-digits starting 6-9 or international 8-15 digits).
 */
export function IsValidPhone(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidPhone',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === undefined || value === null || value === '') return false;
          return validatePhone(value).valid;
        },
        defaultMessage(args: ValidationArguments) {
          const res = validatePhone(args.value);
          return res.error || `${args.property} is not a valid phone number`;
        },
      },
    });
  };
}

/**
 * Validates email address (max 254 chars, valid domain with dot).
 */
export function IsValidEmail(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidEmail',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === undefined || value === null || value === '') return true; // Optional by default
          return validateEmail(value).valid;
        },
        defaultMessage(args: ValidationArguments) {
          const res = validateEmail(args.value);
          return res.error || `${args.property} must be a valid email address`;
        },
      },
    });
  };
}

/**
 * Validates product name (2-150 chars, no control chars, repetition check).
 */
export function IsValidProductName(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidProductName',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === undefined || value === null || value === '') return false;
          return validateProductName(value).valid;
        },
        defaultMessage(args: ValidationArguments) {
          const res = validateProductName(args.value);
          return res.error || `${args.property} is not a valid product name`;
        },
      },
    });
  };
}

/**
 * Validates SKU (letters, digits, - _ . /).
 */
export function IsValidSku(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidSku',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === undefined || value === null || value === '') return true;
          return validateSku(value).valid;
        },
        defaultMessage(args: ValidationArguments) {
          const res = validateSku(args.value);
          return res.error || `${args.property} contains invalid SKU characters`;
        },
      },
    });
  };
}

/**
 * Validates unit rate (> 0, max 100,000,000, max 2 decimals, no leading zero like '02', no exponent, no minus).
 */
export function IsValidUnitRate(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidUnitRate',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          return validateUnitRate(value).valid;
        },
        defaultMessage(args: ValidationArguments) {
          const res = validateUnitRate(args.value);
          return res.error || `${args.property} is not a valid unit rate`;
        },
      },
    });
  };
}

/**
 * Validates GST rate (0, 5, 12, 18, 28).
 */
export function IsValidGstRate(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidGstRate',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === undefined || value === null) return true;
          return validateGstRate(value).valid;
        },
        defaultMessage(args: ValidationArguments) {
          const res = validateGstRate(args.value);
          return res.error || `${args.property} must be one of 0%, 5%, 12%, 18%, or 28%`;
        },
      },
    });
  };
}

/**
 * Validates postal PIN code (6 digits).
 */
export function IsValidPin(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidPin',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === undefined || value === null || value === '') return true;
          return validatePostalPin(value).valid;
        },
        defaultMessage(args: ValidationArguments) {
          const res = validatePostalPin(args.value);
          return res.error || `${args.property} must be a 6-digit PIN code`;
        },
      },
    });
  };
}

/**
 * Validates GSTIN (15 chars with checksum).
 */
export function IsValidGstin(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidGstin',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === undefined || value === null || value === '') return true;
          return validateGstin(value).valid;
        },
        defaultMessage(args: ValidationArguments) {
          const res = validateGstin(args.value);
          return res.error || `${args.property} is not a valid GSTIN format or checksum`;
        },
      },
    });
  };
}

/**
 * Validates PAN (10 chars format).
 */
export function IsValidPan(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidPan',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === undefined || value === null || value === '') return true;
          return validatePan(value).valid;
        },
        defaultMessage(args: ValidationArguments) {
          const res = validatePan(args.value);
          return res.error || `${args.property} is not a valid 10-character PAN`;
        },
      },
    });
  };
}

/**
 * Validates IFSC (11 chars).
 */
export function IsValidIfsc(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidIfsc',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === undefined || value === null || value === '') return true;
          return validateIfsc(value).valid;
        },
        defaultMessage(args: ValidationArguments) {
          const res = validateIfsc(args.value);
          return res.error || `${args.property} is not a valid IFSC code`;
        },
      },
    });
  };
}

/**
 * Validates bank account number (9-18 digits).
 */
export function IsValidBankAccount(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidBankAccount',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === undefined || value === null || value === '') return true;
          return validateBankAccount(value).valid;
        },
        defaultMessage(args: ValidationArguments) {
          const res = validateBankAccount(args.value);
          return res.error || `${args.property} must be a 9 to 18-digit bank account number`;
        },
      },
    });
  };
}

/**
 * Validates HTTPS URL (https:// only).
 */
export function IsValidHttpsUrl(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidHttpsUrl',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === undefined || value === null || value === '') return true;
          return validateHttpsUrl(value).valid;
        },
        defaultMessage(args: ValidationArguments) {
          const res = validateHttpsUrl(args.value);
          return res.error || `${args.property} must be a secure HTTPS URL`;
        },
      },
    });
  };
}

/**
 * Validates date (year >= 2000, not more than 10 years ahead).
 */
export function IsValidCustomDate(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidCustomDate',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === undefined || value === null || value === '') return true;
          return validateDate(value).valid;
        },
        defaultMessage(args: ValidationArguments) {
          const res = validateDate(args.value);
          return res.error || `${args.property} must be a valid date between 2000 and 10 years in the future`;
        },
      },
    });
  };
}

