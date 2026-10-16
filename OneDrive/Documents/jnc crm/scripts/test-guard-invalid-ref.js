/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

process.env.DIRECT_URL = 'postgresql://postgres.invalidref:password@db.invalid.supabase.co:5432/postgres';
process.env.EXPECTED_PROJECT_REF = 'aybysdzuwwtqhnzhgiwp';

console.log('Testing db-preflight-live.js project ref guard with mismatched reference...');
require('./db-preflight-live.js');
