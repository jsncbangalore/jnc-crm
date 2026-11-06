import { describe, it, expect, vi } from 'vitest';
import { HttpStatus, ForbiddenException } from '@nestjs/common';
import { HealthController } from '../../apps/api/src/health/health.controller';
import * as migrationUtil from '../../apps/api/src/common/migration-status.util';

describe('HealthController - /health, /health/ready, /health/schema', () => {
  it('returns ok for /health liveness probe', () => {
    const mockPrisma = {} as any;
    const controller = new HealthController(mockPrisma);

    const res = controller.getHealth();
    expect(res.status).toBe('ok');
    expect(res.features).toBeDefined();
    expect(res.uptime).toBeGreaterThanOrEqual(0);
  });

  it('returns 200 ready when all migrations are applied', async () => {
    const mockPrisma = {} as any;
    const controller = new HealthController(mockPrisma);

    vi.spyOn(migrationUtil, 'getMigrationStatus').mockResolvedValue({
      total: 28,
      applied: 28,
      pending: [],
      isReady: true,
    });

    const mockRes = {
      status: vi.fn(),
    } as any;

    const res = await controller.getReady(mockRes);

    expect(mockRes.status).not.toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(res.status).toBe('ready');
    expect(res.ready).toBe(true);
    expect(res.migrations).toEqual({ total: 28, applied: 28 });
  });

  it('returns 503 not ready when migrations differ or are pending', async () => {
    const mockPrisma = {} as any;
    const controller = new HealthController(mockPrisma);

    vi.spyOn(migrationUtil, 'getMigrationStatus').mockResolvedValue({
      total: 28,
      applied: 27,
      pending: ['20261105183000_add_payment_deductions'],
      isReady: false,
    });

    const mockRes = {
      status: vi.fn(),
    } as any;

    const res = await controller.getReady(mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(res.status).toBe('not_ready');
    expect(res.ready).toBe(false);
    expect(res.message).toContain('Server update pending');
    expect(res.migrations.pendingCount).toBe(1);
    expect(res.migrations.pending).toEqual(['20261105183000_add_payment_deductions']);
  });

  it('rejects /health/schema with 403 Forbidden for non-admin users', async () => {
    const mockPrisma = {} as any;
    const controller = new HealthController(mockPrisma);

    const mockReq = {
      user: { role: 'sales_rep', id: 'user-1' },
    } as any;

    await expect(controller.getSchemaStatus(mockReq)).rejects.toThrow(ForbiddenException);
  });

  it('returns ok for /health/schema when admin requests and migrations are up to date', async () => {
    const mockPrisma = {} as any;
    const controller = new HealthController(mockPrisma);

    vi.spyOn(migrationUtil, 'getMigrationStatus').mockResolvedValue({
      total: 28,
      applied: 28,
      pending: [],
      isReady: true,
    });

    const mockReq = {
      user: { role: 'admin', id: 'admin-1' },
    } as any;

    const res = await controller.getSchemaStatus(mockReq);
    expect(res.status).toBe('ok');
    expect(res.ok).toBe(true);
    expect(res.pendingCount).toBe(0);
    expect(res.missingMigrations).toEqual([]);
  });

  it('returns missing migrations for /health/schema when migrations are pending', async () => {
    const mockPrisma = {} as any;
    const controller = new HealthController(mockPrisma);

    vi.spyOn(migrationUtil, 'getMigrationStatus').mockResolvedValue({
      total: 28,
      applied: 27,
      pending: ['20261105183000_add_payment_deductions'],
      isReady: false,
    });

    const mockReq = {
      user: { role: 'admin', id: 'admin-1' },
    } as any;

    const res = await controller.getSchemaStatus(mockReq);
    expect(res.status).toBe('pending_update');
    expect(res.ok).toBe(false);
    expect(res.pendingCount).toBe(1);
    expect(res.missingMigrations).toEqual(['20261105183000_add_payment_deductions']);
  });
});
