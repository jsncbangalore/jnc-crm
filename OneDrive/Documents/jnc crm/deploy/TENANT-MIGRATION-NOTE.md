# Tenant Migration & Onboarding Guide

This document outlines the mandatory and optional configuration settings required when onboarding or migrating a tenant onto the multi-tenant CRM platform.

The CRM platform operates under a **zero hardcoded tenant identity** architecture. All brand identities, document headers, tax identifiers, banking details, and outbound business emails derive dynamically from the tenant's database profile or environment settings.

---

## 1. Tenant Identity & Branding Profile

Configure these settings under **Settings -> Branding & Profile** or via the Platform Admin portal:

| Setting | Database Field | Required For | Description / Example |
| :--- | :--- | :--- | :--- |
| **Display Name** | `Tenant.name` | All screens, emails | Brand name shown on login dock, emails, and UI header (e.g., `Acme Industrial Tools`). |
| **Legal Entity Name** | `Tenant.legalName` | Invoices & Quotations | Registered business name on official tax documents (e.g., `Acme Industrial Tools Private Limited`). |
| **Company Code** | `Tenant.code` | User login prefix | Unique 3-6 letter identifier used during member login (e.g., `ACME`). |
| **Logo Image URL** | `Tenant.logoUrl` | UI, PDF Documents | Public URL or uploaded PNG/SVG for document headers and portal logo. |
| **Digital Stamp URL** | `Tenant.stampUrl` | Invoices & Quotations | Optional signature/stamp overlay applied to generated PDFs. |
| **Contact Phone** | `Tenant.phone` | Quotation/Invoice footers | Primary official contact telephone or mobile number. |
| **Contact Email** | `Tenant.email` | Document headers | Official inquiry email (e.g., `contact@yourcompany.com`). |
| **Website** | `Tenant.website` | Document footers | Official corporate website URL (e.g., `https://yourcompany.com`). |

---

## 2. Address & Tax Identifiers (Legal Prerequisites)

> **Important**: The invoicing engine strictly validates that these fields are populated prior to invoice creation. Incomplete profiles will reject document creation with a descriptive error.

| Setting | Database Field | Required For | Description / Format |
| :--- | :--- | :--- | :--- |
| **Registered Address** | `Tenant.address` | Mandatory for Invoicing | Full physical address of registered business location. |
| **City** | `Tenant.city` | Mandatory for Invoicing | City name (e.g., `Bengaluru`, `Mumbai`). |
| **State** | `Tenant.state` | State GST Determination | State name (used to calculate CGST+SGST vs. IGST). |
| **Postal Code** | `Tenant.pincode` | Mandatory for Invoicing | 6-digit postal code (PIN). |
| **Country** | `Tenant.country` | International Trade | Country code or name (default: `India`). |
| **GSTIN** | `Tenant.gstin` | Mandatory for Tax Invoices | 15-character Goods and Services Tax Identification Number. |
| **PAN** | `Tenant.pan` | Financial Compliance | 10-character Permanent Account Number. |
| **LUT Bond No** | `Tenant.lutBondNo` | SEZ & Export Invoices | Letter of Undertaking number for zero-rated SEZ/export supply without IGST. |
| **LUT Validity** | `Tenant.lutValidity` | SEZ Compliance Warning | Validity period string (e.g., `From : 01/04/2026 To: 31/03/2027`). |

---

## 3. Financial & Banking Information

Official Tax Invoices and Quotations require complete banking settlement details for recipient remittance:

| Setting | Database Field | Description / Format |
| :--- | :--- | :--- |
| **Bank Account Holder** | `Tenant.bankAccountHolder` | Account beneficiary name matching registered bank entity. |
| **Bank Name** | `Tenant.bankName` | Name of commercial banking institution (e.g., `HDFC Bank`, `ICICI Bank`). |
| **Bank Account Number** | `Tenant.bankAccountNumber` | Full current account number. |
| **IFSC Code** | `Tenant.bankIfsc` | 11-character Indian Financial System Code (e.g., `HDFC0001234`). |
| **Bank Branch** | `Tenant.bankBranch` | Branch location name or identifier. |
| **UPI ID / QR Code** | `Tenant.upiId` | Optional UPI VPA for dynamic QR code on direct payment slips. |

