# Render & DNS Configuration for api.jsnc.co.in

This document specifies the exact configuration values to apply in **Render** and your **DNS Provider** (Cloudflare, GoDaddy, Hostinger, AWS Route 53, etc.) for production deployment.

---

## 1. DNS Configuration (Your Domain Registrar / DNS Provider)

Add the following DNS records for `jsnc.co.in`:

| Type | Name / Host | Target / Value | TTL | Proxy / SSL Mode |
|---|---|---|---|---|
| **CNAME** | `api` (or `api.jsnc.co.in`) | `[your-render-service].onrender.com` | Auto (or 300) | DNS-Only (or Cloudflare "Full / Strict") |
| **CNAME** | `admin` (or `admin.jsnc.co.in`) | `[your-web-hosting-cname-or-server]` | Auto (or 300) | DNS-Only (or Cloudflare "Full / Strict") |

> **Verification**:
> ```bash
> dig +short CNAME api.jsnc.co.in
> # Output must return your Render service target
> ```

---

## 2. Render Web Service Settings (Backend API)

In the Render Dashboard under **Service Settings**:

### A. General
- **Name**: `jnc-crm-api`
- **Environment**: `Node`
- **Region**: `Singapore` (or nearest low-latency region to users)
- **Branch**: `main`
- **Root Directory**: Leave empty (repository root)
- **Build Command**:
  ```bash
  npm run bundle:api
  ```
- **Start Command**:
  ```bash
  node apps/api/dist/main.js
  ```

### B. Custom Domains
1. Click **Add Custom Domain**.
2. Enter: `api.jsnc.co.in`
3. Wait for Render to issue the automated Let's Encrypt TLS/SSL certificate.

### C. Environment Variables (Required in Render)

| Environment Variable | Value / Description | Sensitive? |
|---|---|---|
| `NODE_ENV` | `production` | No |
| `PORT` | `10000` (Render default) | No |
| `DATABASE_URL` | `postgresql://...` (Target PostgreSQL connection string) | **YES** |
| `DIRECT_URL` | `postgresql://...` (Direct non-pooler connection string) | **YES** |
| `FRONTEND_URL` | `https://admin.jsnc.co.in` | No |
| `ALLOWED_ORIGINS` | `https://admin.jsnc.co.in,https://jsnc.co.in,https://www.jsnc.co.in` | No |
| `COOKIE_DOMAIN` | `.jsnc.co.in` | No |
| `COOKIE_SECURE` | `true` | No |
| `COOKIE_SAMESITE` | `lax` | No |
| `TRUST_PROXY` | `1` | No |
| `JWT_SECRET` | 64+ char random string | **YES** |
| `JWT_REFRESH_SECRET` | 64+ char random string | **YES** |
| `OTP_SECRET` | 64+ char random string | **YES** |
| `ENCRYPTION_KEY` | 32-byte base64 encoded AES key | **YES** |
| `EMAIL_FROM` | `noreply@jsnc.co.in` | No |
| `SMTP_HOST` | Transactional SMTP host | No |
| `SMTP_PORT` | `587` | No |
| `SMTP_USER` | SMTP username | No |
| `SMTP_PASS` | SMTP password / API token | **YES** |
| `DEV_DEMO_LOGIN` | Must remain **unset** or `false` | No |

---

## 3. Web Frontend Environment (Build-Time)

When building the frontend website for upload to your web hosting:

| Environment Variable | Production Value | Description |
|---|---|---|
| `VITE_API_URL` | `https://api.jsnc.co.in/api/v1` | **The single source of truth for the API**. Production builds strictly fail if unset. |
| `VITE_PRODUCT_NAME` | `Syntra CRM` | Brand product name |

Build command:
```bash
npm --workspace=apps/web run build
```
Upload the generated `apps/web/dist` folder to your web host for `admin.jsnc.co.in`.
