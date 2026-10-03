/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';
import { assertNotProductionDb } from './safety-check';

assertNotProductionDb('report-orphan-contacts');

const prisma = new PrismaClient();

async function main() {
  console.log(`\n========================================================================`);
  console.log(`[CONTACTS AUDIT] Read-Only Report on Orphan Contacts`);
  console.log(`========================================================================\n`);

  try {
    const totalContacts = await prisma.contact.count();
    const nullTenantContacts = await prisma.contact.count({ where: { tenantId: null } });
    const nullCompanyContacts = await prisma.contact.count({ where: { companyId: null } });
    const bothNullContacts = await prisma.contact.count({
      where: { tenantId: null, companyId: null },
    });
    const validScopedContacts = await prisma.contact.count({
      where: { tenantId: { not: null } },
    });

    console.log(`Summary Statistics:`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`  Total Contacts in Database:          ${totalContacts}`);
    console.log(`  Contacts with Valid tenantId:        ${validScopedContacts}`);
    console.log(`  Contacts with tenantId IS NULL:      ${nullTenantContacts}`);
    console.log(`  Contacts with companyId IS NULL:     ${nullCompanyContacts}`);
    console.log(`  Contacts with BOTH IS NULL:          ${bothNullContacts}`);
    console.log(`------------------------------------------------------------------------\n`);

    if (nullTenantContacts > 0 || nullCompanyContacts > 0) {
      console.log(`Orphan Contacts List (tenantId NULL or companyId NULL):`);
      console.log(`------------------------------------------------------------------------`);

      const orphans = await prisma.contact.findMany({
        where: {
          OR: [{ tenantId: null }, { companyId: null }],
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      console.table(
        orphans.map((c) => ({
          ID: c.id,
          Name: c.name,
          Phone: c.phone,
          Email: c.email || '—',
          CompanyId: c.companyId || 'NULL (No Company)',
          TenantId: c.tenantId || 'NULL (Unscoped)',
          CreatedAt: c.createdAt.toISOString(),
        })),
      );

      if (nullTenantContacts > 0) {
        console.log(`\n[SECURITY NOTE] ${nullTenantContacts} contacts have tenantId NULL.`);
        console.log(`Normal tenant users CANNOT view these records because all application`);
        console.log(`queries strictly enforce \`where: { tenantId: user.tenantId }\`.`);
      }
    } else {
      console.log(`All ${totalContacts} contacts have valid tenantId and companyId associations.`);
      console.log(`No orphan contacts detected!`);
    }
  } catch (error: any) {
    console.error(`Error querying database: ${error.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
