# Deferred Migrations Policy & Safety Documentation

This directory holds SQL migrations that have been intentionally removed from the active migration pipeline (`apps/api/prisma/migrations`) because they perform destructive actions (such as `DROP COLUMN`) that risk data loss, downtime, or backward-incompatibility with live services.

---

## Migration: `20261119140000_drop_deprecated_columns`

### SQL Contents
```sql
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "shippingAddress";
ALTER TABLE "Quotation" DROP COLUMN IF EXISTS "shippingAddress";
ALTER TABLE "Sku" DROP COLUMN IF EXISTS "description";
ALTER TABLE "Sku" DROP COLUMN IF EXISTS "unit";
```

### Preconditions Before This Migration May Ever Run
This migration **MUST NOT RUN** until all of the following conditions are satisfied and independently verified:
1. **Verified Full Database Backups**: Complete physical and logical backups (`pg_dump`) of the target database must exist, be checksum-verified, and test-restored to an isolated staging environment.
2. **Data Archival & Verification**: All historical values stored in `Invoice.shippingAddress`, `Quotation.shippingAddress`, `Sku.description`, and `Sku.unit` must be audited and verified as copied or mapped to permanent archival tables.
3. **Zero Code References Proven**: Every code path across all backend services, workers, reporting scripts, and frontend components must be proven to never query, select, or populate these columns.

### Current Codebase Search Findings (Audit)
A comprehensive code audit performed across the monorepo identified the following active references:
1. `Invoice.shippingAddress`:
   - `apps/api/src/invoicing/pdf-generator.ts` line 617:
     ```typescript
     const shipAddr = (invoice.shippingAddress || billAddr || `${custState}, India`).trim();
     ```
     *Impact*: Dropping `Invoice.shippingAddress` would cause PDF generation to fail or omit historical customer shipping addresses if queried via raw SQL or legacy invoice snapshots.
   - `apps/api/src/invoicing/dto/invoicing.dto.ts` lines 183 & 351: `shippingAddress?: string;`
2. `Quotation.shippingAddress`:
   - `apps/api/src/quotations/quotations.service.ts` lines 188 & 398 & 433 & 674:
     Accepts and maps `shippingAddress` in quote conversion flows.
   - `apps/web/src/components/quotations/CreateQuotationModal.tsx` line 265:
     Passes `shippingAddress: `${deliveryCity}, ${deliveryState}``.
3. `Sku.description`:
   - `apps/api/src/quotations/quotations.service.ts` line 260:
     Error check: `throw new BadRequestException('Product / SKU description is required.');`
4. `Sku.unit`:
   - Legacy unit column from initial `init` schema; current SKU flows use `packageType` and quote line units.

Until these usages are formally decoupled and backward-compatibility grace periods conclude, these columns are preserved as optional text fields in `schema.prisma`.
