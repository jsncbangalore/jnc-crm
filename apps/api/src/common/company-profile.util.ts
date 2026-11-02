/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { decryptAtRest, encryptAtRest } from './encryption.util';

export interface CompanyProfileCompletenessResult {
  complete: boolean;
  missing: string[];
}

export interface CompletenessOptions {
  isSez?: boolean;
  dtoLutBondNo?: string;
  prisma?: any;
}

/**
 * ONE single source of truth function for company profile completeness.
 *
 * Rules:
 * - Requires Tenant name, address, and gstin.
 * - For bank details: complete if Tenant bank fields (bankName, bankAccountNumber, bankIfsc)
 *   are set OR an active CompanyBankAccount with isDocumentDefault (or isDefault) exists.
 * - Optional: LUT Bond No when isSez is true.
 *
 * Can be called flexibly as:
 * - getCompanyProfileCompleteness(tenantId)
 * - getCompanyProfileCompleteness(prisma, tenantId)
 * - getCompanyProfileCompleteness(tenantId, options)
 * - getCompanyProfileCompleteness(prisma, tenantId, options)
 */
export async function getCompanyProfileCompleteness(
  firstArg: any,
  secondArg?: any,
  thirdArg?: any,
): Promise<CompanyProfileCompletenessResult> {
  let prisma: any;
  let tenantId: string;
  let options: CompletenessOptions = {};

  if (typeof firstArg === 'string') {
    tenantId = firstArg;
    if (secondArg && typeof secondArg === 'object') {
      options = secondArg;
      prisma = options.prisma;
    }
  } else {
    prisma = firstArg;
    tenantId = String(secondArg || '');
    if (thirdArg && typeof thirdArg === 'object') {
      options = thirdArg;
    }
  }

  if (!prisma) {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      address: true,
      gstin: true,
      bankName: true,
      bankAccountNumber: true,
      bankIfsc: true,
      lutBondNo: true,
    },
  });

  if (!tenant) {
    return {
      complete: false,
      missing: ['Company profile not found'],
    };
  }

  const missing: string[] = [];

  // 1. Company Name
  if (!tenant.name?.trim()) {
    missing.push('Company Name');
  }

  // 2. Address
  if (!tenant.address?.trim()) {
    missing.push('Address');
  }

  // 3. GSTIN
  if (!tenant.gstin?.trim()) {
    missing.push('GSTIN');
  }

  // 4. Bank Details
  // Complete if Tenant bank fields are set OR active CompanyBankAccount with isDocumentDefault / isDefault exists
  const hasTenantBank = Boolean(
    tenant.bankName?.trim() &&
    tenant.bankAccountNumber?.trim() &&
    tenant.bankIfsc?.trim()
  );

  let hasCompanyBank = false;
  if (!hasTenantBank) {
    const activeBank = await prisma.companyBankAccount.findFirst({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { isDocumentDefault: true },
          { isDefault: true },
        ],
      },
      select: {
        id: true,
        bankName: true,
        accountNumber: true,
        accountNumberLast4: true,
        ifsc: true,
      },
    });

    if (
      activeBank &&
      activeBank.bankName?.trim() &&
      (activeBank.accountNumber || activeBank.accountNumberLast4) &&
      activeBank.ifsc?.trim()
    ) {
      hasCompanyBank = true;
    }
  }

  if (!hasTenantBank && !hasCompanyBank) {
    missing.push('Bank Details');
  }

  // 5. SEZ / LUT Bond No (if applicable)
  if (options?.isSez) {
    const hasLut = Boolean(tenant.lutBondNo?.trim() || options?.dtoLutBondNo?.trim());
    if (!hasLut) {
      missing.push('LUT Bond No');
    }
  }

  return {
    complete: missing.length === 0,
    missing,
  };
}

/**
 * Unified Company Profile builder.
 * Returns the exact same synthesized profile data across all three endpoints:
 * 1. GET /invoices/company-profile
 * 2. GET /invoices/settings/company-profile
 * 3. GET /settings/company-profile
 */
