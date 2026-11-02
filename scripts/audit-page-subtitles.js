const fs = require('fs');
const path = require('path');

const dir = 'apps/web/src/pages';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));

const results = [];
for (const file of files) {
  const content = fs.readFileSync(path.join(dir, file), 'utf8');
  // Look for <h1> ... </h1> followed by <p>
  const h1Regex = /<h1[\s\S]*?<\/h1>[\s\S]*?<p[\s\S]*?<\/p>/gi;
  let match;
  while ((match = h1Regex.exec(content)) !== null) {
    const block = match[0];
    const h1 = block.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '')?.replace(/\{[^}]+\}/g, '')?.trim();
    const p = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1]?.replace(/<[^>]+>/g, '')?.replace(/\{[^}]+\}/g, '')?.trim();
    if (h1 && p) {
      const words = p.split(/\s+/).filter(Boolean);
      results.push({
        file,
        title: h1,
        subtitle: p,
        wordCount: words.length
      });
    }
  }
}

console.log(`Found ${results.length} page subtitles:`);
for (const r of results) {
  const flag = r.wordCount > 12 ? '❌ >12 WORDS' : '✅ OK';
  console.log(`[${flag}] ${r.file} (${r.wordCount} words):`);
  console.log(`   Title:    ${r.title}`);
  console.log(`   Subtitle: ${r.subtitle}`);
}

const over12 = results.filter(r => r.wordCount > 12);
console.log(`\nTotal over 12 words: ${over12.length}`);
