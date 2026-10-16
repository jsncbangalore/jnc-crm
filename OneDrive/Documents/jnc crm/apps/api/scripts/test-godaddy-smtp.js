/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

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

console.log('Connecting to GoDaddy SMTP:', env.SMTP_HOST, 'Port:', env.SMTP_PORT, 'User:', env.SMTP_USER);

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST || 'smtpout.secureserver.net',
  port: Number(env.SMTP_PORT) || 465,
  secure: Number(env.SMTP_PORT) === 465,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

async function main() {
  try {
    console.log('Verifying SMTP credentials with GoDaddy server...');
    await transporter.verify();
    console.log('✅ SMTP Connection & Authentication: SUCCESS');

    console.log('Sending real test email to santhoshs0815@gmail.com...');
    const info = await transporter.sendMail({
      from: `"JS Network Communication" <${env.EMAIL_FROM || env.SMTP_USER}>`,
      to: 'santhoshs0815@gmail.com',
      subject: 'Live Verification: JS Network Communication CRM Email Delivery',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #1a56db; margin-top: 0;">JS Network Communication (JNC Network & Power)</h2>
          <p>Hello Santhosh,</p>
          <p>This email confirms that the <strong>JS Network Communication CRM</strong> is now connected to your live GoDaddy mail server (<code>${env.SMTP_USER}</code>).</p>
          <p style="background-color: #f0fdf4; padding: 12px; border-left: 4px solid #22c55e; color: #166534;">
            <strong>Live SMTP Delivery Verified:</strong> Invoices, dispatch notices, and account emails will now deliver directly to client inboxes.
          </p>
          <p>Sent at: ${new Date().toLocaleString('en-IN')}</p>
        </div>
      `,
    });

    console.log('✅ Email Delivered Successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Accepted Recipient:', info.accepted);
  } catch (err) {
    console.error('❌ SMTP Dispatch Error:', err.message);
  }
}

main();
