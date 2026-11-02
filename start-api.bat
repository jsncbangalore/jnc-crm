@echo off
title JNC-CRM Backend API
cd /d "%~dp0apps\api"
set PORT=3333
set DATABASE_URL=file:C:/Users/JNC R&D/OneDrive/Documents/jnc crm/apps/api/prisma/dev.db
echo Starting JNC-CRM Backend API on http://localhost:3333/api/v1 ...
node dist/src/main.js
pause
