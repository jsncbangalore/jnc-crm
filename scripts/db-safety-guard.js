/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/**
 * Shared safety guard ensuring maintenance scripts only run against local databases
 * unless explicitly bypassed via --i-know-this-is-live.
 */
function assertLocalhostDatabase(urlStr, argv = process.argv) {
  if (argv.includes('--i-know-this-is-live')) {
    console.warn('[SAFETY WARNING] --i-know-this-is-live flag detected. Non-local database permitted.');
    return;
  }

  if (!urlStr) {
    console.error('[SAFETY REFUSAL] DATABASE_URL is missing or empty. Refusing execution.');
    process.exit(1);
  }

  try {
    const parsed = new URL(urlStr);
    const host = (parsed.hostname || '').toLowerCase();
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (!isLocal) {
      console.error(`[SAFETY REFUSAL] Refusing to run on non-local database (${host}).`);
      console.error('All local database maintenance scripts strictly require a localhost database.');
      console.error('To run against a live database, you must explicitly pass --i-know-this-is-live.');
      process.exit(1);
    }
  } catch (err) {
    console.error(`[SAFETY REFUSAL] Invalid DATABASE_URL: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { assertLocalhostDatabase };
