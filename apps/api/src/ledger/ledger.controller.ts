import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Response } from 'express';
import { LedgerService } from './ledger.service';
import { PostingService } from './posting.service';
import { PaymentsService } from '../payments/payments.service';
import { AuditService } from '../audit/audit.service';
import { PageAccess } from '../auth/page-access.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { requireTenantId } from '../common/tenant.util';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuthGuard } from '@nestjs/passport';
import { generateLedgerStatementPdfBuffer } from './statement-pdf';
import { PrismaClient } from '@prisma/client';

@Controller('ledger')
@PageAccess('ledger')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class LedgerController {
  constructor(
    private readonly ledgerService: LedgerService,
    private readonly postingService: PostingService,
    private readonly paymentsService: PaymentsService,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaClient
  ) {}

  /**
   * Reconciliation: For every customer and supplier, verifies ledger closing balance
   * equals the sum of unpaid document balances, and total receivable on the dashboard
   * equals the sum of customer ledger balances.
   */
  @Get('reconciliation')
  async getReconciliation(@CurrentUser() user: ScopedUser) {
    const tenantId = requireTenantId(user);
    return this.ledgerService.getReconciliation(tenantId);
  }

  /**
   * Unlinked Invoices endpoint for reconciliation and linking
   */
  @Get('unlinked-invoices')
  async getUnlinkedInvoices(@CurrentUser() user: ScopedUser) {
    const tenantId = requireTenantId(user);
    return this.ledgerService.getUnlinkedInvoices(tenantId);
  }

  /**
   * All-years open documents endpoint for payment recording & allocation
   */
  @Get('open-documents')
  async getOpenDocuments(
    @CurrentUser() user: ScopedUser,
    @Query('partyType') partyType: 'customer' | 'supplier',
    @Query('partyId') partyId: string
  ) {
    if (!partyType || !partyId) {
      throw new BadRequestException('partyType and partyId query parameters are required.');
    }
    const tenantId = requireTenantId(user);
    return this.ledgerService.getAllOpenDocuments(tenantId, partyType, partyId);
  }

  /**
   * Get all parties (Customers / Suppliers) with running balance and ageing totals
   */
  @Get('parties')
  async getParties(
    @CurrentUser() user: ScopedUser,
    @Query('type') type?: 'customer' | 'supplier' | 'all',
    @Query('partyType') partyType?: 'customer' | 'supplier' | 'all',
    @Query('search') search?: string
  ) {
    const tenantId = requireTenantId(user);
    const resolvedType = partyType || type || 'all';
    return this.ledgerService.getParties(tenantId, resolvedType, search);
  }

  /**
   * Get ledger statement for a specific customer or supplier
   */
  @Get('statement')
  async getStatement(
    @CurrentUser() user: ScopedUser,
    @Query('partyType') partyType: 'customer' | 'supplier',
    @Query('partyId') partyId: string,
    @Query('financialYear') financialYear?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    if (!partyType || !partyId) {
      throw new BadRequestException('partyType and partyId query parameters are required.');
    }
    const tenantId = requireTenantId(user);
    return this.ledgerService.getStatement(tenantId, partyType, partyId, {
      financialYear,
      startDate,
      endDate,
    });
  }

  /**
   * Download Statement as formal PDF with Document Logo
   */
  @Get('statement/pdf')
  async downloadStatementPdf(
    @CurrentUser() user: ScopedUser,
    @Query('partyType') partyType: 'customer' | 'supplier',
    @Query('partyId') partyId: string,
    @Query('financialYear') financialYear: string,
    @Res() res: Response
  ) {
    if (!partyType || !partyId) {
      throw new BadRequestException('partyType and partyId query parameters are required.');
    }
    const tenantId = requireTenantId(user);
    const statement = await this.ledgerService.getStatement(tenantId, partyType, partyId, {
      financialYear,
    });

    // Fetch tenant profile for Document Logo and company information
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });

    // STRICT: Retrieve Document logo (companyLogoUrl from settings). Never portal logo or default!
    const settingLogo = await this.prisma.systemSetting.findUnique({
      where: { key: `tenant:${tenantId}:branding:companyLogoUrl` },
    });
    const docLogoUrl = settingLogo?.value || tenant?.logoUrl || null;

    const pdfBuffer = await generateLedgerStatementPdfBuffer(statement, {
      companyProfile: {
        companyName: tenant?.name || 'Our Company',
        address: tenant?.address,
        city: tenant?.city,
        state: tenant?.state,
        gstin: tenant?.gstin,
        phone: tenant?.phone,
        email: tenant?.email,
        logoUrl: docLogoUrl,
      },
    });

    const filename = `Statement_${partyType}_${statement.party?.name || 'Party'}_${financialYear || 'FY'}.pdf`.replace(
      /[^a-zA-Z0-9_\-\.]/g,
      '_'
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  }

  /**
   * Record payment (Customer Receipt or Supplier Payment) with allocations
   * Authoritative: Calls PaymentsService.record() - no second payment logic.
   */
  @Post('payments')
  @HttpCode(HttpStatus.OK)
  async recordPayment(
    @CurrentUser() user: ScopedUser,
    @Body()
    dto: {
      partyType: 'customer' | 'supplier';
      partyId: string;
      amount: number;
      paymentDate: string;
      paymentMethod: string;
      reference?: string;
      notes?: string;
      autoAllocate?: boolean;
      allocations?: Array<{ documentId: string; amount: number }>;
      confirmDuplicate?: boolean;
      idempotencyKey?: string;
    },
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ) {
    const allocations = dto.allocations?.map((a) => ({
      invoiceId: a.documentId,
      billId: a.documentId,
      documentId: a.documentId,
      amount: a.amount,
    }));

    return this.paymentsService.record(
      {
        partyType: dto.partyType,
        partyId: dto.partyId,
        customerId: dto.partyType === 'customer' ? dto.partyId : undefined,
        supplierId: dto.partyType === 'supplier' ? dto.partyId : undefined,
        amount: dto.amount,
        paymentDate: dto.paymentDate,
        paymentMethod: dto.paymentMethod,
        transactionRef: dto.reference,
        reference: dto.reference,
        notes: dto.notes,
        autoAllocate: dto.autoAllocate,
        allocations,
        confirmDuplicate: dto.confirmDuplicate,
        idempotencyKey: dto.idempotencyKey || idempotencyKey || xIdempotencyKey,
      },
      user
    );
  }

  /**
   * Manual Entry (Opening, Journal, Credit Note, Debit Note)
   * Restricted to Accountant and Admin roles
   */
  @Post('entries')
  @HttpCode(HttpStatus.CREATED)
  async recordManualEntry(
    @CurrentUser() user: ScopedUser,
    @Body()
    dto: {
      partyType: 'customer' | 'supplier';
      partyId: string;
      voucherType: 'opening' | 'journal' | 'credit_note' | 'debit_note';
      voucherNo: string;
      entryDate: string;
      particulars: string;
      debit?: number;
      credit?: number;
    }
  ) {
    const tenantId = requireTenantId(user);
    return this.ledgerService.recordManualEntry(tenantId, dto, user);
  }

  /**
   * Reverse an existing ledger entry (Immutability guarantee)
   */
  @Post('entries/:id/reverse')
  @HttpCode(HttpStatus.CREATED)
  async reverseEntry(
    @CurrentUser() user: ScopedUser,
    @Param('id') id: string,
    @Body() body: { reason: string }
  ) {
    const tenantId = requireTenantId(user);
    return this.ledgerService.reverseEntry(tenantId, id, user, body?.reason);
  }

  /**
   * Get accounting period lock date
   */
  @Get('lock')
  async getLockDate(@CurrentUser() user: ScopedUser) {
    const tenantId = requireTenantId(user);
    return this.ledgerService.getLockDate(tenantId);
  }

  /**
   * Set accounting period lock date (Accountant and Admin only)
   */
  @Post('lock')
  @HttpCode(HttpStatus.OK)
  async setLockDate(
    @CurrentUser() user: ScopedUser,
    @Body() body: { lockedUntil?: string | null }
  ) {
    const tenantId = requireTenantId(user);
    return this.ledgerService.setLockDate(tenantId, body?.lockedUntil, user);
  }

  /**
   * Rebuild ledger history (Idempotent job, restricted to Admins with dry run by default and audit log)
   */
  @Post('rebuild-history')
  @HttpCode(HttpStatus.OK)
  async rebuildHistory(
    @CurrentUser() user: ScopedUser,
    @Body() body?: { dryRun?: boolean }
  ) {
    const allowedRoles = ['platform_super_admin', 'platform_admin', 'tenant_admin', 'admin'];
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException('Only administrators can rebuild ledger history.');
    }

    const tenantId = requireTenantId(user);
    // Dry run by default
    const dryRun = body?.dryRun !== false;

    const result = await this.postingService.rebuildLedgerHistory(tenantId, {
      dryRun,
    });

    await this.auditService.log({
      tenantId,
      actorId: user.id,
      actorName: (user as any).employeeCode || (user as any).name || 'Admin',
      action: 'REBUILD_LEDGER_HISTORY',
      entityName: 'LedgerEntry',
      entityId: tenantId,
      afterState: {
        dryRun,
        resultSummary: result,
      },
    });

    return result;
  }

  /**
   * Party Source Report: counts only of parties by source, createdBy, and createdAt
   */
  @Get('party-source-report')
  async getPartySourceReport(@CurrentUser() user: ScopedUser) {
    const tenantId = requireTenantId(user);
    return this.ledgerService.getPartySourceReport(tenantId);
  }

  /**
   * Reset Demo Data: strictly restricted to non-production environments (NODE_ENV !== 'production')
   * and platform super administrators only.
   */
  @Post('reset-demo')
  @Roles('platform_super_admin')
  @HttpCode(HttpStatus.OK)
  async resetDemoData(@CurrentUser() user: ScopedUser) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Reset demo data is strictly disabled in production.');
    }
    const tenantId = requireTenantId(user);
    return this.ledgerService.resetDemoData(tenantId, user);
  }
}
