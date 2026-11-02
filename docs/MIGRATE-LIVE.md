# Live Database Migration Guide (Manual / Local Runbook)

## Context
Render's **Free compute plan does NOT support pre-deploy commands** (`preDeployCommand`). If your service runs on the Free tier, any migrations in `preDeployCommand` in `render.yaml` are ignored.
To safely apply database migrations to the live database without risking data loss, follow this procedure from your development workstation.

---

## Step 1: Pre-Migration Database Backup
Before touching the live database schema:
1. Log in to your database provider dashboard (e.g. Supabase).
2. Go to **Database** -> **Backups** and create a fresh manual snapshot / export.
3. Alternatively, export via `pg_dump`:
   ```powershell
   pg_dump "$env:DIRECT_URL" -F c -b -v -f "backups/live_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').dump"
   ```

---

## Step 2: Read Live DIRECT_URL from a Local Untracked File
Create a temporary file named `.env.live.direct` (this file is ignored by git and must NEVER be committed).
Place the direct connection string inside:
```
DIRECT_URL=postgresql://postgres.[YOUR_PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
EXPECTED_PROJECT_REF=[YOUR_PROJECT_REF]
```

Run the migration script helper or load the variables:
```powershell
# In PowerShell:
Get-Content .env.live.direct | Where-Object { $_ -match '=' -and -not $_.StartsWith('#') } | ForEach-Object {
  $parts = $_.Split('=', 2)
  [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), 'Process')
}
```

---

## Step 3: Run the Pre-Deploy Guard with Explicit Confirmation
Execute the project ref guard script:
```powershell
node scripts/render-predeploy-guard.js
```
The script will verify:
- `DIRECT_URL` is configured and points to `postgres.[ref]`.
- The target host and project ref match `EXPECTED_PROJECT_REF`.

### Interactive Confirmation
Before applying migrations, print the target host:
```powershell
$uri = [System.Uri]$env:DIRECT_URL
Write-Host "Target Host: $($uri.Host)" -ForegroundColor Yellow
$ref = ($uri.UserInfo.Split('.')[1])
Write-Host "Target Project Ref: $ref" -ForegroundColor Yellow

$confirmation = Read-Host "Type project ref '$ref' to confirm live migration"
if ($confirmation -ne $ref) {
  Write-Error "Confirmation mismatch. Aborting immediately without modifying database."
  exit 1
}
```

---

## Step 4: Run Prisma Migrate Deploy
Deploy all unapplied migrations:
```powershell
npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma 2>&1 | Tee-Object -FilePath logs/live_migration_deploy.log
```

---

## Step 5: Check Prisma Migrate Status
Verify that all migrations are applied cleanly with zero drift:
```powershell
npx prisma migrate status --schema=apps/api/prisma/schema.prisma 2>&1 | Tee-Object -FilePath logs/live_migration_status.log
```
Expected output:
```
Database schema is up to date!
```

---

## Step 6: Cleanup
Delete the untracked `.env.live.direct` file after verification:
```powershell
Remove-Item .env.live.direct -Force
```
