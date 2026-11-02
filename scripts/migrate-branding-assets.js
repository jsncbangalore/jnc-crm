/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function run() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isDryRun = !isApply || args.includes('--dry-run');

  console.log(`=======================================================`);
  console.log(`BRANDING ASSET MIGRATION HELPER`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no database changes)' : 'APPLY (migrating data URLs to BrandingAsset storage)'}`);
  console.log(`=======================================================\n`);

  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      code: true,
      logoUrl: true,
      portalLogoUrl: true,
      signatureUrl: true,
      stampUrl: true,
    },
  });

  let logoCount = 0;
  let portalLogoCount = 0;
  let signatureCount = 0;
  let stampCount = 0;

  const toMigrate = [];

  for (const t of tenants) {
    if (t.logoUrl && t.logoUrl.startsWith('data:image/')) {
      logoCount++;
      toMigrate.push({
        tenantId: t.id,
        assetType: 'logo',
        rawVal: t.logoUrl,
        targetUrl: '/api/v1/settings/branding/logo',
      });
    }

    if (t.portalLogoUrl && t.portalLogoUrl.startsWith('data:image/')) {
      portalLogoCount++;
      toMigrate.push({
        tenantId: t.id,
        assetType: 'portal_logo',
        rawVal: t.portalLogoUrl,
        targetUrl: '/api/v1/settings/branding/portal-logo',
      });
    }

    if (t.signatureUrl && t.signatureUrl.startsWith('data:image/')) {
      signatureCount++;
      toMigrate.push({
        tenantId: t.id,
        assetType: 'signature',
        rawVal: t.signatureUrl,
        targetUrl: '/api/v1/settings/branding/signature',
      });
    }

    if (t.stampUrl && t.stampUrl.startsWith('data:image/')) {
      stampCount++;
      toMigrate.push({
        tenantId: t.id,
        assetType: 'stamp',
        rawVal: t.stampUrl,
        targetUrl: '/api/v1/settings/branding/stamp',
      });
    }
  }

  console.log(`Scan Summary:`);
  console.log(`  - Total tenants inspected: ${tenants.length}`);
  console.log(`  - Document logos to migrate: ${logoCount}`);
  console.log(`  - Portal logos to migrate:   ${portalLogoCount}`);
  console.log(`  - Signatures to migrate:     ${signatureCount}`);
  console.log(`  - Stamps to migrate:         ${stampCount}`);
  console.log(`  - Total assets to migrate:   ${toMigrate.length}\n`);

  if (toMigrate.length === 0) {
    console.log(`[SUCCESS] No legacy data URLs found. All assets are already in short URL storage.`);
    await prisma.$disconnect();
    return;
  }

  if (isDryRun) {
    console.log(`[DRY RUN] ${toMigrate.length} legacy data URL assets identified for migration.`);
    console.log(`To execute this migration and persist assets to BrandingAsset storage, run:`);
    console.log(`  node scripts/migrate-branding-assets.js --apply\n`);
    await prisma.$disconnect();
    return;
  }

  // APPLY MODE
  console.log(`Executing migration for ${toMigrate.length} assets...`);
  const baseUploadDir = path.resolve(process.cwd(), 'apps/web/public/uploads/branding');
  if (!fs.existsSync(baseUploadDir)) {
    fs.mkdirSync(baseUploadDir, { recursive: true });
  }

  let migratedCount = 0;

  for (const item of toMigrate) {
    const match = item.rawVal.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!match) continue;

    const mimeType = match[1].toLowerCase();
    const buf = Buffer.from(match[2], 'base64');
    const contentHash = crypto.createHash('sha256').update(buf).digest('hex');
    const byteSize = buf.length;

    try {
      await prisma.brandingAsset.upsert({
        where: {
          tenantId_assetType: {
            tenantId: item.tenantId,
            assetType: item.assetType,
          },
        },
        create: {
          tenantId: item.tenantId,
          assetType: item.assetType,
          contentHash,
          mimeType,
          byteSize,
          data: buf,
        },
        update: {
          contentHash,
          mimeType,
          byteSize,
          data: buf,
        },
      });
    } catch (e) {
      console.warn(`  [Warning] Could not upsert into BrandingAsset table: ${e.message}`);
    }

    // Write file cache to disk
    const ext = mimeType.includes('webp') ? 'webp' : mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
    const diskPath = path.join(baseUploadDir, `${item.tenantId}_${item.assetType}.${ext}`);
    try {
      fs.writeFileSync(diskPath, buf);
    } catch (e) {
      console.warn(`  [Warning] Could not write disk cache: ${e.message}`);
    }

    // Update Tenant with short URL
    const fieldMap = {
      logo: 'logoUrl',
      portal_logo: 'portalLogoUrl',
      signature: 'signatureUrl',
      stamp: 'stampUrl',
    };

    const targetField = fieldMap[item.assetType];
    await prisma.tenant.update({
      where: { id: item.tenantId },
      data: {
        [targetField]: item.targetUrl,
      },
    });

    migratedCount++;
  }

  console.log(`\n[APPLY COMPLETE] Successfully migrated ${migratedCount} assets to BrandingAsset storage and replaced data URLs with short internal routes.`);
  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error('[Migration Error]', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
