/* --- ROLES CONTRACT & TENANT ISOLATION TEST SUITE ---
 * Tests:
 * 1. Role x Endpoint permissions (200 vs 403) across all 10 roles:
 *    - Destructive & approval endpoints (order status, shipment status, quote status, quote convert, invoice void, payment reverse, supplier delete)
 * 2. Dynamic Page Access validation (granted vs revoked)
 * 3. Cross-Tenant Data Isolation:
 *    - Tenant B user cannot read, update, void, or delete Tenant A orders, shipments, invoices, quotations, payments, or suppliers.
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require(path.join(__dirname, '../node_modules/@prisma/client'));

// Load .env
const envPath = path.join(__dirname, '../apps/api/.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }
  }
}

const prisma = new PrismaClient();
const API_BASE = process.env.API_URL || 'http://localhost:3333/api/v1';
const jwtSecret = process.env.JWT_SECRET || 'crm-default-jwt-secret-for-development-mode-2026';

const ALL_ROLES = [
  'tenant_admin',
  'admin',
  'sub_admin',
  'project_manager',
  'developer_lead',
  'store_manager',
  'finance',
  'accountant',
  'employee',
  'developer',
];

const ALL_PAGES = [
  'leads', 'quotations', 'orders', 'shipments', 'inventory', 'suppliers',
  'invoices', 'bills', 'ledger', 'daily_activities', 'notifications'
];

let passed = 0;
let failed = 0;
const results = [];

function assert(title, condition, extraInfo = '') {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${title}`);
    results.push({ title, status: 'PASSED', info: extraInfo });
  } else {
    failed++;
    console.error(`  [FAIL] ${title} ${extraInfo ? `(${extraInfo})` : ''}`);
    results.push({ title, status: 'FAILED', info: extraInfo });
  }
}

async function apiRequest(method, endpointPath, token, body = null) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers,
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${endpointPath}`, options);
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, data: json };
}

async function main() {
  console.log('========================================================================');
  console.log('CONTRACT SUITE: ROLES PERMISSIONS & TENANT ISOLATION');
  console.log('========================================================================\n');

  const randSuffix = Math.floor(100000 + Math.random() * 900000);
  const tenantAId = `tenant-role-a-${randSuffix}`;
  const tenantBId = `tenant-role-b-${randSuffix}`;

  // 1. Create Tenant A and Tenant B
  console.log(`Setting up test tenants: ${tenantAId} and ${tenantBId}...`);
  const tenantA = await prisma.tenant.create({
    data: {
      id: tenantAId,
      name: `Role Audit Tenant A ${randSuffix}`,
      code: `RAA${randSuffix}`,
      slug: `role-audit-a-${randSuffix}`,
      status: 'active',
      planTier: 'enterprise',
      requireTwoFactor: false,
    },
  });

  const tenantB = await prisma.tenant.create({
    data: {
      id: tenantBId,
      name: `Role Audit Tenant B ${randSuffix}`,
      code: `RAB${randSuffix}`,
      slug: `role-audit-b-${randSuffix}`,
      status: 'active',
      planTier: 'enterprise',
      requireTwoFactor: false,
    },
  });

  // Create Customer (Company) for Tenant A
  const customerA = await prisma.company.create({
    data: {
      tenant: { connect: { id: tenantA.id } },
      name: 'Customer A',
      billingEmail: `custA_${randSuffix}@test.fake`,
    },
  });

  // Create Customer (Company) for Tenant B
  const customerB = await prisma.company.create({
    data: {
      tenant: { connect: { id: tenantB.id } },
      name: 'Customer B',
      billingEmail: `custB_${randSuffix}@test.fake`,
    },
  });

  // Create SKU for Tenant A
  const skuA = await prisma.sku.create({
    data: {
      tenant: { connect: { id: tenantA.id } },
      skuCode: `SKUA-${randSuffix}`,
      name: 'SKU Item A',
      category: 'Hardware',
      unitPrice: 1000,
      costPrice: 600,
      taxRate: 0,
    },
  });

  // 2. Setup users for all 10 roles under Tenant A
  const roleTokens = {};
  const roleUsers = {};
  for (const role of ALL_ROLES) {
    const userId = `user-a-${role}-${randSuffix}`;
    const user = await prisma.user.create({
      data: {
        id: userId,
        tenantId: tenantA.id,
        email: `${role}_${randSuffix}@tenantA.fake`,
        name: `${role} User`,
        role: role,
        employeeCode: `ECA-${role}-${randSuffix}`,
        passwordHash: '$2a$12$dummyhashforaudittestingonly',
        isActive: true,
      },
    });
    roleUsers[role] = user;

    // Grant all pages to test pure role level permissions
    await prisma.userPageAccess.create({
      data: {
        tenant: { connect: { id: tenantA.id } },
        user: { connect: { id: user.id } },
        pages: JSON.stringify(ALL_PAGES),
      },
    });

    roleTokens[role] = jwt.sign(
      {
        sub: user.id,
        userId: user.id,
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: tenantA.id,
      },
      jwtSecret,
      { audience: 'crm-client', issuer: 'crm-api', expiresIn: '1h' }
    );
  }

  // Create Supplier for Tenant A
  const supplierA = await prisma.supplier.create({
    data: {
      tenant: { connect: { id: tenantA.id } },
      name: 'Supplier A',
      email: `supA_${randSuffix}@test.fake`,
    },
  });

  // Create Order for Tenant A
  const orderA = await prisma.order.create({
    data: {
      tenant: { connect: { id: tenantA.id } },
      customer: { connect: { id: customerA.id } },
      createdBy: { connect: { id: roleUsers['sub_admin'].id } },
      orderNumber: `ORD-A-${randSuffix}`,
      customerName: customerA.name,
      customerPhone: '9876543210',
      status: 'confirmed',
      totalAmount: 5000,
      lines: {
        create: [
          {
            skuId: skuA.id,
            description: 'Item 1',
            quantity: 5,
            unitPrice: 1000,
            totalPrice: 5000,
          },
        ],
      },
    },
  });

  // Create Shipment for Tenant A
  const shipmentA = await prisma.shipment.create({
    data: {
      tenantId: tenantA.id,
      orderId: orderA.id,
      shipmentNumber: `SHP-A-${randSuffix}`,
      trackingNumber: `TRK-A-${randSuffix}`,
      courierName: 'BlueDart',
      status: 'pending',
    },
  });

  // Create Quotation for Tenant A
  const quotationA = await prisma.quotation.create({
    data: {
      tenant: { connect: { id: tenantA.id } },
      customer: { connect: { id: customerA.id } },
      createdBy: { connect: { id: roleUsers['sub_admin'].id } },
      quoteNumber: `QT-A-${randSuffix}`,
      customerName: customerA.name,
      customerPhone: '9876543210',
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'draft',
      totalAmount: 3000,
      lines: {
        create: [
          {
            skuId: skuA.id,
            description: 'Quoted item 1',
            quantity: 3,
            unitPrice: 1000,
            totalPrice: 3000,
          },
        ],
      },
    },
  });

  // Create Invoice for Tenant A
  const invoiceA = await prisma.invoice.create({
    data: {
      tenant: { connect: { id: tenantA.id } },
      invoiceNumber: `INV-A-${randSuffix}`,
      customerName: customerA.name,
      customerPhone: '9876543210',
      order: { connect: { id: orderA.id } },
      paymentStatus: 'unpaid',
      totalAmount: 5000,
      balanceDue: 5000,
    },
  });

  // Create Payment for Tenant A
  const paymentA = await prisma.paymentRecord.create({
    data: {
      tenant: { connect: { id: tenantA.id } },
      customer: { connect: { id: customerA.id } },
      amount: 2000,
      paymentType: 'advance',
      paymentMethod: 'bank_transfer',
      transactionRef: `TXN-A-${randSuffix}`,
    },
  });

  // Create Tenant B Admin user and token
  const userB = await prisma.user.create({
    data: {
      id: `user-b-admin-${randSuffix}`,
      tenantId: tenantB.id,
      email: `admin_${randSuffix}@tenantB.fake`,
      name: `Tenant B Admin`,
      role: 'tenant_admin',
      employeeCode: `ECB-admin-${randSuffix}`,
      passwordHash: '$2a$12$dummyhashforaudittestingonly',
      isActive: true,
    },
  });

  const tokenB = jwt.sign(
    {
      sub: userB.id,
      userId: userB.id,
      id: userB.id,
      email: userB.email,
      role: userB.role,
      tenantId: tenantB.id,
    },
    jwtSecret,
    { audience: 'crm-client', issuer: 'crm-api', expiresIn: '1h' }
  );

  // Create User with ZERO page access under Tenant A
  const noAccessUser = await prisma.user.create({
    data: {
      id: `user-a-noaccess-${randSuffix}`,
      tenantId: tenantA.id,
      email: `noaccess_${randSuffix}@tenantA.fake`,
      name: `No Access User`,
      role: 'employee',
      employeeCode: `ECA-noacc-${randSuffix}`,
      passwordHash: '$2a$12$dummyhashforaudittestingonly',
      isActive: true,
    },
  });
  const noAccessToken = jwt.sign(
    {
      sub: noAccessUser.id,
      userId: noAccessUser.id,
      id: noAccessUser.id,
      email: noAccessUser.email,
      role: noAccessUser.role,
      tenantId: tenantA.id,
    },
    jwtSecret,
    { audience: 'crm-client', issuer: 'crm-api', expiresIn: '1h' }
  );

  try {
    // -------------------------------------------------------------
    // SECTION 1: DESTRUCTIVE & APPROVAL ACTIONS ROLE CONTRACT
    // -------------------------------------------------------------
    console.log('\n--- 1. Destructive & Approval Role Rules Matrix ---');

    // 1A. PATCH /orders/:id/status -> [tenant_admin, admin, sub_admin]
    console.log('\n[Action 1A] PATCH /orders/:id/status (Approval/State transition)');
    for (const role of ALL_ROLES) {
      const res = await apiRequest('PATCH', `/orders/${orderA.id}/status`, roleTokens[role], {
        status: 'in_production',
      });
      const shouldAllow = ['tenant_admin', 'admin', 'sub_admin'].includes(role);
      const isOk = shouldAllow ? res.status === 200 : res.status === 403;
      assert(`PATCH /orders/:id/status -> role ${role}: ${shouldAllow ? '200 OK' : '403 Forbidden'}`, isOk, `Status: ${res.status}`);
    }

    // 1B. PATCH /orders/shipments/:id/status -> [tenant_admin, admin, sub_admin]
    console.log('\n[Action 1B] PATCH /orders/shipments/:id/status (Approval/Status transition)');
    for (const role of ALL_ROLES) {
      const res = await apiRequest('PATCH', `/orders/shipments/${shipmentA.id}/status`, roleTokens[role], {
        status: 'in_transit',
      });
      const shouldAllow = ['tenant_admin', 'admin', 'sub_admin'].includes(role);
      const isOk = shouldAllow ? res.status === 200 : res.status === 403;
      assert(`PATCH /orders/shipments/:id/status -> role ${role}: ${shouldAllow ? '200 OK' : '403 Forbidden'}`, isOk, `Status: ${res.status}`);
    }

    // 1C. PATCH /quotations/:id/status -> [tenant_admin, admin, sub_admin]
    console.log('\n[Action 1C] PATCH /quotations/:id/status (Approval/Status transition)');
    for (const role of ALL_ROLES) {
      const res = await apiRequest('PATCH', `/quotations/${quotationA.id}/status`, roleTokens[role], {
        status: 'sent',
      });
      const shouldAllow = ['tenant_admin', 'admin', 'sub_admin'].includes(role);
      const isOk = shouldAllow ? res.status === 200 : res.status === 403;
      assert(`PATCH /quotations/:id/status -> role ${role}: ${shouldAllow ? '200 OK' : '403 Forbidden'}`, isOk, `Status: ${res.status}`);
    }

    // 1D. POST /quotations/:id/convert-to-order -> [tenant_admin, admin, sub_admin]
    console.log('\n[Action 1D] POST /quotations/:id/convert-to-order (Approval/Conversion)');
    // Test a non-allowed role first so quotation is not converted yet
    const quoteNonAllowedRes = await apiRequest('POST', `/quotations/${quotationA.id}/convert-to-order`, roleTokens['store_manager']);
    assert('POST /quotations/:id/convert-to-order -> store_manager returns 403 Forbidden', quoteNonAllowedRes.status === 403, `Status: ${quoteNonAllowedRes.status}`);

    const quoteAdminRes = await apiRequest('POST', `/quotations/${quotationA.id}/convert-to-order`, roleTokens['tenant_admin']);
    assert('POST /quotations/:id/convert-to-order -> tenant_admin allowed', quoteAdminRes.status === 200 || quoteAdminRes.status === 201, `Status: ${quoteAdminRes.status}`);

    // 1E. PATCH /invoices/:id/void -> [tenant_admin, admin, sub_admin, finance, accountant]
    console.log('\n[Action 1E] PATCH /invoices/:id/void (Destructive/Void)');
    for (const role of ALL_ROLES) {
      // Create a fresh invoice for each test to keep void test idempotent
      const tempInv = await prisma.invoice.create({
        data: {
          tenant: { connect: { id: tenantA.id } },
          invoiceNumber: `TINV-${role}-${randSuffix}`,
          customerName: customerA.name,
          customerPhone: '9876543210',
          paymentStatus: 'unpaid',
          totalAmount: 1000,
          balanceDue: 1000,
        },
      });

      const res = await apiRequest('PATCH', `/invoices/${tempInv.id}/void`, roleTokens[role], {
        reason: `Testing void for ${role}`,
      });
      const shouldAllow = ['tenant_admin', 'admin', 'sub_admin', 'finance', 'accountant'].includes(role);
      const isOk = shouldAllow ? res.status === 200 : res.status === 403;
      assert(`PATCH /invoices/:id/void -> role ${role}: ${shouldAllow ? '200 OK' : '403 Forbidden'}`, isOk, `Status: ${res.status}`);
    }

    // 1F. POST /payments/:id/reverse -> [tenant_admin, admin, sub_admin, finance, accountant]
    console.log('\n[Action 1F] POST /payments/:id/reverse (Destructive/Reversal)');
    for (const role of ALL_ROLES) {
      const tempPay = await prisma.paymentRecord.create({
        data: {
          tenant: { connect: { id: tenantA.id } },
          customer: { connect: { id: customerA.id } },
          amount: 500,
          paymentType: 'advance',
          paymentMethod: 'bank_transfer',
          transactionRef: `TRX-${role}-${randSuffix}`,
        },
      });

      const res = await apiRequest('POST', `/payments/${tempPay.id}/reverse`, roleTokens[role], {
        reason: `Testing reverse for ${role}`,
      });
      const shouldAllow = ['tenant_admin', 'admin', 'sub_admin', 'finance', 'accountant'].includes(role);
      const isOk = shouldAllow ? res.status === 200 : res.status === 403;
      assert(`POST /payments/:id/reverse -> role ${role}: ${shouldAllow ? '200 OK' : '403 Forbidden'}`, isOk, `Status: ${res.status}`);
    }

    // 1G. DELETE /suppliers/:id -> [tenant_admin, admin]
    console.log('\n[Action 1G] DELETE /suppliers/:id (Destructive/Delete)');
    for (const role of ALL_ROLES) {
      const tempSup = await prisma.supplier.create({
        data: {
          id: `temp-sup-${role}-${randSuffix}`,
          tenantId: tenantA.id,
          name: `Temp Supplier ${role}`,
        },
      });

      const res = await apiRequest('DELETE', `/suppliers/${tempSup.id}`, roleTokens[role]);
      const shouldAllow = ['tenant_admin', 'admin'].includes(role);
      const isOk = shouldAllow ? res.status === 200 : res.status === 403;
      assert(`DELETE /suppliers/:id -> role ${role}: ${shouldAllow ? '200 OK' : '403 Forbidden'}`, isOk, `Status: ${res.status}`);
    }

    // -------------------------------------------------------------
    // SECTION 2: DYNAMIC PAGE ACCESS (GRANTED VS REVOKED)
    // -------------------------------------------------------------
    console.log('\n--- 2. Dynamic Page Access Check (Granted vs Revoked) ---');
    // Store Manager with granted shipments page access -> 200
    const storeShipRes = await apiRequest('GET', '/orders/shipments/list', roleTokens['store_manager']);
    assert('Store Manager with shipments page access can list shipments (200 OK)', storeShipRes.status === 200, `Status: ${storeShipRes.status}`);

    // User without shipments page access -> 403 with user-friendly message
    const noAccShipRes = await apiRequest('GET', '/orders/shipments/list', noAccessToken);
    assert('User with revoked shipments page access receives 403 Forbidden', noAccShipRes.status === 403, `Status: ${noAccShipRes.status}`);
    assert(
      'Revoked page access message displays plain English without role names',
      noAccShipRes.data?.message === 'You do not have permission to use Shipments. Ask your administrator.',
      `Received: "${noAccShipRes.data?.message}"`
    );

    // -------------------------------------------------------------
    // SECTION 3: CROSS-TENANT DATA ISOLATION
    // -------------------------------------------------------------
    console.log('\n--- 3. Cross-Tenant Data Isolation (Tenant B vs Tenant A) ---');

    // Tenant B cannot read Tenant A order
    const crossGetOrder = await apiRequest('GET', `/orders/${orderA.id}`, tokenB);
    assert('Tenant B cannot read Tenant A order (404/403)', crossGetOrder.status === 404 || crossGetOrder.status === 403, `Status: ${crossGetOrder.status}`);

    // Tenant B cannot update Tenant A order status
    const crossUpdateOrder = await apiRequest('PATCH', `/orders/${orderA.id}/status`, tokenB, { status: 'cancelled' });
    assert('Tenant B cannot update Tenant A order status (404/403)', crossUpdateOrder.status === 404 || crossUpdateOrder.status === 403, `Status: ${crossUpdateOrder.status}`);

    // Tenant B cannot read Tenant A shipment
    const crossGetShip = await apiRequest('GET', `/orders/shipments/${shipmentA.id}/live-timeline`, tokenB);
    assert('Tenant B cannot read Tenant A shipment timeline (404/403)', crossGetShip.status === 404 || crossGetShip.status === 403, `Status: ${crossGetShip.status}`);

    // Tenant B cannot update Tenant A shipment status
    const crossUpdateShip = await apiRequest('PATCH', `/orders/shipments/${shipmentA.id}/status`, tokenB, { status: 'delivered' });
    assert('Tenant B cannot update Tenant A shipment status (404/403)', crossUpdateShip.status === 404 || crossUpdateShip.status === 403, `Status: ${crossUpdateShip.status}`);

    // Tenant B cannot read Tenant A invoice
    const crossGetInv = await apiRequest('GET', `/invoices/${invoiceA.id}`, tokenB);
    assert('Tenant B cannot read Tenant A invoice (404/403)', crossGetInv.status === 404 || crossGetInv.status === 403, `Status: ${crossGetInv.status}`);

    // Tenant B cannot void Tenant A invoice
    const crossVoidInv = await apiRequest('PATCH', `/invoices/${invoiceA.id}/void`, tokenB, { reason: 'Malicious void' });
    assert('Tenant B cannot void Tenant A invoice (404/403)', crossVoidInv.status === 404 || crossVoidInv.status === 403, `Status: ${crossVoidInv.status}`);

    // Tenant B cannot read Tenant A quotation
    const crossGetQuote = await apiRequest('GET', `/quotations/${quotationA.id}`, tokenB);
    assert('Tenant B cannot read Tenant A quotation (404/403)', crossGetQuote.status === 404 || crossGetQuote.status === 403, `Status: ${crossGetQuote.status}`);

    // Tenant B cannot convert Tenant A quotation
    const crossConvertQuote = await apiRequest('POST', `/quotations/${quotationA.id}/convert-to-order`, tokenB);
    assert('Tenant B cannot convert Tenant A quotation (404/403)', crossConvertQuote.status === 404 || crossConvertQuote.status === 403, `Status: ${crossConvertQuote.status}`);

    // Tenant B cannot reverse Tenant A payment
    const crossReversePay = await apiRequest('POST', `/payments/${paymentA.id}/reverse`, tokenB, { reason: 'Malicious reversal' });
    assert('Tenant B cannot reverse Tenant A payment (404/403)', crossReversePay.status === 404 || crossReversePay.status === 403, `Status: ${crossReversePay.status}`);

    // Tenant B cannot delete Tenant A supplier
    const crossDeleteSup = await apiRequest('DELETE', `/suppliers/${supplierA.id}`, tokenB);
    assert('Tenant B cannot delete Tenant A supplier (404/403)', crossDeleteSup.status === 404 || crossDeleteSup.status === 403, `Status: ${crossDeleteSup.status}`);

  } finally {
    // Cleanup audit records and test tenants
    console.log('\nCleaning up test artifacts...');
    await prisma.shipment.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } }).catch(() => {});
    await prisma.orderLine.deleteMany({ where: { order: { tenantId: { in: [tenantA.id, tenantB.id] } } } }).catch(() => {});
    await prisma.order.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } }).catch(() => {});
    await prisma.quotationLine.deleteMany({ where: { quotation: { tenantId: { in: [tenantA.id, tenantB.id] } } } }).catch(() => {});
    await prisma.quotation.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } }).catch(() => {});
    await prisma.invoiceLine.deleteMany({ where: { invoice: { tenantId: { in: [tenantA.id, tenantB.id] } } } }).catch(() => {});
    await prisma.paymentAllocation.deleteMany({ where: { payment: { tenantId: { in: [tenantA.id, tenantB.id] } } } }).catch(() => {});
    await prisma.invoice.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } }).catch(() => {});
    await prisma.paymentRecord.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } }).catch(() => {});
    await prisma.supplier.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } }).catch(() => {});
    await prisma.sku.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } }).catch(() => {});
    await prisma.company.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } }).catch(() => {});
    await prisma.userPageAccess.deleteMany({ where: { user: { tenantId: { in: [tenantA.id, tenantB.id] } } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  console.log(`CONTRACT SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error running contract suite:', err);
  process.exit(1);
});
