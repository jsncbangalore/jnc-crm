const ts = require('typescript');
const fs = require('fs');
const path = require('path');

function getAllFiles(dir, exts) {
  let files = [];
  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (item !== 'node_modules' && item !== 'dist') {
        files = files.concat(getAllFiles(fullPath, exts));
      }
    } else if (exts.some(ext => item.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

const srcDir = path.resolve(__dirname, '../apps/web/src');
const files = getAllFiles(srcDir, ['.tsx', '.jsx']);

let totalFixed = 0;
let filesModified = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const missingPositions = [];

  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(sf) === 'button') {
        const hasType = node.attributes.properties.some(p => p.name && p.name.getText(sf) === 'type');
        if (!hasType) {
          // Record position right after `<button`
          const tagEnd = node.tagName.getEnd();
          missingPositions.push(tagEnd);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);

  if (missingPositions.length > 0) {
    // Sort descending so insertions don't alter earlier offsets
    missingPositions.sort((a, b) => b - a);
    let modified = content;
    for (const pos of missingPositions) {
      modified = modified.slice(0, pos) + ' type="button"' + modified.slice(pos);
    }
    fs.writeFileSync(file, modified, 'utf8');
    totalFixed += missingPositions.length;
    filesModified++;
    console.log(`Fixed ${missingPositions.length} buttons in ${path.relative(srcDir, file)}`);
  }
}

console.log(`Done! Fixed ${totalFixed} buttons across ${filesModified} files.`);
