const fs = require('fs');
const path = require('path');

const dirs = [
  path.resolve(__dirname, '../src'),
  path.resolve(__dirname, '../scripts')
];

const envVars = new Map();

function scan(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      scan(full);
    } else if (f.endsWith('.ts') || f.endsWith('.js')) {
      const content = fs.readFileSync(full, 'utf8');
      const regex = /process\.env\.([A-Za-z0-9_]+)|process\.env\[['"]([A-Za-z0-9_]+)['"]\]/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const v = match[1] || match[2];
        const rel = path.relative(path.resolve(__dirname, '..'), full).replace(/\\/g, '/');
        if (!envVars.has(v)) envVars.set(v, new Set());
        envVars.get(v).add(rel);
      }
    }
  }
}

dirs.forEach(scan);

const sorted = Array.from(envVars.keys()).sort();
console.log(JSON.stringify(sorted.map(key => ({
  variable: key,
  files: Array.from(envVars.get(key))
})), null, 2));
