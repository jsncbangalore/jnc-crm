const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../evidence');
if (!fs.existsSync(dir)) {
  console.log('No evidence directory found.');
  process.exit(0);
}

const files = fs.readdirSync(dir).filter(f => f.startsWith('report-') && f.endsWith('.txt'));

for (const f of files) {
  const p = path.join(dir, f);
  let c = fs.readFileSync(p, 'utf8');

  // Mask JWT tokens
  c = c.replace(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '<MASKED_JWT_TOKEN>');

  // Mask postgres credentials in URLs
  c = c.replace(/postgresql:\/\/([^:@\s'"`]+):([^@\s'"`]+)@/g, 'postgresql://$1:<MASKED>@');

  // Mask SMTP_PASS assignments
  c = c.replace(/(SMTP_PASS\s*[:=]\s*['"]?)[^'"\r\n\s]+(['"]?)/gi, '$1<MASKED>$2');

  // Mask Bcrypt hashes
  c = c.replace(/\$2[aby]\$[0-9]{2}\$[A-Za-z0-9./]{53}/g, '<MASKED_BCRYPT_HASH>');

  fs.writeFileSync(p, c, 'utf8');
}

console.log(`Sanitized ${files.length} evidence reports.`);
