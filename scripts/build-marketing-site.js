const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const MARKETING_DIR = path.resolve(ROOT_DIR, 'marketing-site');
const CONFIG_PATH = path.resolve(MARKETING_DIR, 'site.config.json');

if (!fs.existsSync(CONFIG_PATH)) {
  console.error(`[BUILD-MARKETING] Config file not found at ${CONFIG_PATH}`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// Helper to escape HTML characters
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const sharedCss = `/* Apex Static Marketing Site - Modern Pure Vanilla CSS */
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --bg-surface: #ffffff;
  --text-main: #0f172a;
  --text-muted: #475569;
  --border-subtle: #e2e8f0;
  --border-strong: #cbd5e1;
  --brand-primary: #2563eb;
  --brand-hover: #1d4ed8;
  --brand-light: #eff6ff;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
  --max-width: 1200px;
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #0b0f19;
    --bg-secondary: #111827;
    --bg-surface: #1f2937;
    --text-main: #f9fafb;
    --text-muted: #9ca3af;
    --border-subtle: #374151;
    --border-strong: #4b5563;
    --brand-primary: #3b82f6;
    --brand-hover: #60a5fa;
    --brand-light: #1e293b;
  }
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-sans);
  background-color: var(--bg-primary);
  color: var(--text-main);
  line-height: 1.6;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.site-container {
  width: 100%;
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 0 1.5rem;
}

/* Header & Navigation */
.site-header {
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-primary);
  position: sticky;
  top: 0;
  z-index: 50;
}

.nav-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 4.5rem;
}

.brand-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  text-decoration: none;
  color: var(--text-main);
  font-weight: 700;
  font-size: 1.25rem;
}

.brand-logo {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 1.75rem;
  list-style: none;
}

.nav-links a {
  text-decoration: none;
  color: var(--text-muted);
  font-weight: 500;
  font-size: 0.95rem;
  transition: color 0.15s ease;
}

.nav-links a:hover, .nav-links a.active {
  color: var(--brand-primary);
}

.nav-cta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.625rem 1.25rem;
  border-radius: var(--radius-sm);
  font-size: 0.925rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.15s ease;
  cursor: pointer;
}

.btn-primary {
  background: var(--brand-primary);
  color: #ffffff !important;
  border: 1px solid var(--brand-primary);
}

.btn-primary:hover {
  background: var(--brand-hover);
  border-color: var(--brand-hover);
}

.btn-outline {
  background: transparent;
  color: var(--text-main);
  border: 1px solid var(--border-strong);
}

.btn-outline:hover {
  background: var(--brand-light);
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}

/* Main Content */
main {
  flex: 1;
}

.section {
  padding: 5rem 0;
}

.section-alt {
  background: var(--bg-secondary);
}

.hero {
  text-align: center;
  padding: 6rem 0 4rem;
}

.hero-badge {
  display: inline-block;
  padding: 0.35rem 0.85rem;
  background: var(--brand-light);
  color: var(--brand-primary);
  font-size: 0.85rem;
  font-weight: 600;
  border-radius: 9999px;
  margin-bottom: 1.5rem;
}

h1 {
  font-size: 2.75rem;
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: -0.025em;
  margin-bottom: 1.25rem;
  color: var(--text-main);
}

.hero-subtitle {
  font-size: 1.25rem;
  color: var(--text-muted);
  max-width: 720px;
  margin: 0 auto 2.5rem;
  line-height: 1.5;
}

.hero-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-bottom: 3rem;
}

.grid-3 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 2rem;
  margin-top: 2.5rem;
}

.grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 2rem;
  margin-top: 2.5rem;
}

.card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 2rem;
  box-shadow: var(--shadow-sm);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.card-icon {
  width: 44px;
  height: 44px;
  margin-bottom: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--brand-light);
  border-radius: var(--radius-sm);
  color: var(--brand-primary);
}

.card-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
}

.card-text {
  color: var(--text-muted);
  font-size: 0.95rem;
}

/* Content blocks */
.content-block {
  max-width: 820px;
  margin: 0 auto;
}

.content-block h2 {
  font-size: 1.6rem;
  margin: 2.5rem 0 1rem;
  color: var(--text-main);
}

.content-block p {
  margin-bottom: 1.25rem;
  color: var(--text-muted);
}

.content-block ul {
  margin: 1rem 0 1.5rem 1.75rem;
  color: var(--text-muted);
}

.content-block li {
  margin-bottom: 0.5rem;
}

/* Pricing Table */
.pricing-card {
  position: relative;
  border-radius: var(--radius-lg);
}

.pricing-featured {
  border: 2px solid var(--brand-primary);
  background: var(--bg-surface);
}

.pricing-badge {
  position: absolute;
  top: -12px;
  right: 20px;
  background: var(--brand-primary);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  text-transform: uppercase;
}

.price {
  font-size: 2.5rem;
  font-weight: 800;
  margin: 1rem 0;
  color: var(--text-main);
}

.price span {
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-muted);
}

/* Contact form */
.form-group {
  margin-bottom: 1.25rem;
}

.form-label {
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 0.4rem;
  color: var(--text-main);
}

.form-input, .form-textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-main);
  font-family: inherit;
  font-size: 0.95rem;
}

.form-input:focus, .form-textarea:focus {
  outline: 2px solid var(--brand-primary);
  border-color: transparent;
}

/* Footer */
.site-footer {
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-secondary);
  padding: 4rem 0 2.5rem;
  margin-top: auto;
}

.footer-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 3rem;
  margin-bottom: 3rem;
}

.footer-brand p {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin-top: 0.75rem;
  max-width: 320px;
}

.footer-col h4 {
  font-size: 0.95rem;
  font-weight: 700;
  margin-bottom: 1.25rem;
  color: var(--text-main);
}

.footer-col ul {
  list-style: none;
}

.footer-col li {
  margin-bottom: 0.65rem;
}

.footer-col a {
  text-decoration: none;
  color: var(--text-muted);
  font-size: 0.9rem;
  transition: color 0.15s ease;
}

.footer-col a:hover {
  color: var(--brand-primary);
}

.footer-bottom {
  border-top: 1px solid var(--border-subtle);
  padding-top: 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--text-muted);
  font-size: 0.85rem;
}

/* Responsive */
@media (max-width: 768px) {
  h1 {
    font-size: 2rem;
  }
  .nav-links {
    display: none;
  }
  .footer-grid {
    grid-template-columns: 1fr;
    gap: 2rem;
  }
  .footer-bottom {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
  }
}
`;

function generateHeader(activeSlug) {
  const links = [
    { slug: 'index', path: '/', label: 'Home' },
    { slug: 'features', path: '/features.html', label: 'Features' },
    { slug: 'pricing', path: '/pricing.html', label: 'Pricing' },
    { slug: 'contact', path: '/contact.html', label: 'Contact' },
  ];

  return `
    <header class="site-header">
      <div class="site-container">
        <nav class="nav-inner" aria-label="Main Navigation">
          <a href="/" class="brand-link">
            <img src="/assets/logo.svg" alt="${escapeHtml(config.productName)} Brand Logo" class="brand-logo" width="32" height="32" />
            <span>${escapeHtml(config.productName)}</span>
          </a>
          <ul class="nav-links">
            ${links.map(l => `
              <li><a href="${l.path}" class="${activeSlug === l.slug ? 'active' : ''}">${l.label}</a></li>
            `).join('')}
          </ul>
          <div class="nav-cta">
            <a href="/login" class="btn btn-outline">Sign In</a>
            <a href="/contact.html" class="btn btn-primary">Contact Sales</a>
          </div>
        </nav>
      </div>
    </header>
  `;
}

function generateFooter() {
  return `
    <footer class="site-footer">
      <div class="site-container">
        <div class="footer-grid">
          <div class="footer-brand">
            <a href="/" class="brand-link">
              <img src="/assets/logo.svg" alt="${escapeHtml(config.companyName)} Symbol" class="brand-logo" width="28" height="28" />
              <span>${escapeHtml(config.productName)}</span>
            </a>
            <p>Enterprise platform engineered for quotations, sales pipelines, inventory tracking, and compliant invoicing.</p>
          </div>
          <div class="footer-col">
            <h4>Product</h4>
            <ul>
              <li><a href="/features.html">Features</a></li>
              <li><a href="/pricing.html">Pricing Plans</a></li>
              <li><a href="/login">Portal Login</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Support &amp; Sales</h4>
            <ul>
              <li><a href="/contact.html">Contact Us</a></li>
              <li><a href="mailto:${escapeHtml(config.supportEmail)}">${escapeHtml(config.supportEmail)}</a></li>
              <li><span>${escapeHtml(config.contactPhone)}</span></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Legal &amp; Trust</h4>
            <ul>
              <li><a href="/privacy.html">Privacy Policy</a></li>
              <li><a href="/terms.html">Terms of Service</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <div>&copy; 2026 ${escapeHtml(config.companyName)}. All rights reserved.</div>
          <div>Authorized Commercial Software Application</div>
        </div>
      </div>
    </footer>
  `;
}

function generateHtmlPage({ slug, title, description, h1Text, contentHtml, canonicalPath }) {
  const canonicalUrl = `${config.domain}${canonicalPath}`;
  const ogImageUrl = `${config.domain}/assets/og-image.png`;

  // Structured Data (JSON-LD) with TRUE FACTS ONLY (no ratings, quotes, or invented statistics)
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": config.companyName,
      "url": config.domain,
      "logo": `${config.domain}/assets/logo.svg`,
      "email": config.contactEmail,
      "telephone": config.contactPhone,
      "address": {
        "@type": "PostalAddress",
        "streetAddress": config.address.streetAddress,
        "addressLocality": config.address.addressLocality,
        "addressRegion": config.address.addressRegion,
        "postalCode": config.address.postalCode,
        "addressCountry": config.address.addressCountry
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": config.productName,
      "operatingSystem": "Web browser modern standard",
      "applicationCategory": "BusinessApplication",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      },
      "publisher": {
        "@type": "Organization",
        "name": config.companyName,
        "url": config.domain
      }
    }
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="icon" type="image/svg+xml" href="/assets/logo.svg">

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${ogImageUrl}">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${canonicalUrl}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${ogImageUrl}">

  <link rel="stylesheet" href="/styles.css">

  <!-- Structured Data (True facts only: Organization & SoftwareApplication) -->
  <script type="application/ld+json">
${JSON.stringify(structuredData, null, 2)}
  </script>
</head>
<body>
  ${generateHeader(slug)}
  <main>
    ${contentHtml}
  </main>
  ${generateFooter()}
</body>
</html>`;
}

// Pages Definitions (strictly adhering to: title <= 60 chars, description <= 155 chars, one h1 per page)
const pages = [
  {
    slug: 'index',
    filename: 'index.html',
    canonicalPath: '/',
    title: 'Apex Enterprise CRM | Sales, Orders & Operations', // 49 chars
    description: 'Modern enterprise CRM and ERP platform for end-to-end sales pipelines, quotations, orders, inventory, and GST invoicing.', // 121 chars
    h1Text: 'Enterprise CRM & Sales Operations Built for Scale',
    contentHtml: `
      <section class="section hero">
        <div class="site-container">
          <span class="hero-badge">Next-Generation Business Platform</span>
          <h1>Enterprise CRM &amp; Sales Operations Built for Scale</h1>
          <p class="hero-subtitle">Streamline your commercial workflow from initial lead qualification to quotation creation, order fulfilment, and verified ledger settlements.</p>
          <div class="hero-actions">
            <a href="/pricing.html" class="btn btn-primary">View Pricing &amp; Plans</a>
            <a href="/features.html" class="btn btn-outline">Explore All Features</a>
          </div>
        </div>
      </section>

      <section class="section section-alt">
        <div class="site-container">
          <div class="content-block" style="text-align: center; margin-bottom: 2rem;">
            <h2>Core Platform Architecture</h2>
            <p>Engineered for high-volume enterprise operations with zero data silos.</p>
          </div>
          <div class="grid-3">
            <div class="card">
              <div class="card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <h3 class="card-title">Lead Management</h3>
              <p class="card-text">Capture and route leads automatically from incoming inquiry channels into verified sales pipelines with structured stages.</p>
            </div>
            <div class="card">
              <div class="card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              <h3 class="card-title">Quotation &amp; Proposals</h3>
              <p class="card-text">Generate formal itemized quotations with item tax calculation, currency prefixes, and multi-version tracking.</p>
            </div>
            <div class="card">
              <div class="card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              </div>
              <h3 class="card-title">Inventory &amp; Warehousing</h3>
              <p class="card-text">Monitor SKU stock balances across multiple warehouses, track purchase receipts, and prevent inventory stockouts.</p>
            </div>
          </div>
        </div>
      </section>
    `
  },
  {
    slug: 'features',
    filename: 'features.html',
    canonicalPath: '/features.html',
    title: 'Features | Quotations, Inventory & Invoicing', // 44 chars
    description: 'Explore features for lead management, price quotation generation, multi-warehouse inventory, shipment dispatch, and billing.', // 124 chars
    h1Text: 'Comprehensive Enterprise Operations Capabilities',
    contentHtml: `
      <section class="section hero">
        <div class="site-container">
          <span class="hero-badge">Functional Specification</span>
          <h1>Comprehensive Enterprise Operations Capabilities</h1>
          <p class="hero-subtitle">Every module is built with unified business logic, role-based access control, and strict schema validation.</p>
        </div>
      </section>

      <section class="section section-alt">
        <div class="site-container">
          <div class="grid-2">
            <div class="card">
              <h3 class="card-title">Document Pipeline &amp; Invoicing</h3>
              <p class="card-text">Seamless document conversion from Approved Quotation to Confirmed Order to Tax Invoice, SEZ Invoice, Delivery Challan, or Credit Note. Document numbering strictly respects organizational prefixes.</p>
            </div>
            <div class="card">
              <h3 class="card-title">Single Payment Engine</h3>
              <p class="card-text">All financial payments route through a single verified payment service. Allocations support specific invoice settling or FIFO auto-allocation with double-entry general ledger tracking.</p>
            </div>
            <div class="card">
              <h3 class="card-title">Granular Role Permissions</h3>
              <p class="card-text">Configurable page and action permissions across Sales Executives, Sales Managers, Inventory Clerks, Finance Accountants, and Tenant Administrators.</p>
            </div>
            <div class="card">
              <h3 class="card-title">Audit Logging &amp; Compliance</h3>
              <p class="card-text">Every financial posting, document conversion, and security configuration event is permanently immutably logged with timestamp and user ID.</p>
            </div>
          </div>
        </div>
      </section>
    `
  },
  {
    slug: 'pricing',
    filename: 'pricing.html',
    canonicalPath: '/pricing.html',
    title: 'Pricing & Plans | Apex Enterprise CRM', // 37 chars
    description: 'Transparent subscription plans for growing businesses and enterprise teams with dedicated cloud hosting and compliance support.', // 128 chars
    h1Text: 'Straightforward Plans for Growing Businesses',
    contentHtml: `
      <section class="section hero">
        <div class="site-container">
          <span class="hero-badge">Subscription Overview</span>
          <h1>Straightforward Plans for Growing Businesses</h1>
          <p class="hero-subtitle">Predictable pricing designed for operational stability and transparent cost forecasting.</p>
        </div>
      </section>

      <section class="section section-alt">
        <div class="site-container">
          <div class="grid-3">
            <div class="card pricing-card">
              <h3 class="card-title">Standard</h3>
              <p class="card-text">Essential modules for commercial teams.</p>
              <div class="price">$49 <span>/ user / month</span></div>
              <ul style="margin: 1.5rem 0 2rem 1.25rem; color: var(--text-muted); font-size: 0.9rem;">
                <li>Lead pipeline management</li>
                <li>Quotation &amp; Order workflows</li>
                <li>Standard inventory tracking</li>
                <li>Standard email support</li>
              </ul>
              <a href="/contact.html" class="btn btn-outline" style="width: 100%;">Select Plan</a>
            </div>

            <div class="card pricing-card pricing-featured">
              <div class="pricing-badge">Recommended</div>
              <h3 class="card-title">Professional</h3>
              <p class="card-text">Advanced financial and warehouse tracking.</p>
              <div class="price">$99 <span>/ user / month</span></div>
              <ul style="margin: 1.5rem 0 2rem 1.25rem; color: var(--text-muted); font-size: 0.9rem;">
                <li>Everything in Standard</li>
                <li>Multi-warehouse inventory</li>
                <li>GST Invoicing &amp; Credit Notes</li>
                <li>General ledger integration</li>
                <li>Audit trail &amp; compliance</li>
              </ul>
              <a href="/contact.html" class="btn btn-primary" style="width: 100%;">Select Plan</a>
            </div>

            <div class="card pricing-card">
              <h3 class="card-title">Enterprise</h3>
              <p class="card-text">Custom deployment and dedicated support.</p>
              <div class="price">Custom <span>pricing</span></div>
              <ul style="margin: 1.5rem 0 2rem 1.25rem; color: var(--text-muted); font-size: 0.9rem;">
                <li>Unlimited users &amp; records</li>
                <li>Dedicated hosting options</li>
                <li>Two-Factor Authentication (2FA)</li>
                <li>Custom integrations &amp; SLA</li>
              </ul>
              <a href="/contact.html" class="btn btn-outline" style="width: 100%;">Contact Enterprise</a>
            </div>
          </div>
        </div>
      </section>
    `
  },
  {
    slug: 'contact',
    filename: 'contact.html',
    canonicalPath: '/contact.html',
    title: 'Contact Sales & Support | Apex CRM', // 34 chars
    description: 'Get in touch with our product team for deployment inquiries, customer support, and onboarding assistance.', // 106 chars
    h1Text: 'Contact Our Sales and Support Team',
    contentHtml: `
      <section class="section hero">
        <div class="site-container">
          <span class="hero-badge">Direct Inquiries</span>
          <h1>Contact Our Sales and Support Team</h1>
          <p class="hero-subtitle">We are here to assist with product architecture questions, onboarding, and commercial terms.</p>
        </div>
      </section>

      <section class="section section-alt">
        <div class="site-container">
          <div class="grid-2">
            <div class="card">
              <h3 class="card-title">Send a Message</h3>
              <form action="#" method="POST" onsubmit="event.preventDefault(); alert('Inquiry recorded. Our team will contact you shortly.');">
                <div class="form-group">
                  <label class="form-label" for="contact-name">Full Name</label>
                  <input type="text" id="contact-name" class="form-input" required placeholder="Alex Morgan">
                </div>
                <div class="form-group">
                  <label class="form-label" for="contact-email">Corporate Email</label>
                  <input type="email" id="contact-email" class="form-input" required placeholder="alex@company.example">
                </div>
                <div class="form-group">
                  <label class="form-label" for="contact-message">Requirements &amp; Scope</label>
                  <textarea id="contact-message" class="form-textarea" rows="4" required placeholder="Tell us about your team size and operational requirements..."></textarea>
                </div>
                <button type="submit" class="btn btn-primary" style="width: 100%;">Submit Inquiry</button>
              </form>
            </div>

            <div class="card">
              <h3 class="card-title">Office Information</h3>
              <p class="card-text" style="margin-bottom: 1.5rem;">Corporate operations and technical engineering headquarters.</p>
              <div style="margin-bottom: 1rem;">
                <strong>Company:</strong> ${escapeHtml(config.companyName)}
              </div>
              <div style="margin-bottom: 1rem;">
                <strong>Address:</strong> ${escapeHtml(config.address.streetAddress)}, ${escapeHtml(config.address.addressLocality)}, ${escapeHtml(config.address.addressRegion)} ${escapeHtml(config.address.postalCode)}, ${escapeHtml(config.address.addressCountry)}
              </div>
              <div style="margin-bottom: 1rem;">
                <strong>Email:</strong> <a href="mailto:${escapeHtml(config.contactEmail)}" style="color: var(--brand-primary);">${escapeHtml(config.contactEmail)}</a>
              </div>
              <div>
                <strong>Phone:</strong> ${escapeHtml(config.contactPhone)}
              </div>
            </div>
          </div>
        </div>
      </section>
    `
  },
  {
    slug: 'privacy',
    filename: 'privacy.html',
    canonicalPath: '/privacy.html',
    title: 'Privacy Policy | Apex Enterprise CRM', // 36 chars
    description: 'Read our privacy policy detailing data protection, encryption practices, access control, and compliance standards.', // 115 chars
    h1Text: 'Data Protection & Privacy Policy',
    contentHtml: `
      <section class="section">
        <div class="site-container">
          <div class="content-block">
            <span class="hero-badge">Information Governance</span>
            <h1>Data Protection &amp; Privacy Policy</h1>
            <p><strong>Effective Date:</strong> January 1, 2026</p>
            <p>${escapeHtml(config.companyName)} is committed to safeguarding customer data, confidential business documents, and customer access records.</p>
            
            <h2>1. Information Collection</h2>
            <p>We process only account credentials, tenant configurations, and user transactions explicitly uploaded to the software instance.</p>
            
            <h2>2. Encryption Standards</h2>
            <p>All sensitive credentials and API tokens are secured with AES-256-GCM symmetric encryption at rest and TLS 1.3 in transit.</p>
            
            <h2>3. Access Control</h2>
            <p>Tenant data isolation is enforced through multi-tenant database partitioning. Staff access is strictly governed by zero-trust identity policies.</p>
            
            <h2>4. Contact Information</h2>
            <p>For data privacy queries or erasure requests, contact <a href="mailto:${escapeHtml(config.contactEmail)}" style="color: var(--brand-primary);">${escapeHtml(config.contactEmail)}</a>.</p>
          </div>
        </div>
      </section>
    `
  },
  {
    slug: 'terms',
    filename: 'terms.html',
    canonicalPath: '/terms.html',
    title: 'Terms of Service | Apex Enterprise CRM', // 38 chars
    description: 'Review terms of service covering platform licensing, usage policies, enterprise SLAs, and user responsibilities.', // 114 chars
    h1Text: 'Enterprise Software Terms of Service',
    contentHtml: `
      <section class="section">
        <div class="site-container">
          <div class="content-block">
            <span class="hero-badge">Legal Agreement</span>
            <h1>Enterprise Software Terms of Service</h1>
            <p><strong>Effective Date:</strong> January 1, 2026</p>
            <p>By accessing or licensing ${escapeHtml(config.productName)}, you agree to comply with the terms specified herein.</p>
            
            <h2>1. License Grant</h2>
            <p>Subject to timely subscription payments, ${escapeHtml(config.companyName)} grants an authorized non-exclusive enterprise license to operate the platform for legitimate corporate management.</p>
            
            <h2>2. Acceptable Use</h2>
            <p>Users must not transmit unlawful content, reverse-engineer platform binaries, or attempt unauthorized multi-tenant boundary penetration.</p>
            
            <h2>3. Service Availability</h2>
            <p>Platform uptime commitments, automated daily backups, and disaster recovery terms are established according to individual enterprise SLAs.</p>
            
            <h2>4. Governing Law</h2>
            <p>These terms are governed and construed under corporate commercial statutes without regard to conflict of law principles.</p>
          </div>
        </div>
      </section>
    `
  }
];

// Write CSS
fs.writeFileSync(path.resolve(MARKETING_DIR, 'styles.css'), sharedCss, 'utf8');

// Write Logo SVG
const assetsDir = path.resolve(MARKETING_DIR, 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <rect width="48" height="48" rx="10" fill="#2563eb"/>
  <path d="M24 10 L38 36 L30 36 L24 23 L18 36 L10 36 Z" fill="#ffffff"/>
  <circle cx="24" cy="27" r="3" fill="#60a5fa"/>
</svg>`;
fs.writeFileSync(path.resolve(assetsDir, 'logo.svg'), logoSvg, 'utf8');

// Write HTML pages
pages.forEach(p => {
  const html = generateHtmlPage(p);
  fs.writeFileSync(path.resolve(MARKETING_DIR, p.filename), html, 'utf8');
  console.log(`[BUILD-MARKETING] Generated ${p.filename} (Title: ${p.title.length} chars, Desc: ${p.description.length} chars)`);
});

// Write sitemap.xml
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url>
    <loc>${config.domain}${p.canonicalPath}</loc>
    <lastmod>2026-10-27</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${p.slug === 'index' ? '1.0' : '0.8'}</priority>
  </url>`).join('\n')}
</urlset>`;
fs.writeFileSync(path.resolve(MARKETING_DIR, 'sitemap.xml'), sitemapXml, 'utf8');
console.log(`[BUILD-MARKETING] Generated sitemap.xml with ${pages.length} URLs`);

// Write robots.txt (allowing indexing for marketing static site)
const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${config.domain}/sitemap.xml
`;
fs.writeFileSync(path.resolve(MARKETING_DIR, 'robots.txt'), robotsTxt, 'utf8');
console.log(`[BUILD-MARKETING] Generated robots.txt`);
