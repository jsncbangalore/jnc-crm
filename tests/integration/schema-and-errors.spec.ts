import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';
import { PrismaClient, Prisma } from '@prisma/client';
import { GlobalHttpExceptionFilter } from '../../apps/api/src/common/http-exception.filter';
import { getMigrationStatus } from '../../apps/api/src/common/migration-status.util';
import { PaymentsService } from '../../apps/api/src/payments/payments.service';
import { CompaniesService } from '../../apps/api/src/companies/companies.service';
import { HttpException, HttpStatus } from '@nestjs/common';

const THROWAWAY_DB = 'jnc_crm_throwaway_schema_tests';
const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/postgres?schema=public';
const THROWAWAY_URL = `postgresql://postgres:postgres@localhost:5432/${THROWAWAY_DB}?schema=public`;

describe('Item 12: Schema Guard, Error Taxonomy, and Unregistered Receipts', () => {
  let adminPrisma: PrismaClient;
  let testPrisma: PrismaClient;
  let filter: GlobalHttpExceptionFilter;
  let paymentsService: PaymentsService;
  let companiesService: CompaniesService;
  let testTenantId: string;
  let testUserId: string;

  beforeAll(async () => {
    adminPrisma = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });

    // Clean up any lingering throwaway DB
    try {
      await adminPrisma.$executeRawUnsafe(`
        SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
        WHERE datname = '${THROWAWAY_DB}' AND pid <> pg_backend_pid();
      `);
      await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${THROWAWAY_DB}";`);
    } catch (_) {}

    // Create fresh database
    await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${THROWAWAY_DB}";`);

    // Deploy all migrations
    const schemaPath = path.resolve(process.cwd(), 'apps/api/prisma/schema.prisma');
    execSync(`node node_modules/prisma/build/index.js migrate deploy --schema="${schemaPath}"`, {
      stdio: 'pipe',
      env: {
        ...process.env,
        DATABASE_URL: THROWAWAY_URL,
        DIRECT_URL: THROWAWAY_URL,
      },
    });

    testPrisma = new PrismaClient({ datasources: { db: { url: THROWAWAY_URL } } });
    filter = new GlobalHttpExceptionFilter();
    const mockAuditService = { log: async () => {} };
    paymentsService = new PaymentsService(testPrisma, mockAuditService as any, {} as any);
    companiesService = new CompaniesService(testPrisma, {} as any, mockAuditService as any);

    // Seed base test tenant and user
    testTenantId = 'throwaway-tenant-01';
    await testPrisma.tenant.create({
      data: {
        id: testTenantId,
        name: 'Throwaway Test Tenant',
        code: 'TT01',
        slug: 'throwaway-test-tenant',
      },
    });

    testUserId = 'throwaway-user-01';
    await testPrisma.user.create({
      data: {
        id: testUserId,
        tenantId: testTenantId,
        email: 'tester@example.com',
        name: 'Throwaway Tester',
        role: 'tenant_admin',
        employeeCode: 'TEST01',
        passwordHash: 'dummy_hash',
      },
    });
  });

  afterAll(async () => {
    await testPrisma?.$disconnect();
    try {
      await adminPrisma.$executeRawUnsafe(`
        SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
        WHERE datname = '${THROWAWAY_DB}' AND pid <> pg_backend_pid();
      `);
      await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${THROWAWAY_DB}";`);
    } catch (_) {}
    await adminPrisma?.$disconnect();
  });

  function createMockHost() {
    let responseStatus: number = 200;
    let responseBody: any = null;

    const mockResponse = {
      status: (code: number) => {
        responseStatus = code;
        return {
          json: (body: any) => {
            responseBody = body;
          },
        };
      },
    };

    const mockRequest = {
      method: 'GET',
      url: '/api/v1/orders',
      headers: { 'x-request-id': 'req-test-999' },
      user: { id: testUserId, tenantId: testTenantId },
    };

    const mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as any;

    return {
      host: mockHost,
      getStatus: () => responseStatus,
      getBody: () => responseBody,
    };
  }

  // --------------------------------------------------------------------------
  // 1. Missing Column Simulation (P2022 -> 503 SCHEMA_OUT_OF_DATE)
  // --------------------------------------------------------------------------
  it('simulates a missing column and asserts HTTP 503 SCHEMA_OUT_OF_DATE and safe details', async () => {
    // Drop a test column on throwaway database
    await testPrisma.$executeRawUnsafe(`ALTER TABLE "PaymentRecord" DROP COLUMN IF EXISTS "deductions";`);

    let caughtPrismaError: any = null;
    try {
      // Query that expects the deductions column
      await testPrisma.paymentRecord.findFirst({
        where: { tenantId: testTenantId },
      });
    } catch (err) {
      caughtPrismaError = err;
    }

    expect(caughtPrismaError).toBeDefined();
    expect(caughtPrismaError).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(caughtPrismaError.code).toBe('P2022'); // Column does not exist

    const mock = createMockHost();
    filter.catch(caughtPrismaError, mock.host);

    expect(mock.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    const body = mock.getBody();
    expect(body.code).toBe('SCHEMA_OUT_OF_DATE');
    expect(body.message).toContain('The system needs an update. Nothing was lost.');
    expect(body.requestId).toBe('req-test-999');
    expect(body.field).toBe('deductions');

    // Restore column
    await testPrisma.$executeRawUnsafe(`ALTER TABLE "PaymentRecord" ADD COLUMN "deductions" JSONB DEFAULT '[]'::jsonb;`);
  });

  // --------------------------------------------------------------------------
  // 2. Schema Guard & Startup Refusal Assertions
  // --------------------------------------------------------------------------
  it('detects pending migrations and asserts startup refusal condition', async () => {
    // Fake a missing applied migration in _prisma_migrations
    const latestMigration = await testPrisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1;
    `;
    expect(latestMigration.length).toBeGreaterThan(0);
    const removedMigration = latestMigration[0].migration_name;

    // Delete it to simulate a database behind by one migration
    await testPrisma.$executeRawUnsafe(
      `DELETE FROM _prisma_migrations WHERE migration_name = '${removedMigration}';`
    );

    const status = await getMigrationStatus(testPrisma);
    expect(status.isReady).toBe(false);
    expect(status.pending).toContain(removedMigration);

    // Restore record
    await testPrisma.$executeRawUnsafe(`
      INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (gen_random_uuid(), 'checksum', NOW(), '${removedMigration}', NULL, NULL, NOW(), 1);
    `);

    const restoredStatus = await getMigrationStatus(testPrisma);
    expect(restoredStatus.isReady).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 3. Error Taxonomy: P2002, P2003, P2025
  // --------------------------------------------------------------------------
  it('asserts P2002 duplicate unique constraint is mapped to 409 DUPLICATE with target field', async () => {
    let p2002Err: any = null;
    try {
      // Create duplicate user email
      await testPrisma.user.create({
        data: {
          tenantId: testTenantId,
          email: 'tester@example.com', // Duplicate email
          name: 'Another User',
          role: 'tenant_admin',
          employeeCode: 'TEST02',
          passwordHash: 'dummy',
        },
      });
    } catch (err) {
      p2002Err = err;
    }

    expect(p2002Err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(p2002Err.code).toBe('P2002');

    const mock = createMockHost();
    filter.catch(p2002Err, mock.host);

    expect(mock.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(mock.getBody().code).toBe('DUPLICATE');
    expect(mock.getBody().field).toContain('email');
    expect(mock.getBody().message).toContain('email');
  });

  it('asserts P2003 foreign key violation is mapped to 409 LINKED_RECORD_MISSING with field', async () => {
    let p2003Err: any = null;
    try {
      // Insert PaymentRecord with non-existent customerId
      await testPrisma.paymentRecord.create({
        data: {
          tenantId: testTenantId,
          customerId: '00000000-0000-0000-0000-000000000000',
          amount: 500,
          paymentType: 'receipt',
          paymentMethod: 'Cash',
          paymentDate: new Date(),
          recordedById: testUserId,
        },
      });
    } catch (err) {
      p2003Err = err;
    }

    expect(p2003Err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(p2003Err.code).toBe('P2003');

    const mock = createMockHost();
    filter.catch(p2003Err, mock.host);

    expect(mock.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(mock.getBody().code).toBe('LINKED_RECORD_MISSING');
    expect(mock.getBody().field).toBe('customerId');
  });

  it('asserts P2025 record not found is mapped to 404 NOT_FOUND', async () => {
    let p2025Err: any = null;
    try {
      await testPrisma.invoice.update({
        where: { id: '00000000-0000-0000-0000-000000000000' },
        data: { notes: 'Should fail' },
      });
    } catch (err) {
      p2025Err = err;
    }

    expect(p2025Err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(p2025Err.code).toBe('P2025');

    const mock = createMockHost();
    filter.catch(p2025Err, mock.host);

    expect(mock.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(mock.getBody().code).toBe('NOT_FOUND');
    expect(mock.getBody().message.toLowerCase()).toContain('invoice');
  });

  // --------------------------------------------------------------------------
  // 4. Receipt on Unregistered Party Interception & Registration Flow
  // --------------------------------------------------------------------------
  it('refuses synthetic party ID in record payment and enforces customer registration', async () => {
    const syntheticPartyId = `unlinked:${encodeURIComponent('Beta Electronics')}:${encodeURIComponent('29ABCDE1234F1Z5')}`;

    let error: any = null;
    try {
      await paymentsService.record(
        {
          customerId: syntheticPartyId,
          amount: 1500,
          paymentType: 'receipt',
          paymentMethod: 'Bank Transfer',
          reference: 'HDFC00012345678',
          paymentDate: new Date().toISOString(),
        } as any,
        { id: testUserId, tenantId: testTenantId, role: 'tenant_admin' } as any
      );
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    const resp = error.getResponse();
    expect(resp.code).toBe('LINKED_RECORD_MISSING');
    expect(resp.field).toBe('customerId');
    expect(resp.message).toBe('This customer is not registered yet.');
  });

  it('tests registerAndLink for sk-like parties, identical names, and party with GSTIN', async () => {
    const user = { id: testUserId, tenantId: testTenantId, role: 'tenant_admin' } as any;

    // Create unlinked invoices
    const inv1 = await testPrisma.invoice.create({
      data: {
        tenantId: testTenantId,
        invoiceNumber: 'INV/TEST/001',
        customerName: 'SK Enterprises',
        customerPhone: '+919876543210',
        customerGstin: '29ABCDE5678F1Z2',
        totalAmount: 5000,
        subtotal: 5000,
        balanceDue: 5000,
        docType: 'tax_invoice',
        invoiceDate: new Date(),
        createdById: testUserId,
      },
    });

    const inv2 = await testPrisma.invoice.create({
      data: {
        tenantId: testTenantId,
        invoiceNumber: 'INV/TEST/002',
        customerName: 'sk enterprises', // Same name, lowercase
        customerPhone: '+919876543210',
        customerGstin: '29ABCDE5678F1Z2',
        totalAmount: 3000,
        subtotal: 3000,
        balanceDue: 3000,
        docType: 'tax_invoice',
        invoiceDate: new Date(),
        createdById: testUserId,
      },
    });

    // Call registerAndLink
    const result = await companiesService.registerAndLink(
      {
        name: 'SK Enterprises',
        gstin: '29ABCDE5678F1Z2',
        phone: '+919876543210',
        email: 'billing@skenterprises.example.com',
      },
      user
    );

    expect(result.success).toBe(true);
    expect(result.company.id).toBeDefined();
    expect(result.company.name).toBe('SK Enterprises');
    expect(result.linkedInvoicesCount).toBe(2);

    // Verify invoices are now linked to the newly created company
    const updatedInvs = await testPrisma.invoice.findMany({
      where: { id: { in: [inv1.id, inv2.id] } },
    });
    expect(updatedInvs[0].customerId).toBe(result.company.id);
    expect(updatedInvs[1].customerId).toBe(result.company.id);
  });

  // --------------------------------------------------------------------------
  // 5. Component Crash and Client Error Logging
  // --------------------------------------------------------------------------
  it('stores client error crash with page name, route, componentStack and reference ID', async () => {
    const errorPayload = {
      id: 'err-test-crash-uuid',
      referenceId: 'ERR-CRASH-8812',
      page: 'OrdersPage',
      route: '/orders',
      message: 'Cannot read properties of undefined (reading ordersList)',
      componentStack: 'in OrdersPage\n    in Route\n    in ErrorBoundary',
      buildVersion: '1.0.0-build.42',
    };

    const record = await testPrisma.clientError.create({
      data: {
        id: errorPayload.referenceId,
        tenant: { connect: { id: testTenantId } },
        user: { connect: { id: testUserId } },
        page: errorPayload.page,
        route: errorPayload.route,
        message: errorPayload.message,
        componentStack: errorPayload.componentStack,
        buildVersion: errorPayload.buildVersion,
      },
    });

    expect(record.id).toBe('ERR-CRASH-8812');
    expect(record.page).toBe('OrdersPage');

    const fetched = await testPrisma.clientError.findUnique({
      where: { id: 'ERR-CRASH-8812' },
    });
    expect(fetched).not.toBeNull();
    expect(fetched?.message).toBe(errorPayload.message);
  });
});