export async function getUnifiedCompanyProfile(prisma: any, tenantId: string) {
  if (!tenantId) {
    return null;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    return null;
  }

  let logoBuffer: Buffer | null = null;
  let logoBase64: string | null = null;

  try {
    const asset = await prisma.brandingAsset.findUnique({
      where: { tenantId_assetType: { tenantId: tenant.id, assetType: 'logo' } },
    });
    if (asset && asset.data) {
      logoBuffer = Buffer.from(asset.data);
      const mime = asset.mimeType || 'image/png';
      logoBase64 = `data:${mime};base64,${logoBuffer.toString('base64')}`;
    }
  } catch {}

  let effectiveBankName = tenant.bankName || '';
  let effectiveBankAccountNumber = tenant.bankAccountNumber || '';
  let effectiveBankIfsc = tenant.bankIfsc || '';
  let effectiveBankBranch = tenant.bankBranch || '';
  let effectiveHolderName = tenant.name || '';
  let effectiveBankUpi = tenant.bankUpi || '';

  try {
    const docBank =
      (await prisma.companyBankAccount.findFirst({
        where: { tenantId: tenant.id, isActive: true, isDocumentDefault: true },
      })) ||
      (await prisma.companyBankAccount.findFirst({
        where: { tenantId: tenant.id, isActive: true, isDefault: true },
      }));

    if (docBank) {
      const rawNum = decryptAtRest(docBank.accountNumber) || docBank.accountNumberLast4;
      effectiveBankName = docBank.bankName || effectiveBankName;
      effectiveBankAccountNumber = rawNum || effectiveBankAccountNumber;
      effectiveBankIfsc = docBank.ifsc || effectiveBankIfsc;
      effectiveBankBranch = docBank.branch || effectiveBankBranch;
      effectiveHolderName = docBank.holderName || tenant.name || effectiveHolderName;
      effectiveBankUpi = docBank.upiId || effectiveBankUpi;
    }
  } catch {}

  const completeness = await getCompanyProfileCompleteness(prisma, tenant.id);

  const resolvedLogoUrl =
    logoBase64 ||
    (tenant.logoUrl && tenant.logoUrl.trim() !== ''
      ? tenant.logoUrl
      : (process.env.PRODUCT_LOGO_URL || ''));

  return {
    ...tenant,
    tenantId: tenant.id,
    companyName: tenant.name,
    tradeName: tenant.name,
    address: tenant.address || '',
    city: tenant.city || '',
    state: tenant.state || '',
    pincode: tenant.pincode || '',
    gstin: tenant.gstin || '',
    pan: tenant.pan || (tenant.gstin && tenant.gstin.length >= 12 ? tenant.gstin.substring(2, 12) : ''),
    phone: tenant.phone || '',
    email: tenant.email || '',
    website: tenant.website || '',
    bankName: effectiveBankName,
    bankAccountNumber: effectiveBankAccountNumber,
    bankIfsc: effectiveBankIfsc,
    bankBranch: effectiveBankBranch,
    bankAccountHolder: effectiveHolderName,
    bankUpi: effectiveBankUpi,
    bankDetails: {
      bankName: effectiveBankName,
      accountNumber: effectiveBankAccountNumber,
      ifscCode: effectiveBankIfsc,
      branch: effectiveBankBranch,
      accountHolderName: effectiveHolderName,
      upiId: effectiveBankUpi,
    },
    lutBondNo: tenant.lutBondNo || '',
    lutValidity: tenant.lutValidity || '',
    logoUrl: resolvedLogoUrl,
    logoBase64,
    logoBuffer,
    invoicePrefix: tenant.invoicePrefix || 'INV',
    isOnboarded: tenant.isOnboarded || false,
    completeness,
  };
}

/**
 * Update full company profile & keep Tenant bank fields in sync with CompanyBankAccount
 * within a single transaction.
 */
