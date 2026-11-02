const fs = require('fs');
const code = fs.readFileSync('apps/api/src/inventory/inventory.service.ts', 'utf8');
const lines = code.split('\n');

let depth = 0;
lines.forEach((line, i) => {
  const lineNum = i + 1;
  let s = line.replace(/\/\/.*/, '');
  // strip strings
  s = s.replace(/`[^`]*`/g, '""').replace(/'[^']*'/g, '""').replace(/"[^"]*"/g, '""');
  
  const opens = (s.match(/\{/g) || []).length;
  const closes = (s.match(/\}/g) || []).length;
  const prevDepth = depth;
  depth += opens - closes;

  if (line.trim().startsWith('async ') || line.trim().startsWith('private ') || line.trim().startsWith('public ')) {
    console.log(`Line ${lineNum}: [prevDepth=${prevDepth}] ${line.trim().substring(0, 60)}`);
  }
});
console.log('Final depth:', depth);
