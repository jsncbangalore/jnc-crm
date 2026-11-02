# Production Deployment Guide — Enterprise CRM

## 🌐 Quick Deployment Instructions

This package contains the complete, production-ready white-labeled **CRM** system (NestJS API Backend + React Single-Page Application).

---

### 📦 Package Structure

```text
crm/
├── apps/
│   ├── api/                    # NestJS Backend API (Port 3333 default)
│   │   ├── dist/               # Pre-compiled JavaScript production bundle
│   │   ├── prisma/             # Prisma Schema & Database Migrations
│   │   ├── src/                # Backend Source Code
│   │   ├── package.json
│   │   └── .env.example
│   └── web/                    # React + Vite Frontend
│       ├── dist/               # Production Static Web Build (Ready for Nginx/Apache/cPanel)
│       ├── src/                # Frontend Source Code
│       ├── package.json
│       └── vite.config.ts
├── package.json
└── README.md
```

---

## 🚀 How to Deploy on Production Server

### 1. Backend Setup (Node.js VPS / Ubuntu / Docker / Windows Server)
1. Navigate to the API folder:
   ```bash
   cd apps/api
   npm install --production
   ```
2. Configure `.env` file (copy from `.env.example` and set production secrets):
   ```env
   PORT=3333
   NODE_ENV=production

   # White-Label Product Branding
   PRODUCT_NAME="<YOUR_PRODUCT_NAME>"
   PRODUCT_LOGO_URL="<OPTIONAL_PRODUCT_LOGO_URL>"

   # Database Connection (PostgreSQL with SSL)
   DATABASE_URL="postgresql://<DB_USER>:<DB_PASSWORD>@<DB_HOST>:5432/<DB_NAME>?sslmode=require"
   DIRECT_URL="postgresql://<DB_USER>:<DB_PASSWORD>@<DB_HOST>:5432/<DB_NAME>"

   # Security & Origins (Refuses to start in production if missing)
   FRONTEND_URL="https://<YOUR_FRONTEND_DOMAIN>"
   ALLOWED_ORIGINS="https://<YOUR_FRONTEND_DOMAIN>,https://<YOUR_ADMIN_SUBDOMAIN>"

   # Cryptographic Token & Encryption Secrets (Min 32 characters each)
   JWT_SECRET="<SECURE_32_CHAR_JWT_SECRET>"
   JWT_REFRESH_SECRET="<SECURE_32_CHAR_REFRESH_SECRET>"
   OTP_SECRET="<SECURE_32_CHAR_OTP_SECRET>"
   ENCRYPTION_KEY="<SECURE_32_CHAR_ENCRYPTION_KEY>"

   # System Email Sender & SMTP Transport (EMAIL_FROM must match SMTP_USER)
   SMTP_HOST="<YOUR_SMTP_HOST>"
   SMTP_PORT=465
   SMTP_USER="<YOUR_SYSTEM_EMAIL_ADDRESS>"
   SMTP_PASS="<YOUR_SMTP_PASSWORD>"
   SMTP_SECURE=true
   EMAIL_FROM="<YOUR_SYSTEM_EMAIL_ADDRESS>"

   # Initial Owner Account Provisioning
   OWNER_EMAIL="<OWNER_EMAIL>"
   OWNER_NAME="<OWNER_NAME>"
   OWNER_PHONE="<OWNER_PHONE>"
   OWNER_PASSWORD="<OWNER_PASSWORD>"
   ```
3. Database Setup:
   - Run production migrations:
     ```bash
     CONFIRM_PRODUCTION=yes npm run migrate:prod
     ```
   - Seed the initial master owner account:
     ```bash
     node prisma/seed-owner-only.js
     ```
4. Start with PM2 Process Manager:
   ```bash
   npm install -g pm2
   pm2 start dist/main.js --name "crm-api"
   pm2 save
   ```

---

### 2. Frontend Setup (Nginx / Apache / cPanel / Cloudflare / Vercel)
1. Build the web application with environment variables:
   ```bash
   cd apps/web
   VITE_PRODUCT_NAME="<YOUR_PRODUCT_NAME>" VITE_API_BASE_URL="https://<YOUR_API_DOMAIN>" npm run build
   ```
2. Upload the contents of `apps/web/dist/` directly to your web server public HTML directory (`/var/www/html` or `public_html`).
3. Configure Single Page Application URL rewrites:
  - **Nginx**:
    ```nginx
    location / {
        try_files $uri $uri/ /index.html;
    }
    ```
  - **Apache (`.htaccess`)**:
    ```apache
    <IfModule mod_rewrite.c>
      RewriteEngine On
      RewriteBase /
      RewriteRule ^index\.html$ - [L]
      RewriteCond %{REQUEST_FILENAME} !-f
      RewriteCond %{REQUEST_FILENAME} !-d
      RewriteRule . /index.html [L]
    </IfModule>
    ```

---

## 🧪 Staging Server Setup & Deployment

### 1. Staging Backend
1. Configure staging environment from `.env.staging.example`:
   ```env
   PORT=3334
   NODE_ENV=staging
   PRODUCT_NAME="<STAGING_PRODUCT_NAME>"
   DATABASE_URL="postgresql://<STAGING_USER>:<STAGING_PASSWORD>@<STAGING_HOST>:5432/<STAGING_DB>"
   ALLOWED_DB_HOSTS="<STAGING_HOST>"
   JWT_SECRET="<STAGING_32_CHAR_SECRET>"
   JWT_REFRESH_SECRET="<STAGING_32_CHAR_SECRET>"
   OTP_SECRET="<STAGING_32_CHAR_SECRET>"
   ENCRYPTION_KEY="<STAGING_32_CHAR_KEY>"
   FRONTEND_URL="https://staging.<YOUR_DOMAIN>"
   ALLOWED_ORIGINS="https://staging.<YOUR_DOMAIN>"
   SMTP_HOST="<STAGING_SMTP_HOST>"
   SMTP_PORT=465
   SMTP_USER="<STAGING_SMTP_USER>"
   SMTP_PASS="<STAGING_SMTP_PASS>"
   SMTP_SECURE=true
   EMAIL_FROM="<STAGING_SMTP_USER>"
   ```
2. Start Staging API via PM2 on a distinct port and process name:
   ```bash
   pm2 start dist/main.js --name "crm-api-staging"
   pm2 save
   ```

### 2. Staging Frontend Build
Build the web application pointing to the staging API address:
```bash
cd apps/web
VITE_PRODUCT_NAME="<STAGING_PRODUCT_NAME>" VITE_API_BASE_URL="https://staging-api.<YOUR_DOMAIN>" npm run build
```
Deploy the generated `apps/web/dist/` directory to the staging web server or virtual host.
