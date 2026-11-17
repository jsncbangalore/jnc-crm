/**
 * scripts/cleanup-product-logo-tenants.js
 *
 * Scans all tenant records in the database and cleanses any legacy or incorrect
 * assignments of the Syntra CRM product logo ('/logo.png', 'logo.png', etc.)
 * or empty strings, setting them strictly to NULL.
 *
 * Usage:
 *   node scripts/cleanup-product-logo-tenants.js          (Read-only audit, prints counts only)
 *   node scripts/cleanup-product-logo-tenants.js --apply  (Applies changes, verifies 0 remain)
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// Load environment
const envPath = path.resolve(__dirname, '../apps/api/.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  });
}

const prisma = new PrismaClient();
const isApply = process.argv.includes('--apply');

async function runCleanup() {
  console.log('======================================================');
  console.log('TENANT PRODUCT LOGO CLEANUP AUDIT & MIGRATION');
  console.log(`Mode: ${isApply ? 'APPLY (Write changes to DB)' : 'READ-ONLY AUDIT (Dry Run)'}`);
  console.log('======================================================');

  try {
    const allTenants = await prisma.tenant.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        logoUrl: true,
      },
    });

    console.log(`Total tenants scanned: ${allTenants.length}`);

    // Identify tenants with product logo or empty string
    const problematicTenants = allTenants.filter((t) => {
      if (!t.logoUrl) return false;
      const lower = t.logoUrl.trim().toLowerCase();
      return (
        lower === '/logo.png' ||
        lower === 'logo.png' ||
        lower.endsWith('/logo.png') ||
        lower === '' ||
        lower.includes('default-logo')
      );
    });

    console.log(`Tenants with product logo fallback or empty string: ${problematicTenants.length}`);

    if (problematicTenants.length > 0) {
      console.log('\nMatching Tenants:');
      problematicTenants.forEach((t, i) => {
        console.log(`  [${i + 1}] ID: ${t.id} | Code: ${t.code} | Name: ${t.name} | LogoUrl: "${t.logoUrl}"`);
      });
    }

    if (!isApply) {
      console.log('\n------------------------------------------------------');
      console.log('READ-ONLY AUDIT COMPLETE.');
      if (problematicTenants.length > 0) {
        console.log(`Run with --apply to clean these ${problematicTenants.length} record(s) to NULL:`);
        console.log('  node scripts/cleanup-product-logo-tenants.js --apply');
      } else {
        console.log('No tenants have product logo fallbacks. Database is clean!');
      }
      console.log('------------------------------------------------------');
      return;
    }

    // Apply Mode
    console.log('\nApplying cleanup: setting logoUrl to NULL for affected tenants...');
    let updatedCount = 0;

    for (const t of problematicTenants) {
      await prisma.tenant.update({
        where: { id: t.id },
        data: { logoUrl: null },
      });

      // Purge any associated disk cache
      const baseDirs = [
        path.resolve(process.cwd(), 'apps/web/public/uploads/branding'),
        path.resolve(process.cwd(), 'apps/api/uploads/branding'),
        path.resolve(process.cwd(), 'uploads/branding'),
      ];
      const exts = ['png', 'jpg', 'jpeg', 'webp'];
      for (const dir of baseDirs) {
        for (const ext of exts) {
          const filePath = path.join(dir, `${t.id}_logo.${ext}`);
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch {}
          }
        }
      }

      updatedCount++;
    }

    console.log(`Successfully updated ${updatedCount} tenant(s) to logoUrl = NULL.`);

    // Verification check
    const postCheck = await prisma.tenant.findMany({
      where: {
        OR: [
          { logoUrl: '/logo.png' },
          { logoUrl: 'logo.png' },
          { logoUrl: { endsWith: '/logo.png' } },
        ],
      },
      select: { id: true, code: true, logoUrl: true },
    });

    console.log('\n------------------------------------------------------');
    console.log('VERIFICATION:');
    console.log(`Tenants remaining with product logo: ${postCheck.length}`);
    if (postCheck.length === 0) {
      console.log('SUCCESS: Exactly 0 tenants have product logo in the database.');
    } else {
      console.error('ERROR: Some tenants still have product logo!');
      process.exitCode = 1;
    }
    console.log('------------------------------------------------------');
  } catch (err) {
    console.error('Cleanup script error:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

runCleanup();
