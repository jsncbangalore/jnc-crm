/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, BadRequestException, NotFoundException, ForbiddenException, UnauthorizedException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { BackupService } from '../backup/backup.service';
import { ScopedUser } from '../auth/scoping.service';
import { ScopingService } from '../auth/scoping.service';
import { AuditService } from '../audit/audit.service';
import { requireTenantId } from '../common/tenant.util';
import { parsePagination } from '../common/pagination.util';
import * as Papa from 'papaparse';
import * as path from 'path';
import * as fs from 'fs';
import * as zlib from 'zlib';
import { sanitizeHtml, stripAllHtml } from '../common/html-sanitize.util';


@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);
  private lastClearAllTimestampPerTenant: Map<string, number> = new Map();

  constructor(
    private prisma: PrismaService,
    private scopingService: ScopingService,
    private auditService: AuditService,
    private backupService: BackupService,
  ) {}

  async getStockLevels(user: ScopedUser, query: {
    warehouseId?: string;
    search?: string;
    lowStock?: boolean;
    page?: number;
    limit?: number;
  }) {
    this.scopingService.getInventoryScope(user);
    const tenantId = requireTenantId(user);
    const { page, limit, skip, take } = parsePagination(query, 50, 100);
    const canSeeCostPrice = user.role === 'platform_super_admin' || user.role === 'tenant_admin' || user.role === 'admin';

    // Build SKU filter scoped by tenant (never return soft-deleted SKUs)
    const skuWhere: any = { deletedAt: null, tenantId };
    if (query.search) {
      skuWhere.AND = [
        {
          OR: [
            { skuCode: { contains: query.search } },
            { name: { contains: query.search } },
            { category: { contains: query.search } },
          ],
        },
      ];
    }

    const skus = await this.prisma.sku.findMany({
      where: skuWhere,
      skip,
      take: limit,
      include: {
        preferredSupplier: {
          select: { id: true, name: true, phone: true, leadTimeDays: true },
        },
        stockItems: {
          where: query.warehouseId ? { warehouseId: query.warehouseId } : undefined,
          include: {
            warehouse: { select: { id: true, name: true, code: true } },
            bin: true,
          },
        },
      },
      orderBy: { skuCode: 'asc' },
    });

    // Calculate totals and reorder status per SKU
    const result = skus.map((sku) => {
      const totalOnHand = (sku.stockItems || []).reduce((s, si) => s + si.quantityOnHand, 0);
      const totalReserved = (sku.stockItems || []).reduce((s, si) => s + si.quantityReserved, 0);
      const totalAvailable = totalOnHand - totalReserved;
      const isLowStock = totalOnHand <= sku.reorderPoint;
      const stockPercent = sku.reorderPoint > 0
        ? Math.min(100, Math.round((totalOnHand / (sku.reorderPoint * 2)) * 100))
        : 100;

      const item: any = {
        ...sku,
        totalOnHand,
        totalReserved,
        totalAvailable,
        isLowStock,
        stockPercent,
      };

      // Strip costPrice server-side for sub_admin and employee roles
      if (!canSeeCostPrice) {
        delete item.costPrice;
      }

      return item;
    });

    if (query.lowStock) {
      return result.filter((s) => s.isLowStock);
    }

    return result;
  }

  async recordMovement(data: {
    skuId: string;
    type: string;
    quantity: number;
    supplierId?: string;
    sourceWarehouseId?: string;
    destWarehouseId?: string;
    batchNo?: string;
    reasonCode?: string;
    referenceType?: string;
    referenceId?: string;
  }, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const sku = await this.prisma.sku.findFirst({
      where: { id: data.skuId, tenantId },
    });
    if (!sku) {
      throw new NotFoundException(`SKU "${data.skuId}" not found in your organization`);
    }

    const { tenantId: _injectedTenantId, ...safeData } = data as any;
    const movement = await this.prisma.stockMovement.create({
      data: {
        ...safeData,
        quantity: Number(data.quantity),
        performedById: user.id,
      },
      include: { sku: true },
    });

    // Update StockItem counters
    if (data.type === 'inward') {
      const existing = await this.prisma.stockItem.findFirst({
        where: {
          skuId: data.skuId,
          warehouseId: data.destWarehouseId,
        },
      });
      if (existing) {
        await this.prisma.stockItem.update({
          where: { id: existing.id },
          data: { quantityOnHand: { increment: data.quantity } },
        });
      } else if (data.destWarehouseId) {
        await this.prisma.stockItem.create({
          data: {
            skuId: data.skuId,
            warehouseId: data.destWarehouseId,
            quantityOnHand: data.quantity,
            quantityReserved: 0,
            batchNo: data.batchNo,
          },
        });
      }
    } else if (data.type === 'adjustment') {
      const existing = await this.prisma.stockItem.findFirst({
        where: { skuId: data.skuId },
      });
      if (existing) {
        await this.prisma.stockItem.update({
          where: { id: existing.id },
          data: { quantityOnHand: { increment: data.quantity } },
        });
      }
    }

    return movement;
  }

  async getReorderAlerts(user?: ScopedUser) {
    const tenantId = requireTenantId(user);
    const skus = await this.prisma.sku.findMany({
      where: { deletedAt: null, tenantId },
      include: {
        preferredSupplier: true,
        stockItems: true,
      },
    });

    const alerts = skus
      .map((sku) => {
        const totalOnHand = (sku.stockItems || []).reduce((s, si) => s + si.quantityOnHand, 0);
        return { sku, totalOnHand, isLowStock: totalOnHand <= sku.reorderPoint };
      })
      .filter((s) => s.isLowStock);

    return alerts;
  }

  async getWarehouses(user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const where: any = { deletedAt: null, tenantId };
    const scope: any = this.scopingService.getInventoryScope(user);
    if (scope.warehouseId) {
      where.id = scope.warehouseId;
    }
    return this.prisma.warehouse.findMany({
      where,
      include: {
        bins: true,
        _count: {
          select: { stockItems: true },
        },
      },
    });
  }

  async createWarehouse(data: { name: string; code: string; address?: string; city?: string }, user?: ScopedUser) {
    const tenantId = requireTenantId(user);
    return this.prisma.warehouse.create({
      data: {
        ...data,
        tenantId,
      },
    });
  }

  async getSkus(user: ScopedUser, search?: string) {
    const tenantId = requireTenantId(user);
    const canSeeCostPrice = user.role === 'platform_super_admin' || user.role === 'tenant_admin' || user.role === 'admin';
    const skus = await this.prisma.sku.findMany({
      where: {
        deletedAt: null,
        tenantId,
        ...(search ? {
          OR: [
            { skuCode: { contains: search } },
            { name: { contains: search } },
            { category: { contains: search } },
          ],
        } : {}),
      },
      include: {
        preferredSupplier: { select: { id: true, name: true } },
      },
      orderBy: { skuCode: 'asc' },
    });

    if (!canSeeCostPrice) {
      return skus.map(({ costPrice, ...rest }) => rest);
    }

    return skus;
  }

  async getSkuById(id: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const canSeeCostPrice = user.role === 'platform_super_admin' || user.role === 'tenant_admin' || user.role === 'admin';
    const sku = await this.prisma.sku.findFirst({
      where: { id, tenantId },
      include: {
        preferredSupplier: true,
        stockItems: {
          include: { warehouse: true, bin: true },
        },
        stockMovements: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            performedBy: { select: { id: true, name: true, employeeCode: true } },
            sourceWarehouse: true,
            destWarehouse: true,
          },
        },
        orderLines: {
          where: { order: { tenantId } },
          orderBy: { order: { confirmedAt: 'desc' } },
          take: 50,
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                customerName: true,
                customerPhone: true,
                status: true,
                paymentStatus: true,
                confirmedAt: true,
              },
            },
          },
        },
      },
    });

    if (!sku) {
      throw new NotFoundException('SKU not found');
    }

    const totalOnHand = (sku.stockItems || []).reduce((sum, s) => sum + s.quantityOnHand, 0);
    const totalReserved = (sku.stockItems || []).reduce((sum, s) => sum + s.quantityReserved, 0);
    const totalAvailable = Math.max(0, totalOnHand - totalReserved);

    // Calculate usage stats
    const totalUsedInOrders = (sku.orderLines || []).reduce((sum, ol) => sum + ol.quantity, 0);
    const totalInwardMovements = (sku.stockMovements || [])
      .filter((m) => m.type === 'inward')
      .reduce((sum, m) => sum + m.quantity, 0);
    const totalOutwardMovements = sku.stockMovements
      .filter((m) => m.type === 'outward')
      .reduce((sum, m) => sum + m.quantity, 0);

    const activeOrders = sku.orderLines.filter(
      (ol) => ol.order?.status === 'confirmed' || ol.order?.status === 'processing',
    );

    const data: any = {
      ...sku,
      totalOnHand,
      totalReserved,
      totalAvailable,
      usageStats: {
        totalUsedInOrders,
        totalInwardMovements,
        totalOutwardMovements,
        activeOrdersCount: activeOrders.length,
        activeReservedUnits: activeOrders.reduce((sum, ol) => sum + ol.quantity, 0),
      },
    };

    if (!canSeeCostPrice) {
      delete data.costPrice;
    }

    return data;
  }

  async createSku(
    data: {
      skuCode: string;
      name: string;
      category?: string;
      hsnCode?: string;
      packageType?: string;
      unitPrice?: number;
      costPrice?: number;
      reorderPoint?: number;
      reorderQty?: number;
      preferredSupplierId?: string;
      initialStock?: number;
      warehouseId?: string;
      binCode?: string;
    },
    user: ScopedUser,
  ) {
    const tenantId = requireTenantId(user);
    const sku = await this.prisma.sku.create({
      data: {
        tenantId,
        skuCode: data.skuCode?.trim() || `SKU-${Date.now()}`,
        name: data.name?.trim() || 'New SKU',
        category: data.category || 'General',
        hsnCode: data.hsnCode?.trim() || undefined,
        packageType: data.packageType || 'Unit',
        unitPrice: Number(data.unitPrice) || 0,
        costPrice: Number(data.costPrice) || 0,
        taxRate: Number((data as any).taxRate) || 18.0,
        reorderPoint: Number(data.reorderPoint) || 10,
        reorderQty: Number(data.reorderQty) || 50,
        preferredSupplierId: data.preferredSupplierId || undefined,
      },
    });

    let warehouse = data.warehouseId
      ? await this.prisma.warehouse.findFirst({ where: { id: data.warehouseId, tenantId } })
      : await this.prisma.warehouse.findFirst({ where: { tenantId } });

    if (!warehouse) {
      warehouse = await this.prisma.warehouse.create({
        data: {
          tenantId,
          code: 'MAIN-01',
          name: 'Main Warehouse',
          city: 'Headquarters',
        },
      });
    }

    const initialQty = Number(data.initialStock) || 0;
    if (warehouse && initialQty > 0) {
      // 1. Create StockItem
      await this.prisma.stockItem.create({
        data: {
          skuId: sku.id,
          warehouseId: warehouse.id,
          quantityOnHand: initialQty,
          quantityReserved: 0,
        },
      });

      // 2. Record Inward StockMovement Ledger Entry
      await this.prisma.stockMovement.create({
        data: {
          skuId: sku.id,
          type: 'inward',
          quantity: initialQty,
          destWarehouseId: warehouse.id,
          reasonCode: 'manual_sku_creation',
          performedById: user.id,
        },
      });
    }

    return sku;
  }

  async updateSku(id: string, data: any, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const { quantityOnHand, reasonCode, supplierId: inputSupplierId, supplierName, ...skuData } = data;

    // Verify ownership
    const existingSku = await this.prisma.sku.findFirst({ where: { id, tenantId } });
    if (!existingSku) {
      throw new NotFoundException('SKU not found');
    }

    // Filter and sanitize fields strictly matching Prisma Sku model
    const skuUpdatePayload: any = {};
    if (skuData.name !== undefined) skuUpdatePayload.name = String(skuData.name).trim();
    if (skuData.skuCode !== undefined || skuData.code !== undefined) {
      skuUpdatePayload.skuCode = String(skuData.skuCode || skuData.code).trim();
    }
    if (skuData.category !== undefined) skuUpdatePayload.category = String(skuData.category).trim();
    if (skuData.hsnCode !== undefined) skuUpdatePayload.hsnCode = skuData.hsnCode ? String(skuData.hsnCode).trim() : null;
    if (skuData.packageType !== undefined || skuData.unit !== undefined) {
      skuUpdatePayload.packageType = String(skuData.packageType || skuData.unit).trim();
    }
    if (skuData.unitPrice !== undefined || skuData.price !== undefined) {
      skuUpdatePayload.unitPrice = Number(skuData.unitPrice ?? skuData.price);
    }
    if (skuData.costPrice !== undefined) {
      skuUpdatePayload.costPrice = Number(skuData.costPrice);
    }
    if (skuData.taxRate !== undefined) {
      skuUpdatePayload.taxRate = Number(skuData.taxRate);
    }
    if (skuData.reorderPoint !== undefined || skuData.reorderLevel !== undefined) {
      skuUpdatePayload.reorderPoint = Number(skuData.reorderPoint ?? skuData.reorderLevel);
    }
    if (skuData.reorderQty !== undefined) {
      skuUpdatePayload.reorderQty = Number(skuData.reorderQty);
    }
    if (skuData.datasheetUrl !== undefined) {
      skuUpdatePayload.datasheetUrl = skuData.datasheetUrl;
    }
    if (skuData.preferredSupplierId !== undefined) {
      skuUpdatePayload.preferredSupplierId = skuData.preferredSupplierId;
    }

    if (Object.keys(skuUpdatePayload).length > 0) {
      await this.prisma.sku.updateMany({
        where: { id, tenantId },
        data: skuUpdatePayload,
      });
    }
    const updated = await this.prisma.sku.findFirst({ where: { id, tenantId } });

    // Handle Quantity adjustments via StockMovement Ledger
    if (quantityOnHand !== undefined) {
      let stockItem = await this.prisma.stockItem.findFirst({ where: { skuId: id, warehouse: { tenantId } } });
      if (!stockItem) {
        let defaultWarehouse = await this.prisma.warehouse.findFirst({ where: { tenantId } });
        if (!defaultWarehouse) {
          defaultWarehouse = await this.prisma.warehouse.create({
            data: {
              tenantId,
              code: 'MAIN-01',
              name: 'Main Warehouse',
              city: 'Headquarters',
            },
          });
        }
        if (defaultWarehouse) {
          stockItem = await this.prisma.stockItem.create({
            data: {
              skuId: id,
              warehouseId: defaultWarehouse.id,
              quantityOnHand: 0,
              quantityReserved: 0,
            },
          });
        }
      }

      if (stockItem) {
        const newQty = Number(quantityOnHand);
        const delta = newQty - stockItem.quantityOnHand;

        if (delta !== 0) {
          let resolvedSupplierId = inputSupplierId || updated.preferredSupplierId || undefined;

          // If supplierName was passed, resolve or create supplier
          if (!resolvedSupplierId && supplierName) {
            let sup = await this.prisma.supplier.findFirst({
              where: { name: { equals: supplierName.trim() }, tenantId },
            });
            if (!sup) {
              sup = await this.prisma.supplier.create({
                data: { tenantId, name: supplierName.trim(), leadTimeDays: 7, isActive: true },
              });
            }
            resolvedSupplierId = sup.id;
          }

          // Require supplier for purchase_inward
          if (reasonCode === 'purchase_inward' && delta > 0 && !resolvedSupplierId) {
            throw new BadRequestException(
              'Supplier is required when recording a New Stock Inward / Purchase movement.',
            );
          }

          // Log adjustment movement
          await this.prisma.stockMovement.create({
            data: {
              skuId: id,
              type: delta > 0 ? 'inward' : 'outward',
              quantity: Math.abs(delta),
              supplierId: delta > 0 ? resolvedSupplierId : undefined,
              destWarehouseId: delta > 0 ? stockItem.warehouseId : undefined,
              sourceWarehouseId: delta < 0 ? stockItem.warehouseId : undefined,
              reasonCode: reasonCode || (delta > 0 ? 'purchase_inward' : 'manual_inventory_adjustment'),
              performedById: user.id,
            },
          });

          // Mutate stock item quantity
          await this.prisma.stockItem.update({
            where: { id: stockItem.id },
            data: { quantityOnHand: newQty },
          });
        }
      }
    }

    return updated;
  }

  /**
   * Soft-delete a SKU — preserves historical Orders, Quotations & Movements
   */
  async deleteSku(id: string, user?: ScopedUser) {
    const tenantId = requireTenantId(user);
    return this.prisma.sku.updateMany({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Bulk soft-delete SKUs
   */
  async bulkDeleteSkus(ids: string[], user?: ScopedUser) {
    const tenantId = requireTenantId(user);
    const result = await this.prisma.sku.updateMany({
      where: { id: { in: ids }, tenantId },
      data: { deletedAt: new Date() },
    });
    return { deletedCount: result.count };
  }

  /**
   * Bulk import / load inventory from spreadsheet rows (CSV or Excel)
   */
  /**
   * Bulk import / load inventory from spreadsheet rows (CSV or Excel)
   */
  async importSpreadsheet(records: any[], user: ScopedUser, defaultWarehouseCode = 'MAIN-01') {
    const tenantId = requireTenantId(user);
    const results = {
      totalRows: records.length,
      importedCount: 0,
      updatedCount: 0,
      errors: [] as string[],
      skusCreated: [] as string[],
    };

    // Find or create default warehouse for this tenant
    let defaultWarehouse = await this.prisma.warehouse.findFirst({
      where: { code: defaultWarehouseCode, tenantId },
    });
    if (!defaultWarehouse) {
      defaultWarehouse = await this.prisma.warehouse.findFirst({ where: { tenantId } }) || await this.prisma.warehouse.create({
        data: {
          tenantId,
          code: defaultWarehouseCode,
          name: 'Main Warehouse',
          city: 'Headquarters',
        },
      });
    }

    // 1. Handle single-key banner rows (caused by top title lines like "INVENTORY MANAGEMENT — ...")
    const hasParsedExtra = records.some((r) => r && r.__parsed_extra && Array.isArray(r.__parsed_extra));
    if (hasParsedExtra) {
      const reconstructed: any[] = [];
      const rawRows: any[][] = records.map((r) => {
        const firstVal = Object.values(r).find((v) => !Array.isArray(v));
        const extra = Array.isArray(r.__parsed_extra) ? r.__parsed_extra : [];
        return [firstVal, ...extra];
      });

      let headerIdx = -1;
      const keywords = ['sku', 'item', 'code', 'part', 'component', 'description', 'specs', 'project', 'unit', 'price', 'rate', 'quantity', 'qty', 'stock', 'reference'];
      for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
        const rowStr = rawRows[i].map((c) => String(c || '').toLowerCase().trim()).join(' ');
        let matches = 0;
        for (const kw of keywords) {
          if (rowStr.includes(kw)) matches++;
        }
        if (matches >= 2) {
          headerIdx = i;
          break;
        }
      }

      if (headerIdx !== -1) {
        const headers = rawRows[headerIdx].map((h) => String(h || '').trim());
        for (let r = headerIdx + 1; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!Array.isArray(row) || row.every((c) => !c)) continue;
          const obj: any = {};
          for (let c = 0; c < headers.length; c++) {
            if (headers[c]) obj[headers[c]] = row[c];
          }
          reconstructed.push(obj);
        }
        records = reconstructed;
      }
    }

    // 2. Normalize keys to remove BOM (\uFEFF), dashes, and trim whitespace
    records = records.map((row) => {
      const normalizedRow: any = {};
      for (const key in row) {
        if (Object.prototype.hasOwnProperty.call(row, key)) {
          const cleanKey = key
            .replace(/^\uFEFF/, '')
            .trim()
            .toLowerCase()
            .replace(/[\s_\-\/—–]+/g, '');
          normalizedRow[cleanKey] = row[key];
        }
      }
      return normalizedRow;
    });

    results.totalRows = records.length;

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      try {
        let skuCode = (
          row.skucode ||
          row.sku ||
          row.itemcode ||
          row.componentitemcodesku ||
          row.partnumber ||
          row['SKU Code'] ||
          row['skuCode'] ||
          ''
        )
          .toString()
          .trim();

        let name = (
          row.name ||
          row.productname ||
          row.description ||
          row.itemname ||
          row.partvalue ||
          row.equipmentname ||
          row.specs ||
          row.partspecs ||
          row.partname ||
          ''
        )
          .toString()
          .trim();

        // Fallback: If not detected by name, check positional values
        if (!skuCode || !name) {
          const vals = Object.values(row)
            .map((v) => String(v || '').trim())
            .filter(Boolean);
          if (vals.length >= 4) {
            const possibleSku = vals.find((v) => /^[A-Z0-9]{2,10}-[A-Z0-9\-]{2,20}$/i.test(v));
            if (possibleSku) {
              skuCode = skuCode || possibleSku;
              name = name || vals.find((v) => v !== possibleSku && v.length > 3) || skuCode;
            }
          }
        }

        if (!skuCode || !name) {
          results.errors.push(
            `Row ${i + 1}: SKU Code and Name are required. (Keys: ${Object.keys(row).join(', ')})`
          );
          continue;
        }

        const category = (row.category || row.type || 'General').toString().trim();
        const hsnCode = (row.hsncode || row.hsn || '').toString().trim() || undefined;
        const packageType = (row.packagetype || row.package || row.unit || 'Unit').toString().trim();
        const unitPrice = parseFloat(row.unitprice || row.price || row.sellingprice || 0) || 0;
        const costPrice = parseFloat(row.costprice || row.cost || 0) || (unitPrice * 0.75);
        const taxRate = parseFloat(row.taxrate || row.gst || row.gstrate || 18) || 18.0;
        const reorderPoint = parseInt(row.reorderpoint || row.minstock || 10, 10) || 10;
        const reorderQty = parseInt(row.reorderqty || row.reorderquantity || 50, 10) || 50;
        const quantityOnHand = parseInt(row.quantityonhand || row.quantity || row.qty || row.stock || row.onhand || 0, 10) || 0;
        const supplierName = (row.suppliername || row.supplier || '').toString().trim();
        const binCode = (row.bincode || row.bin || row.location || '').toString().trim();
        const batchNo = (row.batchno || row.batch || row.lot || `BATCH-${new Date().getFullYear()}-IMP`).toString().trim();

        // 1. Resolve Supplier if provided
        let preferredSupplierId: string | null = null;
        if (supplierName) {
          let sup = await this.prisma.supplier.findFirst({
            where: { name: { equals: supplierName }, tenantId },
          });
          if (!sup) {
            sup = await this.prisma.supplier.create({
              data: {
                tenantId,
                name: supplierName,
                leadTimeDays: 7,
                isActive: true,
              },
            });
          }
          preferredSupplierId = sup.id;
        }

        // 2. Resolve Bin if provided
        let binId: string | null = null;
        if (binCode) {
          let bin = await this.prisma.locationBin.findFirst({
            where: { warehouseId: defaultWarehouse.id, binCode },
          });
          if (!bin) {
            bin = await this.prisma.locationBin.create({
              data: {
                warehouseId: defaultWarehouse.id,
                binCode,
                zone: binCode.split('-')[0] || 'A',
                rack: binCode.split('-')[1] || '01',
                shelf: binCode.split('-')[2] || '01',
              },
            });
          }
          binId = bin.id;
        }

        // 3. Upsert SKU (restore if soft-deleted)
        const existingSku = await this.prisma.sku.findFirst({
          where: { skuCode, tenantId },
        });

        let skuId: string;
        if (existingSku) {
          await this.prisma.sku.updateMany({
            where: { id: existingSku.id, tenantId },
            data: {
              name,
              category,
              hsnCode: hsnCode || existingSku.hsnCode,
              packageType,
              unitPrice: unitPrice > 0 ? unitPrice : existingSku.unitPrice,
              costPrice: costPrice > 0 ? costPrice : existingSku.costPrice,
              taxRate: taxRate > 0 ? taxRate : existingSku.taxRate,
              reorderPoint: reorderPoint > 0 ? reorderPoint : existingSku.reorderPoint,
              reorderQty: reorderQty > 0 ? reorderQty : existingSku.reorderQty,
              preferredSupplierId: preferredSupplierId || existingSku.preferredSupplierId,
              deletedAt: null, // restore if previously deleted
            },
          });
          skuId = existingSku.id;
          results.updatedCount++;
        } else {
          const newSku = await this.prisma.sku.create({
            data: {
              tenantId,
              skuCode,
              name,
              category,
              hsnCode,
              packageType,
              unitPrice,
              costPrice,
              taxRate,
              reorderPoint,
              reorderQty,
              preferredSupplierId,
            },
          });
          skuId = newSku.id;
          results.importedCount++;
          results.skusCreated.push(skuCode);
        }

        // 4. Upsert Stock Item
        const existingStock = await this.prisma.stockItem.findFirst({
          where: { skuId, warehouseId: defaultWarehouse.id },
        });

        if (existingStock) {
          if (quantityOnHand > 0) {
            await this.prisma.stockItem.update({
              where: { id: existingStock.id },
              data: {
                quantityOnHand: quantityOnHand,
                binId: binId || existingStock.binId,
                batchNo: batchNo || existingStock.batchNo,
              },
            });
          }
        } else {
          await this.prisma.stockItem.create({
            data: {
              skuId,
              warehouseId: defaultWarehouse.id,
              binId,
              quantityOnHand,
              quantityReserved: 0,
              batchNo,
            },
          });
        }

        // 5. Record Inward Movement for ledger audit
        if (quantityOnHand > 0) {
          await this.prisma.stockMovement.create({
            data: {
              skuId,
              type: 'inward',
              quantity: quantityOnHand,
              destWarehouseId: defaultWarehouse.id,
              supplierId: preferredSupplierId,
              batchNo,
              reasonCode: 'spreadsheet_bulk_import',
              performedById: user.id,
            },
          });
        }
      } catch (err: any) {
        results.errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

    return results;
  }

  /**
   * ─── Stock Transfers ──────────────────────────────────────────────────────────
   */

  /**
   * Initiate a warehouse-to-warehouse stock transfer:
   * 1. Deducts quantity from Source StockItem.quantityOnHand immediately.
   * 2. Creates StockMovement at source (type='transfer_out').
   * 3. Creates StockTransfer record with status='in_transit'.
   */
  async initiateTransfer(
    data: {
      skuId: string;
      sourceWarehouseId: string;
      destinationWarehouseId: string;
      quantity: number;
      notes?: string;
    },
    user: ScopedUser,
  ) {
    const tenantId = requireTenantId(user);

    if (user.role === 'employee') {
      throw new ForbiddenException('Employees are not authorized to initiate stock transfers.');
    }

    const quantity = Number(data.quantity);
    if (!quantity || quantity <= 0) {
      throw new BadRequestException('Transfer quantity must be greater than 0.');
    }

    if (data.sourceWarehouseId === data.destinationWarehouseId) {
      throw new BadRequestException('Source and Destination warehouses must be different.');
    }

    // Role-scoping for sub_admin: must be scoped to the source warehouse
    if (user.role === 'sub_admin' && user.warehouseId && user.warehouseId !== data.sourceWarehouseId) {
      throw new ForbiddenException('Sub-Admins are only permitted to transfer stock out of their assigned warehouse.');
    }

    const sku = await this.prisma.sku.findFirst({ where: { id: data.skuId, tenantId } });
    if (!sku || sku.deletedAt) {
      throw new NotFoundException('SKU not found or has been deleted.');
    }

    const sourceWh = await this.prisma.warehouse.findFirst({ where: { id: data.sourceWarehouseId, tenantId } });
    const destWh = await this.prisma.warehouse.findFirst({ where: { id: data.destinationWarehouseId, tenantId } });
    if (!sourceWh || !destWh) {
      throw new NotFoundException('One or both specified warehouses do not exist.');
    }

    // Check source warehouse available stock
    const sourceItem = await this.prisma.stockItem.findFirst({
      where: { skuId: data.skuId, warehouseId: data.sourceWarehouseId },
    });

    const availableOnHand = sourceItem ? sourceItem.quantityOnHand - sourceItem.quantityReserved : 0;
    if (availableOnHand < quantity) {
      throw new BadRequestException(
        `Insufficient available stock at ${sourceWh.name} for SKU ${sku.skuCode}: available ${availableOnHand}, requested ${quantity}.`,
      );
    }

    // Sequential Transfer Number
    const totalTransfers = await this.prisma.stockTransfer.count({ where: { tenantId } });
    const transferNumber = `TRF-${String(totalTransfers + 1).padStart(5, '0')}`;

    // 1. Create Transfer record in_transit
    const transfer = await this.prisma.stockTransfer.create({
      data: {
        tenantId,
        transferNumber,
        skuId: data.skuId,
        sourceWarehouseId: data.sourceWarehouseId,
        destinationWarehouseId: data.destinationWarehouseId,
        quantity,
        status: 'in_transit',
        notes: data.notes?.trim() || null,
        initiatedById: user.id,
        initiatedAt: new Date(),
      },
      include: {
        sku: true,
        sourceWarehouse: true,
        destinationWarehouse: true,
        initiatedBy: { select: { id: true, name: true, employeeCode: true } },
      },
    });

    // 2. Deduct immediately from source StockItem
    await this.prisma.stockItem.update({
      where: { id: sourceItem!.id },
      data: { quantityOnHand: sourceItem!.quantityOnHand - quantity },
    });

    // 3. Create StockMovement at source (transfer_out)
    await this.prisma.stockMovement.create({
      data: {
        skuId: data.skuId,
        type: 'transfer_out',
        quantity,
        sourceWarehouseId: data.sourceWarehouseId,
        destWarehouseId: data.destinationWarehouseId,
        reasonCode: 'warehouse_stock_transfer_out',
        referenceType: 'transfer',
        referenceId: transfer.id,
        performedById: user.id,
      },
    });

    // 4. Audit Log
    await this.auditService.log({
      actorId: user.id,
      actorName: user.employeeCode,
      action: 'CREATE',
      entityName: 'StockTransfer',
      entityId: transfer.id,
      afterState: { transferNumber, status: 'in_transit', quantity, skuCode: sku.skuCode },
    });

    return transfer;
  }

  /**
   * Retrieve stock transfers with RBAC filtering
   */
  async getTransfers(
    user: ScopedUser,
    query?: { page?: number; limit?: number; status?: string; warehouseId?: string; search?: string },
  ) {
    const tenantId = requireTenantId(user);
    const { page, limit, skip, take } = parsePagination(query, 25, 100);

    const where: any = { tenantId };

    // Scoping for sub_admin
    if (user.role === 'sub_admin' && user.warehouseId) {
      where.OR = [
        { sourceWarehouseId: user.warehouseId },
        { destinationWarehouseId: user.warehouseId },
      ];
    } else if (query?.warehouseId) {
      where.OR = [
        { sourceWarehouseId: query.warehouseId },
        { destinationWarehouseId: query.warehouseId },
      ];
    }

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.search) {
      where.OR = [
        { transferNumber: { contains: query.search } },
        { sku: { skuCode: { contains: query.search } } },
        { sku: { name: { contains: query.search } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.stockTransfer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sku: true,
          sourceWarehouse: true,
          destinationWarehouse: true,
          initiatedBy: { select: { id: true, name: true, employeeCode: true } },
          receivedBy: { select: { id: true, name: true, employeeCode: true } },
        },
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Receive a stock transfer at destination warehouse:
   * 1. Credits destination StockItem.quantityOnHand.
   * 2. Creates StockMovement at destination (type='transfer_in').
   * 3. Sets Transfer status='completed' with receivedAt and receivedById.
   */
  async receiveTransfer(id: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    if (user.role === 'employee') {
      throw new ForbiddenException('Employees are not authorized to receive stock transfers.');
    }

    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id, tenantId },
      include: { sku: true, sourceWarehouse: true, destinationWarehouse: true },
    });

    if (!transfer) {
      throw new NotFoundException(`Stock transfer with ID ${id} not found.`);
    }

    if (transfer.status !== 'in_transit') {
      throw new BadRequestException(
        `Cannot receive transfer ${transfer.transferNumber}: Status is already "${transfer.status}".`,
      );
    }

    // Role-scoping for sub_admin: must be scoped to the destination warehouse
    if (user.role === 'sub_admin' && user.warehouseId && user.warehouseId !== transfer.destinationWarehouseId) {
      throw new ForbiddenException('Sub-Admins can only receive transfers designated for their assigned warehouse.');
    }

    // 1. Credit destination StockItem
    let destItem = await this.prisma.stockItem.findFirst({
      where: { skuId: transfer.skuId, warehouseId: transfer.destinationWarehouseId },
    });

    if (!destItem) {
      destItem = await this.prisma.stockItem.create({
        data: {
          skuId: transfer.skuId,
          warehouseId: transfer.destinationWarehouseId,
          quantityOnHand: transfer.quantity,
          quantityReserved: 0,
        },
      });
    } else {
      await this.prisma.stockItem.update({
        where: { id: destItem.id },
        data: { quantityOnHand: destItem.quantityOnHand + transfer.quantity },
      });
    }

    // 2. Create StockMovement at destination (transfer_in)
    await this.prisma.stockMovement.create({
      data: {
        skuId: transfer.skuId,
        type: 'transfer_in',
        quantity: transfer.quantity,
        sourceWarehouseId: transfer.sourceWarehouseId,
        destWarehouseId: transfer.destinationWarehouseId,
        reasonCode: 'warehouse_stock_transfer_in',
        referenceType: 'transfer',
        referenceId: transfer.id,
        performedById: user.id,
      },
    });

    // 3. Mark transfer completed
    await this.prisma.stockTransfer.updateMany({
      where: { id, tenantId },
      data: {
        status: 'completed',
        receivedById: user.id,
        receivedAt: new Date(),
      },
    });
    const updated = await this.prisma.stockTransfer.findFirst({
      where: { id, tenantId },
      include: {
        sku: true,
        sourceWarehouse: true,
        destinationWarehouse: true,
        initiatedBy: { select: { id: true, name: true, employeeCode: true } },
        receivedBy: { select: { id: true, name: true, employeeCode: true } },
      },
    });

    // 4. Audit Log
    await this.auditService.log({
      actorId: user.id,
      actorName: user.employeeCode,
      action: 'STATUS_CHANGE',
      entityName: 'StockTransfer',
      entityId: transfer.id,
      beforeState: { status: 'in_transit' },
      afterState: { status: 'completed' },
    });

    return updated;
  }

  /**
   * Cancel an in-transit transfer:
   * 1. Reverses source deduction (credits quantity back to source warehouse).
   * 2. Creates compensating StockMovement (type='transfer_cancel').
   * 3. Sets Transfer status='cancelled'.
   */
  async cancelTransfer(id: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    if (user.role === 'employee') {
      throw new ForbiddenException('Employees are not authorized to cancel stock transfers.');
    }

    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id, tenantId },
      include: { sku: true, sourceWarehouse: true, destinationWarehouse: true },
    });

    if (!transfer) {
      throw new NotFoundException(`Stock transfer with ID ${id} not found.`);
    }

    if (transfer.status !== 'in_transit') {
      throw new BadRequestException(
        `Cannot cancel transfer ${transfer.transferNumber}: Status is already "${transfer.status}".`,
      );
    }

    if (user.role === 'sub_admin' && user.warehouseId && user.warehouseId !== transfer.sourceWarehouseId) {
      throw new ForbiddenException('Sub-Admins can only cancel transfers originating from their assigned warehouse.');
    }

    // 1. Revert source deduction
    let sourceItem = await this.prisma.stockItem.findFirst({
      where: { skuId: transfer.skuId, warehouseId: transfer.sourceWarehouseId },
    });

    if (sourceItem) {
      await this.prisma.stockItem.update({
        where: { id: sourceItem.id },
        data: { quantityOnHand: sourceItem.quantityOnHand + transfer.quantity },
      });
    } else {
      await this.prisma.stockItem.create({
        data: {
          skuId: transfer.skuId,
          warehouseId: transfer.sourceWarehouseId,
          quantityOnHand: transfer.quantity,
          quantityReserved: 0,
        },
      });
    }

    // 2. Compensating StockMovement
    await this.prisma.stockMovement.create({
      data: {
        skuId: transfer.skuId,
        type: 'transfer_cancel',
        quantity: transfer.quantity,
        sourceWarehouseId: transfer.sourceWarehouseId,
        destWarehouseId: transfer.destinationWarehouseId,
        reasonCode: 'warehouse_stock_transfer_cancelled',
        referenceType: 'transfer',
        referenceId: transfer.id,
        performedById: user.id,
      },
    });

    // 3. Update Transfer record
    await this.prisma.stockTransfer.updateMany({
      where: { id, tenantId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
      },
    });
    const updated = await this.prisma.stockTransfer.findFirst({
      where: { id, tenantId },
      include: {
        sku: true,
        sourceWarehouse: true,
        destinationWarehouse: true,
        initiatedBy: { select: { id: true, name: true, employeeCode: true } },
      },
    });

    // 4. Audit Log
    await this.auditService.log({
      actorId: user.id,
      actorName: user.employeeCode,
      action: 'STATUS_CHANGE',
      entityName: 'StockTransfer',
      entityId: transfer.id,
      beforeState: { status: 'in_transit' },
      afterState: { status: 'cancelled' },
    });

    return updated;
  }

  /**
   * Aggregates total in-transit stock figures across the system
   */
  async getInTransitSummary(user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const where: any = { status: 'in_transit', tenantId };
    if (user.role === 'sub_admin' && user.warehouseId) {
      where.OR = [
        { sourceWarehouseId: user.warehouseId },
        { destinationWarehouseId: user.warehouseId },
      ];
    }

    const inTransitTransfers = await this.prisma.stockTransfer.findMany({
      where,
    });

    const totalInTransitQty = inTransitTransfers.reduce((sum, t) => sum + t.quantity, 0);
    const inTransitCount = inTransitTransfers.length;

    return {
      totalInTransitQuantity: totalInTransitQty,
      inTransitTransfersCount: inTransitCount,
    };
  }

  /**
   * Complete stock movement audit ledger across warehouses and SKUs
   * (Preserves and displays all historical movements, including for soft-deleted SKUs)
   */
  async getMovements(
    user: ScopedUser,
    query?: { warehouseId?: string; skuId?: string; type?: string; page?: number; limit?: number },
  ) {
    const tenantId = requireTenantId(user);
    const { page, limit, skip, take } = parsePagination(query, 25, 100);

    const where: any = {
      sku: { tenantId },
    };

    // Scoping
    if (user.role === 'sub_admin' && user.warehouseId) {
      where.OR = [
        { sourceWarehouseId: user.warehouseId },
        { destWarehouseId: user.warehouseId },
      ];
    } else if (query?.warehouseId) {
      where.OR = [
        { sourceWarehouseId: query.warehouseId },
        { destWarehouseId: query.warehouseId },
      ];
    }

    if (query?.skuId) {
      where.skuId = query.skuId;
    }

    if (query?.type) {
      where.type = query.type;
    }

    const [items, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sku: true,
          supplier: true,
          sourceWarehouse: true,
          destWarehouse: true,
          performedBy: { select: { id: true, name: true, employeeCode: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Inventory Management — Project-wise Stock Position Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Helper to compute calculated fields for a Project Stock Position
   */
  private computeProjectStockFields(data: any) {
    const quantity = Number(data.quantity) || 1;
    const bomQtyPerUnit = Number(data.bomQtyPerUnit) || 1;
    const batchQty = Number(data.batchQty) || 1;
    const plannedRequirement =
      data.plannedRequirement !== undefined && data.plannedRequirement !== null && !isNaN(Number(data.plannedRequirement))
        ? Number(data.plannedRequirement)
        : bomQtyPerUnit * batchQty;

    const openingStock = Number(data.openingStock) || 0;
    const inflow = Number(data.inflow) || 0;
    const outflow = Number(data.outflow) || 0;
    const presentStock =
      data.presentStock !== undefined && data.presentStock !== null && !isNaN(Number(data.presentStock))
        ? Number(data.presentStock)
        : openingStock + inflow - outflow;

    const shortage = Math.max(0, plannedRequirement - presentStock);

    let status = data.status;
    if (!status || status === 'Auto' || status === 'Automatic' || status === 'Sufficient') {
      if (shortage <= 0 && presentStock >= plannedRequirement * 1.5) {
        status = 'Surplus';
      } else if (shortage <= 0) {
        status = 'Sufficient';
      } else if (shortage > 0 && presentStock > 0) {
        status = 'Shortage';
      } else {
        status = 'Critical Shortage';
      }
    }

    return {
      project: String(data.project || 'General Project').trim(),
      reference: String(data.reference || '-').trim(),
      quantity,
      itemCode: String(data.itemCode || data.skuCode || '').trim(),
      partValue: data.partValue ? String(data.partValue).trim() : null,
      package: data.package || data.packageType ? String(data.package || data.packageType).trim() : null,
      unit: String(data.unit || 'Nos').trim(),
      bomQtyPerUnit,
      batchQty,
      plannedRequirement,
      openingStock,
      inflow,
      outflow,
      presentStock,
      shortage,
      status,
      notes: data.notes ? String(data.notes).trim() : null,
    };
  }

  /**
   * Get all Project-wise Stock Positions with filters
   */
  /**
   * Get all Project-wise Stock Positions with filters
   */
  async getProjectStockPositions(
    user: ScopedUser,
    query?: {
      project?: string;
      search?: string;
      status?: string;
      shortageOnly?: boolean;
    },
  ) {
    const tenantId = requireTenantId(user);
    const where: any = { deletedAt: null, tenantId };

    if (query?.project && query.project !== 'all') {
      where.project = query.project;
    }

    if (query?.status && query.status !== 'all') {
      where.status = query.status;
    }

    if (query?.shortageOnly) {
      where.shortage = { gt: 0 };
    }

    if (query?.search) {
      const q = query.search.trim();
      where.AND = [
        {
          OR: [
            { project: { contains: q } },
            { reference: { contains: q } },
            { itemCode: { contains: q } },
            { partValue: { contains: q } },
            { package: { contains: q } },
            { notes: { contains: q } },
          ],
        },
      ];
    }

    const items = await this.prisma.projectStockPosition.findMany({
      where,
      orderBy: [{ project: 'asc' }, { itemCode: 'asc' }],
    });

    const projectsList = await this.prisma.projectStockPosition.findMany({
      where: { deletedAt: null, tenantId },
      select: { project: true },
      distinct: ['project'],
      orderBy: { project: 'asc' },
    });

    return {
      items,
      total: items.length,
      projects: projectsList.map((p) => p.project),
    };
  }

  /**
   * Get KPI Metrics & Health Summary for Project-wise Stock Positions
   */
  async getProjectStockSummary(user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const items = await this.prisma.projectStockPosition.findMany({
      where: { deletedAt: null, tenantId },
    });

    const totalPositions = items.length;
    const uniqueProjects = new Set(items.map((i) => i.project)).size;
    const totalPlannedRequirement = items.reduce((sum, i) => sum + i.plannedRequirement, 0);
    const totalPresentStock = items.reduce((sum, i) => sum + i.presentStock, 0);
    const totalShortageQty = items.reduce((sum, i) => sum + i.shortage, 0);
    const shortageItemsCount = items.filter((i) => i.shortage > 0).length;
    const criticalItemsCount = items.filter((i) => i.status === 'Critical Shortage' || (i.shortage > 0 && i.presentStock === 0)).length;
    const sufficientCount = items.filter((i) => i.shortage === 0).length;
    const totalSuppliers = await this.prisma.supplier.count({ where: { deletedAt: null, isActive: true, tenantId } });

    return {
      totalPositions,
      uniqueProjects,
      totalPlannedRequirement,
      totalPresentStock,
      totalShortageQty,
      shortageItemsCount,
      criticalItemsCount,
      sufficientCount,
      totalSuppliers,
    };
  }

  /**
   * Get all finished products (Product lines)
   */
  async getProducts(user?: ScopedUser) {
    const tenantId = requireTenantId(user);
    return this.prisma.product.findMany({
      where: { deletedAt: null, tenantId },
      include: {
        skus: {
          where: { deletedAt: null, tenantId },
          select: { id: true, skuCode: true, name: true, category: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Seed canonical product lines (idempotent upsert)
   */
  async seedFinishedProducts(user?: ScopedUser) {
    const tenantId = requireTenantId(user);
    const products = [
      { name: 'Control Panel', category: 'Controllers', description: 'Central control station and main logic controller' },
      { name: 'Power Amplifier', category: 'Audio Systems', description: 'Commercial amplifier units for distributed audio' },
      { name: 'Intercom Station', category: 'Intercom', description: 'Two-way duplex voice communications station' },
      { name: 'Speaker Unit', category: 'Audio Systems', description: 'Flush mount and horn speakers' },
      { name: 'Zone Module', category: 'Controllers', description: 'Addressable loop and zone distribution interface' },
      { name: 'Sensors & Alarms', category: 'Safety Systems', description: 'Optical smoke, heat, and panic alarm devices' },
      { name: 'IP PBX Gateway', category: 'Telephony', description: 'SIP telephony and hybrid VoIP gateway' },
      { name: 'Access Terminal', category: 'Access Control', description: 'Biometric and RFID security terminal' },
      { name: 'Network Switch', category: 'Networking', description: 'Managed Gigabit PoE+ Network Switch' },
    ];

    const results: any[] = [];
    for (const p of products) {
      const existing = await this.prisma.product.findFirst({ where: { name: p.name, deletedAt: null, tenantId } });
      if (existing) {
        results.push({ ...existing, action: 'skipped' });
      } else {
        const created = await this.prisma.product.create({ data: { ...p, tenantId } });
        results.push({ ...created, action: 'created' });
      }
    }
    return { success: true, products: results };
  }

  /**
   * Inventory dashboard counters — supplier count + reorder alerts
   */
  async getInventoryDashboard(user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const [totalSuppliers, totalProducts, skusRaw] = await Promise.all([
      this.prisma.supplier.count({ where: { deletedAt: null, isActive: true, tenantId } }),
      this.prisma.product.count({ where: { deletedAt: null, tenantId } }),
      this.prisma.sku.findMany({
        where: { deletedAt: null, tenantId },
        include: {
          stockItems: true,
          preferredSupplier: { select: { id: true, name: true, phone: true } },
        },
      }),
    ]);

    const belowReorderPoint = skusRaw
      .map((sku) => {
        const totalOnHand = (sku.stockItems || []).reduce((s, si) => s + si.quantityOnHand, 0);
        return { sku, totalOnHand, isLowStock: totalOnHand <= sku.reorderPoint };
      })
      .filter((s) => s.isLowStock)
      .map(({ sku, totalOnHand }) => ({
        id: sku.id,
        skuCode: sku.skuCode,
        name: sku.name,
        category: sku.category,
        totalOnHand,
        reorderPoint: sku.reorderPoint,
        reorderQty: sku.reorderQty,
        preferredSupplier: sku.preferredSupplier,
        preferredSupplierId: sku.preferredSupplierId,
      }));

    return {
      totalSuppliers,
      totalProducts,
      belowReorderPointCount: belowReorderPoint.length,
      belowReorderPoint,
    };
  }

  /**
   * Record a supplier-level purchase (creates StockMovement records per item + updates StockItem)
   */
  async recordSupplierPurchase(
    supplierId: string,
    dto: {
      invoiceNumber?: string;
      invoiceDate?: string;
      supplierGstin?: string;
      taxRate: number;
      taxType: string; // 'cgst_sgst' | 'igst'
      documentUrl?: string;
      notes?: string;
      items: Array<{
        skuId: string;
        quantity: number;
        unitRate: number;
      }>;
    },
    user: ScopedUser,
  ) {
    const tenantId = requireTenantId(user);
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
    if (!supplier) throw new NotFoundException(`Supplier ${supplierId} not found`);

    let defaultWarehouse = await this.prisma.warehouse.findFirst({ where: { deletedAt: null, tenantId }, orderBy: { createdAt: 'asc' } });
    if (!defaultWarehouse) {
      defaultWarehouse = await this.prisma.warehouse.create({
        data: {
          tenantId,
          code: 'MAIN-01',
          name: 'Main Warehouse',
          city: 'Headquarters',
        },
      });
    }

    let overallSubtotal = 0;
    let overallGst = 0;
    const createdMovements: any[] = [];

    for (const item of dto.items) {
      const sku = await this.prisma.sku.findFirst({ where: { id: item.skuId, tenantId } });
      if (!sku) continue;

      const qty = Math.round(Number(item.quantity));
      const rate = Number(item.unitRate);
      const subtotal = rate * qty;
      const taxRate = Number(dto.taxRate) || 0;
      const gstAmt = Math.round(((subtotal * taxRate) / 100) * 100) / 100;

      overallSubtotal += subtotal;
      overallGst += gstAmt;

      // Create StockMovement
      const movement = await this.prisma.stockMovement.create({
        data: {
          skuId: sku.id,
          type: 'inward',
          quantity: qty,
          supplierId,
          destWarehouseId: defaultWarehouse?.id,
          referenceType: 'purchase',
          referenceId: dto.invoiceNumber || `SUP-PO-${Date.now()}`,
          reasonCode: `Supplier Purchase (Invoice: ${dto.invoiceNumber || 'N/A'}, GSTIN: ${dto.supplierGstin || supplier.gstin || 'N/A'})`,
          documentUrl: dto.documentUrl,
          performedById: user.id,
        },
      });
      createdMovements.push(movement);

      // Update StockItem
      if (defaultWarehouse) {
        const stockItem = await this.prisma.stockItem.findFirst({ where: { skuId: sku.id, warehouseId: defaultWarehouse.id } });
        if (stockItem) {
          await this.prisma.stockItem.update({ where: { id: stockItem.id }, data: { quantityOnHand: { increment: qty } } });
        } else {
          await this.prisma.stockItem.create({
            data: { skuId: sku.id, warehouseId: defaultWarehouse.id, quantityOnHand: qty, quantityReserved: 0 },
          });
        }
      }
    }

    const grandTotal = overallSubtotal + overallGst;

    return {
      success: true,
      supplierId,
      invoiceNumber: dto.invoiceNumber,
      subtotal: overallSubtotal,
      gstAmount: overallGst,
      grandTotal,
      taxRate: dto.taxRate,
      taxType: dto.taxType,
      documentUrl: dto.documentUrl,
      movementsCreated: createdMovements.length,
    };
  }

  /**
   * Get all stock movements for a specific supplier (purchase history)
   */
  async getSupplierPurchases(supplierId: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        supplierId,
        type: 'inward',
        sku: { tenantId },
      },
      include: {
        sku: { select: { id: true, skuCode: true, name: true, category: true } },
        performedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return movements;
  }

  /**
   * Create a new Project Stock Position
   */
  async createProjectStockPosition(data: any, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    if (!data.project || !data.project.trim()) {
      throw new BadRequestException('Project name is required');
    }
    if (!data.itemCode || !data.itemCode.trim()) {
      throw new BadRequestException('Item Code is required');
    }

    const formatted = this.computeProjectStockFields(data);
    return this.prisma.projectStockPosition.create({
      data: {
        ...formatted,
        tenantId,
      },
    });
  }

  /**
   * Update an existing Project Stock Position
   */
  async updateProjectStockPosition(id: string, data: any, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const existing = await this.prisma.projectStockPosition.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Project stock position "${id}" not found`);
    }

    const merged = { ...existing, ...data, id: existing.id, tenantId };
    const formatted = this.computeProjectStockFields(merged);

    await this.prisma.projectStockPosition.updateMany({
      where: { id, tenantId },
      data: formatted,
    });
    return this.prisma.projectStockPosition.findFirst({
      where: { id, tenantId },
    });
  }

  /**
   * Soft-delete a Project Stock Position
   */
  async deleteProjectStockPosition(id: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const existing = await this.prisma.projectStockPosition.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Project stock position "${id}" not found`);
    }

    return this.prisma.projectStockPosition.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Bulk import / replace Project Stock Positions
   */
  async bulkImportProjectStockPositions(rows: any[], user: ScopedUser) {
    const tenantId = requireTenantId(user);
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException('Rows array cannot be empty');
    }

    const created: any[] = [];
    for (const r of rows) {
      if (!r.project && !r.itemCode) continue;
      const formatted = this.computeProjectStockFields(r);
      const row = await this.prisma.projectStockPosition.create({
        data: {
          ...formatted,
          tenantId,
        },
      });
      created.push(row);
    }

    return {
      success: true,
      importedCount: created.length,
    };
  }

  /**
   * Record a Purchase / Inward Stock with full GST breakdown and Tax Invoice document upload
   */
  async recordProjectStockPurchase(
    positionId: string,
    dto: {
      quantityPurchased: number;
      unitRate: number;
      taxRate: number; // 18, 12, 28, 5, 0
      supplierName?: string;
      supplierGstin?: string;
      invoiceNumber?: string;
      invoiceDate?: string;
      documentDataUrl?: string;
      notes?: string;
    },
    user: ScopedUser,
  ) {
    const tenantId = requireTenantId(user);
    const position = await this.prisma.projectStockPosition.findFirst({
      where: { id: positionId, tenantId },
    });
    if (!position) throw new NotFoundException('Project stock position not found');

    const qty = Number(dto.quantityPurchased) || 0;
    const rate = Number(dto.unitRate) || 0;
    const taxRate = Number(dto.taxRate) || 18;

    const subtotal = Number((qty * rate).toFixed(2));
    const gstAmount = Number(((subtotal * taxRate) / 100).toFixed(2));
    const grandTotal = Number((subtotal + gstAmount).toFixed(2));

    // 1. Update ProjectStockPosition Inflow and recalculate presentStock / shortage
    const newInflow = position.inflow + qty;
    const newPresentStock = position.openingStock + newInflow - position.outflow;
    const newShortage = Math.max(0, position.plannedRequirement - newPresentStock);

    let newStatus = 'Sufficient';
    if (newShortage > 0 && newPresentStock === 0) {
      newStatus = 'Critical Shortage';
    } else if (newShortage > 0) {
      newStatus = 'Shortage';
    } else if (newPresentStock >= position.plannedRequirement * 1.5) {
      newStatus = 'Surplus';
    }

    const purchaseNote = `Purchased ${qty} ${position.unit} from ${dto.supplierName || 'Supplier'} (GST: ${taxRate}%, Inv: ${dto.invoiceNumber || 'N/A'}, Total: ₹${grandTotal.toLocaleString('en-IN')})`;

    const updatedPosition = await this.prisma.projectStockPosition.update({
      where: { id: positionId },
      data: {
        inflow: newInflow,
        presentStock: newPresentStock,
        shortage: newShortage,
        status: newStatus,
        notes: position.notes ? `${position.notes} | ${purchaseNote}` : purchaseNote,
      },
    });

    // 2. Sync with SKU / Warehouse if exists
    const sku = await this.prisma.sku.findFirst({
      where: {
        tenantId,
        OR: [
          { skuCode: position.itemCode },
          { name: position.itemCode },
          { name: position.partValue || '' },
        ],
      },
    });

    let defaultWarehouse = await this.prisma.warehouse.findFirst({
      where: { deletedAt: null, tenantId },
      orderBy: { createdAt: 'asc' },
    });
    if (!defaultWarehouse) {
      defaultWarehouse = await this.prisma.warehouse.create({
        data: {
          tenantId,
          code: 'MAIN-01',
          name: 'Main Warehouse',
          city: 'Headquarters',
        },
      });
    }

    if (sku && defaultWarehouse) {
      // Create Inward StockMovement
      await this.prisma.stockMovement.create({
        data: {
          skuId: sku.id,
          type: 'inward',
          quantity: qty,
          destWarehouseId: defaultWarehouse.id,
          referenceType: 'purchase',
          referenceId: dto.invoiceNumber || `PO-${position.project}-${Date.now()}`,
          reasonCode: `Project Purchase (${dto.supplierName || 'Supplier'} GSTIN: ${dto.supplierGstin || 'N/A'})`,
          performedById: user.id,
        },
      });

      // Increment warehouse on hand
      const stockItem = await this.prisma.stockItem.findFirst({
        where: { skuId: sku.id, warehouseId: defaultWarehouse.id },
      });
      if (stockItem) {
        await this.prisma.stockItem.update({
          where: { id: stockItem.id },
          data: { quantityOnHand: { increment: qty } },
        });
      } else {
        await this.prisma.stockItem.create({
          data: {
            skuId: sku.id,
            warehouseId: defaultWarehouse.id,
            quantityOnHand: qty,
            quantityReserved: 0,
          },
        });
      }
    }

    return {
      success: true,
      position: updatedPosition,
      purchaseSummary: {
        quantityPurchased: qty,
        unitRate: rate,
        taxRate,
        subtotal,
        gstAmount,
        grandTotal,
        supplierName: dto.supplierName,
        supplierGstin: dto.supplierGstin,
        invoiceNumber: dto.invoiceNumber,
        invoiceDate: dto.invoiceDate,
        documentAttached: !!dto.documentDataUrl,
      },
    };
  }

  /**
   * Clear all inventory data completely fresh for the tenant (SKUs, Stock Items, Movements, Transfers, Project Stock Positions)
   */
  async clearAllInventory(confirmPhrase: string, password: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);

    if (!password || typeof password !== 'string' || password.trim().length === 0) {
      throw new BadRequestException('Current password is required to wipe inventory.');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, passwordHash: true, failedLoginAttempts: true },
    });
    if (!dbUser || !dbUser.passwordHash) {
      throw new UnauthorizedException('User credentials not found.');
    }

    const passwordValid = await bcrypt.compare(password, dbUser.passwordHash);
    if (!passwordValid) {
      const currentAttempts = (dbUser.failedLoginAttempts || 0) + 1;
      const isLocked = currentAttempts >= 5;
      const lockedUntil = isLocked ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: currentAttempts, lockoutUntil: lockedUntil },
      }).catch(() => {});
      throw new UnauthorizedException('Invalid current password.');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, code: true },
    });

    if (!tenant) throw new NotFoundException('Tenant organization not found.');

    const companyCode = (tenant.code || '').toUpperCase();
    const expectedHyphen = `WIPE-INVENTORY-${companyCode}`;
    const expectedDirect = `WIPE-INVENTORY${companyCode}`;
    const expectedSpace = `WIPE-INVENTORY ${companyCode}`;
    const normalizedConfirm = confirmPhrase ? confirmPhrase.trim().toUpperCase() : '';
    const isWipeConfirm =
      normalizedConfirm === expectedHyphen ||
      normalizedConfirm === expectedDirect ||
      normalizedConfirm === expectedSpace ||
      normalizedConfirm === 'WIPE-INVENTORY';

    if (!isWipeConfirm) {
      throw new BadRequestException(`Confirmation phrase invalid. Expected "${expectedHyphen}" or "WIPE-INVENTORY".`);
    }

    // Enforce 1-hour rate limit per company via persistent AuditLog query
    const latestAuditLog = await this.prisma.auditLog.findFirst({
      where: {
        tenantId,
        action: { in: ['WIPE_TENANT_INVENTORY', 'INVENTORY_CLEAR_ALL'] },
      },
      orderBy: { timestamp: 'desc' },
    });

    if (latestAuditLog && latestAuditLog.timestamp) {
      const lastClearedTime = new Date(latestAuditLog.timestamp).getTime();
      const elapsedMs = Date.now() - lastClearedTime;
      if (elapsedMs < 3600000) {
        const remainingMins = Math.ceil((3600000 - elapsedMs) / 60000);
        throw new HttpException(
          `Clear all inventory rate limited. Maximum 1 call per hour per company. Try again in ${remainingMins} minutes.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // 0. Trigger a fresh backup as a safety net
    await this.backupService.createBackup(user);

    // 1. Delete stock positions for this tenant
    await this.prisma.projectStockPosition.deleteMany({ where: { tenantId } });

    // 2. Delete stock transfers for this tenant
    await this.prisma.stockTransfer.deleteMany({ where: { tenantId } });

    // 3. Delete stock movements and items for SKUs belonging to this tenant
    const tenantSkus = await this.prisma.sku.findMany({
      where: { tenantId },
      select: { id: true },
    });
    const tenantSkuIds = tenantSkus.map((s) => s.id);

    if (tenantSkuIds.length > 0) {
      await this.prisma.stockMovement.deleteMany({
        where: { skuId: { in: tenantSkuIds } },
      });

      await this.prisma.stockItem.deleteMany({
        where: { skuId: { in: tenantSkuIds } },
      });
    }

    // 4. Unlink SKUs from existing orders/invoices/quotations if any, or soft-delete unused
    const orderLines = await this.prisma.orderLine.findMany({
      where: { order: { tenantId } },
      select: { skuId: true },
    });
    const invoiceLines = await this.prisma.invoiceLine.findMany({
      where: { invoice: { tenantId } },
      select: { skuId: true },
    });
    const quoteLines = await this.prisma.quotationLine.findMany({
      where: { quotation: { tenantId } },
      select: { skuId: true },
    });

    const referencedSkuIds = new Set([
      ...orderLines.map((l) => l.skuId),
      ...invoiceLines.map((l) => l.skuId).filter(Boolean) as string[],
      ...quoteLines.map((l) => l.skuId).filter(Boolean) as string[],
    ]);

    // Delete all SKUs not locked by orders for this tenant
    await this.prisma.sku.deleteMany({
      where: {
        tenantId,
        id: { notIn: Array.from(referencedSkuIds) },
      },
    });

    // For any SKUs locked by historical orders, mark them soft-deleted so inventory catalog is 100% clean
    await this.prisma.sku.updateMany({
      where: {
        tenantId,
        id: { in: Array.from(referencedSkuIds) },
      },
      data: {
        deletedAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: user.id,
        actorName: (user as any)?.name || user.employeeCode || 'Administrator',
        action: 'WIPE_TENANT_INVENTORY',
        entityName: 'Inventory',
        entityId: tenantId,
        afterState: JSON.stringify({ confirmPhrase, clearedAt: new Date().toISOString() }),
      },
    }).catch(() => {});

    return {
      success: true,
      message: `All inventory data for company ${tenant.code} cleared fresh.`,
    };
  }

  // ─── Purchase Bills & Soft Copies Repository (Database Backed) ───────────────

  async getPurchaseBills(user: ScopedUser, params?: any) {
    if (!user || !user.tenantId) {
      if (user?.role === 'platform_super_admin') {
        throw new ForbiddenException('Platform administrators cannot access company workspace resources directly. Impersonate a client company to view their data.');
      }
      return { data: [], total: 0 };
    }
    const tenantId = user.tenantId;
    const where: any = {
      tenantId,
      deletedAt: null,
    };
    if (params?.search) {
      const q = String(params.search).trim();
      where.OR = [
        { invoiceNumber: { contains: q, mode: 'insensitive' } },
        { vendorName: { contains: q, mode: 'insensitive' } },
        { project: { contains: q, mode: 'insensitive' } },
      ];
    }
    try {
      const [data, total] = await Promise.all([
        this.prisma.purchaseBill.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.purchaseBill.count({ where }),
      ]);
      return { data: data || [], total: total || 0 };
    } catch (err: any) {
      this.logger.error(`Failed to get purchase bills: ${err.message}`, err.stack);
      return { data: [], total: 0 };
    }
  }

  async getPurchaseBill(id: string, user: ScopedUser) {
    if (!user || !user.tenantId) {
      throw new ForbiddenException('Tenant context is required for this operation.');
    }
    const tenantId = user.tenantId;
    try {
      const bill = await this.prisma.purchaseBill.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!bill) throw new NotFoundException(`Purchase bill ${id} not found`);
      return bill;
    } catch (err: any) {
      if (err instanceof NotFoundException || err instanceof ForbiddenException) throw err;
      this.logger.error(`Failed to get purchase bill ${id}: ${err.message}`, err.stack);
      throw new NotFoundException(`Purchase bill ${id} not found`);
    }
  }

  async createPurchaseBill(data: any, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const invoiceNumber = (data.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`).trim();

    const newBill = await this.prisma.purchaseBill.create({
      data: {
        tenantId,
        invoiceNumber,
        vendorName: stripAllHtml(data.vendorName) || 'Supplier / Vendor',
        vendorGstin: stripAllHtml(data.vendorGstin) || null,
        vendorAddress: sanitizeHtml(data.vendorAddress) || null,
        invoiceDate: data.invoiceDate || new Date().toISOString().slice(0, 10),
        project: stripAllHtml(data.project) || 'General Inventory',
        items: Array.isArray(data.items) ? data.items : [],
        subtotal: Number(data.subtotal || 0),
        taxRate: Number(data.taxRate || 18),
        cgst: Number(data.cgst || 0),
        sgst: Number(data.sgst || 0),
        igst: Number(data.igst || 0),
        totalTax: Number(data.totalTax || 0),
        grandTotal: Number(data.grandTotal || 0),
        documentUrl: data.documentUrl || null,
        rawText: data.rawText || null,
        notes: sanitizeHtml(data.notes) || null,
        createdById: user?.id || null,
      },
    });


    // Also update physical stock for items present in the bill
    if (Array.isArray(data.items) && data.items.length > 0) {
      for (const item of data.items) {
        if (item.skuCode || item.name) {
          try {
            // Find existing position or SKU to increase stock
            const existingPos = await this.prisma.projectStockPosition.findFirst({
              where: {
                tenantId,
                OR: [
                  { itemCode: item.skuCode },
                  { partValue: item.name },
                ],
              },
            });
            if (existingPos) {
              await this.prisma.projectStockPosition.updateMany({
                where: { id: existingPos.id, tenantId },
                data: {
                  inflow: { increment: Number(item.quantity || 0) },
                  presentStock: { increment: Number(item.quantity || 0) },
                  notes: newBill.documentUrl ? `Invoice: ${newBill.invoiceNumber} | BillDoc: ${newBill.documentUrl}` : existingPos.notes,
                },
              });
            }
          } catch (e) {
            // Ignore if position doesn't exist
          }
        }
      }
    }

    return newBill;
  }

  async deletePurchaseBill(id: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const bill = await this.prisma.purchaseBill.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!bill) throw new NotFoundException(`Purchase bill ${id} not found`);
    await this.prisma.purchaseBill.update({
      where: { id: bill.id },
      data: { deletedAt: new Date() },
    });
    return { success: true, message: `Bill ${bill.invoiceNumber} deleted` };
  }

  async extractFromDocumentBuffer(buffer: Buffer, originalName: string) {
    let extractedText = '';
    const ext = path.extname(originalName).toLowerCase();

    if (ext === '.pdf' || buffer.subarray(0, 5).toString('ascii').startsWith('%PDF')) {
      try {
        const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
        const str = buffer.toString('binary');
        let match;
        const pieces: string[] = [];
        while ((match = streamRegex.exec(str)) !== null) {
          const raw = Buffer.from(match[1], 'binary');
          let decompressed: Buffer | null = null;
          try {
            decompressed = zlib.inflateSync(raw);
          } catch {
            try { decompressed = zlib.inflateRawSync(raw); } catch {}
          }
          let block = decompressed ? decompressed.toString('utf8') : match[1];
          // Decode hex strings like <4a53204e657477> -> "JS Netw"
          block = block.replace(/<([0-9a-fA-F]+)>/g, (m, hex) => {
            try {
              if (hex.length % 2 === 0) {
                return Buffer.from(hex, 'hex').toString('utf8');
              }
              return m;
            } catch {
              return m;
            }
          });
          const tjRegex = /\(([^)]+)\)\s*Tj/g;
          let m;
          while ((m = tjRegex.exec(block)) !== null) {
            pieces.push(m[1]);
          }
          const arrayRegex = /\[(.*?)\]\s*TJ/g;
          while ((m = arrayRegex.exec(block)) !== null) {
            pieces.push(m[1].replace(/\(([^)]+)\)/g, '$1 ').replace(/\s{2,}/g, ' '));
          }
        }
        extractedText = pieces.join('\n');
      } catch (err: any) {
        this.logger.warn(`PDF text stream extraction failed: ${err.message}`);
      }
    }

    if (extractedText.trim().length > 10) {
      return this.scanBillOcr({ rawText: extractedText, filename: originalName });
    }

    // Guard: Never convert raw binary image formats (AVIF, JPEG, PNG, WEBP) to ASCII strings.
    // That causes ISO-BMFF / EXIF binary headers (e.g. ftypavif, 4iloc, av01) to hallucinate fake line items.
    const isBinaryMedia =
      ext === '.avif' ||
      ext === '.heic' ||
      ext === '.jpg' ||
      ext === '.jpeg' ||
      ext === '.png' ||
      ext === '.webp' ||
      buffer.subarray(4, 8).toString('ascii') === 'ftyp' ||
      (buffer[0] === 0xff && buffer[1] === 0xd8) ||
      buffer.subarray(0, 4).toString('ascii') === '\x89PNG' ||
      buffer.subarray(0, 4).toString('ascii') === 'RIFF';

    if (isBinaryMedia) {
      // Guard against non-document raw AVIF/HEIC containers
      if (ext === '.avif' || ext === '.heic' || buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
        return {
          vendorName: '',
          vendorGstin: '',
          invoiceNumber: '',
          invoiceDate: new Date().toISOString().slice(0, 10),
          items: [],
          subtotal: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          totalTax: 0,
          roundOff: 0,
          grandTotal: 0,
          rawText: '',
        };
      }

      // For standard bill image formats (JPEG, PNG, WEBP), run local offline Tesseract OCR on the buffer
      try {
        const path = require('path');
        const Tesseract = require('tesseract.js');
        const langDir = path.resolve(process.cwd(), 'apps/web/public/tesseract');
        const worker = await Tesseract.createWorker('eng', 1, {
          langPath: langDir,
          gzip: false,
        });
        const ret = await worker.recognize(buffer);
        await worker.terminate();
        const ocrText = ret?.data?.text || '';
        if (ocrText.trim().length > 15) {
          return this.scanBillOcr({ rawText: ocrText, filename: originalName });
        }
      } catch (ocrErr: any) {
        this.logger.warn(`Server-side image OCR error: ${ocrErr?.message || ocrErr}`);
      }

      return {
        vendorName: '',
        vendorGstin: '',
        invoiceNumber: '',
        invoiceDate: new Date().toISOString().slice(0, 10),
        items: [],
        subtotal: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 0,
        rawText: '',
      };
    }

    const asciiText = buffer.toString('utf8').replace(/[^\x20-\x7E\n\r]/g, ' ');
    return this.scanBillOcr({ rawText: asciiText, filename: originalName });
  }

  async scanBillOcr(body: { rawText?: string; filename?: string; fileUrl?: string; imageBase64?: string }) {
    const text = body.rawText || '';

    // Safety guard: Reject binary container headers (AVIF/HEIC/TIFF) if accidentally passed as raw text
    if (
      text.includes('ftypavif') ||
      text.includes('mif1avif') ||
      /(\bav01\b.*\bpitm\b.*\biprp\b)/i.test(text)
    ) {
      return {
        vendorName: '',
        vendorGstin: '',
        invoiceNumber: '',
        invoiceDate: new Date().toISOString().slice(0, 10),
        items: [],
        subtotal: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 0,
        rawText: '',
      };
    }
    
    // 0. Remove trailing blank page markers, scanner footers, and page numbers
    const cleanedText = text
      .replace(/---\s*Page\s*\d+\s*---/gi, '\n')
      .replace(/\bPage\s*\d+\s*(?:of|\/)\s*\d+\b/gi, '')
      .replace(/\bScanned\s*(?:by|with)\s*[A-Za-z0-9\s_-]+/gi, '');
    const rawLines = cleanedText.split('\n').map((l) => l.trim()).filter(Boolean);
    const lines = rawLines.filter((l) => !/^(page\s*\d+|\d+\s*\/\s*\d+|\d+\s*of\s*\d+)$/i.test(l));

    let detectedVendor = '';
    let detectedGstin = '';
    let detectedInvoiceNo = '';
    let detectedDate = new Date().toISOString().slice(0, 10);
    let detectedCgst = 0;
    let detectedSgst = 0;
    let detectedIgst = 0;
    let detectedGrandTotal = 0;
    const detectedItems: Array<{
      name: string;
      skuCode: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      total: number;
    }> = [];

    // 1. Scan for Vendor Name
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^(?:bill to|sold by|seller|vendor|supplier|from)\s*[:\-]?\s*$/i.test(l) && i + 1 < lines.length) {
        detectedVendor = lines[i + 1].trim();
        break;
      }
      const inlineMatch = l.match(/^(?:seller|vendor|supplier|sold by|m\/s|messrs)\s*[:\-]?\s*(.+)$/i);
      if (inlineMatch && inlineMatch[1].trim().length >= 3) {
        detectedVendor = inlineMatch[1].trim();
        break;
      }
    }

    const HEADER_IGNORE = [
      'tax invoice', 'original for recipient', 'duplicate for transporter', 'triplicate',
      'dealers in', 'retail invoice', 'cash memo', 'quotation', 'estimate', 'bill of supply',
      '(original for recipient)', 'original', 'recipient', 'tas kcice', 'credit note', 'e-way bill',
      'purchase invoice', 'tax cash memo'
    ];

    if (!detectedVendor) {
      for (const l of lines.slice(0, 10)) {
        const low = l.toLowerCase();
        if (
          !HEADER_IGNORE.some((h) => low.includes(h)) &&
          !/^(gstin|phone|contact|address|no\s*\d|cin|pan|e-mail|email|date|invoice)/i.test(l) &&
          l.length >= 3 &&
          !/^\d+/.test(l)
        ) {
          detectedVendor = l.replace(/(?:invles|invoice|inv|bill)\s*(?:no\.?|number)?.*$/i, '').trim();
          break;
        }
      }
    }
    detectedVendor = detectedVendor.replace(/^(?:seller|vendor|supplier|sold by|m\/s|messrs)\s*[:\-]?\s*/i, '').trim();
    detectedVendor = detectedVendor.replace(/\s*(?:lavotee|invoice|inv|bill|dated|delivery|mode|po|ref).*$/i, '').trim();
    detectedVendor = detectedVendor.replace(/^[A-Z]{1,2}\s+(?=[A-Z]{3,})/i, '').trim();
    if (!detectedVendor) detectedVendor = 'Supplier / Vendor';

    // 2. Scan for GSTIN (15 character standard Indian GST format)
    const vendorSection = text.slice(0, Math.min(text.indexOf('Buyer') !== -1 ? text.indexOf('Buyer') : 1200, 1200));
    const vendorGstinMatch =
      vendorSection.match(/(?:GSTIN|GSTIN\/UIN|GST\s*NO)\s*[:\-.\s]*([0-9]{2}[A-Z]{4,6}[0-9]{3,5}[A-Z]{1}[1-9A-Z]{1}[A-Z0-9]{1,2})\b/i) ||
      vendorSection.match(/\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[A-Z0-9]{2})\b/i);

    const gstinMatch =
      vendorGstinMatch ||
      text.match(/(?:GSTIN|GSTIN\/UIN|GST\s*NO)\s*[:\-.\s]*([0-9]{2}[A-Z]{4,6}[0-9]{3,5}[A-Z]{1}[1-9A-Z]{1}[A-Z0-9]{1,2})\b/i) ||
      text.match(/\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[A-Z0-9]{2})\b/i);

    if (gstinMatch) {
      let g = gstinMatch[1].toUpperCase();
      if (g.startsWith('20') && /kamataka|karnataka|bangalore|bengaluru/i.test(text)) {
        g = '29' + g.slice(2);
      }
      detectedGstin = g;
    }

    // 3. Scan for Invoice Number
    const invCandidates = [
      text.match(/\b([A-Z]{1,5}\/[A-Z0-9\-]+\/\d{2,4}\/\d{1,8})\b/i),
      text.match(/\b([A-Z]{2,4}\/[A-Z]{2,4}\/[\d\-]+\/\d+)\b/i),
      text.match(/(?:Invoice\s*(?:Number|No\.?|#|Id)|Inv\s*No\.?|Bill\s*No\.?)\s*[:#.\s-]*([A-Za-z0-9\/\-_]{1,30})/i),
      text.match(/\b(INV[-\/]\d{3,10}|BILL[-\/]\d{3,10}|\d{6,10})\b/i),
    ];
    for (const m of invCandidates) {
      if (m && m[1]) {
        const cleanInv = m[1].replace(/Dated.*$/i, '').trim();
        if (cleanInv.length >= 2 && !/^(oice|invoice|dated|date|number|bill|cash)$/i.test(cleanInv)) {
          detectedInvoiceNo = cleanInv;
          break;
        }
      }
    }

    // 4. Scan for Date
    const MONTH_MAP: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const MONTH_NAMES = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
    const namedDateMatch = text.match(new RegExp(`\\b(\\d{1,2})[\\s\\-\\/.](?:of\\s+)?(${MONTH_NAMES})[\\s\\-\\/.](20\\d{2}|\\d{2})\\b`, 'i'));
    if (namedDateMatch) {
      const day = namedDateMatch[1].padStart(2, '0');
      const month = MONTH_MAP[namedDateMatch[2].slice(0, 3).toLowerCase()];
      if (month) {
        let year = namedDateMatch[3].length === 2 ? '20' + namedDateMatch[3] : namedDateMatch[3];
        detectedDate = `${year}-${month}-${day}`;
      }
    } else {
      const explicitDateMatch =
        text.match(/(?:date|dated|dt\.?)\s*[:\-]?\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](20\\d{2}|\\d{2})\b/i) ||
        text.match(/(?:date|dated|dt\.?)\s*[:\-]?\s*(20\\d{2})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/i) ||
        text.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](20\\d{2})\b/) ||
        text.match(/\b(20\\d{2})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/);
      if (explicitDateMatch) {
        if (explicitDateMatch[1].length === 4) {
          detectedDate = `${explicitDateMatch[1]}-${explicitDateMatch[2].padStart(2, '0')}-${explicitDateMatch[3].padStart(2, '0')}`;
        } else {
          const d = explicitDateMatch[1].padStart(2, '0');
          const m = explicitDateMatch[2].padStart(2, '0');
          let y = explicitDateMatch[3];
          if (y.length === 2) y = '20' + y;
          detectedDate = `${y}-${m}-${d}`;
        }
      }
    }

    // 5. Scan for Taxes and Grand Total
    const cgstMatch = text.match(/CGST(?:\s*(?:output\s*tax|tax|input)?\s*(?:@|\([\d.]+%\))?\s*[\d.]*%)?\s*[:\-]?\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    const sgstMatch = text.match(/SGST(?:\s*(?:output\s*tax|tax|input)?\s*(?:@|\([\d.]+%\))?\s*[\d.]*%)?\s*[:\-]?\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    const igstMatch = text.match(/IGST(?:\s*(?:output\s*tax|tax|input)?\s*(?:@|\([\d.]+%\))?\s*[\d.]*%)?\s*[:\-]?\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    const totalMatch =
      text.match(/(?:Grand\s*Total|Net\s*Amount|Total\s*Amount)\s*[:\-]?\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
      text.match(/\bTotal\b.*?(?:₹|Rs\.?|%|\bINR\b)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
      text.match(/\bTotal\b[^\d\n]*(?:\d+\s*(?:nos|pcs|units|box|mtr)\s*)?[%₹Rs.]*\s*([\d,]+\.\d{2})/i) ||
      text.match(/^Total\s*[:\-]?\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/im);

    if (cgstMatch) detectedCgst = parseFloat(cgstMatch[1].replace(/,/g, '')) || 0;
    if (sgstMatch) detectedSgst = parseFloat(sgstMatch[1].replace(/,/g, '')) || 0;
    if (igstMatch) detectedIgst = parseFloat(igstMatch[1].replace(/,/g, '')) || 0;
    if (totalMatch) detectedGrandTotal = parseFloat(totalMatch[1].replace(/,/g, '')) || 0;

    if (detectedCgst > 0 && detectedSgst === 0) {
      detectedSgst = detectedCgst;
    }

    // 6. Scan Table Items
    const NON_ITEM_KEYWORDS = [
      'tax invoice', 'bill to', 'ship to', 'gstin', 'pan number', 'pan no', 'place of supply',
      'taxable amount', 'taxable value', 'cgst', 'sgst', 'igst', 'total amount', 'received amount',
      'due balance', 'balance due', 'bank details', 'account holder', 'account number', 'bank:',
      'branch:', 'ifsc', 'upi id', 'terms & conditions', 'terms and conditions', 'notes:',
      'invoice date', 'invoice no', 'phone', 'pin:', 'pincode', 'buildings', 'date of issue'
    ];

    const TABLE_HEADER_PATTERNS = [
      /description\s*of\s*goods/i, /particulars/i, /item\s*name/i, /description/i, /items?\b/i, /product/i,
      /qty.*price/i, /quantity.*unit/i, /rate.*qty/i, /quantity.*rate/i, /unit\s*price/i,
      /material/i, /details/i, /specs?/i, /specification/i,
      /part\s*(?:no|number|name)?/i, /sl\.?\s*no/i, /s\.?\s*no/i, /sr\.?\s*no/i,
      /hsn(?:\/sac)?/i
    ];
    const TABLE_FOOTER_PATTERNS = [
      /cgst/i, /sgst/i, /igst/i, /output\s*tax/i, /sub\s*total/i, /taxable\s*amount/i, /taxable\s*value/i,
      /total\s*amount/i, /grand\s*total/i, /bank\s*details/i, /terms\s*(&|and)\s*conditions/i, /notes/i
    ];

    const UNIT_REGEX = /^(kg|nos|pcs|pieces?|units?|box(?:es)?|mtr|meters?|sets?|pkts?|gms|ltr|liters?|pairs?|bags?)$/i;

    let inTable = false;
    const hasTableStructure = lines.some((l) => TABLE_HEADER_PATTERNS.some((p) => p.test(l)));

    for (const rawLine of lines) {
      const line = rawLine.trim();
      const isHeader = TABLE_HEADER_PATTERNS.some((p) => p.test(line));
      const isFooter = TABLE_FOOTER_PATTERNS.some((p) => p.test(line));

      if (isHeader) {
        inTable = true;
        continue;
      }

      if (isFooter && inTable && detectedItems.length > 0) {
        inTable = false;
        break;
      }

      if (hasTableStructure && !inTable) {
        continue;
      }

      const low = line.toLowerCase();
      if (!line || NON_ITEM_KEYWORDS.some((k) => low.includes(k)) || line.length < 4 || /^(no|utc|ure|nos|pcs|page|date)$/i.test(line)) {
        continue;
      }

      const cleanRow = line.replace(/^\s*\d+[\.\/\)]?\s*/, '').trim();
      const tokens = cleanRow.split(/\s+/).filter(Boolean);

      // Method 1: Unit-Aware Token Parsing
      let unitIdx = -1;
      let unit = 'Nos';
      for (let i = 0; i < tokens.length; i++) {
        if (UNIT_REGEX.test(tokens[i])) {
          unitIdx = i;
          unit = tokens[i].toUpperCase();
          break;
        }
      }

      if (unitIdx > 0) {
        const qtyCandidate = parseFloat(tokens[unitIdx - 1].replace(/[!~?\(¥₹$,\)]/g, ''));
        if (!isNaN(qtyCandidate) && qtyCandidate > 0) {
          const qty = qtyCandidate;
          let nameEndIdx = unitIdx - 1;
          if (nameEndIdx > 0 && /^\d{4,8}$/.test(tokens[nameEndIdx - 1])) {
            nameEndIdx = nameEndIdx - 1;
          }

          const nameTokens = tokens.slice(0, nameEndIdx).filter((t) => !/^(rs\.?|₹|\$|€|£)$/i.test(t));
          const name = nameTokens.join(' ').replace(/^[!~?\(¥₹$\)\s]+|[!~?\(¥₹$\)\s]+$/g, '');

          const afterTokens = tokens.slice(unitIdx + 1);
          const priceNumbers: number[] = [];
          for (const t of afterTokens) {
            if (/%\)?$/.test(t)) continue;
            const clean = t.replace(/[!~?\(¥₹$,\)]/g, '');
            if (/^\d+(?:\.\d+)?$/.test(clean)) {
              priceNumbers.push(parseFloat(clean));
            }
          }

          if (priceNumbers.length > 0 && name.length >= 2) {
            let rate = priceNumbers[0];
            let total = priceNumbers[priceNumbers.length - 1];

            if (priceNumbers.length >= 3) {
              const candidateRate = priceNumbers[0];
              const candidateTax = priceNumbers[1];
              const candidateTotal = priceNumbers[priceNumbers.length - 1];
              if (
                Math.abs(candidateRate * qty - candidateTotal) < 0.1 ||
                Math.abs((candidateRate + candidateTax) * qty - candidateTotal) < 0.1
              ) {
                rate = candidateRate;
                total = candidateTotal;
              }
            }

            detectedItems.push({
              name,
              skuCode: 'ITM-' + name.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20),
              quantity: qty,
              unit,
              unitPrice: rate,
              total: total || Number((qty * rate).toFixed(2)),
            });
            continue;
          }
        }
      }

      // Method 2: Mathematical Product Detection (N1 * N2 === N3)
      const numIndices: number[] = [];
      for (let i = tokens.length - 1; i >= 0; i--) {
        let raw = tokens[i].replace(/[!~?\(¥₹$,\)]/g, '').trim();
        if (/^\d+(?:\.\d+)?$/.test(raw)) {
          numIndices.unshift(i);
        }
      }

      if (numIndices.length >= 3) {
        const idx1 = numIndices[numIndices.length - 3];
        const idx2 = numIndices[numIndices.length - 2];
        const idx3 = numIndices[numIndices.length - 1];

        const n1 = parseFloat(tokens[idx1].replace(/[!~?\(¥₹$,\)]/g, ''));
        const n2 = parseFloat(tokens[idx2].replace(/[!~?\(¥₹$,\)]/g, ''));
        const n3 = parseFloat(tokens[idx3].replace(/[!~?\(¥₹$,\)]/g, ''));

        let qty = 1;
        let rate = n3;
        let total = n3;

        if (Math.abs(n1 * n2 - n3) < 0.1) {
          if (n1 % 1 === 0 && n1 <= 1000 && (n2 % 1 !== 0 || n2 > n1)) {
            qty = n1;
            rate = n2;
          } else {
            qty = n2;
            rate = n1;
          }
          total = n3;
        } else {
          qty = n2 <= 1000 ? n2 : 1;
          rate = n1;
          total = n3;
        }

        const nameTokens = tokens.slice(0, idx1).filter((t) => !/^(rs\.?|₹|\$|€|£)$/i.test(t));
        const name = nameTokens.join(' ').replace(/^[!~?\(¥₹$\)\s]+|[!~?\(¥₹$\)\s]+$/g, '');

        if (name.length >= 2 && !NON_ITEM_KEYWORDS.some((k) => name.toLowerCase().includes(k))) {
          detectedItems.push({
            name,
            skuCode: 'ITM-' + name.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20),
            quantity: qty,
            unit: 'Nos',
            unitPrice: rate,
            total,
          });
          continue;
        }
      }

      // Method 3: 2 Number Fallback (Quantity & Line Total)
      if (numIndices.length === 2) {
        const idx1 = numIndices[0];
        const idx2 = numIndices[1];
        const n1 = parseFloat(tokens[idx1].replace(/[!~?\(¥₹$,\)]/g, ''));
        const n2 = parseFloat(tokens[idx2].replace(/[!~?\(¥₹$,\)]/g, ''));

        let qty = 1;
        let rate = n2;
        let total = n2;

        if (n1 <= 1000 && n2 >= n1) {
          qty = n1;
          rate = Number((n2 / n1).toFixed(2));
          total = n2;
        }

        const nameTokens = tokens.slice(0, idx1).filter((t) => !/^(rs\.?|₹|\$|€|£)$/i.test(t));
        const name = nameTokens.join(' ').replace(/^[!~?\(¥₹$\)\s]+|[!~?\(¥₹$\)\s]+$/g, '');

        if (name.length >= 2 && !NON_ITEM_KEYWORDS.some((k) => name.toLowerCase().includes(k))) {
          detectedItems.push({
            name,
            skuCode: 'ITM-' + name.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20),
            quantity: qty,
            unit: 'Nos',
            unitPrice: rate,
            total,
          });
        }
      }
    }

    const subtotal = Number((detectedItems.reduce((s, it) => s + it.total, 0) || 0).toFixed(2));
    const totalTax = Number((detectedCgst + detectedSgst + detectedIgst).toFixed(2));
    const calculatedGrandTotal = Number((subtotal + totalTax).toFixed(2));
    const grandTotal = detectedGrandTotal > 0 ? detectedGrandTotal : calculatedGrandTotal;
    const roundOff = Number((grandTotal - calculatedGrandTotal).toFixed(2));

    return {
      vendorName: detectedVendor,
      vendorGstin: detectedGstin || '',
      invoiceNumber: detectedInvoiceNo || `INV-${Date.now().toString().slice(-6)}`,
      invoiceDate: detectedDate,
      items: detectedItems,
      subtotal,
      taxRate: subtotal > 0 && totalTax > 0 ? Number(((totalTax / subtotal) * 100).toFixed(1)) : 0,
      cgst: detectedCgst,
      sgst: detectedSgst,
      igst: detectedIgst,
      totalTax,
      roundOff,
      grandTotal,
      rawText: text,
    };
  }

  /**
   * High-Speed Atomic Bulk Edit for Components
   */
  async bulkEditComponents(
    body: {
      items?: Array<{ skuId?: string; positionId?: string; skuCode?: string; name?: string }>;
      positionIds?: string[];
      skuIds?: string[];
      updates?: {
        project?: string;
        supplierName?: string;
        packageType?: string;
        unit?: string;
        unitPrice?: number;
        costPrice?: number;
        taxRate?: number;
        plannedRequirement?: number;
        presentStock?: number;
      };
      rowUpdates?: Array<{
        skuId?: string;
        positionId?: string;
        project?: string;
        supplier?: string;
        packageType?: string;
        unit?: string;
        unitPrice?: number;
        taxRate?: number;
        plannedRequirement?: number;
        presentStock?: number;
      }>;
    },
    user: ScopedUser,
  ) {
    const tenantId = requireTenantId(user);
    const { items, positionIds, skuIds, updates, rowUpdates } = body;

    let updatedCount = 0;

    // Normalize rowUpdates from rowUpdates, items, or components
    let effectiveRowUpdates: any[] = Array.isArray(rowUpdates) ? [...rowUpdates] : [];
    if (effectiveRowUpdates.length === 0) {
      const candidateList = Array.isArray(items) ? items : (Array.isArray((body as any).components) ? (body as any).components : []);
      if (candidateList.length > 0) {
        effectiveRowUpdates = candidateList.map((it: any) => ({
          positionId: it.positionId || it.id,
          skuId: it.skuId,
          project: it.updates?.project ?? it.project,
          supplier: it.updates?.supplierName ?? it.updates?.supplier ?? it.supplierName ?? it.supplier,
          supplierName: it.updates?.supplierName ?? it.updates?.supplier ?? it.supplierName ?? it.supplier,
          packageType: it.updates?.packageType ?? it.updates?.unit ?? it.packageType ?? it.unit,
          unit: it.updates?.unit ?? it.updates?.packageType ?? it.unit ?? it.packageType,
          unitPrice: it.updates?.unitPrice ?? it.unitPrice,
          taxRate: it.updates?.taxRate ?? it.taxRate,
          plannedRequirement: it.updates?.plannedRequirement ?? it.plannedRequirement,
          presentStock: it.updates?.presentStock ?? it.presentStock,
        }));
      }
    }

    // Handle Mode B (Row-by-Row Spreadsheet Updates)
    if (effectiveRowUpdates.length > 0) {
      const positionUpdates = effectiveRowUpdates.filter((r) => r.positionId || r.id);
      const skuUpdates = effectiveRowUpdates.filter((r) => r.skuId);

      await this.prisma.$transaction(async (tx) => {
        for (const r of positionUpdates) {
          const targetPosId = r.positionId || r.id;
          const updateData: any = {};
          if (r.project !== undefined && r.project !== null) updateData.project = String(r.project).trim();
          if (r.packageType !== undefined && r.packageType !== null) updateData.package = String(r.packageType).trim();
          if (r.unit !== undefined && r.unit !== null) updateData.unit = String(r.unit).trim();
          if (r.supplier !== undefined || r.supplierName !== undefined) {
            const supp = (r.supplierName || r.supplier || '').trim();
            if (supp) updateData.notes = `Supplier: ${supp}`;
          }
          if (r.plannedRequirement !== undefined && r.plannedRequirement !== null && !isNaN(Number(r.plannedRequirement))) {
            updateData.plannedRequirement = Number(r.plannedRequirement);
          }
          if (r.presentStock !== undefined && r.presentStock !== null && !isNaN(Number(r.presentStock))) {
            updateData.presentStock = Number(r.presentStock);
          }

          if (Object.keys(updateData).length > 0 && targetPosId) {
            await tx.projectStockPosition.updateMany({
              where: { id: targetPosId, tenantId },
              data: updateData,
            });
            updatedCount++;
          }
        }

        for (const r of skuUpdates) {
          const updateData: any = {};
          if (r.unitPrice !== undefined && r.unitPrice !== null && !isNaN(Number(r.unitPrice))) {
            updateData.unitPrice = Number(r.unitPrice);
            updateData.costPrice = Number(r.unitPrice);
          }
          if (r.taxRate !== undefined && r.taxRate !== null && !isNaN(Number(r.taxRate))) {
            updateData.taxRate = Number(r.taxRate);
          }
          if (r.packageType !== undefined || r.unit !== undefined) {
            updateData.packageType = String(r.packageType || r.unit).trim();
          }

          if (Object.keys(updateData).length > 0 && r.skuId) {
            await tx.sku.updateMany({
              where: { id: r.skuId, tenantId },
              data: updateData,
            });
          }
        }
      });

      return {
        success: true,
        updatedCount: effectiveRowUpdates.length,
        message: `Successfully updated ${effectiveRowUpdates.length} components.`,
      };
    }

    // Handle Mode A (Fast 1-Click Batch Updates)
    if (updates && Object.keys(updates).length > 0) {
      const targetPosIds: string[] = [];
      const targetSkuIds: string[] = [];

      if (Array.isArray(positionIds)) {
        targetPosIds.push(...positionIds);
      }
      if (Array.isArray(skuIds)) {
        targetSkuIds.push(...skuIds);
      }
      if (Array.isArray(items)) {
        items.forEach((it) => {
          if (it.positionId) targetPosIds.push(it.positionId);
          if (it.skuId) targetSkuIds.push(it.skuId);
        });
      }

      const uniquePosIds = Array.from(new Set(targetPosIds));
      const uniqueSkuIds = Array.from(new Set(targetSkuIds));

      const posUpdateData: any = {};
      if (updates.project !== undefined && updates.project.trim()) {
        posUpdateData.project = updates.project.trim();
      }
      if (updates.packageType !== undefined) {
        posUpdateData.package = updates.packageType;
      }
      if (updates.unit !== undefined) {
        posUpdateData.unit = updates.unit;
      }
      if (updates.supplierName !== undefined && updates.supplierName.trim()) {
        posUpdateData.notes = `Supplier: ${updates.supplierName.trim()}`;
      }
      if (updates.plannedRequirement !== undefined && !isNaN(Number(updates.plannedRequirement))) {
        posUpdateData.plannedRequirement = Number(updates.plannedRequirement);
      }
      if (updates.presentStock !== undefined && !isNaN(Number(updates.presentStock))) {
        posUpdateData.presentStock = Number(updates.presentStock);
      }

      const skuUpdateData: any = {};
      if (updates.unitPrice !== undefined && !isNaN(Number(updates.unitPrice))) {
        skuUpdateData.unitPrice = Number(updates.unitPrice);
        skuUpdateData.costPrice = Number(updates.unitPrice);
      }
      if (updates.taxRate !== undefined && !isNaN(Number(updates.taxRate))) {
        skuUpdateData.taxRate = Number(updates.taxRate);
      }
      if (updates.packageType !== undefined) {
        skuUpdateData.packageType = updates.packageType;
      }
      if (updates.unit !== undefined) {
        skuUpdateData.packageType = updates.unit;
      }

      await this.prisma.$transaction(async (tx) => {
        if (uniquePosIds.length > 0 && Object.keys(posUpdateData).length > 0) {
          const res = await tx.projectStockPosition.updateMany({
            where: { id: { in: uniquePosIds }, tenantId },
            data: posUpdateData,
          });
          updatedCount += res.count;
        }

        if (uniqueSkuIds.length > 0 && Object.keys(skuUpdateData).length > 0) {
          await tx.sku.updateMany({
            where: { id: { in: uniqueSkuIds }, tenantId },
            data: skuUpdateData,
          });
        }
      });

      return {
        success: true,
        updatedCount: Math.max(uniquePosIds.length, uniqueSkuIds.length),
        message: `Successfully updated ${Math.max(uniquePosIds.length, uniqueSkuIds.length)} components.`,
      };
    }

    throw new BadRequestException('No updates provided for bulk edit');
  }
}



