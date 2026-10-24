# Production Go-Live Deployment Guide

This runbook documents the clean production deployment of the multi-tenant CRM using a web frontend (`https://<YOUR_FRONTEND_DOMAIN>`), a dedicated backend API service (`https://<YOUR_API_DOMAIN>`), and a managed PostgreSQL database.

---

## 1. Create the API Subdomain

1. **Create Subdomain in DNS / Hosting Panel**:
   - Create an `api` subdomain pointing to your backend hosting server (e.g. `api.<YOUR_DOMAIN>`).
2. **Enable SSL**:
   - Request and verify an SSL/TLS certificate for `api.<YOUR_DOMAIN>`.
3. **Wait for DNS Propagation**:
   - Allow time for DNS record propagation.
4. **Verify DNS Resolution**:
   - Run the following command:
     ```bash
     nslookup api.<YOUR_DOMAIN>
     ```
   - Confirm `nslookup` returns an IP address.

---

## 2. Deployment Architecture Options

### Option A: Node.js Web App / Managed Container
1. Select **Node.js 20.x LTS**.
2. Application Root: `/api`.
3. Entry file: `start_server.js`.
4. Configure production environment variables.

### Option B: VPS / Dedicated Server
1. Provision a Linux VPS or cloud instance.
2. In your DNS Zone Editor, point the `A` record for `api.<YOUR_DOMAIN>` to the IP address of your host.
3. Configure Environment Variables:
   ```ini
   NODE_ENV=production
   DATABASE_URL=postgresql://<DB_USER>:<PASSWORD>@<DB_HOST>:5432/<DB_NAME>?sslmode=require
   JWT_SECRET=<STRONG_64_CHAR_HEX_SECRET>
   JWT_REFRESH_SECRET=<STRONG_64_CHAR_HEX_SECRET>
   OTP_SECRET=<STRONG_32_CHAR_SECRET>
   ENCRYPTION_KEY=<STRONG_32_BYTE_BASE64_KEY>
   FRONTEND_URL=https://<YOUR_FRONTEND_DOMAIN>
   ALLOWED_ORIGINS=https://<YOUR_FRONTEND_DOMAIN>
   TRUST_PROXY=1
   SMTP_HOST=<SMTP_HOST>
   SMTP_PORT=465
   SMTP_USER=<SYSTEM_EMAIL_ADDRESS>
   SMTP_PASS=<SMTP_PASSWORD>
   SMTP_SECURE=true
   EMAIL_FROM=<SYSTEM_EMAIL_ADDRESS>
   ```

5. Application Start Command:
   ```bash
   npm install --omit=dev
   node start_server.js
   ```

---

## 3. Local Build, Migration & Release Packaging

Run the preparation pipeline:

```bash
# 1. Preflight database health check
npm run db:preflight-live

# 2. Deploy database migrations over DIRECT_URL
CONFIRM_PRODUCTION=yes npm --workspace=apps/api run migrate:prod

# 3. Build production release archives
npm run release:pack
```

`npm run release:pack` validates branding security guards and generates production release archives in `deploy-release/`.

---

## 4. Deployment Execution

### A. Deploy API Bundle to `api.<YOUR_DOMAIN>`
1. Extract release archive to the API root folder.
2. Configure production environment variables.
3. Run package installation: `npm install --omit=dev`.
4. Entry file: `start_server.js`. Start or reload the application service.

### B. Deploy Web Bundle to `<YOUR_FRONTEND_DOMAIN>`
1. Extract web distribution bundle into the web server root.
2. Verify `.htaccess` or Nginx rewrite rules are present for SPA routing and security header enforcement.

---

## 5. Verification

After API and Web deployment:

1. **Run Live Verification**:
   ```bash
   npm run verify:live -- --web https://<YOUR_FRONTEND_DOMAIN> --api https://<YOUR_API_DOMAIN>
   ```
2. **Platform & Company Setup Flow**:
   - Platform Admin signs in at `https://<YOUR_FRONTEND_DOMAIN>/platform/login`.
   - Provision tenant organization and assign initial administrator account.
