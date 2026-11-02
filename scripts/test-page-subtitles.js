const fs = require('fs');
const path = require('path');

const pagesDir = path.resolve('apps/web/src/pages');
const files = fs.readdirSync(pagesDir).filter((f) => f.endsWith('.tsx'));

console.log('--- AUDITING ALL PAGE SUBTITLES IN apps/web/src/pages ---');

let totalPages = 0;
let failedPages = 0;
const results = [];

for (const file of files) {
  const filePath = path.join(pagesDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // Look for page headers: <h1 ...>Title</h1> followed closely by a subtitle <p ...>Subtitle</p>
  // We match within 400 characters after the closing </h1> to ensure it is the header's subtitle
  const h1Regex = /<h1[^>]*>([\s\S]*?)<\/h1>/g;
  let match;
  while ((match = h1Regex.exec(content)) !== null) {
    const rawTitle = match[1].replace(/<[^>]*>/g, '').replace(/\{.*?\}/g, '').trim();
    if (!rawTitle || rawTitle.length < 2) continue;

    // Look for immediate next sibling or child <p> within 400 chars
    const snippet = content.slice(match.index + match[0].length, match.index + match[0].length + 400);
    const pMatch = snippet.match(/^\s*(?:<div[^>]*>\s*)*<p[^>]*>([\s\S]*?)<\/p>/);
    if (!pMatch) continue;

    const rawSubtitle = pMatch[1]
      .replace(/<[^>]*>/g, '')
      .replace(/\{.*?\}/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!rawSubtitle || rawSubtitle.length < 3) continue;

    // Word count calculation
    const words = rawSubtitle.split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    totalPages++;
    const isOverLimit = wordCount > 12;

    results.push({
      file,
      title: rawTitle,
      subtitle: rawSubtitle,
      wordCount,
      isOverLimit,
    });

    if (isOverLimit) {
      failedPages++;
      console.error(
        `❌ [FAIL] ${file} subtitle is ${wordCount} words (> 12 limit):\n   Title:    "${rawTitle}"\n   Subtitle: "${rawSubtitle}"`
      );
    } else {
      console.log(
        `✅ [PASS] ${file} (${wordCount} words): "${rawSubtitle}"`
      );
    }
  }
}

console.log('----------------------------------------------------');
console.log(`Audited ${totalPages} subtitles across ${files.length} pages.`);
if (failedPages > 0) {
  console.error(`FAILURE: ${failedPages} subtitles exceeded the 12-word limit.`);
  process.exit(1);
} else {
  console.log('SUCCESS: All page subtitles are 12 words or fewer.');
  process.exit(0);
}
