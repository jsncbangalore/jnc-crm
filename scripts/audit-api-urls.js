const fs = require('fs');
const path = require('path');

const targets = ['onrender.com', 'api.jsnc.co.in', 'localhost:3333', 'VITE_API_URL', 'BACKEND_URL'];
const results = [];

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f === 'node_modules' || f === 'dist' || f === '.git' || f === 'brain' || f === 'logs') continue;
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      scanDir(full);
    } else if (stat.isFile() && (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.includes('.env') || f.endsWith('.json') || f.endsWith('.md'))) {
      const content = fs.readFileSync(full, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        for (const t of targets) {
          if (line.includes(t)) {
            results.push({ file: full.replace(/\\/g, '/'), line: idx + 1, match: t, text: line.trim() });
            break;
          }
        }
      });
    }
  }
}

scanDir('.');
console.log('Total references found:', results.length);
results.forEach(r => console.log(`${r.file}:${r.line} [${r.match}] -> ${r.text}`));
