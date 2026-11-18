# Email Delivery & Health Alert Webhook Configuration

## Overview
Syntra CRM monitors outbound email delivery in real-time. When mail delivery degrades or critical security verification codes fail, automated alert payloads can be delivered to an external alerting endpoint (Slack, Discord, PagerDuty, Datadog, or custom webhook).

---

## 1. Environment Configuration

To enable automated webhook alerting on email delivery degradation:

```bash
# Webhook destination endpoint (HTTPS required in production)
EMAIL_ALERT_WEBHOOK_URL="https://alerts.yourcompany.com/webhooks/crm-mail"

# Optional HMAC-SHA256 signing secret for payload authenticity
EMAIL_ALERT_WEBHOOK_SECRET="whsec_0123456789abcdef0123456789abcdef"

# Alert trigger threshold for queue backlog age in seconds (default: 600)
EMAIL_QUEUE_MAX_AGE_SECONDS=600

# Minimum retry failures before trigger (default: 3)
EMAIL_ALERT_MIN_FAILURES=3
```

---

## 2. Trigger Events

| Event Code | Severity | Trigger Condition |
| :--- | :--- | :--- |
| `email.smtp_down` | **CRITICAL** | Hourly or startup SMTP handshake fails (`transporter.verify()` error). |
| `email.verification_failed` | **HIGH** | Verification code email reaches `failed` status after max retry attempts. |
| `email.queue_backlog` | **MEDIUM** | Oldest pending outbox item age exceeds `EMAIL_QUEUE_MAX_AGE_SECONDS`. |
| `email.certificate_error` | **CRITICAL** | TLS certificate validation error against custom tenant or root SMTP server. |

---

## 3. Webhook Payload Schema

Payloads are dispatched via HTTP POST with `Content-Type: application/json`.

```json
{
  "eventId": "evt_7f8a9b0c1d2e",
  "timestamp": "2026-11-18T13:45:00.000Z",
  "event": "email.verification_failed",
  "severity": "HIGH",
  "environment": "production",
  "data": {
    "provider": "smtp",
    "smtpStatus": "degraded",
    "queueSize": 2,
    "failedCount": 1,
    "oldestPendingAgeSec": 75,
    "failedVerificationCount": 1,
    "lastError": "Tenant SMTP rejected recipient",
    "recipient": "use***@example.com",
    "reason": "domain_not_verified"
  }
}
```

> **Privacy Guard:** Plain recipient email addresses, temporary passwords, and verification codes are **never** included in webhook payloads. Recipient emails are masked (`use***@example.com`).

---

## 4. Webhook Signature Verification

If `EMAIL_ALERT_WEBHOOK_SECRET` is configured, each request includes header `X-CRM-Signature`:

```python
import hmac
import hashlib

expected_sig = hmac.new(
    webhook_secret.encode('utf-8'),
    raw_payload_bytes,
    hashlib.sha256
).hexdigest()

assert hmac.compare_digest(request.headers.get('X-CRM-Signature'), expected_sig)
```

---

## 5. Testing & Verification

Platform administrators can verify email delivery health and trigger a lightweight operational test directly in the Platform Console under **Security & Audit Logs -> Email Delivery Diagnostics** or via:

```bash
# Inspect current email delivery health status via API
curl -s http://localhost:3333/api/v1/health | jq .emailDiagnostics

# Query platform mail diagnostics (requires Platform Admin token)
curl -s -H "Authorization: Bearer <TOKEN>" http://localhost:3333/api/v1/platform/mail-status
```
