@echo off
title JNC-CRM Main Launcher
echo ========================================================
echo   Starting JNC-CRM Application (Backend + Frontend)
echo ========================================================
echo.

start "JNC-CRM Backend API" cmd /k "cd /d "%~dp0apps\api" && node dist/src/main.js"
timeout /t 3 /nobreak >nul
start "JNC-CRM Frontend Web" cmd /k "cd /d "%~dp0apps\web" && node ..\..\node_modules\vite\bin\vite.js"

echo.
echo ========================================================
echo   JNC-CRM is running!
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:3333/api/v1
echo ========================================================
