/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');

// Load .env from root or apps/api
const envPaths = [
  path.join(__dirname, '..', 'apps', 'api', '.env'),
  path.join(__dirname, '..', '.env'),
  path.join(process.cwd(), '.env'),
];

for (const p of envPaths) {
  if (fs.existsSync(p)) {
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const k = trimmed.substring(0, idx).trim();
        let v = trimmed.substring(idx + 1).trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        if (process.env[k] === undefined) process.env[k] = v;
      }
    }
  }
}

async function runMailTest() {
  const args = process.argv.slice(2);
  let toAddress = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--to' && args[i + 1]) {
      toAddress = args[i + 1].trim();
      break;
    }
  }

  if (!toAddress) {
    console.error('Usage: npm run mail:test -- --to <email-address>');
    process.exit(1);
  }

  const provider = (process.env.MAIL_PROVIDER || 'smtp').trim().toLowerCase();
  // Strictly derive From address from EMAIL_FROM
  const fromEmail = (process.env.EMAIL_FROM || '').trim() || 'noreply@jsnc.co.in';
  const senderName = 'JNC CRM CLI Test';
  const fromHeader = `"${senderName}" <${fromEmail}>`;
  const host = process.env.SMTP_HOST || 'smtpout.secureserver.net';
  const port = Number(process.env.SMTP_PORT) || 587;
  const timestamp = new Date().toISOString();

  console.log(`========================================================================`);
  console.log(`JNC CRM OUTGOING MAIL TEST`);
  console.log(`Timestamp        : ${timestamp}`);
  console.log(`Mail Provider    : ${provider.toUpperCase()}`);
  console.log(`Sender Name      : ${senderName}`);
  console.log(`SMTP Host        : ${host}:${port}`);
  console.log(`From Header Used : ${fromHeader}`);
  console.log(`Recipient        : ${toAddress}`);
  console.log(`========================================================================\n`);

  let result = {
    provider,
    smtpHost: host,
    fromHeader,
    status: 'failed',
  };

  if (provider === 'brevo') {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      console.error('Error: BREVO_API_KEY is not set');
      process.exit(1);
    }
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey.trim(),
          'accept': 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: senderName, email: fromEmail },
          to: [{ email: toAddress }],
          subject: '[JNC CRM] CLI Mail Test (Brevo)',
          htmlContent: `<p>CLI Mail Test via Brevo at ${timestamp}</p>`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.messageId || data.messageIds)) {
        result = {
          provider,
          smtpHost: 'api.brevo.com',
          fromHeader,
          status: 'sent',
          messageId: data.messageId || data.messageIds[0],
        };
      } else {
        result = {
          provider,
          smtpHost: 'api.brevo.com',
          fromHeader,
          status: 'failed',
          errorText: data.message || `HTTP ${res.status}`,
        };
      }
    } catch (err) {
      result = { provider, smtpHost: 'api.brevo.com', fromHeader, status: 'failed', errorText: err.message };
    }
  } else if (provider === 'resend') {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('Error: RESEND_API_KEY is not set');
      process.exit(1);
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromHeader,
          to: [toAddress],
          subject: '[JNC CRM] CLI Mail Test (Resend)',
          html: `<p>CLI Mail Test via Resend at ${timestamp}</p>`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.id) {
        result = {
          provider,
          smtpHost: 'api.resend.com',
          fromHeader,
          status: 'sent',
          messageId: data.id,
        };
      } else {
        result = {
          provider,
          smtpHost: 'api.resend.com',
          fromHeader,
          status: 'failed',
          errorText: data.message || `HTTP ${res.status}`,
        };
      }
    } catch (err) {
      result = { provider, smtpHost: 'api.resend.com', fromHeader, status: 'failed', errorText: err.message };
    }
  } else {
    // Nodemailer SMTP — sends exactly one mail
    const nodemailer = require(path.join(__dirname, '..', 'node_modules', 'nodemailer'));
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';

    if (!user || !pass) {
      console.error('Error: SMTP_USER and SMTP_PASS must be configured for SMTP provider');
      process.exit(1);
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
      });

      const info = await transporter.sendMail({
        from: fromHeader,
        to: toAddress,
        subject: '[JNC CRM] CLI Mail Test (SMTP)',
        html: `<p>CLI Mail Test via SMTP at ${timestamp}</p>`,
      });

      result = {
        provider: 'smtp',
        smtpHost: `${host}:${port}`,
        fromHeader,
        status: 'sent',
        messageId: info.messageId,
      };
    } catch (err) {
      result = {
        provider: 'smtp',
        smtpHost: `${host}:${port}`,
        fromHeader,
        status: 'failed',
        errorText: err.message,
      };
    }
  }

  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'failed') {
    process.exit(1);
  }
}

runMailTest();
