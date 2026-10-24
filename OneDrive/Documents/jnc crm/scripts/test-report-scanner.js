const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const rDir = path.join(repoRoot, 'evidence');

const REPORT_PATTERNS = [
  { name: 'Plaintext Password in connection string', regex: /postgres(?:ql)?:\/\/[^:\s'"`]+:(?!<MASKED>|\*\*\*)[^@\s'"`]+@/i },
  { name: 'Plaintext SMTP password assignment', regex: /(?:SMTP_PASS|SMTP_PASSWORD)\s*[:=]\s*['"]?(?!<MASKED>|\*\*\*)[^\s'"`]{4,}['"]?/i },
  { name: 'Bcrypt password hash ($2a$, $2b$, $2y$)', regex: /\$2[aby]\$[0-9]{2}\$[A-Za-z0-9./]{53}/ },
  { name: 'Argon2 password hash', regex: /\$argon2(?:id|[ia])\$/ },
  { name: 'JSON Web Token (JWT)', regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'Authorization Bearer Token', regex: /Bearer\s+[A-Za-z0-9_\-\.]{25,}/i },
  { name: 'Private Key header', regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { name: 'Long secret / key assignment', regex: /(?:JWT_SECRET|JWT_REFRESH_SECRET|OTP_SECRET|ENCRYPTION_KEY|MAIL_ENCRYPTION_KEY|WHATSAPP_APP_SECRET|INDIAMART_WEBHOOK_SECRET|WEBSITE_WEBHOOK_SECRET|BACKUP_ENCRYPTION_KEY)\s*[:=]\s*['"]?(?!<MASKED>|\*\*\*)[A-Za-z0-9+/=_-]{20,}['"]?/i },
];

let violations = 0;
if (fs.existsSync(rDir)) {
  const files = fs.readdirSync(rDir);
  for (const f of files) {
    if (f.startsWith('report-') && f.endsWith('.txt')) {
      const fullPath = path.join(rDir, f);
      const text = fs.readFileSync(fullPath, 'utf8');
      for (const pat of REPORT_PATTERNS) {
        if (pat.regex.test(text)) {
          console.log(`[VIOLATION] ${f}: ${pat.name}`);
          violations++;
        }
      }
    }
  }
}

console.log(`Scan completed: ${violations} violations found.`);
