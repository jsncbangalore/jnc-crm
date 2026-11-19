import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { InventoryController } from '../../apps/api/src/inventory/inventory.controller';

describe('Bulk Delete Skus Security & Typed Confirmation Guard', () => {
  let controller: InventoryController;
  let mockInventoryService: any;

  const mockUser: any = {
    id: 'user-admin-1',
    tenantId: 'tenant-acme-corp',
    employeeCode: 'EMP001',
    role: 'admin',
    tenant: {
      id: 'tenant-acme-corp',
      code: 'ACM',
      name: 'Acme Corporation',
      slug: 'acme-corp',
      status: 'active',
    },
  };

  beforeEach(() => {
    mockInventoryService = {
      bulkDeleteSkus: vi.fn().mockResolvedValue({ deletedCount: 3 }),
    };
    controller = new InventoryController(mockInventoryService);
  });

  it('1. Refuses request with auto-filled generic confirmation keyword "CONFIRM_DELETE"', async () => {
    const payload: any = {
      ids: ['sku-1', 'sku-2', 'sku-3'],
      confirmation: 'CONFIRM_DELETE',
      count: 3,
      company: 'Acme Corporation',
    };

    await expect(controller.bulkDeleteSkus(payload, mockUser)).rejects.toThrow(BadRequestException);
    await expect(controller.bulkDeleteSkus(payload, mockUser)).rejects.toThrow(/not an auto-filled generic keyword/);
    expect(mockInventoryService.bulkDeleteSkus).not.toHaveBeenCalled();
  });

  it('2. Refuses request with auto-filled generic confirmation keyword "DELETE"', async () => {
    const payload: any = {
      ids: ['sku-1', 'sku-2', 'sku-3'],
      confirmation: 'DELETE',
      count: 3,
      company: 'Acme Corporation',
    };

    await expect(controller.bulkDeleteSkus(payload, mockUser)).rejects.toThrow(BadRequestException);
    await expect(controller.bulkDeleteSkus(payload, mockUser)).rejects.toThrow(/not an auto-filled generic keyword/);
  });

  it('3. Refuses request when count does not match the actual number of SKU IDs provided', async () => {
    const payload: any = {
      ids: ['sku-1', 'sku-2', 'sku-3'],
      confirmation: 'DELETE 5 PRODUCTS',
      count: 5, // Mismatch: 5 provided but ids has 3
      company: 'Acme Corporation',
    };

    await expect(controller.bulkDeleteSkus(payload, mockUser)).rejects.toThrow(BadRequestException);
    await expect(controller.bulkDeleteSkus(payload, mockUser)).rejects.toThrow(/count mismatch/);
  });

  it('4. Refuses request when typed confirmation text does not include the exact count', async () => {
    const payload: any = {
      ids: ['sku-1', 'sku-2', 'sku-3'],
      confirmation: 'DELETE ALL PRODUCTS', // Missing count
      count: 3,
      company: 'Acme Corporation',
    };

    await expect(controller.bulkDeleteSkus(payload, mockUser)).rejects.toThrow(BadRequestException);
    await expect(controller.bulkDeleteSkus(payload, mockUser)).rejects.toThrow(/DELETE 3 PRODUCTS/);
  });

  it('5. Refuses request when company parameter does not match the user tenant/company', async () => {
    const payload: any = {
      ids: ['sku-1', 'sku-2', 'sku-3'],
      confirmation: 'DELETE 3 PRODUCTS',
      count: 3,
      company: 'Wrong Company Inc',
    };

    await expect(controller.bulkDeleteSkus(payload, mockUser)).rejects.toThrow(BadRequestException);
    await expect(controller.bulkDeleteSkus(payload, mockUser)).rejects.toThrow(/does not match authorized company/);
  });

  it('6. Accepts valid typed confirmation matching real count and company, passing audit metadata', async () => {
    const payload: any = {
      ids: ['sku-1', 'sku-2', 'sku-3'],
      confirmation: 'DELETE 3 PRODUCTS',
      count: 3,
      company: 'Acme Corporation',
    };

    const result = await controller.bulkDeleteSkus(payload, mockUser);
    expect(result).toEqual({ deletedCount: 3 });
    expect(mockInventoryService.bulkDeleteSkus).toHaveBeenCalledWith(
      ['sku-1', 'sku-2', 'sku-3'],
      mockUser,
      {
        confirmation: 'DELETE 3 PRODUCTS',
        company: 'Acme Corporation',
      }
    );
  });
});