export async function updateUnifiedCompanyProfile(
  prisma: any,
  tenantId: string,
  dto: any,
  assetHandlers?: {
    saveDiskAssetCache?: (tenantId: string, assetType: string, mime: string, buf: Buffer) => void;
  },
) {
  return prisma.$transaction(async (tx: any) => {
    const updateData: any = {
      isOnboarded: true,
    };

    const companyName = dto.companyName || dto.name;
    if (companyName !== undefined) updateData.name = companyName?.trim();
    if (dto.phone !== undefined) updateData.phone = dto.phone?.trim();
    if (dto.email !== undefined) updateData.email = dto.email?.trim();
    if (dto.address !== undefined) updateData.address = dto.address?.trim();
    if (dto.city !== undefined) updateData.city = dto.city?.trim();
    if (dto.state !== undefined) updateData.state = dto.state?.trim();
    if (dto.pincode !== undefined) updateData.pincode = dto.pincode?.trim();
    if (dto.website !== undefined) updateData.website = dto.website?.trim();
    if (dto.gstin !== undefined) updateData.gstin = dto.gstin?.trim()?.toUpperCase();
    if (dto.pan !== undefined) updateData.pan = dto.pan?.trim()?.toUpperCase();
    if (dto.lutBondNo !== undefined) updateData.lutBondNo = dto.lutBondNo?.trim();
    if (dto.lutValidity !== undefined) updateData.lutValidity = dto.lutValidity?.trim();
    if (dto.invoicePrefix !== undefined) updateData.invoicePrefix = dto.invoicePrefix?.trim()?.toUpperCase();
    if (dto.invoiceTerms !== undefined) updateData.invoiceTerms = dto.invoiceTerms?.trim();
    if (dto.signatoryName !== undefined) updateData.signatoryName = dto.signatoryName?.trim();
    if (dto.signatoryDesignation !== undefined) updateData.signatoryDesignation = dto.signatoryDesignation?.trim();
    if (dto.requireTwoFactor !== undefined) updateData.requireTwoFactor = Boolean(dto.requireTwoFactor);

    // Handle branding URLs
    if (dto.logoUrl !== undefined) updateData.logoUrl = dto.logoUrl;
    if (dto.signatureUrl !== undefined) updateData.signatureUrl = dto.signatureUrl;
    if (dto.stampUrl !== undefined) updateData.stampUrl = dto.stampUrl;

    // Handle bank details synchronization
    if (dto.bankName && dto.bankAccountNumber) {
      const cleanAcc = String(dto.bankAccountNumber).replace(/\s+/g, '');
      const last4 = cleanAcc.length >= 4 ? cleanAcc.slice(-4) : cleanAcc;
      const cleanIfsc = (dto.bankIfsc || '').trim().toUpperCase();
      const cleanBranch = dto.bankBranch !== undefined ? dto.bankBranch?.trim() : null;
      const cleanUpi = dto.bankUpi !== undefined ? dto.bankUpi?.trim() : null;
      const holder = (companyName?.trim()) || 'Company Account';

      updateData.bankName = dto.bankName.trim();
      updateData.bankAccountNumber = cleanAcc;
      updateData.bankIfsc = cleanIfsc;
      if (cleanBranch !== null) updateData.bankBranch = cleanBranch;
      if (cleanUpi !== null) updateData.bankUpi = cleanUpi;

      const existingBank = await tx.companyBankAccount.findFirst({
        where: {
          tenantId,
          isActive: true,
          OR: [{ isDocumentDefault: true }, { isDefault: true }],
        },
      });

      if (existingBank) {
        await tx.companyBankAccount.update({
          where: { id: existingBank.id },
          data: {
            bankName: dto.bankName.trim(),
            holderName: holder,
            accountNumber: encryptAtRest(cleanAcc)!,
            accountNumberLast4: last4,
            ifsc: cleanIfsc || existingBank.ifsc,
            branch: cleanBranch !== null ? cleanBranch : existingBank.branch,
            upiId: cleanUpi !== null ? cleanUpi : existingBank.upiId,
            isDefault: true,
            isDocumentDefault: true,
            isActive: true,
          },
        });
      } else {
        await tx.companyBankAccount.create({
          data: {
            tenantId,
            label: 'Primary Settlement Account',
            bankName: dto.bankName.trim(),
            holderName: holder,
            accountNumber: encryptAtRest(cleanAcc)!,
            accountNumberLast4: last4,
            ifsc: cleanIfsc,
            branch: cleanBranch || '',
            upiId: cleanUpi || '',
            isDefault: true,
            isDocumentDefault: true,
            isActive: true,
          },
        });
      }
    } else {
      // If bank fields are not in the update payload, sync from the active default CompanyBankAccount
      const defaultBank = await tx.companyBankAccount.findFirst({
        where: {
          tenantId,
          isActive: true,
          OR: [{ isDocumentDefault: true }, { isDefault: true }],
        },
      });

      if (defaultBank && (updateData.bankName === undefined || updateData.bankAccountNumber === undefined)) {
        const rawNum = decryptAtRest(defaultBank.accountNumber) || defaultBank.accountNumberLast4;
        updateData.bankName = defaultBank.bankName;
        updateData.bankAccountNumber = rawNum;
        updateData.bankIfsc = defaultBank.ifsc;
        updateData.bankBranch = defaultBank.branch;
        updateData.bankUpi = defaultBank.upiId;
      }
    }

    await tx.tenant.update({
      where: { id: tenantId },
      data: updateData,
    });

    return getUnifiedCompanyProfile(tx, tenantId);
  });
}

