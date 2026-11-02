@echo off
title JNC-CRM Frontend Web (Port 5173)
cd /d "%~dp0apps\web"
echo ========================================================
echo   JNC-CRM Frontend Web Server (Port 5173)
echo ========================================================
node ..\..\node_modules\vite\bin\vite.js
pause
