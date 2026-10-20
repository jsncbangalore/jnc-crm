# JNC CRM — LOGIN, EMAIL & PASSWORD RESET DIAGNOSTIC REPORT

**Date:** 2026-10-20  
**Target Identity:** `santhosh1508sk@gmail.com`  
**Referenced Documentation:** `ROLES_AND_PERMISSIONS_NOTES.md`, `Super Admin.txt`, `DEPLOYMENT_GUIDE.md`

---

## 1. Executive Summary & Root Cause Analysis

### The Problem
When attempting to log in on this device, entering email `santhosh1508sk@gmail.com` and password `homework@2003` resulted in the error:
> **`Invalid credentials.`**

However, the exact same credentials worked on another device.

### The Root Cause
1. **Wrong Login Portal Screen**:
   - The screenshot shows the **Platform Administration** page (`/platform/login`).
   - The subtitle explicitly states: *`Restricted access — platform super-admins only`*.
2. **Role & Database Scope Boundary**:
   - According to system architecture and `ROLES_AND_PERMISSIONS_NOTES.md`:
     - **`jayarajjnc@gmail.com`** is the **Platform Super Admin** (`role: platform_super_admin`, `tenantId: null`). This account alone is permitted on `/platform/login`.
     - **`santhosh1508sk@gmail.com`** is the **Company / Tenant Admin** (`role: tenant_admin`, `tenantId: '06a3bcd1...'`).
   - The backend handler `platformLogin()` in `apps/api/src/auth/auth.service.ts` strictly enforces:
     ```typescript
     where: {
       role: 'platform_super_admin',
       tenantId: null,
       deletedAt: null,
     }
     ```
   - When a company admin or employee attempts to log in at `/platform/login`, the query returns `0` records and throws `401 UnauthorizedException('Invalid credentials.')`.
   - On the other device, the user navigated to the **Company CRM Login** page (**`/login`**), where `santhosh1508sk@gmail.com` is recognized and authenticated successfully.

---

## 2. Mail Delivery Test & Sender Analysis

### Live Test Dispatch
A test email was triggered to verify backend SMTP connectivity and identify the exact sender credentials:
- **Command:** `npm run mail:test -- --to santhosh1508sk@gmail.com`
- **Result:** `SENT` (HTTP 200 / SMTP 250 OK)
- **Message-ID:** `<2f517f35-09a9-df47-2d46-e699c23490af@jsnc.co.in>`

### Sender Identity ("Who is that coming from?")
| Attribute | Value |
|---|---|
| **Sender Display Name** | `JNC CRM` (or `JNC CRM CLI Test`) |
| **From Email Address** | **`jayaraj@jsnc.co.in`** |
| **Outgoing SMTP Server** | `smtpout.secureserver.net` (GoDaddy / Secureserver) |
| **Port / Protocol** | `587` (STARTTLS) |
| **Authenticated User** | `jayaraj@jsnc.co.in` |

### Why Email Issues Occur & How to Solve Them
1. **Gmail Spam / Promotions Folder Placement**:
   - Automated emails from custom domains (like `jsnc.co.in`) through GoDaddy SMTP may be filtered into the **Spam** or **Junk** folder in Gmail unless the user marks the email as *"Report not spam"*.
   - **Recommendation**: Always check Spam/Junk if the email is not visible in the Primary inbox within 60 seconds.
2. **Cloud Host Port 587 Blocking**:
   - When running on certain cloud VPS hosts (Render, DigitalOcean, Hostinger VPS), outbound SMTP port 587 is sometimes blocked by hosting provider security filters.
   - The system includes automatic REST API fallbacks (`Brevo` or `Resend`) via HTTPS port 443 which can be activated if SMTP connection timeouts ever occur.

---

## 3. Analysis of Current "Forgot Password" Flow & Limitations

### Current State of `/forgot-password`:
- **Current UI**: A single input field requesting `Email` with a submit button.
- **Identified Deficiencies**:
  1. **No Sender Transparency**: Does not inform the user that emails originate from `jayaraj@jsnc.co.in`.
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
  - *"Password reset instructions will be sent from **jayaraj@jsnc.co.in**."*
  - *"Please check your Spam/Junk folder if you do not see the email within 2 minutes."*
- **Interactive State**:
  - Show masked recipient (`san***@gmail.com`).
  - 60-second cooldown timer before allowing a retry.
  - Direct links back to both `/login` and `/platform/login`.

### Step 3: Enhance `ResetPasswordPage.tsx`
- Add real-time password policy checklist:
  - [ ] Minimum 12 characters
  - [ ] At least one uppercase letter
  - [ ] At least one number
  - [ ] At least one special symbol (`@$!%*?&`)
- Show live password match verification before enabling the submit button.

### Step 4: Verification & Safe Testing
- Test the full loop:
  1. Trigger reset for `santhosh1508sk@gmail.com`.
  2. Confirm receipt in inbox/spam from `jayaraj@jsnc.co.in`.
  3. Verify link redirection and password update.
