const { execSync } = require('child_process');

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const remote = process.argv[2] || 'origin';
console.log(`=== Pushing commits to ${remote} one by one ===`);

// Extract token
const input = 'protocol=https\nhost=github.com\nusername=jsncbangalore\n\n';
const creds = execSync('git credential fill', { input, encoding: 'utf8' });
const token = creds.split('\n').find(l => l.startsWith('password=')).split('=')[1].trim();
const authHeader = 'AUTHORIZATION: Basic ' + Buffer.from('jsncbangalore:' + token).toString('base64');
console.log('✓ Authentication header prepared');

// Update fetch head for remote
execSync(`git -c "http.extraHeader=${authHeader}" fetch ${remote} main`, { stdio: 'inherit' });

const commits = execSync(`git log ${remote}/main..main --reverse --format="%H %s"`, { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean)
  .map(line => {
    const [hash, ...rest] = line.split(' ');
    return { hash, msg: rest.join(' ') };
  });

console.log(`Found ${commits.length} commits to push:`);
commits.forEach((c, idx) => console.log(`  [${idx + 1}/${commits.length}] ${c.hash.slice(0, 7)} - ${c.msg}`));

for (let i = 0; i < commits.length; i++) {
  const c = commits[i];
  console.log(`\n------------------------------------------------------------`);
  console.log(`[${i + 1}/${commits.length}] Pushing commit ${c.hash.slice(0, 7)}: "${c.msg}" ...`);

  let pushed = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      console.log(`  Attempt ${attempt}/5: git push ${remote} ${c.hash}:refs/heads/main`);
      const gitCmd = `git -c "http.extraHeader=${authHeader}" -c http.postBuffer=524288000 push ${remote} ${c.hash}:refs/heads/main`;
      const out = execSync(gitCmd, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 90000,
      });
      console.log(out || '  ✓ Pushed successfully');
      pushed = true;
      break;
    } catch (err) {
      const errOut = (err.stderr ? err.stderr.toString() : '') || (err.stdout ? err.stdout.toString() : '');
      console.error(`  Attempt ${attempt} error:\n${errOut || err.message}`);
      console.log(`  Waiting 3s before retry...`);
      sleep(3000);
    }
  }

  if (!pushed) {
    console.error(`\n❌ Failed to push commit ${c.hash.slice(0, 7)} after 5 attempts.`);
    process.exit(1);
  }
}

console.log(`\n🎉 All ${commits.length} commits pushed successfully to ${remote}!`);
