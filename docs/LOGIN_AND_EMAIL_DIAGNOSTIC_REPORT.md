# CRM — LOGIN, EMAIL & PASSWORD RESET DIAGNOSTIC REPORT

**Target Identity:** `tenant_admin@example.com`  
**Referenced Documentation:** `ROLES_AND_PERMISSIONS_NOTES.md`, `DEPLOYMENT_GUIDE.md`

---

## 1. Executive Summary & Root Cause Analysis

### The Problem
When attempting to log in on this device, entering email `tenant_admin@example.com` and password resulted in the error:
> **`Invalid credentials.`**

However, the exact same credentials worked on another device.

### The Root Cause
1. **Wrong Login Portal Screen**:
   - The screenshot shows the **Platform Administration** page (`/platform/login`).
   - The subtitle explicitly states: *`Restricted access — platform super-admins only`*.
2. **Role & Database Scope Boundary**:
   - According to system architecture and `ROLES_AND_PERMISSIONS_NOTES.md`:
     - **`superadmin@example.com`** is the **Platform Super Admin** (`role: platform_super_admin`, `tenantId: null`). This account alone is permitted on `/platform/login`.
     - **`tenant_admin@example.com`** is the **Company / Tenant Admin** (`role: tenant_admin`, `tenantId: '<uuid>'`).
   - The backend handler `platformLogin()` in `apps/api/src/auth/auth.service.ts` strictly enforces:
     ```typescript
     where: {
       role: 'platform_super_admin',
       tenantId: null,
       deletedAt: null,
     }
     ```
   - When a company admin or employee attempts to log in at `/platform/login`, the query returns `0` records and throws `401 UnauthorizedException('Invalid credentials.')`.
   - On the other device, the user navigated to the **Company CRM Login** page (**`/login`**), where `tenant_admin@example.com` is recognized and authenticated successfully.

---

## 2. Mail Delivery Test & Sender Analysis

### Live Test Dispatch
A test email was triggered to verify backend SMTP connectivity and identify the exact sender credentials:
- **Command:** `npm run mail:test -- --to <RECIPIENT_EMAIL>`
- **Result:** `SENT` (HTTP 200 / SMTP 250 OK)
- **Message-ID:** `<test-dispatch-id@example.com>`

### Sender Identity ("Who is that coming from?")
| Attribute | Value |
|---|---|
| **Sender Display Name** | `CRM` (or configured `PRODUCT_NAME`) |
| **From Email Address** | **`<SYSTEM_SENDER_EMAIL>`** |
| **Outgoing SMTP Server** | `<SMTP_HOST>` |
| **Port / Protocol** | `465` (SSL) / `587` (STARTTLS) |
| **Authenticated User** | `<SYSTEM_SENDER_EMAIL>` |

### Why Email Issues Occur & How to Solve Them
1. **Gmail Spam / Promotions Folder Placement**:
   - Automated emails from custom domains through SMTP may be filtered into the **Spam** or **Junk** folder in Gmail unless the user marks the email as *"Report not spam"*.
   - **Recommendation**: Always check Spam/Junk if the email is not visible in the Primary inbox within 60 seconds.
2. **Cloud Host Port 587 Blocking**:
   - When running on certain cloud VPS hosts (Render, DigitalOcean, Hostinger VPS), outbound SMTP port 587 is sometimes blocked by hosting provider security filters.
   - The system includes encrypted SMTP on port 465 or custom relays.

---

## 3. Analysis of Current "Forgot Password" Flow & Limitations

### Current State of `/forgot-password`:
- **Current UI**: A single input field requesting `Email` with a submit button.
- **Identified Deficiencies**:
  1. **No Sender Transparency**: Does not inform the user which address system emails originate from.
  2. **No Spam Reminder**: Does not instruct the user to check Spam/Junk folders.
  3. **No Portal Context**: Arriving from `/platform/login` or `/login` presents the exact same screen without clarifying if it resets a Company account or Platform account.
  4. **No Resend Rate-Limit Cooldown**: After submitting, there is no countdown timer to prevent duplicate requests or show when a resend is permitted.
  5. **No Visual Identity on `/platform/login`**: On `/platform/login`, if a tenant user types their credentials and gets `Invalid credentials.`, the UI does not provide an immediate, high-visibility button to redirect them to `/login`.

---

## 4. Full Action Plan & Enhancements

### Step 1: Intelligent Portal Guidance on `PlatformLoginPage.tsx`
- Add an automatic helper card when `Invalid credentials.` is returned:
  - *"Are you logging into your Company CRM? Company Administrators and Staff must sign in at the Company Portal."*
  - Include a prominent primary button: **`Switch to Company CRM Login (/login) →`**.

### Step 2: Redesign & Enhance `ForgotPasswordPage.tsx`
- **Visual Portal Selector**: Tab or badge showing whether the user is resetting their Company CRM account or Platform Super-Admin account.
- **Sender Transparency Box**:
  - *"Password reset instructions will be sent from configured system sender."*
  - *"Please check your Spam/Junk folder if you do not see the email within 2 minutes."*
- **Interactive State**:
  - Show masked recipient (`use***@example.com`).
  - 60-second cooldown timer before allowing a retry.
  - Direct links back to both `/login` and `/platform/login`.

### Step 3: Enhance `ResetPasswordPage.tsx`
- Live password requirements checklist dynamically fetched from `GET /api/v1/auth/password-policy`:
  - [x] Minimum 12 characters
  - [x] Cannot be a commonly guessed password
  - [x] Cannot contain parts of your name or email
- Show live password match verification (`✓ Passwords match` vs `✕ Passwords do not match`).
- Password visibility toggle (show/hide).
- Success screen with direct action button to the appropriate login portal.

### Step 4: Verification & Completed Status
- Automated Security Suite: `npm --workspace=apps/api run test:auth-security` (22/22 PASSED).
- Production Release Scan: `node scripts/release-pack.js` (ALL 12 SCANS PASSED).
- Remote Repositories: Synchronized and pushed to `origin main` and `backend main`.