---

## 4. Document & Numbering Sequences

Invoices and quotations adhere to Indian Financial Year numbering sequences (`April 1 to March 31`). Numbers are strictly monotonic and never reused:

| Document Type | Default Prefix Pattern | Example Format |
| :--- | :--- | :--- |
| **Tax Invoice** | `INV` | `INV/26-27/0001` |
| **SEZ Invoice** | `SEZ` | `SEZ/26-27/0001` |
| **Proforma Invoice** | `PI` | `PI/26-27/0001` |
| **Delivery Challan** | `DC` | `DC/26-27/0001` |
| **Quotation** | `QT` | `QT/26-27/0001` |
| **Credit Note** | `CN` | `CN/26-27/0001` |

Custom document prefix overrides can be configured per tenant in **Settings -> Invoicing Settings**.

---

## 5. Tenant Outbound MailAccount (SMTP Credentials)

### Security & Privacy Isolation Model
The CRM implements strict separation of duties between platform transactional notifications and tenant customer business correspondence:
- **System Sender (`EMAIL_FROM`)**: Handles password reset tokens, two-factor OTP verification codes, security login alerts, and welcome credentials.
- **Tenant MailAccount (`MailAccount` table)**: Required for all business operations (quotation delivery, tax invoices, order updates, customer communications).

> **Enforcement**: If a tenant attempts to email a quotation, invoice, or dispatch notice without an active registered `MailAccount`, the backend rejects the request:
> ```
> BadRequestException: "Connect your company mail account in Settings"
> ```

### Required MailAccount Fields
Navigate to **Settings -> Mail Accounts -> Add Account**:
1. **Account Name / Label**: Descriptive name (e.g., `Company Billing Mailbox`).
2. **Sender Display Name**: Name recipients see in their inbox (e.g., `Acme Billing Team`).
3. **Email Address**: Sender email address (e.g., `billing@yourcompany.com`).
4. **SMTP Host**: Secure outbound mail server (e.g., `smtp.yourcompany.com`).
5. **SMTP Port**: Secure ports only (`465` with SSL/TLS or `587` with STARTTLS).
6. **SMTP Username**: Mailbox authentication username.
7. **SMTP Password**: Mailbox authentication password (automatically encrypted at rest with AES-256-GCM via `ENCRYPTION_KEY`).
8. **Purpose**:
   - `ALL`: Default handler for all tenant outbound communications.
   - `BILLING_INVOICES`: Dedicated to invoices, proformas, receipts, and challans.
   - `SALES_OUTBOUND`: Dedicated to quotations and sales lead outreach.
   - `PRIMARY_ALERTS`: Dedicated to operational team notifications.

---

## 6. Webhooks & External Lead Integrations

Each tenant can independently configure external inbound webhook integrations without cross-tenant bleed:

| Integration | Setting / Header | Purpose |
| :--- | :--- | :--- |
| **IndiaMART Push API** | Per-tenant webhook secret | Ingests RFQ leads pushed by IndiaMART directly into tenant lead queue. |
| **Website Contact Forms** | `X-Website-Secret` / Token | Collects inquiries from tenant landing pages or contact forms. |
| **WhatsApp Cloud API** | Tenant App Secret & Verify Token | Multi-tenant Meta WhatsApp business webhook routing. |

---

## 7. Migration Verification Checklist

Before releasing a new tenant into production:

1. [ ] **Tenant Profile Created**: Verify legal name, address, GSTIN, and bank details are populated.
2. [ ] **Outbound MailAccount Verified**: Use the **Send Test Email** button in **Settings -> Mail Accounts** to verify SMTP connectivity and TLS certificates.
3. [ ] **Document Test**: Generate a draft quotation and test invoice PDF to confirm headers, logos, and bank remittance blocks render correctly.
4. [ ] **White-Label Verification**: Run repository automated integrity checks:
   ```bash
   npm run scan:branding
   npm run test:white-label
   ```
