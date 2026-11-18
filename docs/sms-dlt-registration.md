# Indian DLT (Distributed Ledger Technology) SMS Registration Guide

In India, the Telecom Regulatory Authority of India (TRAI) mandates that all commercial and transactional SMS messages must be routed through registered DLT portals (e.g. Jio DLT, Airtel DLT, Vodafone Idea DLT, BSNL DLT, Videocon DLT).

Syntra CRM requires four environment variables when using an Indian SMS provider:
- `SMS_PROVIDER=indian_dlt`
- `SMS_GATEWAY_URL`: Endpoint of your chosen SMS gateway (e.g. MSG91, Textlocal, Fast2SMS)
- `SMS_API_KEY`: API credential key from your provider (never hardcoded)
- `SMS_SENDER_ID`: 6-character registered Header/Sender ID (e.g. `SYNTRA`, `JNCCRM`)
- `SMS_DLT_ENTITY_ID`: 19-digit Enterprise Principal Entity ID (PE ID)

---

## Step 1: Principal Entity (Business) Registration

1. Visit any operator's DLT portal (registration on one portal syncs across all operators via blockchain):
   - **Jio DLT**: https://trueconnect.jio.com
   - **Airtel DLT**: https://www.airtel.in/business/commercial-communication
   - **Vodafone Idea (VilPower)**: https://www.vilpower.in
2. Register as **Enterprise / Principal Entity**.
3. Upload business documentation:
   - Certificate of Incorporation / GST Certificate / PAN Card
   - Authorized Signatory ID and Authorization Letter on company letterhead
4. Upon approval, you will receive your **Principal Entity ID (PE ID)** (19-digit number).
   - Set as `SMS_DLT_ENTITY_ID` in `apps/api/.env`.

---

## Step 2: Register Headers (Sender IDs)

1. Under the DLT portal's **Headers** section, choose **Header Type**:
   - Select **Transactional** / **Service Implicit** (for OTPs, password reset, 2-step verification codes).
2. Enter your 6-character alphanumeric Header (e.g., `SYNTRA`).
   - The header must match or abbreviate your registered trade or brand name.
3. Submit for telecom operator approval (typically approved in 24–48 hours).
4. Set as `SMS_SENDER_ID` in `apps/api/.env`.

---

## Step 3: Register Content Templates

Every message format with variables must be registered and approved before sending.

### Verification Code Template (Service Implicit):
- **Template Name**: `Syntra_CRM_Auth_OTP`
- **Communication Type**: `Service Implicit`
- **Header**: `SYNTRA`
- **Message Content**:
  ```text
  {#var#} is your Syntra CRM verification code. Valid for 10 minutes. Do not share this OTP with anyone. - JNC Network Communication
  ```
- **Variables**: `{#var#}` corresponds to the 6-digit random code.
- Once approved, note the **DLT Template ID** (19-digit identifier) and set as `SMS_DLT_DEFAULT_TEMPLATE_ID`.

---

## Step 4: Configuration Example

In `apps/api/.env`:
```env
SMS_PROVIDER=indian_dlt
SMS_GATEWAY_URL=https://api.your-sms-provider.com/v1/send
SMS_API_KEY=your_secure_provider_api_key
SMS_SENDER_ID=SYNTRA
SMS_DLT_ENTITY_ID=1101234567890123456
SMS_DLT_DEFAULT_TEMPLATE_ID=1207161234567890123
```

---

## Fallback & Behavior When Unconfigured

If no SMS provider is configured (`SMS_PROVIDER` is unset or credentials missing):
- Syntra CRM logs a startup warning:
  `[SMS HONESTY] No SMS provider configured. Phone-based verification and SMS password reset are disabled. System will use email and authenticator only.`
- The API refuses phone verification requests with a clean HTTP 400 error.
- The web app hides phone-based reset options, prompting users for their registered email address or authenticator app.
- For local testing only, set `SMS_PROVIDER=console` with `NODE_ENV=development` to capture SMS dispatches in the server console without sending external messages.
