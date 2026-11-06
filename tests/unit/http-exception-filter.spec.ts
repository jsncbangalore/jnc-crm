import { describe, it, expect, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { GlobalHttpExceptionFilter } from '../../apps/api/src/common/http-exception.filter';

function createMockHost(overrides?: { tenantId?: string; userId?: string; route?: string }) {
  let responseStatus = 200;
  let responseJson: any = null;

  const mockResponse = {
    status: vi.fn().mockImplementation((s: number) => {
      responseStatus = s;
      return mockResponse;
    }),
    json: vi.fn().mockImplementation((j: any) => {
      responseJson = j;
      return mockResponse;
    }),
  };

  const mockRequest = {
    headers: { 'x-request-id': 'test-req-12345', 'x-tenant-id': overrides?.tenantId || 'tenant-xyz' },
    user: { id: overrides?.userId || 'user-abc', tenantId: overrides?.tenantId || 'tenant-xyz' },
    method: 'GET',
    url: overrides?.route || '/api/v1/ledger/parties?partyType=customer',
    originalUrl: overrides?.route || '/api/v1/ledger/parties?partyType=customer',
  };

  const mockHost = {
    switchToHttp: () => ({
      getResponse: () => mockResponse,
      getRequest: () => mockRequest,
    }),
  } as any;

  return {
    mockHost,
    mockResponse,
    mockRequest,
    getStatus: () => responseStatus,
    getJson: () => responseJson,
  };
}

describe('GlobalHttpExceptionFilter - Error Taxonomy (API)', () => {
  const filter = new GlobalHttpExceptionFilter();

  it('1. P2002 -> 409 DUPLICATE with the field name', () => {
    const { mockHost, getStatus, getJson } = createMockHost();
    const error = {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: { target: ['invoiceNumber'] },
      message: 'Unique constraint failed on the fields: (`invoiceNumber`)',
    };

    filter.catch(error, mockHost);

    expect(getStatus()).toBe(HttpStatus.CONFLICT); // 409
    const json = getJson();
    expect(json.code).toBe('DUPLICATE');
    expect(json.field).toBe('invoiceNumber');
    expect(json.message).toBe('A record with this invoice number already exists.');
    expect(json.requestId).toBe('test-req-12345');
    expect(json.statusCode).toBe(409);
  });

  it('2. P2003 -> 409 LINKED_RECORD_MISSING with the field name (customerId)', () => {
    const { mockHost, getStatus, getJson } = createMockHost();
    const error = {
      name: 'PrismaClientKnownRequestError',
      code: 'P2003',
      meta: { field_name: 'PaymentRecord_customerId_fkey' },
      message: 'Foreign key constraint failed on the field: `customerId`',
    };

    filter.catch(error, mockHost);

    expect(getStatus()).toBe(HttpStatus.CONFLICT); // 409
    const json = getJson();
    expect(json.code).toBe('LINKED_RECORD_MISSING');
    expect(json.field).toBe('customerId');
    expect(json.message).toBe('This customer is not registered yet.');
    expect(json.requestId).toBe('test-req-12345');
  });

  it('3. P2025 -> 404 NOT_FOUND with the record type', () => {
    const { mockHost, getStatus, getJson } = createMockHost();
    const error = {
      name: 'PrismaClientKnownRequestError',
      code: 'P2025',
      meta: { modelName: 'Invoice', cause: 'Record to update not found.' },
      message: 'An operation failed because it depends on one or more records that were required but not found.',
    };

    filter.catch(error, mockHost);

    expect(getStatus()).toBe(HttpStatus.NOT_FOUND); // 404
    const json = getJson();
    expect(json.code).toBe('NOT_FOUND');
    expect(json.field).toBe('Invoice');
    expect(json.message).toBe('The requested invoice could not be found.');
    expect(json.requestId).toBe('test-req-12345');
  });

  it('4. P2021 and P2022 -> 503 SCHEMA_OUT_OF_DATE with plain administrator message', () => {
    const { mockHost, getStatus, getJson } = createMockHost();
    const error = {
      name: 'PrismaClientKnownRequestError',
      code: 'P2022',
      meta: { modelName: 'PaymentRecord', column: 'PaymentRecord.deductions' },
      message: 'The column PaymentRecord.deductions does not exist in the current database.',
    };

    filter.catch(error, mockHost);

    expect(getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE); // 503
    const json = getJson();
    expect(json.code).toBe('SCHEMA_OUT_OF_DATE');
    expect(json.message).toBe('The system needs an update. Nothing was lost. Ask your administrator.');
    expect(json.field).toBe('deductions');
    expect(json.requestId).toBe('test-req-12345');
  });

  it('5. Other Prisma errors -> 500 INTERNAL with requestId and no stack or table leaks', () => {
    const { mockHost, getStatus, getJson } = createMockHost();
    const error = {
      name: 'PrismaClientKnownRequestError',
      code: 'P2034',
      message: 'Transaction failed due to a write conflict or deadlock on table "public"."orders".',
      stack: 'Error: Transaction failed\n    at internal/prisma.ts:123',
    };

    filter.catch(error, mockHost);

    expect(getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR); // 500
    const json = getJson();
    expect(json.code).toBe('INTERNAL');
    expect(json.message).toBe('An internal database error occurred.');
    expect(json.requestId).toBe('test-req-12345');
    // Stack and raw table name must never be returned to client
    expect(JSON.stringify(json)).not.toContain('internal/prisma.ts');
    expect(JSON.stringify(json)).not.toContain('public.orders');
  });

  it('6. Generic constraint text is never returned to the client', () => {
    const codes = ['P2002', 'P2003', 'P2025', 'P2021', 'P2022', 'P2034'];
    for (const code of codes) {
      const { mockHost, getJson } = createMockHost();
      filter.catch({ name: 'PrismaClientKnownRequestError', code, meta: {} }, mockHost);
      const jsonStr = JSON.stringify(getJson());
      expect(jsonStr).not.toContain('A database constraint prevented this operation');
    }
  });

  it('7. Connection errors (P1001, P1002, P2024) map to 503 SERVER_UPDATE_PENDING', () => {
    for (const code of ['P1001', 'P1002', 'P2024']) {
      const { mockHost, getStatus, getJson } = createMockHost();
      filter.catch({ name: 'PrismaClientKnownRequestError', code, message: 'timeout' }, mockHost);
      expect(getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(getJson().code).toBe('SERVER_UPDATE_PENDING');
    }
  });
});
