# Invoice Numbering Architecture & Audit Documentation

## Overview
Indian GST statutory compliance (CGST Rules, 2017, Rule 46(b)) requires tax invoices to contain:
> *"A consecutive serial number not exceeding sixteen characters, in one or multiple series, containing only alphabets or numerals or special characters (hyphen or dash and slash symbol), unique for a financial year."*

To satisfy this requirement strictly, the CRM enforces server-side consecutive number assignment inside an atomic database transaction.

---

## Architecture Principles

### 1. Server-Side Atomic Sequential Assignment
- Client requests **never dictate** the final document number.
- When `POST /invoices/create-direct` is called without manual override, `invoicing.service.ts` uses `documentSeriesService.getNextDocumentNumber(tx, tenantId, docType)` inside the `prisma.$transaction`.
- Format: `[PREFIX]-[FY]-[SEQUENTIAL_COUNTER]` (e.g., `INV-2627-0001`, `PRO-2627-0001`, `DC-2627-0001`, `CN-2627-0001`).
- The sequential counter is scoped per:
  - **Company / Tenant** (`tenantId`)
  - **Financial Year** (e.g. `2026-2027` represented as `2627`)
  - **Document Series / Type** (`tax_invoice`, `proforma_invoice`, `delivery_challan`, `credit_note`)

### 2. Concurrency & Race-Condition Protection
- Row-level lock or atomic increment on `DocumentSeries` table within PostgreSQL transaction guarantees zero gaps and zero duplicates even under high concurrent volume.

### 3. Read-Only Web UI with Role-Gated Manual Override
- On `CreateDocumentModal.tsx`, the invoice number field is rendered **read-only** by default, displaying `(Auto-assigned on save)`.
- **Manual Override** is available exclusively to administrators (`tenant_admin`, `admin`, `sub_admin`, `platform_super_admin`).
- When an administrator uses manual override:
  1. The API verifies administrative role (`req.user.role`). Non-admins receive HTTP 403 Forbidden.
  2. The API checks for existing duplicates in the same tenant. If duplicate, HTTP 400 is returned: `"Invoice number ... already exists for this company."`.
  3. The action is recorded in the immutable audit log:
     - Action: `MANUAL_DOCUMENT_NUMBER_OVERRIDE`
     - Metadata: `{ previousNumber, manualNumber, docType, reason }`

### 4. Voiding vs Renumbering
- In accordance with GST audit trails, **existing invoices are never renumbered**.
- If an invoice is cancelled or voided:
  - Its number is retained permanently in the ledger and invoice registry.
  - `isVoided` is set to `true`.
  - `paymentStatus` is set to `'void'`.
  - A void audit entry `VOID_DOCUMENT` is written.
  - The sequence number is **not reused**, preserving chronological continuity.

---

## Audit Verification

Run the read-only audit tool at any time:
```bash
node scripts/check-invoice-numbering.js
```
The script evaluates:
- Uniqueness and duplicate numbers per company.
- Sequence gap detection across financial years.
- Format consistency (standard FY format vs legacy formats).
- Output is strictly aggregated (counts only, zero customer/personal information exposed).
