/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

// Top common passwords snippet (frequently targeted)
const TOP_COMMON_PASSWORDS = new Set([
  'password', 'password123', '123456789012', 'admin12345678', 'welcome12345',
  'administrator', 'qwertyuiop12', 'iloveyou1234', 'changeme1234', 'letmein12345',
  'networkadmin123', 'crmadmin1234', 'company12345', 'supersecret1', 'passw0rd1234',
  '1234567890123', 'abcdefghijklm', '098765432112', 'pass12345678', 'system123456',
  'master123456', 'trustno11234', 'dragon123456', 'football1234', 'monkey123456',
  'sunshine1234', 'princess1234', 'solo12345678', 'starwars1234', 'shadow123456'
]);

export interface PasswordValidationContext {
  email?: string;
  name?: string;
}

export interface PasswordPolicyRule {
  id: string;
  label: string;
}

export interface PasswordPolicyDto {
  minLength: number;
  maxLength: number;
  rules: PasswordPolicyRule[];
  senderEmail?: string;
}

export function getPasswordPolicy(): PasswordPolicyDto {
  return {
    minLength: 12,
    maxLength: 200,
    rules: [
      { id: 'minLength', label: 'Minimum 12 characters' },
      { id: 'notCommon', label: 'Cannot be a commonly guessed password' },
      { id: 'noPersonalInfo', label: 'Cannot contain parts of your name or email' },
    ],
  };
}

export function validatePasswordPolicy(password: string, context?: PasswordValidationContext): void {
  if (!password || password.length < 12) {
    throw new BadRequestException('Password must be at least 12 characters in length.');
  }

  const lower = password.toLowerCase();

  for (const common of TOP_COMMON_PASSWORDS) {
    const lettersOnly = lower.replace(/[^a-z]/g, '');
    if (lower === common || lettersOnly === common || (lettersOnly.startsWith(common) && lettersOnly.length <= common.length + 3)) {
      throw new BadRequestException('Password is too common and easily guessed. Please choose a stronger password.');
    }
  }

  if (context?.email) {
    const emailPrefix = context.email.split('@')[0].toLowerCase();
    const genericPrefixes = ['admin', 'platform', 'owner', 'user', 'support', 'info', 'contact', 'team'];
    if (emailPrefix.length >= 3 && !genericPrefixes.includes(emailPrefix) && lower.includes(emailPrefix)) {
      throw new BadRequestException('Password must not contain parts of your email address.');
    }
  }

  if (context?.name) {
    const genericRoleTerms = ['platform', 'super', 'admin', 'administrator', 'user', 'owner', 'manager', 'tenant'];
    const nameParts = context.name
      .toLowerCase()
      .split(/\s+/)
      .filter((p) => p.length >= 3 && !genericRoleTerms.includes(p));
    for (const part of nameParts) {
      if (lower.includes(part)) {
        throw new BadRequestException('Password must not contain your name.');
      }
    }
  }
}

/**
 * Checks if a stored bcrypt hash uses less than 12 rounds.
 */
export function needsRehash(hash: string): boolean {
  try {
    const rounds = bcrypt.getRounds(hash);
    return rounds < 12;
  } catch {
    return false;
  }
}
