# Transactional SMTP Provider Configuration Guide

Syntra CRM supports any standard RFC 5321 compliant SMTP server using standard environment variables:
- `SMTP_HOST`: Hostname of the SMTP relay
- `SMTP_PORT`: Port (typically `587` with STARTTLS, `465` with SSL/TLS, or `2525` alternate)
- `SMTP_USER`: Authentication username or API key user
- `SMTP_PASS`: Authentication password or API key secret
- `EMAIL_FROM`: Canonical verified sender address (e.g. `notifications@yourdomain.com` or `Syntra CRM <notifications@yourdomain.com>`)

---

## 1. Amazon SES (Simple Email Service)

Amazon SES provides high deliverability and scale.

### Prerequisites:
1. Verify your sending domain in the AWS SES Console.
2. Create SMTP Credentials in the SES Console (under *Account dashboard* -> *SMTP settings* -> *Create SMTP credentials*).
3. If your account is in SES Sandbox, ensure your recipient addresses are verified or request production access.

### Configuration (`apps/api/.env`):
```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=AKIAIOSFODNN7EXAMPLE
SMTP_PASS=BP0...example...secret...
EMAIL_FROM=notifications@yourdomain.com
```

*(Replace `us-east-1` with your AWS region, e.g. `ap-south-1` for Mumbai).*

---

## 2. Brevo (formerly Sendinblue)

Brevo provides transactional SMTP relays with sender authentication.

### Prerequisites:
1. Verify your sender domain with SPF and DKIM DNS records.
2. Generate an SMTP Key under *Transactional* -> *Email* -> *Settings* -> *Configuration*.

### Configuration (`apps/api/.env`):
```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your-account-login@domain.com
SMTP_PASS=xsmtpsib-...your-brevo-key...
EMAIL_FROM=notifications@yourdomain.com
```

---

## 3. Postmark

Postmark is specialized for transactional email delivery.

### Prerequisites:
1. Add and verify your Sender Signature or Domain in the Postmark dashboard.
2. Obtain your Server API Token from the Server's *Settings* -> *API Tokens*.

### Configuration (`apps/api/.env`):
```env
SMTP_HOST=smtp.postmarkapp.com
SMTP_PORT=587
SMTP_USER=your-server-api-token
SMTP_PASS=your-server-api-token
EMAIL_FROM=notifications@yourdomain.com
```

---

## 4. Resend SMTP Relay

Resend supports standard SMTP relay delivery alongside its REST API.

### Prerequisites:
1. Add and verify your domain in the Resend Domains dashboard.
2. Create an API key with Sending permissions.

### Configuration (`apps/api/.env`):
```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_12345678_example_key
EMAIL_FROM=notifications@yourdomain.com
```

---

## 5. Local Development & Testing

In local development and test environments (`NODE_ENV=development` or `NODE_ENV=test`), you can use a local mail catcher (e.g., Mailpit, MailHog, or the embedded test catcher):

```env
SMTP_HOST=127.0.0.1
SMTP_PORT=2525
SMTP_USER=test
SMTP_PASS=test
EMAIL_FROM=crm-local@testcrm.internal
```

In production mode (`NODE_ENV=production`), the application refuses to start if `SMTP_HOST` points to `localhost`, `127.0.0.1`, or any internal SSRF-blocked address.
