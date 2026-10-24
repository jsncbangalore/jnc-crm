# Deployment Guide: Production Hardening & Multi-Tenant Release

This guide outlines the strict sequence for deploying the Auth single-use ticket, company boundary enforcement, multi-tenant white-labeling, and Mail TLS hardening updates to production.

---

## Deployment Order

### 1. Database Backup
Before applying any changes, take a full snapshot backup of the production database:

```bash
# Option A: Run repository backup script
npm run db:backup

# Option B: Direct pg_dump
pg_dump --clean --if-exists --no-owner --no-privileges "$DIRECT_URL" > "backup-$(date +%Y%m%d_%H%M%S).sql"
```

Tag the current production release in Git:
```bash
git tag "pre-deploy-$(date +%Y%m%d%H%M)"
```

---

### 2. Environment Variables
Verify that all production environment variables are configured with cryptographically strong secrets.

The API server will **refuse to start in production** (`process.exit(1)`) if:
- `EMAIL_FROM` or SMTP variables (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`) are missing
- `EMAIL_FROM` differs from `SMTP_USER`
- `ALLOWED_ORIGINS` or `FRONTEND_URL` is missing
- `DATABASE_URL` is missing
- `OTP_SECRET` or `ENCRYPTION_KEY` is missing or shorter than 32 characters

| Variable | Requirement | Description |
| :--- | :--- | :--- |
| `PRODUCT_NAME` | Optional | White-label product display name (defaults to "CRM") |
| `PRODUCT_LOGO_URL` | Optional | Brand logo image URL for system communications |
| `FRONTEND_URL` | Valid URL | Canonical production frontend URL |
| `ALLOWED_ORIGINS` | Comma-delimited URLs | Allowed CORS origins for browser API access |
| `EMAIL_FROM` | Valid Email | Sole authorized sender for system emails |
| `SMTP_HOST` | Hostname | SMTP mail server hostname |
| `SMTP_PORT` | Port number | SMTP server port (typically 465 or 587) |
| `SMTP_USER` | Valid Email | SMTP authenticated username (must match `EMAIL_FROM`) |
| `SMTP_PASS` | Password | SMTP authenticated password |
| `SMTP_SECURE` | boolean | Set to `true` for SSL/TLS on port 465 |
| `OTP_SECRET` | Min 32 chars | HMAC-SHA256 key for hashing 6-digit OTP codes and challenge IDs |
| `ENCRYPTION_KEY` | Min 32 chars | AES-256-GCM master key for encrypting SMTP passwords at rest |
| `JWT_SECRET` | Min 32 chars | Secret key for signing and verifying single-use `resetTicket` JWTs |
| `DATABASE_URL` | Valid URL | PostgreSQL connection pooler string |
| `DIRECT_URL` | Valid URL | Direct PostgreSQL connection string for migrations |

*Generate compliant secrets using OpenSSL if required:*
```bash
openssl rand -hex 32
```

---

### 3. Database Migrations
Deploy pending database migrations in sequential order. Do **NOT** run `db push` in production.

Pending migrations:
1. `20261020100000_add_mail_account_encryption`: Adds `encryption` (`ssl` | `starttls`) to `MailAccount`, migrates existing `isSecure` rows, and deprecates `none`.
2. `20261020110000_add_reset_ticket`: Adds `ResetTicket` table with `jti`, `emailNormalized`, and `usedAt` for single-use replay protection.
3. `20261020120000_add_email_outbox`: Adds `EmailOutbox` table for async, reliable SMTP delivery and decoy dispatching.
4. `20261020130000_add_two_factor_auth`: Adds `UserTwoFactor`, `TrustedDevice`, `LoginTicket`, and `Tenant.requireTwoFactor` for enterprise 2-Step Verification (TOTP, backup codes, email fallback, trusted devices).

Execute migration command:
```bash
CONFIRM_PRODUCTION=yes npm --workspace=apps/api run migrate:prod
```

Run pre-deploy TLS inspection to verify existing mail accounts without printing secrets:
```bash
npm --workspace=apps/api run inspect:mail-tls
```

---

### 4. Backend Deployment
Build and restart the NestJS API application:

```bash
# Build API package
npm --workspace=apps/api run build

# Restart API process (e.g., via PM2 or systemd)
pm2 reload crm-api --update-env
```

Verify backend health check:
```bash
curl -f https://<api-domain>/api/v1/health
curl -f https://<api-domain>/api/v1/auth/password-policy
```

---

### 5. Frontend Deployment
Build and deploy the React / Vite frontend bundle:

```bash
# Build Web package
npm --workspace=apps/web run build

# Deploy dist folder to CDN / static hosting (e.g. Vercel, S3, or Nginx)
```

---

### 6. Smoke Testing
Execute automated and manual verification:

```bash
# Run automated Mail TLS test suite
npm --workspace=apps/api run test:mail-security

# Run automated Auth & OTP security verification suite
npm --workspace=apps/api run test:auth-security

# Run live endpoint security verification
node scripts/verify-live.js
```

**Manual Verification Checklist:**
1. **Forgot Password Parity**: Request reset for a known email and an unknown email; verify both return the identical timing-safe message: *"If an active account exists for [email], a 6-digit verification code has been sent."*
2. **OTP Single-Use & Replay**: Complete password reset with verification code. Attempt to reuse the same `resetTicket` in a second request; verify rejection with `HTTP 400 Bad Request`.
3. **Session Revocation**: Verify all prior browser sessions for the reset user account are revoked.
4. **Company Boundary Check**: As `tenant_admin` of Company A, verify administrative actions on Company B users are rejected with `HTTP 403 Forbidden`.
5. **Mail Auto-Detect**: On Settings > Mail Accounts > Add Account, enter a Gmail or Microsoft 365 address; verify auto-fill of host, port, and standard TLS encryption.
6. **SMTP Test with SSRF & TLS**: Test a connection; verify private IPs (e.g. `127.0.0.1`) and unencrypted ports (e.g. `25`) are rejected, and successful connections enforce strict TLS certificate validation.
7. **2FA Enforcement & Grace Period**: Log in as `platform_super_admin` or `tenant_admin`; verify 7-day grace period notification banner. If grace period expires, verify setup modal triggers and blocks access.
8. **2FA Setup & QR Code**: In My Account > Security, click "Set up 2-Step Verification"; verify QR code renders without network calls, TOTP authenticator scans correctly, and 10 backup codes (XXXX-XXXX format) are issued.
9. **2FA Login Challenge**: Log in with 2FA enabled; verify password verification succeeds first without issuing session tokens, presenting the 6-digit challenge. Verify both TOTP code and single-use backup code authenticate the login.
10. **Trusted Device Bypass**: Check "Trust this device for 30 days" during 2FA verification. Log out and log back in; verify 2FA challenge is bypassed while cookie remains valid.
11. **Company Admin 2FA Reset**: As `tenant_admin`, reset 2FA for an enrolled user in Users list; verify user's 2FA is reset and all sessions are revoked.

---

### 7. Emergency Recovery Procedures
In the event of administrative lockouts:

**Reset 2-Step Verification (Platform Super Admin or Locked User):**
```bash
CONFIRM_PRODUCTION=yes npm run admin:reset-2fa
```

**Hardened Admin Password Reset (Strict Complexity & Common Password Guard):**
```bash
CONFIRM_PRODUCTION=yes npm run admin:set-password
```

---

### 8. Rollback Plan
If unexpected issues arise during deployment:

1. **Frontend Rollback**:
   Revert static hosting deployment to the previous deployment build or Git tag.
2. **Backend Rollback**:
   Revert API server to previous Git commit and restart:
   ```bash
   git checkout <pre-deploy-tag>
   npm --workspace=apps/api run build
   pm2 reload crm-api --update-env
   ```
3. **Database Rollback**:
   The migration changes are additive and backward-compatible. If full database rollback is necessary, restore the pre-deployment SQL dump:
   ```bash
   psql "$DIRECT_URL" < "backup-<timestamp>.sql"
   ```
