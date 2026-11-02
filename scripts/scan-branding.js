const fs = require('fs');
const path = require('path');

const terms = ['companydisplayname', 'tenant.name', 'branding.company', 'all rights reserved', 'crm portal'];

function scanDir(dir) {
  let results = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (f !== 'node_modules' && f !== '.git' && f !== 'dist' && f !== 'build' && f !== '.cache') {
        results = results.concat(scanDir(p));
      }
    } else if (/\.(ts|tsx|js|jsx|html|json)$/.test(f) && !f.includes('.test.') && !f.includes('.spec.')) {
      const content = fs.readFileSync(p, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (line.includes('C2PA') || line.includes('c2pa') || line.includes('Automated AI scraping') || line.includes('rights:')) return;
        const lower = line.toLowerCase();
        for (const term of terms) {
          if (lower.includes(term)) {
            results.push({ file: p.replace(/\\/g, '/'), line: idx + 1, term, snippet: line.trim() });
            break;
          }
        }
      });
    }
  }
  return results;
}

const res = scanDir('apps/web/src');
console.log('Results count:', res.length);
res.forEach(r => {
  console.log(`${r.file}:${r.line} [${r.term}] ${r.snippet}`);
});
