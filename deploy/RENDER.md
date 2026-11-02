# Render Deployment Guide

This runbook documents production deployment on Render and DNS mail configuration.

---

## 1. Environment Variable Specification

Configure the following environment variables in the Render Dashboard under **Environment**:

| Variable Name | Required | Description & Generation Instructions |
|---|---|---|
| `NODE_ENV` | Yes | Set to `production`. |
| `PORT` | Yes | Set to `3333` (or leave default `$PORT` set by Render). |
| `PRODUCT_NAME` | Optional | Product display name (defaults to "CRM"). |
| `FRONTEND_URL` | Yes | Public Web App URL (e.g. `https://<YOUR_FRONTEND_DOMAIN>`). |
| `ALLOWED_ORIGINS` | Yes | Comma-separated CORS origins (e.g. `https://<YOUR_FRONTEND_DOMAIN>,https://<YOUR_API_DOMAIN>`). |
| `DATABASE_URL` | Yes | PostgreSQL connection string. |
| `DIRECT_URL` | Yes | Direct PostgreSQL connection string for Prisma migrations. |
| `EMAIL_FROM` | Yes | System sender email address (must match `SMTP_USER`). |
| `SMTP_HOST` | Yes | Outgoing SMTP host. |
| `SMTP_PORT` | Yes | SMTP port (465 or 587). |
| `SMTP_USER` | Yes | SMTP authenticated user. |
| `SMTP_PASS` | Yes | SMTP password. |
| `SMTP_SECURE` | Yes | Set to `true` for port 465. |
| `OTP_SECRET` | Yes | Min 32-character secret. |
| `JWT_SECRET` | Yes | Min 32-character secret. |
| `JWT_REFRESH_SECRET` | Yes | Min 32-character secret. |
| `ENCRYPTION_KEY` | Yes | 32-byte secret for credential encryption. |

---

## 2. DNS Records (SPF, DKIM, DMARC)

> [!IMPORTANT]
> **SPF RECORD RULE:**
> According to RFC 7208, a domain **MUST HAVE EXACTLY ONE SPF TXT RECORD**.

### 2.1 SPF Record Example
- **Type:** `TXT`
- **Host:** `@`
- **Value:** `v=spf1 include:<YOUR_MAIL_PROVIDER_SPF> ~all`

### 2.2 DKIM Record
- **Type:** `TXT`
- **Host:** Selector provided by your mail provider (e.g. `mail._domainkey`)
- **Value:** Copy the exact public key string provided by your mail provider.

### 2.3 DMARC Record
- **Type:** `TXT`
- **Host:** `_dmarc`
- **Value:**
  ```text
  v=DMARC1; p=none; rua=mailto:dmarc-reports@<YOUR_DOMAIN>; pct=100
  ```

---

## 3. Custom Domain Setup

1. In Render Dashboard, go to your service -> **Settings** -> **Custom Domains**.
2. Click **Add Custom Domain** and enter `api.<YOUR_DOMAIN>`.
3. Render will display a CNAME target (e.g. `<service-name>.onrender.com`).
4. In your DNS Control Panel:
   - **Type:** `CNAME`
   - **Name:** `api`
   - **Target:** `<service-name>.onrender.com`
   - **TTL:** `3600`
5. Wait for DNS propagation and automatic TLS certificate generation.
