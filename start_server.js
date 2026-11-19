/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');

// Determine root directory and API directory
const ROOT_DIR = __dirname;
const apiStartServer = path.join(ROOT_DIR, 'apps/api/start_server.js');

if (fs.existsSync(apiStartServer) && path.resolve(apiStartServer) !== path.resolve(__filename)) {
  require(apiStartServer);
} else {
  // Standalone fallback
  const distCandidates = [
    path.join(ROOT_DIR, 'apps/api/dist/main.js'),
    path.join(ROOT_DIR, 'dist/main.js'),
  ];
  const target = distCandidates.find((c) => fs.existsSync(c));
  if (!target) {
    console.error('[STARTUP] FATAL: Could not locate compiled entry point (dist/main.js)');
    process.exit(1);
  }

  console.log(`[STARTUP] Starting server from: ${target}`);
  require(target);
}
