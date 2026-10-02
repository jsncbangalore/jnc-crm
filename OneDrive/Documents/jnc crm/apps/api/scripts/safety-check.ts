/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const PROD_HOST = 'aws-0-ap-southeast-1.pooler.supabase.com';

export function assertNotProductionDb(contextName: string = 'Script/Test') {
  const dbUrl = process.env.DATABASE_URL || '';
  const allowProd = process.argv.includes('--allow-production') || process.env.ALLOW_PRODUCTION === 'true';

  if (dbUrl.includes(PROD_HOST) && !allowProd) {
    const errorMsg = `\n========================================================================\n` +
      `[SECURITY ERROR] ${contextName} refused to run on production database:\n` +
      `Host: ${PROD_HOST}\n` +
      `To allow execution on production, you must explicitly pass --allow-production\n` +
      `========================================================================\n`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}
