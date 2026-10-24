/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');
const lines = fs.readFileSync(envPath, 'utf8').split('\n');
const env = {};
for (const line of lines) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = match[2] ? match[2].trim() : '';
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[match[1]] = val;
  }
}

const customHost = env.SMTP_HOST || 'mail.example.com';
const configs = [
  { host: 'smtpout.secureserver.net', port: 465, secure: true },
  { host: 'smtpout.secureserver.net', port: 587, secure: false },
  { host: 'smtpout.secureserver.net', port: 80, secure: false },
  { host: 'smtpout.secureserver.net', port: 3535, secure: false },
  { host: 'smtp.secureserver.net', port: 465, secure: true },
  { host: 'smtp.secureserver.net', port: 587, secure: false },
  { host: customHost, port: 465, secure: true },
  { host: customHost, port: 587, secure: false },
];

async function testAll() {
  for (const cfg of configs) {
    console.log(`\nTesting ${cfg.host}:${cfg.port} (secure=${cfg.secure})...`);
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });

    try {
      await transporter.verify();
      console.log(`[OK] SUCCESS on ${cfg.host}:${cfg.port}!`);
      return cfg;
    } catch (e) {
      console.log(`[FAIL] Failed: ${e.message}`);
    }
  }
}

testAll();
