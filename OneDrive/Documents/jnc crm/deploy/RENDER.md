# Render Cloud Deployment Guide for JNC CRM Monorepo

This guide covers deploying the JNC CRM NestJS backend service to Render using the Render Blueprint (`render.yaml`).

---

## 1. Free Tier vs. Paid Tier Considerations

> [!WARNING]
> **Render Free Plan Limitations:**
> - **SMTP Port Blocking:** Render blocks outbound connections on ports 25, 465, and 587 on free web services. Standard SMTP will fail silently or time out. Set `MAIL_PROVIDER=brevo` or `MAIL_PROVIDER=resend` to send emails via HTTPS REST API instead.
> - **Cold Starts (Spin Down):** Free instances spin down after ~15 minutes of inactivity. The first HTTP request after idle takes 30–60 seconds while the instance wakes up. The frontend application includes an automatic warming banner and 60-second retry handler for initial requests.
> - **Paid Upgrade Benefits:** Render Individual ($7/mo) or Starter plans prevent spin-down (100% uptime) and unblock outbound mail ports if native SMTP is required.

---

## 2. Render Infrastructure & Service Specifications

| Property | Value |
|---|---|
| **Service Type** | Web Service |
| **Runtime** | Node |
| **Region** | Singapore (`singapore`) |
| **Root Directory** | `.` |
| **Build Command** | `npm --workspace=apps/api run build && npx prisma generate --schema=apps/api/prisma/schema.prisma` |
| **Start Command** | `node apps/api/dist/main.js` |
| **Health Check Path** | `/api/v1/health` |
| **Node Version** | `>=18.0.0` (specify in Environment Variables: `NODE_VERSION=20`) |
| **Pre-Deploy Command** | `node scripts/db-preflight-live.js && npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma` |

---

## 3. Environment Variable Specification

Configure the following environment variables in the Render Dashboard under **Environment**:

| Variable Name | Required | Description & Generation Instructions |
|---|---|---|
| `NODE_ENV` | Yes | Set to `production`. |
| `PORT` | Yes | Set to `3333` (or leave default `$PORT` set by Render). |
| `FRONTEND_URL` | Yes | Public Web App URL (e.g. `https://admin.jsnc.co.in`). |
| `ALLOWED_ORIGINS` | Yes | Comma-separated CORS origins (e.g. `https://admin.jsnc.co.in,https://api.jsnc.co.in`). |
| `DATABASE_URL` | Yes | PostgreSQL connection string (Transaction Pooler or direct connection). |
| `DIRECT_URL` | Yes | Direct PostgreSQL connection string for Prisma migrations (`npx prisma migrate deploy`). Checked against expected project reference by pre-deploy guard. |
| `MAIL_PROVIDER` | Yes | Email delivery provider: `brevo`, `resend`, or `smtp` (default `smtp`, HTTPS provider recommended on Render). |
| `BREVO_API_KEY` | Optional | API Key from Brevo Dashboard (required if `MAIL_PROVIDER=brevo`). Masked: `<MASKED>` |
| `RESEND_API_KEY` | Optional | API Key from Resend Dashboard (required if `MAIL_PROVIDER=resend`). Masked: `<MASKED>` |
| `EMAIL_FROM` | Yes | Sender email address (e.g. `jsnccrm@gmail.com` or `noreply@jsnc.co.in`). |
| `PRIMARY_EMAIL_FROM` | Yes | Fallback sender address. |
| `JWT_SECRET` | Yes | 256-bit random hex string. Generate via: `openssl rand -hex 32` or Render auto-generation. |
| `JWT_REFRESH_SECRET` | Yes | 256-bit random hex string. Generate via: `openssl rand -hex 32` or Render auto-generation. |
| `ENCRYPTION_KEY` | Yes | 32-byte secret for credential encryption. Generate via: `openssl rand -hex 32`. |
| `BACKUP_ENCRYPTION_KEY` | Yes | 32-byte secret for database backup encryption. |

---

## 4. Hostinger DNS Records (SPF, DKIM, DMARC)

> [!IMPORTANT]
> **CRITICAL SPF RECORD MERGE RULE:**
> According to DNS specifications (RFC 7208), a domain **MUST HAVE EXACTLY ONE SPF TXT RECORD**. Having multiple TXT records starting with `v=spf1` will cause SPF validation failure and flag emails as SPAM.
> **DO NOT** create a separate TXT record for Brevo. Instead, **MERGE** `include:spf.brevo.com` into your existing Hostinger SPF record.

### 4.1 Exact SPF Record Merge Example
* **Existing Hostinger SPF Record:**
  `v=spf1 include:hostinger.com ~all`
* **Brevo Directive to Add:**
  `include:spf.brevo.com`
* **Merged Single TXT Record for Hostinger DNS (`@` / `jsnc.co.in.`):**
  ```text
  v=spf1 include:hostinger.com include:spf.brevo.com ~all
  ```

### 4.2 DKIM (DomainKeys Identified Mail) Record
- **Type:** `TXT`
- **Host / Name:** Exact selector shown in Brevo Console (e.g. `mail._domainkey` or `brevo._domainkey`)
- **TTL:** `3600`
- **TXT Value:** Copy the exact public key string provided by Brevo Dashboard (do NOT alter whitespace or characters).

### 4.3 DMARC Record
- **Type:** `TXT`
- **Host / Name:** `_dmarc` (or `_dmarc.jsnc.co.in.`)
- **TTL:** `3600`
- **TXT Value (Start with `p=none` first for monitoring):**
  ```text
  v=DMARC1; p=none; rua=mailto:dmarc-reports@jsnc.co.in; pct=100
  ```

---

## 5. Domain & Mail Delivery Setup Checklist

Complete the following checklist in sequence:

- [ ] **1. Brevo Sender & Domain Registration:** Register `jsnc.co.in` in Brevo Console under **Senders & IP -> Domains**.
- [ ] **2. Single Merged SPF Record:** Verify Hostinger DNS has only ONE SPF TXT record containing both Hostinger and Brevo includes: `v=spf1 include:hostinger.com include:spf.brevo.com ~all`.
- [ ] **3. DKIM Record Entry:** Add the DKIM TXT record exactly as Brevo shows it (e.g. Host `mail._domainkey`).
- [ ] **4. DMARC Record Entry:** Add `_dmarc` TXT record with `p=none` policy.
- [ ] **5. Brevo Verification:** Click **Verify Domain** in Brevo Console until status displays **Configured & Verified**.
- [ ] **6. Email Delivery CLI Test:** Execute `npm run mail:test -- --to <address>` and confirm delivery logs `[MAIL DISPATCH SUCCESS]`.
- [ ] **7. Admin API Test:** Call `POST /api/v1/platform/mail-test` as `platform_super_admin` and verify test email arrives in inbox.

---

## 6. Custom Domain Setup (`api.jsnc.co.in`)

1. In Render Dashboard, go to your service `jnc-crm-api` -> **Settings** -> **Custom Domains**.
2. Click **Add Custom Domain** and enter `api.jsnc.co.in`.
3. Render will display a CNAME target (e.g. `jnc-crm-api.onrender.com`).
4. In Hostinger DNS Control Panel:
   - **Type:** `CNAME`
   - **Name:** `api`
   - **Target:** `jnc-crm-api.onrender.com`
   - **TTL:** `3600`
5. Wait for DNS propagation and automatic TLS certificate generation by Render (Let's Encrypt).
