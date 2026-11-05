# Same-Site API Architecture & Subdomain Migration Guide

This architectural guide documents the exact steps required to serve the CRM API from a subdomain of the primary domain (e.g., `api.jsnc.co.in` alongside `admin.jsnc.co.in`).

Serving the API as a same-site subdomain eliminates third-party cookie restrictions across all major web browsers (Safari Intelligent Tracking Prevention, Chrome Privacy Sandbox, Firefox Total Cookie Protection, and Brave Shields) and allows 100% of refresh token storage to reside in secure `HttpOnly` cookies.

> **Status:** Specification and Runbook only. Do not implement until scheduled by engineering.

---

## 1. Architectural Overview & Benefits

```
Current (Cross-Site Architecture):
+-------------------------------+              +----------------------------------+
| Frontend Web Client           |  CORS fetch  | Backend API Server               |
| https://admin.jsnc.co.in      | -----------> | https://crm-api.onrender.com     |
+-------------------------------+              +----------------------------------+
  Cookies treated as 3rd-party:
  - Requires SameSite=None; Secure
  - Blocked by Safari ITP, Brave, Chrome incognito
  - Requires fallback token (crm_refresh_token_fb) in localStorage

Target (Same-Site Subdomain Architecture):
+-------------------------------+              +----------------------------------+
| Frontend Web Client           |  Same-Site   | Backend API Server               |
| https://admin.jsnc.co.in      | -----------> | https://api.jsnc.co.in           |
+-------------------------------+              +----------------------------------+
  Cookies treated as 1st-party:
  - Registrable domain: jsnc.co.in
  - Cookie domain: .jsnc.co.in
  - SameSite=Lax or Strict; Secure; HttpOnly
  - ZERO fallback tokens needed; immune to browser cookie blocking
```

---

## 2. Step 1: DNS Record Configuration

Configure a canonical name (`CNAME`) record on your authoritative DNS provider (e.g., Cloudflare, Route53, Namecheap, GoDaddy):

| Type  | Name / Host | Target / Value | TTL | Proxy Status |
| :---  | :--- | :--- | :--- | :--- |
| **CNAME** | `api` (or `api.jsnc.co.in`) | `jnc-crm-api.onrender.com` | `300` / Auto | DNS-Only (or Cloudflare Full Strict) |

### Verification Command:
```bash
dig +short CNAME api.jsnc.co.in
# Expected Output: jnc-crm-api.onrender.com.
```

---

## 3. Step 2: Render Custom Domain Setup

1. Open the **Render Dashboard** (`dashboard.render.com`).
2. Navigate to the Web Service powering the backend (e.g., `jnc-crm-api`).
3. In the left navigation menu, click **Settings**.
4. Scroll to **Custom Domains** and click **Add Custom Domain**.
5. Enter: `api.jsnc.co.in` and click **Save**.
6. Render will verify DNS propagation and automatically provision a free Let's Encrypt TLS/SSL certificate.
7. Wait until the domain status shows **Verified** with an active SSL certificate badge.

### TLS Verification:
```bash
curl -Iv https://api.jsnc.co.in/api/v1/health
# Confirm HTTP 200 OK and valid SSL certificate for api.jsnc.co.in
```

---

## 4. Step 3: Environment Variables & CORS Origins

### Backend Environment Variables (`apps/api/.env` / Render Dashboard)

```env
# 1. API Host & Routing
API_HOST="https://api.jsnc.co.in"
FRONTEND_URL="https://admin.jsnc.co.in"

# 2. CORS Allowed Origins (Comma-separated)
CORS_ORIGIN="https://admin.jsnc.co.in"
ALLOWED_ORIGINS="https://admin.jsnc.co.in"

# 3. Cookie Configuration
# Setting COOKIE_DOMAIN with a leading dot shares the cookie across all subdomains
COOKIE_DOMAIN=".jsnc.co.in"

# SameSite policy: 'lax' for standard web navigation or 'strict' for highest isolation
COOKIE_SAMESITE="lax"

# Secure must be true in production HTTPS
COOKIE_SECURE="true"
```

### Frontend Environment Variables (`apps/web/.env` / Hosting Dashboard)

