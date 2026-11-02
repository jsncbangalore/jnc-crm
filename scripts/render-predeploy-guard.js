/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

console.log('========================================================================');
console.log('RENDER PRE-DEPLOYMENT PROJECT-REF GUARD');
console.log('========================================================================');

const directUrl = process.env.DIRECT_URL;
const expectedRef = process.env.NEW_PROJECT_REF || process.env.EXPECTED_PROJECT_REF;
const oldRef = process.env.OLD_PROJECT_REF;

if (!directUrl) {
  console.error('[PRE-DEPLOY FAIL] Required environment variable "DIRECT_URL" is missing or empty.');
  process.exit(1);
}

if (!expectedRef) {
  console.error('[PRE-DEPLOY FAIL] Required environment variable "NEW_PROJECT_REF" (or "EXPECTED_PROJECT_REF") is missing or empty.');
  process.exit(1);
}

// Strictly parse project ref from connection string username (postgres.<ref>) or hostname (db.<ref>.supabase.co)
let actualRef = null;
try {
  const parsedUrl = new URL(directUrl);
  const username = parsedUrl.username || '';
  const matchUser = username.match(/^[^.]+\.([a-z0-9_-]+)$/i);
  const matchHost = parsedUrl.hostname.match(/^db\.([a-z0-9_-]+)\.supabase\.co$/i);

  actualRef = matchUser && matchUser[1] ? matchUser[1] : matchHost && matchHost[1] ? matchHost[1] : null;

  if (!actualRef) {
    console.error(`[PROJECT REF REFUSAL] Connection string username "${username}" has no project ref. Format must be "postgres.<ref>". Execution refused.`);
    process.exit(1);
  }
} catch (err) {
  console.error(`[PROJECT REF REFUSAL] Invalid DIRECT_URL connection string: ${err.message}`);
  process.exit(1);
}

if (oldRef && actualRef === oldRef) {
  console.error(`[PROJECT REF REFUSAL] Connection string has OLD_PROJECT_REF "${actualRef}". Refusing execution on old database.`);
  process.exit(1);
}

if (actualRef !== expectedRef) {
  console.error(`[PROJECT REF REFUSAL] Connection string project ref "${actualRef}" does not match expected NEW_PROJECT_REF "${expectedRef}". Execution refused.`);
  process.exit(1);
}

console.log(`[PRE-DEPLOY GUARD PASS] Verified database project ref "${actualRef}" matching live NEW_PROJECT_REF.`);
console.log('Proceeding to prisma migrate deploy...\n');
process.exit(0);
