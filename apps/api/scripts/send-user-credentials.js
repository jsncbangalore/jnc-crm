/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const nodemailer = require('nodemailer');
const { assertNotProductionDb } = require('./safety-check');
const { PrismaClient } = require('@prisma/client');

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/crm_dev?schema=public';
process.env.DATABASE_URL = dbUrl;
assertNotProductionDb('send-user-credentials');

const prisma = new PrismaClient();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

const defaultPortalUrl = process.env.FRONTEND_URL || 'https://admin.example.com/login';
const defaultAppName = process.env.PRODUCT_NAME || 'CRM';
const supportContact = process.env.SUPPORT_EMAIL || 'support@example.com';

const users = [
  {
    name: 'Sample Admin',
    role: 'Admin',
    employeeCode: 'ADM-001',
    email: process.env.TEST_DISPATCH_EMAIL || 'admin@example.com',
    tempPassword: 'SampleTempPass#2026',
  },
];

function buildHtml(u) {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); padding: 24px; text-align: center;">
        <h2 style="color: #38BDF8; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">${defaultAppName}</h2>
        <p style="color: #94A3B8; margin: 6px 0 0 0; font-size: 13px;">Enterprise Management Portal &mdash; Security Credential Update</p>
      </div>

      <div style="padding: 28px 24px;">
        <div style="background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
          <p style="margin: 0; color: #92400E; font-size: 13px; font-weight: 600;">
            &#128274; Security Notice: System Credentials Rotated
          </p>
          <p style="margin: 4px 0 0 0; color: #B45309; font-size: 12px; line-height: 1.5;">
            All previous default passwords have been revoked due to credential rotation. A secure temporary password has been assigned to your account. You will be required to establish a new private password upon your initial login.
          </p>
        </div>

        <p style="color: #1E293B; font-size: 14px; margin-top: 0;">Dear <strong>${u.name}</strong>,</p>
        <p style="color: #475569; font-size: 13px; line-height: 1.6;">
          Your updated login credentials for the <strong>${defaultAppName} Portal</strong> are detailed below:
        </p>

        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 8px 0; color: #64748B; width: 140px; border-bottom: 1px solid #F1F5F9;"><strong>Assigned Role:</strong></td>
              <td style="padding: 8px 0; color: #0F172A; border-bottom: 1px solid #F1F5F9;"><strong>${u.role}</strong></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B; border-bottom: 1px solid #F1F5F9;"><strong>User ID / Code:</strong></td>
              <td style="padding: 8px 0; color: #0F172A; font-family: monospace; font-size: 14px; font-weight: bold; border-bottom: 1px solid #F1F5F9;"><code>${u.employeeCode}</code></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B; border-bottom: 1px solid #F1F5F9;"><strong>Temporary Password:</strong></td>
              <td style="padding: 8px 0; color: #D97706; font-family: monospace; font-size: 15px; font-weight: bold; border-bottom: 1px solid #F1F5F9;"><code>${u.tempPassword}</code></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B;"><strong>Portal URL:</strong></td>
              <td style="padding: 8px 0;"><a href="${defaultPortalUrl}" style="color: #2563EB; font-weight: 600; text-decoration: underline;">${defaultPortalUrl}</a></td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${defaultPortalUrl}" style="background: #2563EB; color: #ffffff; padding: 12px 28px; text-decoration: none; font-size: 13px; font-weight: bold; border-radius: 6px; display: inline-block;">
            Log In &amp; Change Password
          </a>
        </div>

        <p style="color: #64748B; font-size: 12px; line-height: 1.6; margin-bottom: 0;">
          <em>Note: For security reasons, you will be prompted to change your temporary password immediately before gaining access to the CRM. Do not share your temporary credentials with anyone.</em>
        </p>
      </div>

      <div style="background: #F1F5F9; padding: 16px 24px; border-top: 1px solid #E2E8F0; text-align: center; color: #64748B; font-size: 11px;">
        <p style="margin: 0; font-weight: 600;">${defaultAppName} &mdash; Enterprise Management Portal</p>
        <p style="margin: 4px 0 0 0;">Support: ${supportContact}</p>
      </div>
    </div>
  `;
}

async function run() {
  console.log('Connecting to SMTP and preparing email dispatch...');
  await transporter.verify();
  console.log('SMTP connection verified.');

  for (const u of users) {
    try {
      const subject = `${defaultAppName} Account Credentials [${u.employeeCode}] - Temporary Password & Forced Reset`;
      const html = buildHtml(u);
      const text = `Hello ${u.name},\n\nYour updated ${defaultAppName} credentials are:\nUser ID: ${u.employeeCode}\nTemporary Password: ${u.tempPassword}\nPortal URL: ${defaultPortalUrl}\n\nPlease log in and set your new password immediately.`;

      const info = await transporter.sendMail({
        from: `"${defaultAppName}" <${process.env.SMTP_USER}>`,
        to: u.email,
        subject,
        html,
        text,
      });

      console.log(`[SENT] ${u.name} <${u.email}> | MessageId: ${info.messageId}`);

      // Record in MessageLog
      await prisma.messageLog.create({
        data: {
          channel: 'email',
          recipient: u.email,
          subject,
          body: `[Credentials Dispatched to ${u.name} (${u.employeeCode}) - MessageId: ${info.messageId}]`,
          status: 'sent',
          relatedEntityType: 'user',
        },
      });
    } catch (err) {
      console.error(`[ERROR] Failed to send to ${u.email}:`, err.message);
    }
  }

  console.log('All credentials emails dispatched successfully.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error during dispatch:', err);
  process.exit(1);
});
