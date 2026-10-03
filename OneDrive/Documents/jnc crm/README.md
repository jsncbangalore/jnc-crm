# 🏭 JNC Network — Enterprise ERP, CRM & Component Inventory System

A production-grade Enterprise Resource Planning (ERP), CRM, and Electronic Component Inventory Management Platform built for **JNC Network & Communication**.

---

## 🌟 Key Functional Modules

### 1. ⚡ Master Component Stock & BOM Shortage Planner
- **Catalog Management**: 416+ electronic components, ICs, passives, semiconductors, and electromechanical parts.
- **Official Production BOM (`SCH_PAS_MAIN_CTRL_V31`)**: 88-item official Bill of Materials for Public Addressing System Main Controller with real-time stock shortage calculations.
- **1-Click Restock & Batch Inflow**: Direct batch replenishment with lot numbers, supplier tracking, and live stock impact counters.
- **Dynamic Procurement Buy List**: 1-click `+ Add List` / `✕ Remove` toggle with live GST breakdown and PDF export.
- **Smart GST Bill Scanner**: Universal OCR parser with backward token analysis and automated HSN separation for supplier tax invoices.

### 2. 👥 CRM & Lead Pipeline
- Multi-channel inbound lead ingestion (Website, IndiaMART, WhatsApp).
- Automated round-robin lead allocation and lead lifecycle stages.
- Quotations with GST calculations, discounting rules, and 1-click conversion to sales orders.

### 3. 📄 GST Invoicing & Compliance
- GST-compliant invoice generation with digital signatures, HSN classification, CGST/SGST/IGST breakdown.
- PDF generation and automated customer email dispatch.

### 4. 🔒 Enterprise Security & Audit
- Role-Based Access Control (RBAC) with row-level data scoping.
- AES-256 encrypted database backup and restore engine.
- BCrypt cryptographic password hashing (zero hardcoded passwords).
- Account lockout protection against brute-force attempts.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend Web App** | React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Framer Motion |
| **Backend API Gateway** | NestJS (Node.js), TypeScript, Express Adapter |
| **Database & Cloud Storage** | PostgreSQL on Supabase Cloud, Prisma ORM 5.22 |
| **Authentication & Tokens** | JWT (JSON Web Tokens) with refresh token rotation and BCrypt hashing |
| **Communication** | Nodemailer (SMTP), Inbound Webhooks |

---

## ⚙️ Environment Configuration

Create a `.env` file in `apps/api/.env` with the following parameters:

```env
# Server Configuration
PORT=3333

# Cloud Database Connection (Supabase PostgreSQL)
DATABASE_URL="postgresql://<DB_USER>:<DB_PASSWORD>@<DB_HOST>:5432/<DB_NAME>"

# Cryptographic Token Secrets
JWT_SECRET="<YOUR_STRONG_JWT_SECRET>"
JWT_EXPIRATION="1d"
JWT_REFRESH_SECRET="<YOUR_STRONG_REFRESH_SECRET>"
JWT_REFRESH_EXPIRATION="7d"

# Corporate SMTP Email Configuration
EMAIL_FROM="your-email@yourdomain.com"
SMTP_HOST="smtp.yourdomain.com"
SMTP_PORT=465
SMTP_USER="your-email@yourdomain.com"
SMTP_PASS="<YOUR_SMTP_PASSWORD>"

# Inbound Webhook Secrets (Optional / Production)
WHATSAPP_APP_SECRET="<WHATSAPP_APP_SECRET>"
WHATSAPP_VERIFY_TOKEN="<WHATSAPP_VERIFY_TOKEN>"
INDIAMART_WEBHOOK_SECRET="<INDIAMART_WEBHOOK_SECRET>"
WEBSITE_WEBHOOK_SECRET="<WEBSITE_WEBHOOK_SECRET>"

# Database Encryption & Backup
BACKUP_ENCRYPTION_KEY="<YOUR_AES_256_BACKUP_KEY>"
BACKUP_OFFSITE_PATH="backups/offsite"
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: `v18.x` or higher
- **npm**: `v9.x` or higher

### 2. Installation
```bash
# Install root and workspace dependencies
npm install
```

### 3. Database Migration & Schema Sync
```bash
# Push Prisma schema to Development/Test Database
# NOTE: The prisma/migrations directory contains incremental ALTER migrations on top of base tables.
# To initialize a brand-new empty database (e.g. for development or testing), use `prisma db push` or
# `npm run db:push:test` in apps/api. `prisma migrate deploy` is only for existing databases that already have base tables.
npm run db:push:test
```

### 4. Running the Backend API
```bash
# Production Build
cd apps/api
node ../../node_modules/@nestjs/cli/bin/nest.js build
node dist/src/main.js
```
The REST API is live at `http://localhost:3333/api/v1`.

### 5. Running the Frontend Web Application
```bash
cd apps/web
node ../../node_modules/vite/bin/vite.js
```
The Web App is live at `http://localhost:5173`.

---

## 🛡️ User Roles & Access Hierarchy

1. **Super Admin (`super_admin`)**: Unrestricted access to financial reports, inventory wipes, user credential resets, and system settings.
2. **Admin (`admin`)**: Component inventory replenishment, procurement buy lists, BOM configurations, and supplier management.
3. **Manager (`manager`)**: Lead management, quotations, sales order approvals, and invoice generation.
4. **Employee (`employee`)**: Assigned lead handling, customer interactions, and personal performance dashboard.

---

## 📦 Deployment Guide

### Deploying the Backend API
The NestJS backend can be containerized with Docker or deployed to cloud platforms (AWS EC2, Render, Railway, DigitalOcean App Platform):
```bash
cd apps/api
npm run build
npm run start:prod
```

### Deploying the Frontend Web App
The React Vite frontend can be deployed to Vercel, Netlify, Cloudflare Pages, or AWS S3 + CloudFront:
```bash
cd apps/web
node ../../node_modules/vite/bin/vite.js build
# Deploy the generated `dist/` directory
```

---

© 2026 **JNC Network & Communication**. All Rights Reserved.
