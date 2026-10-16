Add-Type -AssemblyName System.IO.Compression.FileSystem

$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir

# Output directories
$zipOutDir = Join-Path $rootDir "zips"
if (-not (Test-Path $zipOutDir)) {
    New-Item -ItemType Directory -Path $zipOutDir | Out-Null
}

$cleanZip = Join-Path $zipOutDir "jnc-crm-clean-source.zip"
$webZip = Join-Path $zipOutDir "jnc-crm-web-dist.zip"
$apiZip = Join-Path $zipOutDir "jnc-crm-api-dist.zip"

# Stage area in Windows Temp
$tempStage = Join-Path $env:TEMP "jnc-zip-stage"
if (Test-Path $tempStage) { Remove-Item $tempStage -Recurse -Force }
New-Item -ItemType Directory -Path $tempStage | Out-Null

$excludeList = @("node_modules", ".git", "dist", "coverage", ".next", "zips", "deploy-release", "temp-prod-stage", "scratch", "backups", "temp-jnc-clone-test", "test-api-bundle")

Get-ChildItem -Path $rootDir | Where-Object { $_.Name -notin $excludeList -and $_.Name -notlike "*.zip" } | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $tempStage -Recurse -Force
}

if (Test-Path $cleanZip) { Remove-Item $cleanZip -Force }
Write-Host "Creating jnc-crm-clean-source.zip..." -ForegroundColor Yellow
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempStage, $cleanZip)
Remove-Item $tempStage -Recurse -Force

# Web Dist Zip (for Hostinger Frontend)
$webDist = Join-Path $rootDir "apps\web\dist"
if (Test-Path $webDist) {
    if (Test-Path $webZip) { Remove-Item $webZip -Force }
    Write-Host "Creating jnc-crm-web-dist.zip..." -ForegroundColor Yellow
    [System.IO.Compression.ZipFile]::CreateFromDirectory($webDist, $webZip)
}

# API Dist Zip (for Backend API)
$apiDist = Join-Path $rootDir "apps\api"
if (Test-Path $apiDist) {
    if (Test-Path $apiZip) { Remove-Item $apiZip -Force }
    Write-Host "Creating jnc-crm-api-dist.zip..." -ForegroundColor Yellow
    $apiStage = Join-Path $env:TEMP "jnc-api-stage"
    if (Test-Path $apiStage) { Remove-Item $apiStage -Recurse -Force }
    New-Item -ItemType Directory -Path $apiStage | Out-Null
    if (Test-Path (Join-Path $apiDist "dist")) { Copy-Item (Join-Path $apiDist "dist") $apiStage -Recurse -Force }
    if (Test-Path (Join-Path $apiDist "prisma")) { Copy-Item (Join-Path $apiDist "prisma") $apiStage -Recurse -Force }
    if (Test-Path (Join-Path $apiDist "assets")) { Copy-Item (Join-Path $apiDist "assets") $apiStage -Recurse -Force }
    if (Test-Path (Join-Path $apiDist "start_server.js")) { Copy-Item (Join-Path $apiDist "start_server.js") $apiStage -Force }
    if (Test-Path (Join-Path $apiDist "package.json")) { Copy-Item (Join-Path $apiDist "package.json") $apiStage -Force }
    [System.IO.Compression.ZipFile]::CreateFromDirectory($apiStage, $apiZip)
    Remove-Item $apiStage -Recurse -Force
}

Write-Host "`nZIP Files Created Successfully:" -ForegroundColor Green
Get-ChildItem $zipOutDir | Select-Object Name, @{Name="Size (MB)";Expression={[math]::Round($_.Length/1MB, 2)}} | Format-Table -AutoSize
