$rootDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Definition }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stageDir = Join-Path $rootDir "temp-prod-stage"
$fullZip = Join-Path $rootDir "jnc-crm-live-complete.zip"
$webZip = Join-Path $rootDir "jnc-crm-web-dist.zip"
$apiZip = Join-Path $rootDir "jnc-crm-api-dist.zip"

Write-Host "Creating Production Deployment Bundles..." -ForegroundColor Cyan

# Clean previous zips and stage
if (Test-Path $stageDir) { Remove-Item -Path $stageDir -Recurse -Force }
if (Test-Path $fullZip) { Remove-Item -Path $fullZip -Force }
if (Test-Path $webZip) { Remove-Item -Path $webZip -Force }
if (Test-Path $apiZip) { Remove-Item -Path $apiZip -Force }

New-Item -ItemType Directory -Path $stageDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageDir "apps\api") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageDir "apps\web") | Out-Null

# 1. Copy API Files (Source + Dist + Prisma)
Write-Host "Staging Backend API..." -ForegroundColor Yellow
$apiSource = Join-Path $rootDir "apps\api"
$apiDest = Join-Path $stageDir "apps\api"

Copy-Item -Path (Join-Path $apiSource "dist") -Destination (Join-Path $apiDest "dist") -Recurse -Force
Copy-Item -Path (Join-Path $apiSource "src") -Destination (Join-Path $apiDest "src") -Recurse -Force
Copy-Item -Path (Join-Path $apiSource "prisma") -Destination (Join-Path $apiDest "prisma") -Recurse -Force
Copy-Item -Path (Join-Path $apiSource "package.json") -Destination (Join-Path $apiDest "package.json") -Force
Copy-Item -Path (Join-Path $apiSource "tsconfig*.json") -Destination $apiDest -Force
if (Test-Path (Join-Path $apiSource "nest-cli.json")) { Copy-Item -Path (Join-Path $apiSource "nest-cli.json") -Destination $apiDest -Force }
if (Test-Path (Join-Path $apiSource ".env.example")) { Copy-Item -Path (Join-Path $apiSource ".env.example") -Destination $apiDest -Force }

# 2. Copy Web Files (Source + Dist)
Write-Host "Staging Frontend Web..." -ForegroundColor Yellow
$webSource = Join-Path $rootDir "apps\web"
$webDest = Join-Path $stageDir "apps\web"

Copy-Item -Path (Join-Path $webSource "dist") -Destination (Join-Path $webDest "dist") -Recurse -Force
Copy-Item -Path (Join-Path $webSource "src") -Destination (Join-Path $webDest "src") -Recurse -Force
Copy-Item -Path (Join-Path $webSource "public") -Destination (Join-Path $webDest "public") -Recurse -Force
Copy-Item -Path (Join-Path $webSource "package.json") -Destination (Join-Path $webDest "package.json") -Force
Copy-Item -Path (Join-Path $webSource "vite.config.ts") -Destination (Join-Path $webDest "vite.config.ts") -Force
Copy-Item -Path (Join-Path $webSource "tailwind.config.js") -Destination (Join-Path $webDest "tailwind.config.js") -Force
Copy-Item -Path (Join-Path $webSource "postcss.config.js") -Destination (Join-Path $webDest "postcss.config.js") -Force
Copy-Item -Path (Join-Path $webSource "tsconfig*.json") -Destination $webDest -Force
Copy-Item -Path (Join-Path $webSource "index.html") -Destination (Join-Path $webDest "index.html") -Force

# 3. Copy Root & Docs
Write-Host "Staging Root configs..." -ForegroundColor Yellow
Copy-Item -Path (Join-Path $rootDir "package.json") -Destination (Join-Path $stageDir "package.json") -Force
Copy-Item -Path (Join-Path $rootDir "README.md") -Destination (Join-Path $stageDir "README.md") -Force
Copy-Item -Path (Join-Path $rootDir "DEPLOYMENT_GUIDE.md") -Destination (Join-Path $stageDir "DEPLOYMENT_GUIDE.md") -Force
if (Test-Path (Join-Path $rootDir ".htaccess")) { Copy-Item -Path (Join-Path $rootDir ".htaccess") -Destination (Join-Path $stageDir ".htaccess") -Force }
if (Test-Path (Join-Path $rootDir "eng.traineddata")) { Copy-Item -Path (Join-Path $rootDir "eng.traineddata") -Destination (Join-Path $stageDir "eng.traineddata") -Force }

# 4. Create ZIPs using .NET ZipFile
Write-Host "Creating jnc-crm-live-complete.zip..." -ForegroundColor Green
[System.IO.Compression.ZipFile]::CreateFromDirectory($stageDir, $fullZip)

Write-Host "Creating jnc-crm-web-dist.zip (Frontend Static)..." -ForegroundColor Green
[System.IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $webSource "dist"), $webZip)

Write-Host "Creating jnc-crm-api-dist.zip (Backend Bundle)..." -ForegroundColor Green
[System.IO.Compression.ZipFile]::CreateFromDirectory($apiDest, $apiZip)

# Cleanup
Remove-Item -Path $stageDir -Recurse -Force

Write-Host "Successfully Created Production ZIPs!" -ForegroundColor Cyan
Write-Host "1. $fullZip ($( (Get-Item $fullZip).Length / 1MB ) MB)"
Write-Host "2. $webZip ($( (Get-Item $webZip).Length / 1MB ) MB)"
Write-Host "3. $apiZip ($( (Get-Item $apiZip).Length / 1MB ) MB)"
