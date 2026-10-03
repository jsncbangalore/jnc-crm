/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BackupService } from '../backup/backup.service';
import { ScopedUser } from '../auth/scoping.service';
import { ScopingService } from '../auth/scoping.service';
import { AuditService } from '../audit/audit.service';
import { requireTenantId } from '../common/tenant.util';
import * as Papa from 'papaparse';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class InventoryService {
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
    const tenantId = requireTenantId(user);
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 200;
    const skip = (page - 1) * limit;
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
      const totalOnHand = sku.stockItems.reduce((s, si) => s + si.quantityOnHand, 0);
      const totalReserved = sku.stockItems.reduce((s, si) => s + si.quantityReserved, 0);
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

    const movement = await this.prisma.stockMovement.create({
      data: {
        ...data,
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
        const totalOnHand = sku.stockItems.reduce((s, si) => s + si.quantityOnHand, 0);
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

    const totalOnHand = sku.stockItems.reduce((sum, s) => sum + s.quantityOnHand, 0);
    const totalReserved = sku.stockItems.reduce((sum, s) => sum + s.quantityReserved, 0);
    const totalAvailable = Math.max(0, totalOnHand - totalReserved);

    // Calculate usage stats
    const totalUsedInOrders = sku.orderLines.reduce((sum, ol) => sum + ol.quantity, 0);
    const totalInwardMovements = sku.stockMovements
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
        skuCode: data.skuCode.trim(),
        name: data.name.trim(),
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

    // Update SKU fields
    await this.prisma.sku.updateMany({
      where: { id, tenantId },
      data: {
        ...skuData,
        unitPrice: skuData.unitPrice !== undefined ? Number(skuData.unitPrice) : undefined,
        costPrice: skuData.costPrice !== undefined ? Number(skuData.costPrice) : undefined,
        taxRate: skuData.taxRate !== undefined ? Number(skuData.taxRate) : undefined,
        reorderPoint: skuData.reorderPoint !== undefined ? Number(skuData.reorderPoint) : undefined,
        reorderQty: skuData.reorderQty !== undefined ? Number(skuData.reorderQty) : undefined,
      },
    });
    const updated = await this.prisma.sku.findFirst({ where: { id, tenantId } });

    // Handle Quantity adjustments via StockMovement Ledger
    if (quantityOnHand !== undefined) {
      let stockItem = await this.prisma.stockItem.findFirst({ where: { skuId: id } });
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
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 50;
    const skip = (page - 1) * limit;

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
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 50;
    const skip = (page - 1) * limit;

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
        const totalOnHand = sku.stockItems.reduce((s, si) => s + si.quantityOnHand, 0);
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
  async clearAllInventory(user: ScopedUser) {
    const tenantId = requireTenantId(user);

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
    const orderLines = await this.prisma.orderLine.findMany({ select: { skuId: true } });
    const invoiceLines = await this.prisma.invoiceLine.findMany({ select: { skuId: true } });
    const quoteLines = await this.prisma.quotationLine.findMany({ select: { skuId: true } });

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

    return {
      success: true,
      message: 'All inventory data cleared fresh. Inventory is now completely empty and ready for fresh entries.',
    };
  }

  // ─── Purchase Bills & Soft Copies Repository ─────────────────────────────────

  private getPurchaseBillsFilePath(): string {
    const dir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'purchase_bills.json');
  }

  private readStoredPurchaseBills(): any[] {
    try {
      const filePath = this.getPurchaseBillsFilePath();
      if (!fs.existsSync(filePath)) return [];
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content || '[]');
    } catch {
      return [];
    }
  }

  private writeStoredPurchaseBills(bills: any[]) {
    const filePath = this.getPurchaseBillsFilePath();
    fs.writeFileSync(filePath, JSON.stringify(bills, null, 2), 'utf-8');
  }

  async getPurchaseBills(user: ScopedUser, params?: any) {
    const tenantId = requireTenantId(user);
    const bills = this.readStoredPurchaseBills();
    let result = bills.filter((b) => !b.tenantId || b.tenantId === tenantId);
    if (params?.search) {
      const q = params.search.toLowerCase();
      result = result.filter(
        (b) =>
          (b.invoiceNumber && b.invoiceNumber.toLowerCase().includes(q)) ||
          (b.vendorName && b.vendorName.toLowerCase().includes(q)) ||
          (b.project && b.project.toLowerCase().includes(q))
      );
    }
    return { data: result, total: result.length };
  }

  async getPurchaseBill(id: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const bills = this.readStoredPurchaseBills();
    const bill = bills.find((b) => b.id === id && (!b.tenantId || b.tenantId === tenantId));
    if (!bill) throw new NotFoundException(`Purchase bill ${id} not found`);
    return bill;
  }

  async createPurchaseBill(data: any, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const bills = this.readStoredPurchaseBills();
    const id = `BILL-${Date.now()}-${Math.round(Math.random() * 1000)}`;

    const newBill = {
      id,
      tenantId,
      invoiceNumber: data.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`,
      vendorName: data.vendorName || 'Supplier / Vendor',
      vendorGstin: data.vendorGstin || '',
      vendorAddress: data.vendorAddress || '',
      invoiceDate: data.invoiceDate || new Date().toISOString().slice(0, 10),
      project: data.project || 'General Inventory',
      items: Array.isArray(data.items) ? data.items : [],
      subtotal: Number(data.subtotal || 0),
      taxRate: Number(data.taxRate || 18),
      cgst: Number(data.cgst || 0),
      sgst: Number(data.sgst || 0),
      igst: Number(data.igst || 0),
      totalTax: Number(data.totalTax || 0),
      grandTotal: Number(data.grandTotal || 0),
      documentUrl: data.documentUrl || null,
      rawText: data.rawText || '',
      notes: data.notes || '',
      createdById: user?.id,
      createdByName: (user as any)?.name || user?.employeeCode || 'Administrator',
      createdAt: new Date().toISOString(),
      softCopyData: data.softCopyData || null,
    };

    bills.unshift(newBill);
    this.writeStoredPurchaseBills(bills);

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
    let bills = this.readStoredPurchaseBills();
    const bill = bills.find((b) => b.id === id && (!b.tenantId || b.tenantId === tenantId));
    if (!bill) throw new NotFoundException(`Purchase bill ${id} not found`);
    bills = bills.filter((b) => b.id !== id);
    this.writeStoredPurchaseBills(bills);
    return { success: true, message: `Bill ${bill.invoiceNumber} deleted` };
  }

  async scanBillOcr(body: { rawText?: string; filename?: string; fileUrl?: string }) {
    const text = body.rawText || '';
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    let detectedVendor = '';
    let detectedGstin = '';
    let detectedInvoiceNo = '';
    let detectedDate = new Date().toISOString().slice(0, 10);
    const detectedItems: Array<{
      name: string;
      skuCode: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      total: number;
    }> = [];

    // 1. Scan for GSTIN
    const gstinMatch = text.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/i);
    if (gstinMatch) detectedGstin = gstinMatch[0].toUpperCase();

    // 2. Scan for Invoice Number
    const invMatch = text.match(/(?:inv(?:oice)?|bill|tax\s*invoice)[\s\w]*[:#№\s-]*([A-Z0-9\/-]{3,20})/i);
    if (invMatch && invMatch[1]) detectedInvoiceNo = invMatch[1].trim();

    // 3. Scan for Date
    const dateMatch = text.match(/(\d{1,2}[-\/.]\d{1,2}[-\/.](?:\d{4}|\d{2}))/);
    if (dateMatch) {
      detectedDate = dateMatch[1];
    }

    // 4. Scan for Vendor Name in top 5 lines
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const l = lines[i];
      if (
        l.length > 3 &&
        !l.toLowerCase().includes('tax invoice') &&
        !l.toLowerCase().includes('cash memo') &&
        !l.toLowerCase().includes('gstin') &&
        !l.toLowerCase().includes('bill to')
      ) {
        detectedVendor = l;
        break;
      }
    }
    if (!detectedVendor) detectedVendor = 'Supplier / Vendor';

    // 5. Scan lines for item rows
    for (const line of lines) {
      // Look for lines that have numbers (qty, price)
      const numMatches = line.match(/\d+(?:\.\d+)?/g);
      if (numMatches && numMatches.length >= 2) {
        const parts = line.split(/\s{2,}|\t/).filter(Boolean);
        const nameCandidate = parts[0] || line.replace(/[\d,.]+/g, '').trim();
        if (
          nameCandidate.length > 2 &&
          !nameCandidate.toLowerCase().includes('total') &&
          !nameCandidate.toLowerCase().includes('tax') &&
          !nameCandidate.toLowerCase().includes('subtotal') &&
          !nameCandidate.toLowerCase().includes('invoice') &&
          !nameCandidate.toLowerCase().includes('gst')
        ) {
          const qty = parseFloat(numMatches[0]) || 1;
          const rate = parseFloat(numMatches[numMatches.length - 1]) || 5;
          const skuCode = 'ITM-' + nameCandidate.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20);
          detectedItems.push({
            name: nameCandidate,
            skuCode,
            quantity: qty,
            unit: 'Nos',
            unitPrice: rate,
            total: qty * rate,
          });
        }
      }
    }

    const subtotal = detectedItems.reduce((s, it) => s + it.total, 0) || 0;
    const taxRate = 18;
    const totalTax = (subtotal * taxRate) / 100;
    const grandTotal = subtotal + totalTax;

    return {
      vendorName: detectedVendor,
      vendorGstin: detectedGstin || '',
      invoiceNumber: detectedInvoiceNo || `INV-${Date.now().toString().slice(-6)}`,
      invoiceDate: detectedDate,
      items: detectedItems,
      subtotal,
      taxRate,
      cgst: totalTax / 2,
      sgst: totalTax / 2,
      igst: 0,
      totalTax,
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

    // Handle Mode B (Row-by-Row Spreadsheet Updates)
    if (rowUpdates && Array.isArray(rowUpdates) && rowUpdates.length > 0) {
      const positionUpdates = rowUpdates.filter((r) => r.positionId);
      const skuUpdates = rowUpdates.filter((r) => r.skuId);

      await this.prisma.$transaction(async (tx) => {
        for (const r of positionUpdates) {
          const updateData: any = {};
          if (r.project !== undefined) updateData.project = r.project;
          if (r.packageType !== undefined) updateData.package = r.packageType;
          if (r.unit !== undefined) updateData.unit = r.unit;
          if (r.supplier !== undefined) updateData.notes = `Supplier: ${r.supplier}`;
          if (r.plannedRequirement !== undefined) updateData.plannedRequirement = Number(r.plannedRequirement);
          if (r.presentStock !== undefined) updateData.presentStock = Number(r.presentStock);

          if (Object.keys(updateData).length > 0) {
            await tx.projectStockPosition.updateMany({
              where: { id: r.positionId, tenantId },
              data: updateData,
            });
            updatedCount++;
          }
        }

        for (const r of skuUpdates) {
          const updateData: any = {};
          if (r.unitPrice !== undefined) {
            updateData.unitPrice = Number(r.unitPrice);
            updateData.costPrice = Number(r.unitPrice);
          }
          if (r.taxRate !== undefined) updateData.taxRate = Number(r.taxRate);
          if (r.packageType !== undefined) updateData.packageType = r.packageType;
          if (r.unit !== undefined) updateData.packageType = r.unit;

          if (Object.keys(updateData).length > 0) {
            await tx.sku.updateMany({
              where: { id: r.skuId, tenantId },
              data: updateData,
            });
          }
        }
      });

      return {
        success: true,
        updatedCount: rowUpdates.length,
        message: `Successfully updated ${rowUpdates.length} components.`,
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