```env
# Point frontend API client directly to custom subdomain
VITE_API_URL="https://api.jsnc.co.in/api/v1"
```

---

## 5. Step 4: Cookie SameSite Policy Configuration

With `COOKIE_DOMAIN=".jsnc.co.in"` and both frontend and API under `jsnc.co.in`:

### `SameSite=Lax` (Recommended)
- **Behavior:** The browser automatically attaches `crm_refresh_token` on all same-site requests (`admin.jsnc.co.in` -> `api.jsnc.co.in`) as well as top-level user navigations (e.g., clicking a link to the CRM).
- **Protection:** Prevents CSRF attacks for all state-changing HTTP methods (`POST`, `PUT`, `DELETE`, `PATCH`).
- **Compatibility:** Maximum compatibility with external redirects, OAuth handshakes, and email verification links.

### `SameSite=Strict` (Optional High-Security Mode)
- **Behavior:** The cookie is sent **only** if the request originated from the exact same site. Even following a link from an external website or email client will not send the cookie on the first request.
- **Protection:** Absolute CSRF defense.
- **Tradeoff:** Users clicking a bookmark or email link will see an unauthenticated page until navigating internally.

---

## 6. Step 5: Removing the Client-Side Fallback Token (`crm_refresh_token_fb`)

Once the same-site subdomain is active and verified, client-side fallback storage is no longer needed. Follow these steps to deprecate and remove it:

### A. Remove Fallback Storage from `apps/web/src/services/api.ts`
1. Remove `STAFF_REFRESH_KEY` (`'crm_refresh_token_fb'`) and `PLATFORM_REFRESH_KEY` (`'platform_refresh_token_fb'`).
2. Simplify `setStoredRefreshToken`:
   ```ts
   // Deprecated: No storage of refresh tokens in localStorage/sessionStorage.
   export const setStoredRefreshToken = () => {};
   export const getStoredRefreshToken = () => null;
   ```
3. In `executeResilientRefresh`:
   - Eliminate the `{ refreshToken: fallbackToken }` body payload.
   - Rely solely on `withCredentials: true` sending the browser's HttpOnly cookie:
   ```ts
   return axios.post(
     refreshUrl,
     expectedUserId ? { expectedUserId } : {},
     {
       withCredentials: true,
       timeout: 60000,
       headers: {
         'X-Requested-With': 'XMLHttpRequest',
         'Content-Type': 'application/json',
       },
     }
   );
   ```

### B. Clean Up Storage References
- Remove references to `crm_refresh_token_fb` in:
  - `apps/web/src/contexts/AuthContext.tsx`
  - `apps/web/src/components/auth/AuthLoginForm.tsx`
  - `apps/web/src/components/common/ErrorStateCard.tsx`
  - `apps/web/src/config/storage-inventory.ts`
- Clean any legacy tokens from client storage on initialization:
  ```ts
  try {
    localStorage.removeItem('crm_refresh_token_fb');
    sessionStorage.removeItem('crm_refresh_token_fb');
    localStorage.removeItem('platform_refresh_token_fb');
    sessionStorage.removeItem('platform_refresh_token_fb');
  } catch {}
  ```

---

## 7. Migration Verification & Testing Checklist

- [ ] **DNS CNAME Resolution:** `dig api.jsnc.co.in` points to Render hostname.
- [ ] **TLS Certificate Valid:** Browser shows secure lock on `https://api.jsnc.co.in/api/v1/health`.
- [ ] **CORS Pre-flight:** OPTIONS request from `https://admin.jsnc.co.in` receives `Access-Control-Allow-Origin: https://admin.jsnc.co.in` and `Access-Control-Allow-Credentials: true`.
- [ ] **Cookie Response Headers:**
  ```http
  Set-Cookie: crm_refresh_token=...; Domain=.jsnc.co.in; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Lax
  Set-Cookie: crm_session_active=1; Domain=.jsnc.co.in; Path=/; Secure; SameSite=Lax
  ```
- [ ] **Browser Storage Audit:** DevTools -> Application -> Local Storage contains **zero** refresh tokens.
- [ ] **Safari & Brave Smoke Test:** Verify refresh token cycle completes automatically in Safari private browsing and Brave shields without session drop.
