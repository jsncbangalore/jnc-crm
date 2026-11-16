const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(process.cwd(), 'apps/api/.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        process.env[match[1]] = value;
      }
    }
  }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const runId = Date.now().toString().slice(-4);
  const email = `plat_grace_${runId}@example.internal`;
  const pass = 'PlatformPass@123';
  const hash = await bcrypt.hash(pass, 10);
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

  const user = await prisma.user.create({
    data: {
      email,
      name: 'Platform Grace SuperAdmin',
      role: 'platform_super_admin',
      employeeCode: `EMP-PLAT-${runId}`,
      passwordHash: hash,
      tenantId: null,
      firstLoginAfter2FaReleaseAt: tenDaysAgo,
    },
  });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('request', (r) => {
    if (r.url().includes('auth')) {
      console.log('REQ:', r.method(), r.url());
      if (r.postData()) {
        try {
          const p = JSON.parse(r.postData());
          if (p.password) p.password = '***';
          console.log('  Data:', JSON.stringify(p));
        } catch {
          console.log('  Data:', r.postData().slice(0, 100));
        }
      }
    }
  });

  page.on('response', async (r) => {
    if (r.url().includes('auth')) {
      console.log('RES:', r.status(), r.url());
      try {
        const t = await r.text();
        console.log('  Body:', t.slice(0, 200));
      } catch {}
    }
  });

  await page.goto('http://localhost:5173/platform/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#platform-identifier');
  await page.evaluate(() => {
    localStorage.setItem(
      'crm_cookie_consent',
      JSON.stringify({
        choice: 'all',
        preferences: true,
        policyVersion: '2026.10.1',
        savedAt: new Date().toISOString(),
      })
    );
  });

  await page.fill('#platform-identifier', email);
  await page.fill('#platform-password', pass);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  const text = await page.innerText('body');
  console.log('\n--- VISIBLE TEXT ---');
  console.log(text.split('\n').filter((l) => l.trim()).slice(0, 25).join('\n'));

  await browser.close();
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
}

check().catch((err) => {
  console.error(err);
  process.exit(1);
});
