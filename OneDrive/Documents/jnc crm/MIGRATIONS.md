# Database Migrations Deployment & Verification Guide

This document lists the 5 database migration files required for the Enterprise 2-Step Verification (2FA), Session Security, Single-Use Reset Tickets, Email Outbox, and Mail TLS updates.

---

## Migration Execution Order

Run migrations in strict sequential order using the production migration runner:
```bash
CONFIRM_PRODUCTION=yes npm --workspace=apps/api run migrate:prod
```

---

## 1. `20261020093000_add_otp_challenge_and_device_sessions`
- **Order:** 1 of 5
- **What it Changes:**
  - Adds `photoUrl` (TEXT) and `lastPasswordChangeAt` (TIMESTAMP) columns to table `User`.
  - Adds `userAgent` (TEXT), `ipAddress` (TEXT), `lastUsedAt` (TIMESTAMP), and `deviceLabel` (TEXT) columns to table `RefreshSession`.
  - Creates table `OtpChallenge` (`id` PK, `emailNormalized`, `purpose`, `codeHash`, `expiresAt`, `attempts`, `maxAttempts`, `resendAfter`, `usedAt`, `requestIp`, `requestUserAgent`, `createdAt`) with indexes on `emailNormalized` and `expiresAt`.
- **Can it be Rolled Back:** Yes (fully additive and backward-compatible).
  ```sql
  DROP TABLE IF EXISTS "OtpChallenge";
  ALTER TABLE "RefreshSession" DROP COLUMN IF EXISTS "deviceLabel", DROP COLUMN IF EXISTS "lastUsedAt", DROP COLUMN IF EXISTS "ipAddress", DROP COLUMN IF EXISTS "userAgent";
  ALTER TABLE "User" DROP COLUMN IF EXISTS "lastPasswordChangeAt", DROP COLUMN IF EXISTS "photoUrl";
  ```
- **Exact Smoke Test:**
  1. Trigger password reset: `POST /api/v1/auth/forgot-password/request` with `{"email": "test@example.com"}`.
  2. Query `SELECT id, "emailNormalized", purpose, "expiresAt" FROM "OtpChallenge" WHERE "emailNormalized" = 'test@example.com';` and verify 1 row returned.
  3. Sign in to any account and query `SELECT "deviceLabel", "userAgent", "ipAddress" FROM "RefreshSession" WHERE "userId" = '<user_id>' LIMIT 1;`. Verify device metadata is populated.

---

## 2. `20261020103000_add_mail_account_encryption`
- **Order:** 2 of 5
- **What it Changes:**
  - Adds column `encryption` (TEXT NOT NULL DEFAULT 'starttls') to table `MailAccount`.
  - Migrates legacy data: sets `encryption = 'ssl'` for accounts where `isSecure = true` or `smtpPort = 465`, and `encryption = 'starttls'` for all others.
- **Can it be Rolled Back:** Yes.
  ```sql
  ALTER TABLE "MailAccount" DROP COLUMN IF EXISTS "encryption";
  ```
- **Exact Smoke Test:**
  1. Run the non-destructive inspector:
     ```bash
     npm --workspace=apps/api run inspect:mail-tls
     ```
  2. Verify inspector reports existing `MailAccount` rows with their new `encryption` value (`ssl` or `starttls`) without runtime schema errors.

---

## 3. `20261020110000_add_reset_ticket`
- **Order:** 3 of 5
- **What it Changes:**
  - Creates table `ResetTicket` (`id` PK, `jti` UNIQUE, `emailNormalized`, `expiresAt`, `usedAt`, `createdAt`) with indexes on `jti`, `emailNormalized`, and `expiresAt`.
- **Can it be Rolled Back:** Yes.
  ```sql
  DROP TABLE IF EXISTS "ResetTicket";
  ```
- **Exact Smoke Test:**
  1. Submit a valid OTP code to `POST /api/v1/auth/forgot-password/verify`.
  2. Verify response contains `resetTicket` JWT.
  3. Query `SELECT id, jti, "emailNormalized", "usedAt" FROM "ResetTicket" WHERE "emailNormalized" = 'test@example.com';`. Verify `usedAt` is NULL.
  4. Submit password reset via `POST /api/v1/auth/forgot-password/reset`. Query `ResetTicket` again and verify `usedAt` is now populated.
  5. Resubmit the exact same `resetTicket`; verify rejection with `HTTP 400 Bad Request`.

---

## 4. `20261020120000_add_email_outbox`
- **Order:** 4 of 5
- **What it Changes:**
  - Creates table `EmailOutbox` (`id` PK, `tenantId`, `to`, `subject`, `text`, `html`, `status`, `attempts`, `maxAttempts`, `lastError`, `nextAttemptAt`, `sentAt`, `isDecoy`, `createdAt`, `updatedAt`) with index on `["status", "nextAttemptAt"]`.
- **Can it be Rolled Back:** Yes.
  ```sql
  DROP TABLE IF EXISTS "EmailOutbox";
  ```
- **Exact Smoke Test:**
  1. Request reset for an existing email: verify `EmailOutbox` row created with `status = 'pending'`, `isDecoy = false`.
  2. Request reset for a non-existent email: verify `EmailOutbox` row created with `status = 'discarded'`, `isDecoy = true`.
  3. Query `SELECT id, "to", status, "isDecoy" FROM "EmailOutbox" ORDER BY "createdAt" DESC LIMIT 2;`.

---

## 5. `20261020130000_add_two_factor_auth`
- **Order:** 5 of 5
- **What it Changes:**
  - Adds column `requireTwoFactor` (BOOLEAN NOT NULL DEFAULT false) to table `Tenant`.
  - Adds column `firstLoginAfter2FaReleaseAt` (TIMESTAMP) to table `User`.
  - Creates table `UserTwoFactor` (`id` PK, `userId` UNIQUE, `method` DEFAULT 'totp', `secretEnc`, `enabledAt`, `lastUsedStep`, `backupCodesHash`, `createdAt`, `updatedAt`).
  - Creates table `TrustedDevice` (`id` PK, `userId`, `tokenHash` UNIQUE, `label`, `userAgent`, `ip`, `expiresAt`, `lastUsedAt`, `createdAt`) with index on `userId`.
  - Creates table `LoginTicket` (`id` PK, `jti` UNIQUE, `userId`, `expiresAt`, `usedAt`, `attempts`, `createdAt`) with index on `jti`.
  - Adds foreign key constraints with `ON DELETE CASCADE` referencing table `User`.
- **Can it be Rolled Back:** Yes.
  ```sql
  DROP TABLE IF EXISTS "LoginTicket";
  DROP TABLE IF EXISTS "TrustedDevice";
  DROP TABLE IF EXISTS "UserTwoFactor";
  ALTER TABLE "User" DROP COLUMN IF EXISTS "firstLoginAfter2FaReleaseAt";
  ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "requireTwoFactor";
  ```
- **Exact Smoke Test:**
  1. Authenticate with an account with 2FA enabled:
     `POST /api/v1/auth/login` with correct credentials.
     Verify response returns `requiresTwoFactor: true`, `methods: ["totp", "backup_code"]`, and `loginTicket`. Verify NO `accessToken` or `refreshToken` is issued.
  2. Verify 2FA challenge:
     `POST /api/v1/auth/login/verify-2fa` with `loginTicket` and valid TOTP code.
     Verify `accessToken` is returned and `UserTwoFactor.lastUsedStep` is updated in database.
  3. Run comprehensive automated security verification:
     ```bash
     npm --workspace=apps/api run test:auth-security
     ```
