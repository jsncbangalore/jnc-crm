const fs = require('fs');
const path = require('path');

const banned = ['SSO', 'SAML', 'BOM', 'tier', 'regional', 'GST-compliant'];

function scan(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      if (!['node_modules', '.git', 'dist'].includes(f)) scan(full);
    } else if (f.endsWith('.tsx') || f.endsWith('.ts')) {
      const txt = fs.readFileSync(full, 'utf8');
      banned.forEach(b => {
        const re = new RegExp(`(^|[^a-zA-Z0-9])${b.replace('-', '\\-')}([^a-zA-Z0-9]|$)`, 'i');
        if (re.test(txt)) {
          // Check line by line
          txt.split('\n').forEach((line, idx) => {
            if (re.test(line)) {
              console.log(`${full}:${idx + 1} [${b}]: ${line.trim()}`);
            }
          });
        }
      });
    }
  }
}

scan(path.resolve(__dirname, '../apps/web/src/pages'));
scan(path.resolve(__dirname, '../apps/web/src/components'));
