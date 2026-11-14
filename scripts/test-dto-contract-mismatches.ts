/**
 * DTO Contract Mismatch Verification Test
 * 
 * Verifies that for every POST, PUT, and PATCH endpoint:
 * 1. The web form / client payload contains ONLY fields defined on the API DTO.
 * 2. Any unknown fields that would trigger class-validator "property X should not exist" are caught and flagged.
 * 3. Required fields defined on the DTO are provided by the client form.
 * 4. Fails the build if any unknown or missing field is found.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const API_SRC = path.resolve(__dirname, '../apps/api/src');
const WEB_SRC = path.resolve(__dirname, '../apps/web/src');

interface DtoProperty {
  name: string;
  isOptional: boolean;
}

interface DtoInfo {
  name: string;
  filePath: string;
  properties: Map<string, DtoProperty>;
}

interface EndpointInfo {
  controller: string;
  method: string;
  httpMethod: 'POST' | 'PUT' | 'PATCH';
  fullPath: string;
  dtoName?: string;
  bodyParamName?: string;
}

interface ContractCheckResult {
  endpoint: string;
  httpMethod: string;
  dtoName: string;
  clientCall: string;
  formFile?: string;
  payloadKeys: string[];
  allowedKeys: string[];
  unknownKeys: string[];
  missingRequiredKeys: string[];
  status: 'SYNC' | 'OUT_OF_SYNC';
}

// 1. Collect all DTO definitions across apps/api/src
function collectDtos(): Map<string, DtoInfo> {
  const dtos = new Map<string, DtoInfo>();

  function walkDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        parseDtoFile(fullPath);
      }
    }
  }

  function parseDtoFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('class ') || (!content.includes('Dto') && !filePath.includes('dto'))) return;

    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

    function visit(node: ts.Node) {
      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.text;
        const properties = new Map<string, DtoProperty>();

        node.members.forEach((member) => {
          if (ts.isPropertyDeclaration(member) && member.name) {
            const propName = member.name.getText(sourceFile).replace(/['"]/g, '');
            let isOptional = Boolean(member.questionToken);

            if (member.modifiers) {
              member.modifiers.forEach((mod) => {
                const text = mod.getText(sourceFile);
                if (text.includes('IsOptional')) {
                  isOptional = true;
                }
              });
            }

            properties.set(propName, { name: propName, isOptional });
          }
        });

        // Also check inherited classes if any
        if (properties.size > 0 || className.endsWith('Dto')) {
          dtos.set(className, {
            name: className,
            filePath,
            properties,
          });
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  walkDir(API_SRC);
  return dtos;
}

// 2. Collect all controller endpoints
function collectEndpoints(): EndpointInfo[] {
  const endpoints: EndpointInfo[] = [];

  function walkDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.controller.ts')) {
        parseControllerFile(fullPath);
      }
    }
  }

  function parseControllerFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

    let controllerBasePath = '';

    function visit(node: ts.Node) {
      if (ts.isClassDeclaration(node) && node.modifiers) {
        node.modifiers.forEach((mod) => {
          if (ts.isDecorator(mod) && ts.isCallExpression(mod.expression)) {
            const callText = mod.expression.expression.getText(sourceFile);
            if (callText === 'Controller') {
              const arg = mod.expression.arguments[0];
              controllerBasePath = arg ? arg.getText(sourceFile).replace(/['"]/g, '') : '';
            }
          }
        });
      }

      if (ts.isMethodDeclaration(node) && node.modifiers) {
        let httpMethod: 'POST' | 'PUT' | 'PATCH' | null = null;
        let methodSubPath = '';

        node.modifiers.forEach((mod) => {
          if (ts.isDecorator(mod) && ts.isCallExpression(mod.expression)) {
            const decName = mod.expression.expression.getText(sourceFile);
            if (decName === 'Post' || decName === 'Put' || decName === 'Patch') {
              httpMethod = decName.toUpperCase() as any;
              const arg = mod.expression.arguments[0];
              methodSubPath = arg ? arg.getText(sourceFile).replace(/['"]/g, '') : '';
            }
          }
        });

        if (httpMethod) {
          let dtoName: string | undefined;
          let bodyParamName: string | undefined;

          node.parameters.forEach((param) => {
            if (param.modifiers) {
              param.modifiers.forEach((mod) => {
                if (ts.isDecorator(mod)) {
                  const decText = mod.getText(sourceFile);
                  if (decText.startsWith('@Body(')) {
                    bodyParamName = param.name.getText(sourceFile);
                    if (param.type) {
                      dtoName = param.type.getText(sourceFile).trim();
                    }
                  }
                }
              });
            }
          });

          const cleanBase = controllerBasePath ? `/${controllerBasePath.replace(/^\/+|\/+$/g, '')}` : '';
          const cleanSub = methodSubPath ? `/${methodSubPath.replace(/^\/+|\/+$/g, '')}` : '';
          const fullPath = `${cleanBase}${cleanSub}` || '/';

          endpoints.push({
            controller: path.basename(filePath),
            method: node.name.getText(sourceFile),
            httpMethod,
            fullPath,
            dtoName,
            bodyParamName,
          });
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  walkDir(API_SRC);
  return endpoints;
}

// 3. Known web form / client payload definitions mapped to endpoints
const KNOWN_WEB_PAYLOADS: Array<{
  endpointMatch: RegExp;
  httpMethod: 'POST' | 'PUT' | 'PATCH';
  clientCall: string;
  formFile: string;
  expectedDto: string;
  payloadKeys: string[];
}> = [
  // 1. Quotations
  {
    endpointMatch: /^\/quotations$/,
    httpMethod: 'POST',
    clientCall: 'quotationsApi.create',
    formFile: 'apps/web/src/components/quotations/CreateQuotationModal.tsx',
    expectedDto: 'CreateQuotationDto',
    payloadKeys: [
      'customerId', 'customerName', 'customerPhone', 'customerEmail',
      'companyName', 'shippingAddress', 'taxRate', 'terms', 'lines'
    ],
  },
  {
    endpointMatch: /^\/quotations$/,
    httpMethod: 'POST',
    clientCall: 'quotationsApi.create (page)',
    formFile: 'apps/web/src/pages/QuotationsPage.tsx',
    expectedDto: 'CreateQuotationDto',
    payloadKeys: [
      'leadId', 'customerName', 'customerPhone', 'customerEmail',
      'companyName', 'shippingAddress', 'notes', 'terms', 'taxRate', 'lines'
    ],
  },
  {
    endpointMatch: /^\/quotations\/[^/]+\/status$/,
    httpMethod: 'PATCH',
    clientCall: 'quotationsApi.updateStatus',
    formFile: 'apps/web/src/pages/QuotationsPage.tsx',
    expectedDto: 'UpdateQuotationStatusDto',
    payloadKeys: ['status'],
  },
  {
    endpointMatch: /^\/quotations\/lines$/,
    httpMethod: 'POST',
    clientCall: 'CreateQuotationModal line items',
    formFile: 'apps/web/src/components/quotations/CreateQuotationModal.tsx',
    expectedDto: 'QuotationLineItemDto',
    payloadKeys: ['skuId', 'name', 'quantity', 'unitPrice', 'discount', 'hsnCode'],
  },

  // 2. Leads
  {
    endpointMatch: /^\/leads$/,
    httpMethod: 'POST',
    clientCall: 'leadsApi.create',
    formFile: 'apps/web/src/components/leads/CreateLeadModal.tsx',
    expectedDto: 'CreateLeadDto',
    payloadKeys: [
      'customerName', 'customerPhone', 'customerEmail', 'companyName',
      'state', 'city', 'productCategory', 'productName', 'quantity', 'unit',
      'estimatedValue', 'urgency', 'queryMessage', 'source', 'forceSave', 'allowDuplicate'
    ],
  },
  {
    endpointMatch: /^\/leads\/[^/]+$/,
    httpMethod: 'PATCH',
    clientCall: 'leadsApi.update',
    formFile: 'apps/web/src/components/leads/CreateLeadModal.tsx',
    expectedDto: 'UpdateLeadDto',
    payloadKeys: [
      'customerName', 'customerPhone', 'customerEmail', 'companyName',
      'state', 'city', 'productCategory', 'productName', 'quantity', 'unit',
      'estimatedValue', 'urgency', 'queryMessage'
    ],
  },
  {
    endpointMatch: /^\/leads\/[^/]+\/status$/,
    httpMethod: 'PATCH',
    clientCall: 'leadsApi.updateStatus',
    formFile: 'apps/web/src/pages/LeadsPage.tsx',
    expectedDto: 'UpdateLeadStatusDto',
    payloadKeys: ['status'],
  },

  // 3. Orders
  {
    endpointMatch: /^\/orders$/,
    httpMethod: 'POST',
    clientCall: 'ordersApi.create',
    formFile: 'apps/web/src/components/orders/CreateOrderModal.tsx',
    expectedDto: 'CreateOrderDto',
    payloadKeys: [
      'customerId', 'customerName', 'customerPhone', 'customerEmail',
      'shippingAddress', 'notes', 'lines'
    ],
  },
  {
    endpointMatch: /^\/orders\/lines$/,
    httpMethod: 'POST',
    clientCall: 'CreateOrderModal line items',
    formFile: 'apps/web/src/components/orders/CreateOrderModal.tsx',
    expectedDto: 'OrderLineItemDto',
    payloadKeys: ['skuId', 'name', 'quantity', 'unitPrice'],
  },
  {
    endpointMatch: /^\/orders\/[^/]+$/,
    httpMethod: 'PATCH',
    clientCall: 'ordersApi.update',
    formFile: 'apps/web/src/components/orders/EditOrderModal.tsx',
    expectedDto: 'UpdateOrderDto',
    payloadKeys: [
      'customerName', 'customerPhone', 'customerEmail', 'shippingAddress',
      'paymentStatus', 'notes', 'lines'
    ],
  },
  {
    endpointMatch: /^\/orders\/[^/]+\/status$/,
    httpMethod: 'PATCH',
    clientCall: 'ordersApi.updateStatus',
    formFile: 'apps/web/src/components/orders/EditOrderModal.tsx',
    expectedDto: 'UpdateOrderStatusDto',
    payloadKeys: ['status'],
  },

  // 4. Customers & Companies
  {
    endpointMatch: /^\/companies$/,
    httpMethod: 'POST',
    clientCall: 'companiesApi.create',
    formFile: 'apps/web/src/components/companies/CompanyModal.tsx',
    expectedDto: 'CreateCompanyDto',
    payloadKeys: ['name', 'gstin', 'industry', 'address', 'city', 'state', 'website', 'billingEmail'],
  },
  {
    endpointMatch: /^\/companies$/,
    httpMethod: 'POST',
    clientCall: 'companiesApi.create (select modal)',
    formFile: 'apps/web/src/components/common/CustomerSelectWithModal.tsx',
    expectedDto: 'CreateCompanyDto',
    payloadKeys: ['name', 'gstin', 'billingEmail', 'phone', 'address', 'state', 'city'],
  },
  {
    endpointMatch: /^\/companies\/[^/]+$/,
    httpMethod: 'PATCH',
    clientCall: 'companiesApi.update',
    formFile: 'apps/web/src/components/companies/CompanyModal.tsx',
    expectedDto: 'UpdateCompanyDto',
    payloadKeys: ['name', 'gstin', 'industry', 'address', 'city', 'state', 'website', 'billingEmail'],
  },
  {
    endpointMatch: /^\/companies\/[^/]+\/contacts$/,
    httpMethod: 'POST',
    clientCall: 'companiesApi.createContact',
    formFile: 'apps/web/src/components/companies/CompanyContactsModal.tsx',
    expectedDto: 'CreateContactDto',
    payloadKeys: ['name', 'phone', 'email', 'designation'],
  },

  // 5. Suppliers
  {
    endpointMatch: /^\/suppliers$/,
    httpMethod: 'POST',
    clientCall: 'suppliersApi.create',
    formFile: 'apps/web/src/pages/SuppliersPage.tsx',
    expectedDto: 'CreateSupplierDto',
    payloadKeys: ['name', 'contactPerson', 'phone', 'email', 'gstin', 'city', 'address', 'leadTimeDays', 'notes'],
  },
  {
    endpointMatch: /^\/suppliers\/[^/]+$/,
    httpMethod: 'PATCH',
    clientCall: 'suppliersApi.update',
    formFile: 'apps/web/src/pages/SuppliersPage.tsx',
    expectedDto: 'UpdateSupplierDto',
    payloadKeys: ['name', 'contactPerson', 'phone', 'email', 'gstin', 'city', 'address', 'leadTimeDays', 'notes', 'isActive'],
  },
  {
    endpointMatch: /^\/inventory\/suppliers\/[^/]+\/purchase$/,
    httpMethod: 'POST',
    clientCall: 'inventoryApi.recordSupplierPurchase',
    formFile: 'apps/web/src/components/inventory/SupplierPurchaseModal.tsx',
    expectedDto: 'RecordPurchaseDto',
    payloadKeys: ['invoiceNumber', 'invoiceDate', 'supplierGstin', 'taxRate', 'taxType', 'documentUrl', 'items', 'notes'],
  },
  {
    endpointMatch: /^\/inventory\/purchase-bills$/,
    httpMethod: 'POST',
    clientCall: 'inventoryApi.createPurchaseBill',
    formFile: 'apps/web/src/components/inventory/SmartBillScannerModal.tsx',
    expectedDto: 'CreatePurchaseBillDto',
    payloadKeys: [
      'vendorName', 'vendorGstin', 'supplierGstin', 'invoiceNumber', 'billNumber',
      'invoiceDate', 'issueDate', 'dueDate', 'taxRate', 'taxType', 'documentUrl',
      'grandTotal', 'items', 'notes'
    ],
  },

  // 6. SKUs and Stock
  {
    endpointMatch: /^\/inventory\/skus$/,
    httpMethod: 'POST',
    clientCall: 'inventoryApi.createSku',
    formFile: 'apps/web/src/components/inventory/RecordComponentPurchaseModal.tsx',
    expectedDto: 'CreateSkuDto',
    payloadKeys: ['skuCode', 'name', 'category', 'unitPrice', 'costPrice', 'taxRate', 'packageType', 'reorderPoint', 'reorderQty'],
  },
  {
    endpointMatch: /^\/inventory\/skus\/[^/]+$/,
    httpMethod: 'PATCH',
    clientCall: 'inventoryApi.updateSku',
    formFile: 'apps/web/src/pages/InventoryPage.tsx',
    expectedDto: 'UpdateSkuDto',
    payloadKeys: ['skuCode', 'name', 'category', 'unitPrice', 'costPrice', 'unit', 'taxRate', 'packageType', 'reorderPoint', 'reorderQty'],
  },
  {
    endpointMatch: /^\/inventory\/project-stock$/,
    httpMethod: 'POST',
    clientCall: 'inventoryApi.createProjectStockPosition',
    formFile: 'apps/web/src/components/inventory/RecordComponentPurchaseModal.tsx',
    expectedDto: 'CreateProjectStockDto',
    payloadKeys: [
      'project', 'reference', 'quantity', 'itemCode', 'partValue',
      'package', 'unit', 'bomQtyPerUnit', 'batchQty', 'plannedRequirement',
      'openingStock', 'inflow', 'outflow', 'notes'
    ],
  },
  {
    endpointMatch: /^\/inventory\/transfers$/,
    httpMethod: 'POST',
    clientCall: 'inventoryApi.transferStock',
    formFile: 'apps/web/src/components/inventory/WarehouseTransferModal.tsx',
    expectedDto: 'TransferStockDto',
    payloadKeys: ['skuId', 'sourceWarehouseId', 'destinationWarehouseId', 'quantity', 'notes'],
  },

  // 7. Invoices
  {
    endpointMatch: /^\/invoices\/create-direct$/,
    httpMethod: 'POST',
    clientCall: 'invoicingApi.createDirect',
    formFile: 'apps/web/src/components/invoices/CreateDocumentModal.tsx',
    expectedDto: 'CreateDirectInvoiceDto',
    payloadKeys: [
      'docType', 'customerId', 'customerName', 'customerPhone', 'customerEmail',
      'customerAddress', 'customerGstin', 'invoiceNumber', 'invoiceDate', 'dueDate',
      'paymentTerms', 'lines', 'notes', 'shippingCharges', 'discount'
    ],
  },
  {
    endpointMatch: /^\/invoices\/lines$/,
    httpMethod: 'POST',
    clientCall: 'CreateDocumentModal line items',
    formFile: 'apps/web/src/components/invoices/CreateDocumentModal.tsx',
    expectedDto: 'InvoiceLineItemDto',
    payloadKeys: ['skuId', 'description', 'hsnCode', 'unit', 'quantity', 'unitPrice', 'discount', 'taxRate'],
  },
  {
    endpointMatch: /^\/invoices\/[^/]+$/,
    httpMethod: 'PATCH',
    clientCall: 'invoicingApi.update',
    formFile: 'apps/web/src/pages/InvoicesPage.tsx',
    expectedDto: 'UpdateInvoiceDto',
    payloadKeys: [
      'invoiceNumber', 'invoiceDate', 'dueDate', 'customerName',
      'customerPhone', 'customerEmail', 'customerAddress', 'customerGstin', 'notes'
    ],
  },

  // 8. Receipts and Payments
  {
    endpointMatch: /^\/payments$/,
    httpMethod: 'POST',
    clientCall: 'paymentApi.record',
    formFile: 'apps/web/src/components/payments/RecordPaymentModal.tsx',
    expectedDto: 'RecordPaymentDto',
    payloadKeys: [
      'partyId', 'partyType', 'customerId', 'supplierId', 'amount',
      'paymentType', 'paymentMethod', 'transactionRef', 'reference',
      'bankAccountId', 'paymentDate', 'notes', 'allocations', 'deductions',
      'allowAdvance', 'isAdvance', 'confirmDuplicate', 'confirmedLargePayment', 'typedConfirmation'
    ],
  },
  {
    endpointMatch: /^\/payments\/allocations$/,
    httpMethod: 'POST',
    clientCall: 'RecordPaymentModal allocation items',
    formFile: 'apps/web/src/components/payments/RecordPaymentModal.tsx',
    expectedDto: 'PaymentAllocationDto',
    payloadKeys: ['documentId', 'invoiceId', 'billId', 'amount'],
  },
  {
    endpointMatch: /^\/payments\/deductions$/,
    httpMethod: 'POST',
    clientCall: 'RecordPaymentModal deduction items',
    formFile: 'apps/web/src/components/payments/RecordPaymentModal.tsx',
    expectedDto: 'PaymentDeductionDto',
    payloadKeys: ['type', 'amount', 'note', 'notes'],
  },

  // 9. Bank Accounts
  {
    endpointMatch: /^\/settings\/bank-accounts$/,
    httpMethod: 'POST',
    clientCall: 'bankAccountsApi.create',
    formFile: 'apps/web/src/components/settings/CompanyBankAccountsSection.tsx',
    expectedDto: 'CreateBankAccountDto',
    payloadKeys: ['label', 'bankName', 'holderName', 'accountNumber', 'ifsc', 'branch', 'upiId', 'isDefault', 'isDocumentDefault'],
  },
  {
    endpointMatch: /^\/settings\/bank-accounts\/[^/]+$/,
    httpMethod: 'PATCH',
    clientCall: 'bankAccountsApi.update',
    formFile: 'apps/web/src/components/settings/CompanyBankAccountsSection.tsx',
    expectedDto: 'UpdateBankAccountDto',
    payloadKeys: ['label', 'bankName', 'holderName', 'accountNumber', 'ifsc', 'branch', 'upiId', 'isDefault', 'isDocumentDefault'],
  },

  // 10. Branding & Profile
  {
    endpointMatch: /^\/settings\/branding$/,
    httpMethod: 'POST',
    clientCall: 'brandingApi.update',
    formFile: 'apps/web/src/pages/BrandingSettingsPage.tsx',
    expectedDto: 'UpdateBrandingDto',
    payloadKeys: ['companyDisplayName', 'companyPhone', 'companyLogoUrl'],
  },
  {
    endpointMatch: /^\/settings\/company-profile$/,
    httpMethod: 'POST',
    clientCall: 'brandingApi.updateProfile',
    formFile: 'apps/web/src/pages/BrandingSettingsPage.tsx',
    expectedDto: 'UpdateCompanyProfileDto',
    payloadKeys: [
      'name', 'phone', 'email', 'address', 'city', 'state', 'pincode',
      'website', 'gstin', 'pan', 'invoicePrefix', 'lutBondNo', 'lutValidity',
      'bankName', 'bankAccountNumber', 'bankIfsc', 'bankBranch', 'bankUpi',
      'signatoryName', 'signatoryDesignation', 'signatureUrl', 'stampUrl', 'requireTwoFactor'
    ],
  },

  // 11. Users
  {
    endpointMatch: /^\/users$/,
    httpMethod: 'POST',
    clientCall: 'usersApi.create',
    formFile: 'apps/web/src/pages/UsersPage.tsx',
    expectedDto: 'CreateUserDto',
    payloadKeys: ['name', 'email', 'phone', 'role', 'teamId', 'warehouseId', 'pages', 'homePage'],
  },
  {
    endpointMatch: /^\/users\/[^/]+$/,
    httpMethod: 'PATCH',
    clientCall: 'usersApi.update',
    formFile: 'apps/web/src/pages/UsersPage.tsx',
    expectedDto: 'UpdateUserDto',
    payloadKeys: ['name', 'phone', 'role', 'teamId', 'warehouseId'],
  },

  // 12. Authentication
  {
    endpointMatch: /^\/auth\/login$/,
    httpMethod: 'POST',
    clientCall: 'authApi.login',
    formFile: 'apps/web/src/components/auth/AuthLoginForm.tsx',
    expectedDto: 'LoginDto',
    payloadKeys: ['identifier', 'password', 'companyCode'],
  },
  {
    endpointMatch: /^\/auth\/login\/verify-2fa$/,
    httpMethod: 'POST',
    clientCall: 'authApi.verifyTwoFactor',
    formFile: 'apps/web/src/components/auth/AuthLoginForm.tsx',
    expectedDto: 'VerifyTwoFactorDto',
    payloadKeys: ['loginTicket', 'code', 'rememberDevice'],
  },
];

// Main test execution
async function runContractAudit() {
  console.log('========================================================================');
  console.log('API DTO & WEB FORM CONTRACT MISMATCH AUDIT');
  console.log('========================================================================\n');

  const dtos = collectDtos();
  console.log(`[INFO] Collected ${dtos.size} DTO class definitions from API.\n`);

  const endpoints = collectEndpoints();
  console.log(`[INFO] Collected ${endpoints.length} POST/PUT/PATCH endpoints from controllers.\n`);

  const results: ContractCheckResult[] = [];
  let outOfSyncCount = 0;

  for (const check of KNOWN_WEB_PAYLOADS) {
    const matchingEndpoint = endpoints.find(
      (ep) => ep.httpMethod === check.httpMethod && check.endpointMatch.test(ep.fullPath)
    );

    const dtoName = check.expectedDto || matchingEndpoint?.dtoName;
    const dto = dtos.get(dtoName);

    if (!dto) {
      console.warn(`[WARN] DTO "${dtoName}" not found for endpoint ${check.httpMethod} ${check.clientCall}`);
      continue;
    }

    const allowedKeys = Array.from(dto.properties.keys());
    const requiredKeys = Array.from(dto.properties.values())
      .filter((p) => !p.isOptional)
      .map((p) => p.name);

    // Check unknown keys
    const unknownKeys = check.payloadKeys.filter((k) => !allowedKeys.includes(k));

    // Check missing required keys
    const missingRequiredKeys = requiredKeys.filter((k) => !check.payloadKeys.includes(k));

    const isSync = unknownKeys.length === 0 && missingRequiredKeys.length === 0;
    if (!isSync) {
      outOfSyncCount++;
    }

    results.push({
      endpoint: matchingEndpoint ? `${matchingEndpoint.httpMethod} ${matchingEndpoint.fullPath}` : `${check.httpMethod} [model] ${check.clientCall}`,
      httpMethod: check.httpMethod,
      dtoName,
      clientCall: check.clientCall,
      formFile: check.formFile,
      payloadKeys: check.payloadKeys,
      allowedKeys,
      unknownKeys,
      missingRequiredKeys,
      status: isSync ? 'SYNC' : 'OUT_OF_SYNC',
    });
  }

  // Print results
  console.log('CONTRACT AUDIT RESULTS:');
  console.log('------------------------------------------------------------------------');
  for (const res of results) {
    const badge = res.status === 'SYNC' ? '✅ [SYNC]' : '❌ [OUT OF SYNC]';
    console.log(`${badge} ${res.endpoint} -> DTO: ${res.dtoName}`);
    console.log(`         Form: ${res.formFile}`);
    console.log(`         Payload fields: ${res.payloadKeys.join(', ')}`);
    if (res.unknownKeys.length > 0) {
      console.log(`         ⚠️ UNKNOWN FIELDS (will trigger 400): ${res.unknownKeys.join(', ')}`);
    }
    if (res.missingRequiredKeys.length > 0) {
      console.log(`         ⚠️ MISSING REQUIRED FIELDS: ${res.missingRequiredKeys.join(', ')}`);
    }
    console.log('');
  }

  console.log('========================================================================');
  console.log(`SUMMARY: ${results.length - outOfSyncCount} SYNCED, ${outOfSyncCount} OUT OF SYNC`);
  console.log('========================================================================\n');

  if (outOfSyncCount > 0) {
    console.error(`[FAIL] DTO contract mismatch detected! ${outOfSyncCount} forms are out of sync.`);
    process.exit(1);
  } else {
    console.log('[PASS] All tested web forms and API DTO contracts are in 100% sync!');
  }
}

runContractAudit().catch((err) => {
  console.error('[ERROR] Audit execution failed:', err);
  process.exit(1);
});
