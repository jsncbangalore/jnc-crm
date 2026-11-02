@echo off
title JNC-CRM Frontend (React + Vite)
cd /d "%~dp0apps\web"
echo Starting JNC-CRM Frontend on http://localhost:5173 ...
node ..\..\node_modules\vite\bin\vite.js
pause
