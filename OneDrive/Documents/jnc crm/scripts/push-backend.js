const { execSync } = require('child_process');
const path = require('path');
const wt = path.join(process.env.TEMP, 'jnc_backend_worktree');

function run(cmd) {
  console.log('>', cmd);
  const out = execSync(cmd, { cwd: wt, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  if (out) console.log(out.trim());
}

try {
  run('git add -A');
  run('git commit -m "feat(api): update standalone backend bundle with logo upload, direct printing, and security fixes"');
  run('git push backend HEAD:main');
  console.log('\n[SUCCESS] Successfully pushed latest backend updates to jnc_crm_backend (main branch).');
} catch (err) {
  console.error('[ERROR]', err.message);
  if (err.stdout) console.log(err.stdout.toString());
  if (err.stderr) console.error(err.stderr.toString());
  process.exit(1);
}
