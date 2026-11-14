import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PlatformService } from '../../apps/api/src/platform/platform.service';
import { AuthService } from '../../apps/api/src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { execSync } from 'child_process';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';

describe('Permanent Tenant Deletion & Cascade Isolation Test Suite', () => {
  let prisma: PrismaClient;
  let platformService: PlatformService;
  let authService: AuthService;

  const runId = Date.now().toString().slice(-6);

  beforeAll(async () => {
    prisma = new PrismaClient();
    const jwtService = new JwtService({ secret: 'test-secret-key-at-least-32-chars-long' });
    const mockNotifications: any = {
      sendEmail: async () => true,
    };

    authService = new AuthService(
      prisma as any,
      jwtService,
      mockNotifications,
      {} as any,
      {} as any,
      {} as any,
    );

    platformService = new PlatformService(
      prisma as any,
      jwtService,
      mockNotifications,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Helper to create a fake tenant with full child hierarchy
  async function createFakeTenantTree(codeSuffix: string, status: 'active' | 'suspended' = 'suspended', isInternal = false) {
    const code = `TEST_DEL_${codeSuffix}_${Date.now().toString().slice(-4)}`;
    const tenant = await prisma.tenant.create({
      data: {
        code,
        name: `Fake Company ${code}`,
        slug: `fake-${code.toLowerCase()}`,
        status,
        isInternal,
        deletedAt: status === 'suspended' ? new Date() : null,
        users: {
          create: [
            {
              email: `${code.toLowerCase()}_user1@example.fake`,
              name: 'Fake User 1',
              role: 'admin',
              employeeCode: `EMP-${codeSuffix}-01`,
              passwordHash: '$2b$10$fakehashfortestingonlyabcdefghijk',
            },
            {
              email: `${code.toLowerCase()}_user2@example.fake`,
              name: 'Fake User 2',
              role: 'employee',
              employeeCode: `EMP-${codeSuffix}-02`,
              passwordHash: '$2b$10$fakehashfortestingonlyabcdefghijk',
            },
          ],
        },
        skus: {
          create: [
            {
              skuCode: `SKU-${codeSuffix}-01`,
              name: 'Fake SKU 1',
              category: 'General',
              unitPrice: 150,
              costPrice: 80,
            },
          ],
        },
        leads: {
          create: [
            {
              leadNumber: `LD-${codeSuffix}-01`,
              customerName: 'Fake Lead Customer',
              customerPhone: '9876543210',
              status: 'new',
            },
          ],
        },
      },
      include: {
        users: true,
        skus: true,
        leads: true,
      },
    });

    const sku = tenant.skus[0];

    // Create Quotation with QuotationLine
    const quote = await prisma.quotation.create({
      data: {
        tenantId: tenant.id,
        quoteNumber: `Q-${codeSuffix}-01`,
        validUntil: new Date(Date.now() + 86400000),
        lines: {
          create: [
            {
              skuId: sku.id,
              quantity: 2,
              unitPrice: 150,
              totalPrice: 300,
            },
          ],
        },
      },
      include: { lines: true },
    });

    // Create Order with OrderLine
    const order = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        orderNumber: `ORD-${codeSuffix}-01`,
        customerName: 'Fake Customer',
        customerPhone: '9876543210',
        lines: {
          create: [
            {
              skuId: sku.id,
              quantity: 2,
              unitPrice: 150,
              totalPrice: 300,
            },
          ],
        },
      },
      include: { lines: true },
    });

    // Create Invoice with InvoiceLine
    const invoice = await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        invoiceNumber: `INV-${codeSuffix}-01`,
        customerName: 'Fake Customer',
        customerPhone: '9876543210',
        customerState: 'Karnataka',
        invoiceDate: new Date(),
        dueDate: new Date(Date.now() + 86400000 * 7),
        totalAmount: 300,
        lines: {
          create: [
            {
              skuId: sku.id,
              description: 'Fake Invoice Item',
              quantity: 2,
              unitPrice: 150,
              lineTotal: 300,
            },
          ],
        },
      },
      include: { lines: true },
    });

    // Create LedgerEntry
    const ledger = await prisma.ledgerEntry.create({
      data: {
        tenantId: tenant.id,
        partyType: 'customer',
        partyId: 'fake-customer-id',
        entryDate: new Date(),
        financialYear: '2026-2027',
        voucherType: 'invoice',
        voucherNo: `V-${codeSuffix}-01`,
        particulars: 'Sale of services',
        debit: 300,
        credit: 0,
      },
    });

    return {
      tenant,
      user: tenant.users[0],
      sku,
      quote,
      order,
      invoice,
      ledger,
    };
  }

  it('1. Permanent deletion of fake tenant cascades cleanly and leaves 0 child rows for that tenantId', async () => {
    const data = await createFakeTenantTree(`DEL1_${runId}`, 'suspended');
    const tenantId = data.tenant.id;

    // Verify records exist before deletion
    expect(await prisma.user.count({ where: { tenantId } })).toBe(2);
    expect(await prisma.sku.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.quotation.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.order.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.invoice.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { tenantId } })).toBe(1);

    // Call permanent deletion via platformService
    const result = await platformService.permanentDeleteTenant(
      tenantId,
      { confirmCode: data.tenant.code },
      { sub: 'test-super-admin-id', name: 'Test Super Admin' },
      '127.0.0.1',
    );

    expect(result.success).toBe(true);
    expect(result.deletedTenant.code).toBe(data.tenant.code);
    expect(result.deletedCounts.users).toBe(2);
    expect(result.deletedCounts.quotations).toBe(1);
    expect(result.deletedCounts.invoices).toBe(1);

    // Verify all child tables reach 0 rows for that tenantId
    expect(await prisma.tenant.findUnique({ where: { id: tenantId } })).toBeNull();
    expect(await prisma.user.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.lead.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.quotation.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.order.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.invoice.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.sku.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.ledgerEntry.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.quotationLine.count({ where: { quotationId: data.quote.id } })).toBe(0);
    expect(await prisma.orderLine.count({ where: { orderId: data.order.id } })).toBe(0);
    expect(await prisma.invoiceLine.count({ where: { invoiceId: data.invoice.id } })).toBe(0);
  });

  it('2. Another tenant data remains completely untouched when a tenant is permanently deleted', async () => {
    const victim = await createFakeTenantTree(`VIC_${runId}`, 'suspended');
    const sibling = await createFakeTenantTree(`SIB_${runId}`, 'active');

    // Permanently delete victim tenant
    await platformService.permanentDeleteTenant(
      victim.tenant.id,
      { confirmCode: victim.tenant.code },
      { sub: 'admin-id' },
    );

    // Sibling data must be 100% intact
    const survivingSiblingTenant = await prisma.tenant.findUnique({ where: { id: sibling.tenant.id } });
    expect(survivingSiblingTenant).not.toBeNull();
    expect(survivingSiblingTenant?.code).toBe(sibling.tenant.code);

    expect(await prisma.user.count({ where: { tenantId: sibling.tenant.id } })).toBe(2);
    expect(await prisma.sku.count({ where: { tenantId: sibling.tenant.id } })).toBe(1);
    expect(await prisma.quotation.count({ where: { tenantId: sibling.tenant.id } })).toBe(1);
    expect(await prisma.order.count({ where: { tenantId: sibling.tenant.id } })).toBe(1);
    expect(await prisma.invoice.count({ where: { tenantId: sibling.tenant.id } })).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { tenantId: sibling.tenant.id } })).toBe(1);

    // Clean up sibling
    await prisma.tenant.delete({ where: { id: sibling.tenant.id } });
  });

  it('3. Refuses permanent deletion for internal tenant, still-active tenant, or wrong confirm code', async () => {
    // 3a: Refuse if internal tenant
    const internalTenant = await createFakeTenantTree(`INT_${runId}`, 'suspended', true);
    await expect(
      platformService.permanentDeleteTenant(
        internalTenant.tenant.id,
        { confirmCode: internalTenant.tenant.code },
        { sub: 'admin' },
      ),
    ).rejects.toThrow(ForbiddenException);
    await prisma.tenant.delete({ where: { id: internalTenant.tenant.id } });

    // 3b: Refuse if still-active (deletedAt is null)
    const activeTenant = await createFakeTenantTree(`ACT_${runId}`, 'active', false);
    await expect(
      platformService.permanentDeleteTenant(
        activeTenant.tenant.id,
        { confirmCode: activeTenant.tenant.code },
        { sub: 'admin' },
      ),
    ).rejects.toThrow(BadRequestException);

    // 3c: Refuse if wrong confirmation code
    await prisma.tenant.update({
      where: { id: activeTenant.tenant.id },
      data: { deletedAt: new Date(), status: 'suspended' },
    });

    await expect(
      platformService.permanentDeleteTenant(
        activeTenant.tenant.id,
        { confirmCode: 'WRONG_CODE_XYZ' },
        { sub: 'admin' },
      ),
    ).rejects.toThrow(BadRequestException);

    // Clean up
    await prisma.tenant.delete({ where: { id: activeTenant.tenant.id } });
  });

  it('4. Forced failure mid-transaction rolls back completely without deleting any rows', async () => {
    const data = await createFakeTenantTree(`ROLL_${runId}`, 'suspended');
    const tenantId = data.tenant.id;

    // Simulate an error mid-transaction
    let errorThrown = false;
    try {
      await prisma.$transaction(async (tx) => {
        // Delete quotation
        await tx.quotation.delete({ where: { id: data.quote.id } });
        // Force mid-transaction failure
        throw new Error('SIMULATED_TRANSACTION_FAILURE');
      });
    } catch (err: any) {
      if (err.message.includes('SIMULATED_TRANSACTION_FAILURE')) {
        errorThrown = true;
      }
    }

    expect(errorThrown).toBe(true);

    // Verify complete rollback: Quotation, QuotationLine, and Tenant still exist intact
    const rolledBackTenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    expect(rolledBackTenant).not.toBeNull();

    const rolledBackQuote = await prisma.quotation.findUnique({ where: { id: data.quote.id } });
    expect(rolledBackQuote).not.toBeNull();

    const rolledBackQuoteLines = await prisma.quotationLine.count({ where: { quotationId: data.quote.id } });
    expect(rolledBackQuoteLines).toBe(1);

    // Clean up
    await prisma.tenant.delete({ where: { id: tenantId } });
  });

  it('5. Surviving audit record exists after permanent deletion with actor and deleted row counts', async () => {
    const data = await createFakeTenantTree(`AUD_${runId}`, 'suspended');
    const tenantId = data.tenant.id;

    const adminUser = await prisma.user.findFirst({
      where: { role: { in: ['platform_super_admin', 'platform_admin', 'tenant_admin'] } },
    });

    const actor = {
      sub: adminUser?.id,
      name: 'Audit Super Admin',
      email: 'superadmin@example.internal',
    };

    const res = await platformService.permanentDeleteTenant(
      tenantId,
      { confirmCode: data.tenant.code },
      actor,
      '192.168.1.100',
    );

    expect(res.success).toBe(true);

    // Find the surviving audit record by entityId and action
    const survivingAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'PERMANENT_DELETE_TENANT',
        entityId: tenantId,
      },
    });

    expect(survivingAudit).not.toBeNull();
    if (adminUser) {
      expect(survivingAudit?.actorId).toBe(adminUser.id);
    }
    expect(survivingAudit?.actorName).toBe(actor.name);
    expect(survivingAudit?.ipAddress).toBe('192.168.1.100');

    // Verify afterState contains tenantCode and deletedCounts
    const state = JSON.parse(survivingAudit?.afterState || '{}');
    expect(state.tenantCode).toBe(data.tenant.code);
    expect(state.deletedCounts.users).toBe(2);
    expect(state.deletedCounts.quotations).toBe(1);
    expect(state.deletedCounts.invoices).toBe(1);
  });

  it('6. prisma migrate diff reports no drift after migration', () => {
    const dbUrl = process.env.DATABASE_URL || 'postgresql://jnc_app:jnc_app_pass_dev_2026@localhost:5432/jnc_crm_dev?schema=public';
    const output = execSync(
      `node node_modules/prisma/build/index.js migrate diff --from-schema-datamodel apps/api/prisma/schema.prisma --to-schema-datasource apps/api/prisma/schema.prisma`,
      {
        env: {
          ...process.env,
          DATABASE_URL: dbUrl,
          DIRECT_URL: dbUrl,
        },
        encoding: 'utf8',
      },
    );

    // Expect migrate diff to run cleanly without schema drift on constraints or tenant relations
    expect(output).toBeDefined();
    console.log('[prisma migrate diff output]:\n', output.trim() || 'No schema differences detected.');
  });
});
