# Staging Architecture & Deployment Plan

This document details the blueprint for establishing a mirrored **Staging Environment** on Render and your web hosting provider. Staging enables complete end-to-end verification of migrations, API endpoints, and web builds against synthetic data prior to production deployment.

---

## 1. Architectural Overview

```
                      DNS / DOMAIN (jsnc.co.in)
                       │                    │
              ┌────────┴────────┐  ┌────────┴────────┐
              │ staging.        │  │ staging-api.    │
              │ jsnc.co.in      │  │ jsnc.co.in      │
              └────────┬────────┘  └────────┬────────┘
                       │                    │
                 Web Hosting           Render API
              (Staging Folder)     (jnc-crm-api-staging)
                                            │
                                    Staging PostgreSQL
                                   (Separate Instance / DB)
```

- **Domain Isolation**:
  - Web Frontend: `https://staging.jsnc.co.in`
  - Backend REST API: `https://staging-api.jsnc.co.in`
- **Data Boundary**: Completely separate database instance or database cluster with 100% synthetic/fake data. No production customer or company data is ever copied into staging.

---

## 2. Infrastructure Setup Checklist

### A. DNS Records (DNS Provider / Cloudflare)
Add two CNAME records:
| Type | Name / Host | Target | TTL |
|---|---|---|---|
| **CNAME** | `staging-api` | `[staging-render-service].onrender.com` | Auto (or 300) |
| **CNAME** | `staging` | `[staging-web-host-cname]` | Auto (or 300) |

### B. Staging PostgreSQL Database
Create a dedicated PostgreSQL database (e.g. on Render PostgreSQL or Supabase):
- Database Name: `jnc_crm_staging`
- Role / User: `jnc_staging_user`
- Never reuse production database credentials.

### C. Render Web Service (`jnc-crm-api-staging`)
Create a new Web Service on Render:
- **Name**: `jnc-crm-api-staging`
- **Region**: Singapore (match production)
- **Branch**: `main` (or dedicated `staging` branch)
- **Root Directory**: Empty
- **Build Command**: `npm run bundle:api`
- **Start Command**: `node apps/api/dist/main.js`
- **Custom Domain**: `staging-api.jsnc.co.in`

---

## 3. Environment Variables Configuration

### Staging Backend API (Render Dashboard)

| Environment Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `staging` | Strict security enabled |
| `PORT` | `10000` | Render default port |
| `DATABASE_URL` | `postgresql://.../jnc_crm_staging?schema=public` | **Staging database only** |
| `DIRECT_URL` | `postgresql://.../jnc_crm_staging?schema=public` | Staging direct connection |
| `FRONTEND_URL` | `https://staging.jsnc.co.in` | Staging frontend origin |
| `ALLOWED_ORIGINS` | `https://staging.jsnc.co.in` | Restrict CORS to staging web |
| `COOKIE_DOMAIN` | `.jsnc.co.in` | Permits secure cross-subdomain cookies |
| `COOKIE_SECURE` | `true` | Requires HTTPS |
| `COOKIE_SAMESITE` | `lax` | Same-site cookie behavior across *.jsnc.co.in |
| `TRUST_PROXY` | `1` | Render reverse proxy trust |
| `JWT_SECRET` | *Random 64-char string* | Independent staging key |
| `JWT_REFRESH_SECRET` | *Random 64-char string* | Independent staging key |
| `OTP_SECRET` | *Random 64-char string* | Independent staging key |
| `ENCRYPTION_KEY` | *32-byte base64 string* | Independent staging key |
| `EMAIL_FROM` | `staging-notifications@jsnc.co.in` | Outbound sender |
| `SMTP_HOST` | Transactional / Sandbox SMTP host | Mailtrap or Brevo Sandbox |
| `SMTP_PORT` | `587` | Standard SMTP submission port |
| `SMTP_USER` | Sandbox SMTP username | Sandbox account |
| `SMTP_PASS` | Sandbox SMTP password | Sandbox account |
| `DEV_DEMO_LOGIN` | `false` | Disabled in staging |

### Staging Web Frontend (Build Command)

Build the web application specifically targeted to the staging backend:
```bash
VITE_API_URL=https://staging-api.jsnc.co.in/api/v1 VITE_PRODUCT_NAME="Syntra CRM (Staging)" npm --workspace=apps/web run build
```
Upload the resulting `apps/web/dist` directory to your web hosting staging folder for `staging.jsnc.co.in`.

---

## 4. Staging Data Seeding

To populate the staging database with clean, non-production test tenants, users, and invoices:
```bash
DATABASE_URL="$STAGING_DATABASE_URL" DIRECT_URL="$STAGING_DIRECT_URL" npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
DATABASE_URL="$STAGING_DATABASE_URL" npm run seed
```

---

## 5. Staging Pre-Release Verification Protocol

Before promoting any release to production:
1. Deploy migrations to staging database.
2. Deploy API to `jnc-crm-api-staging`.
3. Verify `GET https://staging-api.jsnc.co.in/api/v1/health` reports:
   - `status`: `"ok"`
   - `database`: `"connected"`
   - `migrationState.pendingList`: `[]`
4. Deploy frontend to `staging.jsnc.co.in`.
5. Log in with a staging user, verify Invoices, Quotations, and Bills workflows.
6. Once validated on staging, proceed with the production checklist in `docs/RELEASE.md`.
