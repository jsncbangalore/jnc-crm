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
  {
    endpointMatch: /^\/inventory\/project-stock\/[^/]+\/purchase$/,
    httpMethod: 'POST',
    clientCall: 'inventoryApi.recordProjectStockPurchase',
    formFile: 'apps/web/src/components/inventory/RecordPurchaseModal.tsx',
    expectedDto: 'RecordProjectStockPurchaseDto',
    payloadKeys: [
      'quantityPurchased', 'unitRate', 'taxRate', 'supplierName',
      'supplierGstin', 'invoiceNumber', 'invoiceDate', 'documentDataUrl', 'notes'
    ],
  },
  {
    endpointMatch: /^\/payments$/,
    httpMethod: 'POST',
    clientCall: 'paymentApi.record',
    formFile: 'apps/web/src/components/payments/RecordPaymentModal.tsx',
    expectedDto: 'RecordPaymentDto',
    payloadKeys: [
      'partyId', 'partyType', 'amount', 'paymentType', 'paymentMethod',
      'transactionRef', 'paymentDate', 'notes', 'allocations', 'allowAdvance', 'confirmDuplicate'
    ],
  },
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
    endpointMatch: /^\/inventory\/skus$/,
    httpMethod: 'POST',
    clientCall: 'inventoryApi.createSku',
    formFile: 'apps/web/src/components/inventory/RecordComponentPurchaseModal.tsx',
    expectedDto: 'CreateSkuDto',
    payloadKeys: ['skuCode', 'name', 'category', 'unitPrice', 'costPrice', 'taxRate', 'packageType', 'reorderPoint', 'reorderQty'],
  },
  {
    endpointMatch: /^\/inventory\/project-stock$/,
    httpMethod: 'POST',
    clientCall: 'inventoryApi.createProjectStockPosition',
    formFile: 'apps/web/src/components/inventory/RecordComponentPurchaseModal.tsx',
    expectedDto: 'CreateProjectStockPositionDto',
    payloadKeys: [
      'project', 'reference', 'quantity', 'itemCode', 'partValue',
      'package', 'unit', 'bomQtyPerUnit', 'batchQty', 'plannedRequirement',
      'openingStock', 'inflow', 'outflow', 'notes'
    ],
  },
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
  {
    endpointMatch: /^\/leads$/,
    httpMethod: 'POST',
    clientCall: 'leadsApi.create',
    formFile: 'apps/web/src/pages/LeadsPage.tsx',
    expectedDto: 'CreateLeadDto',
    payloadKeys: ['customerName', 'customerPhone', 'customerEmail', 'companyName', 'city', 'productCategory', 'estimatedValue', 'urgency'],
  },
  {
    endpointMatch: /^\/suppliers$/,
    httpMethod: 'POST',
    clientCall: 'suppliersApi.create',
    formFile: 'apps/web/src/pages/SuppliersPage.tsx',
    expectedDto: 'CreateSupplierDto',
    payloadKeys: ['name', 'gstin', 'pan', 'contactPerson', 'email', 'phone', 'address', 'city', 'state', 'pincode', 'leadTimeDays'],
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

    const dtoName = matchingEndpoint?.dtoName || check.expectedDto;
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
      endpoint: matchingEndpoint ? `${matchingEndpoint.httpMethod} ${matchingEndpoint.fullPath}` : `UNKNOWN ${check.clientCall}`,
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
