const fs = require('fs');
const path = require('path');

const replacements = [
  {
    file: 'AuditLogsPage.tsx',
    match: /Operating security logs, company login attempts, active sessions, browser names, and IP addresses\./,
    replace: 'Security logs, login attempts, active sessions, and client IP addresses.',
  },
  {
    file: 'ContactPage.tsx',
    match: /Have questions about \{.*?\}, enterprise volume pricing, or need technical assistance\? Send us a message and our team will get back to you promptly\./,
    replace: 'Contact our team for pricing, technical questions, or enterprise assistance.',
  },
  {
    file: 'CookieConsentPage.tsx',
    match: /We believe in complete transparency\.[\s\S]*?marketing cookies\./,
    replace: 'We use browser storage for security and preferences without advertising trackers.',
  },
  {
    file: 'FeaturesPage.tsx',
    match: /\{.*?\} replaces disconnected spreadsheets and point solutions with an integrated operations hub designed for growing businesses\./,
    replace: 'Integrated sales, fulfillment, and billing operations for growing businesses.',
  },
  {
    file: 'ForcePasswordResetPage.tsx',
    match: /Welcome,[\s\S]*?before accessing the system\./,
    replace: 'Set a new secure password before accessing your account.',
  },
  {
    file: 'HelpPage.tsx',
    match: /Search our comprehensive guides, tutorials, and FAQs to get the most out of \{.*?\}/,
    replace: 'Guides, tutorials, and answers for common questions.',
  },
  {
    file: 'InvoicesPage.tsx',
    match: /Generate, preview, print, and email 100% compliant Tax Invoices, SEZ \(LUT\) Copies, Proforma & Delivery Challans\./,
    replace: 'Create compliant Tax Invoices, SEZ copies, and Delivery Challans.',
  },
  {
    file: 'LandingPage.tsx',
    match: /\{BRAND\.name\} keeps every lead[\s\S]*?spends its time selling\./,
    replace: 'Track leads, conversations, and deals with automated follow-ups.',
  },
  {
    file: 'LeadFlowPage.tsx',
    match: /Visual Bezier flow builder, real-time IndiaMART webhook configuration, Meta &amp; WhatsApp Cloud connections, unified inbox, and conversion analytics\./,
    replace: 'Automate leads from IndiaMART, Meta, and WhatsApp in one pipeline.',
  },
  {
    file: 'ObjectManagerPage.tsx',
    match: /Custom Object Schema Builder • Define Custom Objects, Field Types & Relational Lookups/,
    replace: 'Define custom objects, custom fields, and relational lookups.',
  },
  {
    file: 'PricingPage.tsx',
    match: /Choose the plan that fits your current operational needs\. Upgrade anytime as your team and pipeline expand\./,
    replace: 'Select a plan that fits your operations and scale anytime.',
  },
  {
    file: 'PurchaseBillsPage.tsx',
    match: /Manage vendor purchase invoices, inward component batches, track GST input tax credits, and scan physical bills\./,
    replace: 'Record vendor bills, inward batches, and GST input credits.',
  },
  {
    file: 'QuotationsPage.tsx',
    match: /Create professional GST price estimates, print PDFs, and convert to active orders in 1-click/,
    replace: 'Create GST price estimates and convert them into confirmed orders.',
  },
  {
    file: 'SolutionsPage.tsx',
    match: /Whether managing complex distribution warehouses or fast-moving client accounts, \{.*?\} adapts to your exact operational workflows\./,
    replace: 'Tailored workflows for distribution warehouses and customer accounts.',
  },
];

let updatedCount = 0;
for (const item of replacements) {
  const filePath = path.resolve('apps/web/src/pages', item.file);
  if (!fs.existsSync(filePath)) {
    console.warn('File not found:', item.file);
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  if (item.match.test(content)) {
    const updated = content.replace(item.match, item.replace);
    fs.writeFileSync(filePath, updated, 'utf8');
    console.log('Updated subtitle in:', item.file);
    updatedCount++;
  } else {
    console.log('Pattern not matched in:', item.file);
  }
}
console.log('Total updated:', updatedCount);
