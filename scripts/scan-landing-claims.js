const fs = require('fs');
const path = require('path');

const landingFile = path.resolve(__dirname, '../apps/web/src/pages/LandingPage.tsx');
const content = fs.readFileSync(landingFile, 'utf8');
const lines = content.split('\n');

const results = [];

// Look for JSX text: >text<, and string literals in arrays/objects
lines.forEach((line, lineNum) => {
  const trimmed = line.trim();
  if (trimmed.startsWith('import ') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;

  // 1. JSX text content
  const jsxMatches = line.match(/>([^<>{}\r\n]+)</g);
  if (jsxMatches) {
    jsxMatches.forEach(m => {
      const text = m.slice(1, -1).trim();
      if (text.length > 3) {
        checkAndAdd(text, lineNum + 1);
      }
    });
  }

  // 2. Object string property values
  const propMatches = line.match(/(?:title|text|description|blurb|cta|features|quote|author|role|subtext|headline):\s*['"`]([^'"`]+)['"`]/g);
  if (propMatches) {
    propMatches.forEach(m => {
      const val = m.replace(/^[^:]+:\s*['"`]|['"`]$/g, '').trim();
      if (val.length > 3) {
        checkAndAdd(val, lineNum + 1);
      }
    });
  }

  // 3. Array of string items (e.g. features: ['...', '...'])
  const arrayItemMatches = line.match(/^\s*['"`]([^'"`]+)['"`],?\s*$/);
  if (arrayItemMatches) {
    const val = arrayItemMatches[1].trim();
    if (val.length > 3) {
      checkAndAdd(val, lineNum + 1);
    }
  }
});

function checkAndAdd(text, lineNum) {
  // Split into sentences
  const sList = text.split(/(?<=[.!?])\s+/);
  sList.forEach(s => {
    const clean = s.trim();
    if (clean.length < 4) return;

    // Check for number, statistic, or claim about results
    const hasNumber = /\d|%|₹|\$|\b(?:one|two|three|four|five|ten|hundred|thousand|million|first|quarter)\b/i.test(clean);
    const hasStat = /%\s*uptime|sla|users|pipeline|rate|conversion|retention|accuracy/i.test(clean);
    const hasClaim = /faster|boost|scale|grow|save|cut|eliminate|close deals|win rate|best quarter|streamline|accelerate/i.test(clean);

    if (hasNumber || hasStat || hasClaim) {
      results.push({ lineNum, sentence: clean });
    }
  });
}

// Deduplicate
const seen = new Set();
const uniqueResults = [];
for (const r of results) {
  const key = r.sentence.toLowerCase();
  if (!seen.has(key)) {
    seen.add(key);
    uniqueResults.push(r);
  }
}

console.log(`=== FOUND ${uniqueResults.length} SENTENCES / CLAUSES WITH NUMBERS, STATS, OR CLAIMS ===\n`);
uniqueResults.forEach((r, idx) => {
  console.log(`[Line ${r.lineNum}] ${r.sentence}`);
});
