-- Migration: 20261114120000_cascade_tenant_permanent_deletion
-- Description: Align database foreign key constraints with schema.prisma for cascading tenant deletion.
-- Ensures deleting a Tenant cascades through quotations, quotation lines, SKUs, orders, order lines,
-- invoices, ledger, inventory, and other tenant-owned tables, while protecting AuditLog from cascading deletion.

-- 1. QuotationLine: Cascade when Quotation or Sku is deleted
ALTER TABLE "QuotationLine" DROP CONSTRAINT IF EXISTS "QuotationLine_quotationId_fkey";
ALTER TABLE "QuotationLine" DROP CONSTRAINT IF EXISTS "QuotationLine_skuId_fkey";
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. OrderLine: Cascade when Order or Sku is deleted
ALTER TABLE "OrderLine" DROP CONSTRAINT IF EXISTS "OrderLine_orderId_fkey";
ALTER TABLE "OrderLine" DROP CONSTRAINT IF EXISTS "OrderLine_skuId_fkey";
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. InvoiceLine: Cascade when Invoice is deleted; SetNull when Sku is deleted
ALTER TABLE "InvoiceLine" DROP CONSTRAINT IF EXISTS "InvoiceLine_invoiceId_fkey";
ALTER TABLE "InvoiceLine" DROP CONSTRAINT IF EXISTS "InvoiceLine_skuId_fkey";
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. StockItem: Cascade when Sku or Warehouse is deleted
ALTER TABLE "StockItem" DROP CONSTRAINT IF EXISTS "StockItem_skuId_fkey";
ALTER TABLE "StockItem" DROP CONSTRAINT IF EXISTS "StockItem_warehouseId_fkey";
ALTER TABLE "StockItem" DROP CONSTRAINT IF EXISTS "StockItem_binId_fkey";
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_binId_fkey" FOREIGN KEY ("binId") REFERENCES "LocationBin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. StockMovement: Cascade when Sku is deleted; SetNull for warehouse/supplier/user
ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_skuId_fkey";
ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_supplierId_fkey";
ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_sourceWarehouseId_fkey";
ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_destWarehouseId_fkey";
ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_performedById_fkey";
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_destWarehouseId_fkey" FOREIGN KEY ("destWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. StockTransfer: Cascade when Sku or Warehouse is deleted; SetNull for user
ALTER TABLE "StockTransfer" DROP CONSTRAINT IF EXISTS "StockTransfer_skuId_fkey";
ALTER TABLE "StockTransfer" DROP CONSTRAINT IF EXISTS "StockTransfer_sourceWarehouseId_fkey";
ALTER TABLE "StockTransfer" DROP CONSTRAINT IF EXISTS "StockTransfer_destinationWarehouseId_fkey";
ALTER TABLE "StockTransfer" DROP CONSTRAINT IF EXISTS "StockTransfer_initiatedById_fkey";
ALTER TABLE "StockTransfer" DROP CONSTRAINT IF EXISTS "StockTransfer_receivedById_fkey";
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. AuditLog Protection: Decouple from CASCADE deletion so historical and surviving audit records are preserved
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_tenantId_fkey";
ALTER TABLE "AuditLog" ALTER COLUMN "tenantId" DROP NOT NULL;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
