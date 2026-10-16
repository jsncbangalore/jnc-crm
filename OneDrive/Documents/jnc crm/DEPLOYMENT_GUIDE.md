# Production Deployment Guide — JSNC CRM Enterprise

## 🌐 Quick Deployment Instructions

This package contains the complete, production-ready **JSNC CRM** system (API Backend + React Single-Page Application).

---

### 📦 Package Structure

```text
jnc-crm/
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
   DATABASE_URL="postgresql://<DB_USER>:<DB_PASSWORD>@<DB_HOST>:5432/<DB_NAME>"
   JWT_SECRET="<SECURE_RANDOM_SECRET>"
   JWT_REFRESH_SECRET="<SECURE_RANDOM_SECRET>"
   ENCRYPTION_KEY="<32_BYTE_HEX_KEY>"
   CORS_ORIGIN="https://your-crm-domain.com"
   ```
3. Database Setup:
   - **new empty database**: `prisma db push` once
   - **existing production database**: apply `deploy/2026-10-prod-upgrade.sql` after a backup
4. Start with PM2 Process Manager:
   ```bash
   npm install -g pm2
   pm2 start dist/main.js --name "jnc-crm-api"
   pm2 save
   ```

---

### 2. Frontend Setup (Nginx / Apache / cPanel / Cloudflare / Vercel)
- Upload the contents of `apps/web/dist/` directly to your web server public HTML directory (`/var/www/html` or `public_html`).
- Configure Single Page Application URL rewrites:
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

### 1. Staging Backend (Different PORT & Process Name)
1. Configure staging environment from `.env.staging.example`:
   ```env
   PORT=3334
   NODE_ENV=staging
   DATABASE_URL="postgresql://<STAGING_USER>:<STAGING_PASSWORD>@<STAGING_HOST>:5432/<STAGING_DB>"
   ALLOWED_DB_HOSTS="<STAGING_HOST>"
   JWT_SECRET="<STAGING_RANDOM_SECRET>"
   JWT_REFRESH_SECRET="<STAGING_RANDOM_SECRET>"
   ENCRYPTION_KEY="<32_BYTE_HEX_KEY>"
   FRONTEND_URL="https://staging.yourdomain.com"
   CORS_ORIGIN="https://staging.yourdomain.com"
   ```
2. Initialize database & run staging seed:
   ```bash
   npx prisma db push
   npx ts-node --transpile-only scripts/seed-staging.ts
   ```
   *(Note: The seed script prints initial random passwords once to the console. They are never written to disk.)*
3. Start Staging API via PM2 on a distinct port and process name:
   ```bash
   pm2 start dist/main.js --name "jnc-crm-api-staging"
   pm2 save
   ```

### 2. Staging Frontend Build
Build the web application pointing to the staging API address:
```bash
cd apps/web
VITE_API_URL="https://staging-api.yourdomain.com/api/v1" npm run build
```
Deploy the generated `apps/web/dist/` directory to the staging web server or virtual host.
