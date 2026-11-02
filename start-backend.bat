@echo off
title JNC-CRM Backend API (Port 3333)
cd /d "%~dp0apps\api"
echo ========================================================
echo   JNC-CRM REST API Server (Port 3333)
echo ========================================================
node dist/src/main.js
pause
