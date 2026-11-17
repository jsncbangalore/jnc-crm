const fs = require('fs');
const path = require('path');

const apiEnvs = new Map();
const webEnvs = new Map();

function scanTarget(target, isWeb) {
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    const files = fs.readdirSync(target);
    for (const f of files) {
      if (f === 'node_modules' || f === 'dist' || f === '.git' || f === 'brain' || f === 'logs') continue;
      scanTarget(path.join(target, f), isWeb);
    }
  } else if (stat.isFile() && (target.endsWith('.ts') || target.endsWith('.tsx') || target.endsWith('.js'))) {
    const content = fs.readFileSync(target, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const pMatches = [...line.matchAll(/process\.env\.([A-Z0-9_]+)/g)];
      pMatches.forEach(m => {
        const varName = m[1];
        const map = isWeb ? webEnvs : apiEnvs;
        if (!map.has(varName)) map.set(varName, []);
        map.get(varName).push({ file: target.replace(/\\/g, '/'), line: idx + 1, snippet: line.trim() });
      });

      const vMatches = [...line.matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)];
      vMatches.forEach(m => {
        const varName = m[1];
        if (!webEnvs.has(varName)) webEnvs.set(varName, []);
        webEnvs.get(varName).push({ file: target.replace(/\\/g, '/'), line: idx + 1, snippet: line.trim() });
      });
    });
  }
}

scanTarget('apps/api/src', false);
scanTarget('apps/web/src', true);
scanTarget('apps/web/vite.config.ts', true);

console.log('=== API ENV VARS (' + apiEnvs.size + ') ===');
for (const [k, v] of [...apiEnvs.entries()].sort((a,b) => a[0].localeCompare(b[0]))) {
  console.log(`- ${k} (referenced in ${v.length} places)`);
}

console.log('\n=== WEB ENV VARS (' + webEnvs.size + ') ===');
for (const [k, v] of [...webEnvs.entries()].sort((a,b) => a[0].localeCompare(b[0]))) {
  console.log(`- ${k} (referenced in ${v.length} places)`);
}
