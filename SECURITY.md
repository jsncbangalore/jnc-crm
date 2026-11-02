# Security Policy & Hardening Guide

## 1. Vulnerability Reporting Procedure
If you discover a security vulnerability, please report it privately to our security team:
- **Email**: <SECURITY_EMAIL>
- **Response SLA**: Within 24 hours acknowledging receipt, with a status update every 48 hours until resolved.
- Please do **not** disclose security vulnerabilities publicly or open public GitHub issues until a patch has been released.

---

## 2. Security Architecture & Controls

### 2.1 HTTP & Transport Layer Security
- **Strict Transport Security (HSTS)**: 1-year duration (`max-age=31536000`), `includeSubDomains`, and `preload`.
- **Content Security Policy (CSP)**:
  - API: `default-src 'none'`
  - Web frontend: Strict origin policy restricting scripts to `'self'`, fonts to trusted origins, with `frame-ancestors 'none'`.
- **Clickjacking Protection**: `X-Frame-Options: DENY` and `frameguard: deny`.
- **MIME Sniffing Prevention**: `X-Content-Type-Options: nosniff`.
- **Referrer Policy**: `no-referrer` on API; `strict-origin-when-cross-origin` on web assets.
- **Header Sanitization**: Removal of `X-Powered-By` header across all responses.
- **Request Identification**: Every request and response contains a unique `X-Request-Id` UUID for end-to-end tracing without logging confidential payloads or credentials.

### 2.2 Rate Limiting & Denial-of-Service Protection
- **Global Throttling**: 100 requests per minute per IP via `ThrottlerGuard`.
- **Auth Endpoint Restrictions**:
  - Staff Login: 10 requests per 15 minutes.
  - Multi-company Select: 10 requests per 15 minutes.
  - Platform Super Admin Login: 5 requests per 15 minutes.
  - Forgot Password: 5 requests per 15 minutes.
  - Password Reset: 5 requests per 15 minutes.
- **Reverse Proxy Alignment**: Express `trust proxy` enabled to resolve client IP addresses correctly through CDNs and reverse proxies.
- **Payload Size Limits**: Strict 1MB global limit on JSON and urlencoded requests. Large file uploads (Excel/CSV imports) restricted to 50MB only on authorized endpoints.

### 2.3 Authentication & Session Security
- **In-Memory Access Tokens**: Short-lived (15 minutes) JWTs kept purely in memory React state, never stored in `localStorage` or `sessionStorage`.
- **HttpOnly Refresh Cookies**:
  - Refresh tokens stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies scoped to `/api/v1/auth`.
  - Immune to XSS token theft.
- **CSRF Protection**: Endpoints consuming cookies require `X-Requested-With: XMLHttpRequest` and validate origin headers against an explicit allow-list.
- **Refresh Token Rotation**:
  - Single-use refresh tokens rotated on every use with session family tracking in `RefreshSession`.
  - Immediate revocation of the entire session family upon token reuse detection, with automated audit logging.
- **Device Revocation**: "Sign out of all devices" invalidates all sessions by incrementing `tokenVersion`.
- **Inactivity Auto-Logout**: 30-minute inactivity timeout with a 2-minute visual warning modal.

### 2.4 Cryptography & Data Protection
- **Encryption at Rest**: AES-256-GCM encryption with 12-byte initialization vectors and authentication tags for third-party credentials (SMTP passwords, webhook secrets).
- **Password Hashing**: Bcrypt cost factor 12. Legacy passwords hashed with cost < 12 are automatically rehashed upon successful login.
- **Password Strength Policy**: Minimum 12 characters, exclusion of top 10,000 common passwords, and rejection of usernames or email substrings in passwords.
- **Response Sanitization**: Global interceptor recursively strips sensitive properties (`passwordHash`, `smtpPass`, `imapPass`, `webhookSecret`, `tokenHash`) from all outgoing API responses.
- **Audit Log Immutability**: Prisma middleware unconditionally rejects `update`, `delete`, and `upsert` operations on `AuditLog` entries with a 403 Forbidden exception.

### 2.5 File Upload & Storage Hardening
- **Magic Bytes Validation**: File buffers are validated for authentic file headers (PDF, PNG, JPEG, WebP, AVIF, XLSX, CSV).
- **Double Extension Rejection**: Rejects multi-dot filenames (e.g. `document.pdf.exe`).
- **Authenticated Streaming**: No public static file hosting. Uploaded purchase documents require user authentication and tenant membership before streaming, accompanied by `Content-Disposition: inline` and `X-Content-Type-Options: nosniff`.
- **Formula Injection Defense**: CSV and Excel export generators sanitize spreadsheet cells starting with `=`, `+`, `-`, or `@` by prepending a single quote `'`.

### 2.6 Webhook Security
- **Timing Attack Prevention**: Webhook secret tokens and HMAC-SHA256 signatures are validated with `crypto.timingSafeEqual`.
- **Size Bounds**: Webhook payloads are restricted to a maximum of 100KB.
- **Replay & Expiration Checks**: Inbound timestamps older than 24 hours or in the future are rejected.
- **XSS Sanitization**: Inbound webhook text strings are stripped of HTML markup before database storage. Frontend rich HTML displays are sanitized via `DOMPurify`.
