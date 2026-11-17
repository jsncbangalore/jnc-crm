const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dumpBin = path.resolve('node_modules/pg-dump-restore-nodejs/bin/win/bin/pg_dump.exe');
const restoreBin = path.resolve('node_modules/pg-dump-restore-nodejs/bin/win/bin/pg_restore.exe');
const testDump = path.resolve('backups/test-custom.dump');

if (!fs.existsSync('backups')) fs.mkdirSync('backups', { recursive: true });

console.log('Testing pg_dump -Fc...');
execSync(`"${dumpBin}" -h localhost -p 5432 -U postgres -d jnc_crm_dev -Fc --no-owner --file="${testDump}"`, {
  env: { ...process.env, PGPASSWORD: 'postgres' },
  stdio: 'inherit'
});
console.log('Dump completed successfully! Size:', fs.statSync(testDump).size);
