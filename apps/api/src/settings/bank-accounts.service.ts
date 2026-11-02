/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopedUser } from '../auth/scoping.service';
import { encryptAtRest, decryptAtRest } from '../common/encryption.util';
import {
  validateBankAccount,
  validateIfsc,
  validateUpiId,
} from '@crm/shared-validation';

export interface CreateBankAccountDto {
  label?: string;
  bankName: string;
  holderName?: string;
  accountNumber: string;
  ifsc: string;
  branch?: string;
  upiId?: string;
  isDefault?: boolean;
  isDocumentDefault?: boolean;
}

export interface UpdateBankAccountDto {
  label?: string;
  bankName?: string;
  holderName?: string;
  accountNumber?: string;
  ifsc?: string;
  branch?: string;
  upiId?: string;
  isDefault?: boolean;
  isDocumentDefault?: boolean;
  isActive?: boolean;
}

@Injectable()
export class BankAccountsService {
  private readonly logger = new Logger(BankAccountsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List company bank accounts for tenant.
   * Safe view: never exposes plain account number, returns last4 digits.
   */
  async findAll(tenantId: string, includeInactive = false) {
    const where: any = { tenantId };
    if (!includeInactive) {
      where.isActive = true;
    }

    const accounts = await this.prisma.companyBankAccount.findMany({
      where,
      orderBy: [
        { isDefault: 'desc' },
        { isDocumentDefault: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    if (accounts.length === 0) {
      try {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: {
            id: true,
            name: true,
            bankName: true,
            bankAccountNumber: true,
            bankIfsc: true,
            bankBranch: true,
            bankUpi: true,
          },
        });

        if (tenant && (tenant.bankName || tenant.bankAccountNumber)) {
          const rawNum = tenant.bankAccountNumber ? String(tenant.bankAccountNumber).replace(/\s+/g, '') : '';
          const last4 = rawNum.length >= 4 ? rawNum.slice(-4) : (rawNum || '0000');
          const bName = tenant.bankName || 'Company Bank';
          return [
            {
              id: `tenant-${tenant.id}`,
              label: tenant.name || 'Primary Settlement Account',
              bankName: bName,
              holderName: tenant.name || 'Company Account',
              accountNumberLast4: last4,
              maskedAccount: `••••${last4}`,
              displayLabel: `${bName} ••••${last4}`,
              ifsc: tenant.bankIfsc || '',
              branch: tenant.bankBranch || '',
              upiId: tenant.bankUpi || '',
              isDefault: true,
              isDocumentDefault: true,
              isActive: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ];
        }
      } catch {
        // Safe fallback
      }
    }

    return accounts.map((acc) => ({
      id: acc.id,
      label: acc.label,
      bankName: acc.bankName,
      holderName: acc.holderName,
      accountNumberLast4: acc.accountNumberLast4,
      maskedAccount: `••••${acc.accountNumberLast4}`,
      displayLabel: `${acc.bankName} ••••${acc.accountNumberLast4}`,
      ifsc: acc.ifsc,
      branch: acc.branch,
      upiId: acc.upiId,
      isDefault: acc.isDefault,
      isDocumentDefault: acc.isDocumentDefault,
      isActive: acc.isActive,
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt,
    }));
  }

  /**
   * Get single account by id.
   */
  async findOne(tenantId: string, id: string) {
    const acc = await this.prisma.companyBankAccount.findFirst({
      where: { id, tenantId },
    });
    if (!acc) {
      throw new NotFoundException(`Bank account ${id} not found.`);
    }

    return {
      id: acc.id,
      label: acc.label,
      bankName: acc.bankName,
      holderName: acc.holderName,
      accountNumberLast4: acc.accountNumberLast4,
      maskedAccount: `••••${acc.accountNumberLast4}`,
      displayLabel: `${acc.bankName} ••••${acc.accountNumberLast4}`,
      ifsc: acc.ifsc,
      branch: acc.branch,
      upiId: acc.upiId,
      isDefault: acc.isDefault,
      isDocumentDefault: acc.isDocumentDefault,
      isActive: acc.isActive,
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt,
    };
  }

  /**
   * Create a new company bank account with AES-256-GCM encryption at rest.
   */
  async create(tenantId: string, dto: CreateBankAccountDto, user: ScopedUser) {
    if (!dto.bankName?.trim()) {
      throw new BadRequestException('Bank name is required.');
    }

    // Shared account number validation (9-18 digits)
    const accCheck = validateBankAccount(dto.accountNumber, true);
    if (!accCheck.valid) {
      throw new BadRequestException(accCheck.error);
    }
    const rawAccount = accCheck.value;
    const last4 = rawAccount.slice(-4);

    // Shared IFSC validation (11 characters)
    const ifscCheck = validateIfsc(dto.ifsc, true);
    if (!ifscCheck.valid) {
      throw new BadRequestException(ifscCheck.error);
    }
    const cleanIfsc = ifscCheck.value;

    // Shared UPI ID validation (optional)
    let cleanUpi: string | undefined = undefined;
    if (dto.upiId?.trim()) {
      const upiCheck = validateUpiId(dto.upiId, false);
      if (!upiCheck.valid) {
        throw new BadRequestException(upiCheck.error);
      }
      cleanUpi = upiCheck.value;
    }

    // Encrypt account number at rest
    const encryptedAccount = encryptAtRest(rawAccount);
    if (!encryptedAccount) {
      throw new BadRequestException('Failed to encrypt account number.');
    }

    const count = await this.prisma.companyBankAccount.count({ where: { tenantId } });
    const isFirst = count === 0;
    const shouldBeDefault = isFirst || Boolean(dto.isDefault);
    const shouldBeDocDefault = isFirst || Boolean(dto.isDocumentDefault);

    const label = dto.label?.trim() || `${dto.bankName.trim()} (••••${last4})`;

    return this.prisma.$transaction(async (tx) => {
      if (shouldBeDefault) {
        await tx.companyBankAccount.updateMany({
          where: { tenantId },
          data: { isDefault: false },
        });
      }

      if (shouldBeDocDefault) {
        await tx.companyBankAccount.updateMany({
          where: { tenantId },
          data: { isDocumentDefault: false },
        });
      }

      const created = await tx.companyBankAccount.create({
        data: {
          tenantId,
          label,
          bankName: dto.bankName.trim(),
          holderName: dto.holderName?.trim() || null,
          accountNumber: encryptedAccount,
          accountNumberLast4: last4,
          ifsc: cleanIfsc,
          branch: dto.branch?.trim() || null,
          upiId: cleanUpi || null,
          isDefault: shouldBeDefault,
          isDocumentDefault: shouldBeDocDefault,
          isActive: true,
        },
      });

      // Synchronize primary tenant banking fields for document templates & settings
      if (shouldBeDocDefault || shouldBeDefault) {
        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            bankName: created.bankName,
            bankAccountNumber: rawAccount,
            bankIfsc: created.ifsc,
            bankBranch: created.branch,
            bankUpi: created.upiId,
          },
        });
      }

      return {
        id: created.id,
        label: created.label,
        bankName: created.bankName,
        holderName: created.holderName,
        accountNumberLast4: created.accountNumberLast4,
        maskedAccount: `••••${created.accountNumberLast4}`,
        displayLabel: `${created.bankName} ••••${created.accountNumberLast4}`,
        ifsc: created.ifsc,
        branch: created.branch,
        upiId: created.upiId,
        isDefault: created.isDefault,
        isDocumentDefault: created.isDocumentDefault,
        isActive: created.isActive,
      };
    });
  }

  /**
   * Update company bank account.
   */
  async update(tenantId: string, id: string, dto: UpdateBankAccountDto, user: ScopedUser) {
    const existing = await this.prisma.companyBankAccount.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Bank account ${id} not found.`);
    }

    const data: any = {};

    if (dto.bankName !== undefined) {
      if (!dto.bankName.trim()) throw new BadRequestException('Bank name cannot be empty.');
      data.bankName = dto.bankName.trim();
    }

    if (dto.label !== undefined) {
      data.label = dto.label.trim();
    }

    if (dto.holderName !== undefined) {
      data.holderName = dto.holderName.trim() || null;
    }

    let rawAccount: string | undefined;
    if (dto.accountNumber !== undefined && dto.accountNumber.trim()) {
      const accCheck = validateBankAccount(dto.accountNumber, true);
      if (!accCheck.valid) {
        throw new BadRequestException(accCheck.error);
      }
      rawAccount = accCheck.value;
      data.accountNumber = encryptAtRest(rawAccount);
      data.accountNumberLast4 = rawAccount.slice(-4);
    }

    if (dto.ifsc !== undefined) {
      const ifscCheck = validateIfsc(dto.ifsc, true);
      if (!ifscCheck.valid) {
        throw new BadRequestException(ifscCheck.error);
      }
      data.ifsc = ifscCheck.value;
    }

    if (dto.branch !== undefined) {
      data.branch = dto.branch.trim() || null;
    }

    if (dto.upiId !== undefined) {
      if (dto.upiId.trim()) {
        const upiCheck = validateUpiId(dto.upiId, false);
        if (!upiCheck.valid) {
          throw new BadRequestException(upiCheck.error);
        }
        data.upiId = upiCheck.value;
      } else {
        data.upiId = null;
      }
    }

    if (dto.isActive !== undefined) {
      data.isActive = Boolean(dto.isActive);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.companyBankAccount.updateMany({
          where: { tenantId },
          data: { isDefault: false },
        });
        data.isDefault = true;
      }

      if (dto.isDocumentDefault) {
        await tx.companyBankAccount.updateMany({
          where: { tenantId },
          data: { isDocumentDefault: false },
        });
        data.isDocumentDefault = true;
      }

      const updated = await tx.companyBankAccount.update({
        where: { id },
        data,
      });

      if (updated.isDocumentDefault || updated.isDefault) {
        const accNumToUse = rawAccount || decryptAtRest(updated.accountNumber) || updated.accountNumberLast4;
        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            bankName: updated.bankName,
            bankAccountNumber: accNumToUse,
            bankIfsc: updated.ifsc,
            bankBranch: updated.branch,
            bankUpi: updated.upiId,
          },
        });
      }

      return {
        id: updated.id,
        label: updated.label,
        bankName: updated.bankName,
        holderName: updated.holderName,
        accountNumberLast4: updated.accountNumberLast4,
        maskedAccount: `••••${updated.accountNumberLast4}`,
        displayLabel: `${updated.bankName} ••••${updated.accountNumberLast4}`,
        ifsc: updated.ifsc,
        branch: updated.branch,
        upiId: updated.upiId,
        isDefault: updated.isDefault,
        isDocumentDefault: updated.isDocumentDefault,
        isActive: updated.isActive,
      };
    });
  }

  /**
   * Set an account as default payment receiving account.
   */
  async setDefault(tenantId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.companyBankAccount.updateMany({
        where: { tenantId },
        data: { isDefault: false },
      });
      const updated = await tx.companyBankAccount.update({
        where: { id },
        data: { isDefault: true, isActive: true },
      });

      const rawAccount = decryptAtRest(updated.accountNumber) || updated.accountNumberLast4;
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          bankName: updated.bankName,
          bankAccountNumber: rawAccount,
          bankIfsc: updated.ifsc,
          bankBranch: updated.branch,
          bankUpi: updated.upiId,
        },
      });

      return updated;
    });
  }

  /**
   * Set an account as document default (printed on invoices, quotations).
   */
  async setDocumentDefault(tenantId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.companyBankAccount.updateMany({
        where: { tenantId },
        data: { isDocumentDefault: false },
      });
      const updated = await tx.companyBankAccount.update({
        where: { id },
        data: { isDocumentDefault: true, isActive: true },
      });

      const rawAccount = decryptAtRest(updated.accountNumber) || updated.accountNumberLast4;
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          bankName: updated.bankName,
          bankAccountNumber: rawAccount,
          bankIfsc: updated.ifsc,
          bankBranch: updated.branch,
          bankUpi: updated.upiId,
        },
      });

      return updated;
    });
  }

  /**
   * Deactivate a bank account.
   */
  async deactivate(tenantId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.companyBankAccount.update({
        where: { id },
        data: { isActive: false, isDefault: false, isDocumentDefault: false },
      });

      // Synchronize to next active default account or clear tenant fields if none active
      const nextActive = await tx.companyBankAccount.findFirst({
        where: { tenantId, isActive: true },
        orderBy: [{ isDocumentDefault: 'desc' }, { isDefault: 'desc' }, { createdAt: 'asc' }],
      });

      if (nextActive) {
        await tx.companyBankAccount.update({
          where: { id: nextActive.id },
          data: { isDefault: true, isDocumentDefault: true },
        });
        const rawAccount = decryptAtRest(nextActive.accountNumber) || nextActive.accountNumberLast4;
        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            bankName: nextActive.bankName,
            bankAccountNumber: rawAccount,
            bankIfsc: nextActive.ifsc,
            bankBranch: nextActive.branch,
            bankUpi: nextActive.upiId,
          },
        });
      } else {
        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            bankName: null,
            bankAccountNumber: null,
            bankIfsc: null,
            bankBranch: null,
            bankUpi: null,
          },
        });
      }

      return updated;
    });
  }

  /**
   * Activate a bank account.
   */
  async activate(tenantId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const activeCount = await tx.companyBankAccount.count({
        where: { tenantId, isActive: true },
      });
      const isFirst = activeCount === 0;

      const updated = await tx.companyBankAccount.update({
        where: { id },
        data: {
          isActive: true,
          ...(isFirst ? { isDefault: true, isDocumentDefault: true } : {}),
        },
      });

      if (isFirst) {
        const rawAccount = decryptAtRest(updated.accountNumber) || updated.accountNumberLast4;
        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            bankName: updated.bankName,
            bankAccountNumber: rawAccount,
            bankIfsc: updated.ifsc,
            bankBranch: updated.branch,
            bankUpi: updated.upiId,
          },
        });
      }

      return updated;
    });
  }
}
