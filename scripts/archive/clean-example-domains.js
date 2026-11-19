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
const files = getAllFiles(srcDir, ['.ts', '.tsx', '.html']);

let modifiedCount = 0;
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('example.com') || content.includes('example.test') || content.includes('+1-800-555')) {
    content = content
      .replace(/example\.test/g, 'company.test')
      .replace(/\+1-800-555-\d{4}/g, '+91 80 4000 0000')
      .replace(/\+1-800-555/g, '+91 80 4000')
      .replace(/example\.com/g, 'company.com');
    fs.writeFileSync(file, content, 'utf8');
    modifiedCount++;
    console.log(`Cleaned: ${path.relative(srcDir, file)}`);
  }
}

console.log(`Done! Cleaned placeholder domains in ${modifiedCount} files.`);
