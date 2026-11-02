-- Migration: 20261012000000_cascade_delete_stock_items
-- Description: Add ON DELETE CASCADE / SET NULL to inventory and line item foreign key constraints to prevent FK violation 23503 on Tenant or Sku deletion.

-- 1. Drop existing constraints
ALTER TABLE "StockItem" DROP CONSTRAINT IF EXISTS "StockItem_skuId_fkey";
ALTER TABLE "StockItem" DROP CONSTRAINT IF EXISTS "StockItem_warehouseId_fkey";
ALTER TABLE "StockItem" DROP CONSTRAINT IF EXISTS "StockItem_binId_fkey";

ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_skuId_fkey";
ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_supplierId_fkey";
ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_sourceWarehouseId_fkey";
ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_destWarehouseId_fkey";
ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_performedById_fkey";

ALTER TABLE "QuotationLine" DROP CONSTRAINT IF EXISTS "QuotationLine_skuId_fkey";
ALTER TABLE "OrderLine" DROP CONSTRAINT IF EXISTS "OrderLine_skuId_fkey";
ALTER TABLE "InvoiceLine" DROP CONSTRAINT IF EXISTS "InvoiceLine_skuId_fkey";

ALTER TABLE "StockTransfer" DROP CONSTRAINT IF EXISTS "StockTransfer_skuId_fkey";
ALTER TABLE "StockTransfer" DROP CONSTRAINT IF EXISTS "StockTransfer_sourceWarehouseId_fkey";
ALTER TABLE "StockTransfer" DROP CONSTRAINT IF EXISTS "StockTransfer_destinationWarehouseId_fkey";
ALTER TABLE "StockTransfer" DROP CONSTRAINT IF EXISTS "StockTransfer_initiatedById_fkey";
ALTER TABLE "StockTransfer" DROP CONSTRAINT IF EXISTS "StockTransfer_receivedById_fkey";

-- 2. Re-create constraints with ON DELETE CASCADE / SET NULL
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_binId_fkey" FOREIGN KEY ("binId") REFERENCES "LocationBin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_destWarehouseId_fkey" FOREIGN KEY ("destWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
