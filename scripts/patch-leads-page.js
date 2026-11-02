const fs = require('fs');
const filePath = 'apps/web/src/pages/LeadsPage.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Dedupe on fetch
const target1 = `      const { data } = await leadsApi.list(params);\r\n      setLeads(data.items || []);`;
const replacement1 = `      const { data } = await leadsApi.list(params);\r\n      const rawItems = data.items || [];\r\n      const seen = new Set<string>();\r\n      const uniqueItems = rawItems.filter((item: Lead) => {\r\n        if (!item?.id || seen.has(item.id)) return false;\r\n        seen.add(item.id);\r\n        return true;\r\n      });\r\n      setLeads(uniqueItems);`;

if (!content.includes(target1)) {
  console.error('Target 1 not found!');
  process.exit(1);
}
content = content.replace(target1, replacement1);

// 2. Dedupe in filteredLeads
const target2 = `  const filteredLeads = useMemo(() => {\r\n    return leads.filter((l) => {`;
const replacement2 = `  const filteredLeads = useMemo(() => {\r\n    const seen = new Set<string>();\r\n    return leads.filter((l) => {\r\n      if (!l?.id || seen.has(l.id)) return false;\r\n      seen.add(l.id);`;

if (!content.includes(target2)) {
  console.error('Target 2 not found!');
  process.exit(1);
}
content = content.replace(target2, replacement2);

// 3. Remove idx from keys
// Pipeline card key: key={`${column.id}-${lead.id}-${idx}`} -> key={`${column.id}-${lead.id}`}
const target3 = `key={\`\${column.id}-\${lead.id}-\${idx}\`}`;
const replacement3 = `key={\`\${column.id}-\${lead.id}\`}`;
if (!content.includes(target3)) {
  console.error('Target 3 not found!');
  process.exit(1);
}
content = content.replace(target3, replacement3);

// Table view row key: key={`${l.id}-${idx}`} -> key={l.id}
const target4 = `key={\`\${l.id}-\${idx}\`}`;
const replacement4 = `key={l.id}`;
const countMatches = (content.match(new RegExp(target4.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
console.log(`Found ${countMatches} occurrences of target 4.`);
content = content.replaceAll(target4, replacement4);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated LeadsPage.tsx!');
