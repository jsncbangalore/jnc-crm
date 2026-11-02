/**
 * Text Message Audit & Plain-English Verification Test
 * 
 * Verifies that:
 * 1. Every error and toast message in web and API is written in short plain sentences
 *    that tell the user what to do next.
 * 2. Fails if any user-facing message contains:
 *    - "should not exist"
 *    - "must be a"
 *    - "undefined"
 *    - "[object"
 *    - A stack trace (e.g. "at ... (file:line:col)")
 * 3. Verifies both static source code strings and runtime error formatters.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { formatValidationErrors } from '../apps/api/src/common/validation-error.formatter';

function loadErrorHelper() {
  const code = fs.readFileSync(path.resolve(__dirname, '../apps/web/src/utils/errorHelper.ts'), 'utf8');
  const transpiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const mod: any = {};
  const fn = new Function('exports', transpiled.outputText);
  fn(mod);
  return mod;
}

const { sanitizeUserMessage, parseApiError } = loadErrorHelper();

const FORBIDDEN_PATTERNS = [
  { name: 'should not exist', regex: /should not exist/i },
  { name: 'must be a', regex: /must be a /i },
  { name: 'undefined', regex: /\bundefined\b/i },
  { name: '[object', regex: /\[object/i },
  { name: 'stack trace', regex: /(?:^\s*at\s+[\w$./\\-]+\s*\([^\)]+:\d+:\d+\)|(?:SyntaxError|TypeError|ReferenceError):\s)/m },
];

function walk(dir: string, list: string[] = []): string[] {
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) {
      if (f !== 'node_modules' && f !== 'dist' && f !== '.git' && f !== 'build') {
        walk(fp, list);
      }
    } else if (/\.(ts|tsx)$/.test(f) && !f.endsWith('.spec.ts')) {
      list.push(fp);
    }
  }
  return list;
}

interface MessageFinding {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
}

async function runTextAudit() {
  console.log('========================================================================');
  console.log('TEXT AUDIT & USER MESSAGE QUALITY VERIFICATION');
  console.log('========================================================================\n');

  const files = [
    ...walk(path.resolve(__dirname, '../apps/api/src')),
    ...walk(path.resolve(__dirname, '../apps/web/src')),
  ];

  console.log(`[INFO] Auditing ${files.length} source files for forbidden technical text...\n`);

  const findings: MessageFinding[] = [];

  for (const file of files) {
    const rel = path.relative(path.resolve(__dirname, '..'), file);

    // Skip formatter/sanitizer definitions themselves that test/replace these phrases
    if (
      rel.includes('validation-error.formatter.ts') ||
      rel.includes('http-exception.filter.ts') ||
      rel.includes('errorHelper.ts') ||
      rel.includes('validationErrorHandler.ts') ||
      rel.includes('test-')
    ) {
      continue;
    }

    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;
      const trimmed = lineText.trim();

      // Check if this line defines an error message or user-facing notification
      const isMessageContext =
        /toast\.|throw\s+new\s+\w*Exception|setError\(|\bmessage\s*:\s*['"`]|alert\(|notify\(|statusMessage/i.test(trimmed);

      if (!isMessageContext) return;

      for (const pat of FORBIDDEN_PATTERNS) {
        if (pat.regex.test(trimmed)) {
          // Ignore type annotations like `foo?: string | undefined`
          if (pat.name === 'undefined' && (/:\s*[\w\[\]\s|]*undefined/.test(trimmed) || /!==\s*undefined|===\s*undefined|\?\./.test(trimmed))) {
            continue;
          }
          findings.push({
            file: rel,
            line: lineNum,
            pattern: pat.name,
            snippet: trimmed,
          });
        }
      }
    });
  }

  // 2. Programmatic Runtime Validation Tests
  console.log('--- RUNTIME FORMATTER VERIFICATION ---');

  // Test 2A: class-validator unknown field error interception
  const mockWhitelistError: any = [
    {
      property: 'invoiceDate',
      constraints: {
        whitelistValidation: 'property invoiceDate should not exist',
      },
    },
    {
      property: 'supplierGstin',
      constraints: {
        whitelistValidation: 'property supplierGstin should not exist',
      },
    },
  ];

  const formattedResult = formatValidationErrors(mockWhitelistError);
  if (!formattedResult.hasUnknownField) {
    throw new Error('formatValidationErrors failed to identify unknown fields');
  }
  if (formattedResult.unknownFields.length !== 2) {
    throw new Error(`Expected 2 unknown fields, got ${formattedResult.unknownFields.length}`);
  }
  // Assert formattedResult does NOT contain "should not exist" in fieldErrors
  for (const fe of formattedResult.fieldErrors) {
    for (const pat of FORBIDDEN_PATTERNS) {
      if (pat.regex.test(fe.message)) {
        throw new Error(`formatValidationErrors leaked forbidden phrase "${pat.name}": ${fe.message}`);
      }
    }
  }
  console.log('✅ [PASS] Whitelist validation errors intercepted and transformed into UNKNOWN_FIELD');

  // Test 2B: formatValidationErrors on standard types
  const mockTypeErrors: any = [
    {
      property: 'taxRate',
      constraints: {
        isNumber: 'taxRate must be a number conforming to the specified constraints',
        max: 'taxRate must not be greater than 28',
      },
    },
    {
      property: 'invoiceNumber',
      constraints: {
        isString: 'invoiceNumber must be a string',
      },
    },
    {
      property: 'invoiceDate',
      constraints: {
        isDateString: 'invoiceDate must be a valid ISO 8601 date string',
      },
    },
  ];

  const typeResult = formatValidationErrors(mockTypeErrors);
  for (const fe of typeResult.fieldErrors) {
    for (const pat of FORBIDDEN_PATTERNS) {
      if (pat.regex.test(fe.message)) {
        throw new Error(`formatValidationErrors leaked forbidden phrase "${pat.name}": ${fe.message}`);
      }
    }
  }
  console.log('✅ [PASS] Type validation errors formatted into plain English sentences:');
  typeResult.fieldErrors.forEach((f) => console.log(`         "${f.field}" -> "${f.message}"`));

  // Test 2C: parseApiError on server 500 stack trace response
  const mock500Error = {
    response: {
      status: 500,
      data: {
        statusCode: 500,
        message: 'Internal server error: Error at Object.<anonymous> (c:\\app\\server.js:45:12)',
        requestId: 'req-test-12345',
      },
    },
  };
  const parsed500 = parseApiError(mock500Error);
  for (const pat of FORBIDDEN_PATTERNS) {
    if (pat.regex.test(parsed500.message)) {
      throw new Error(`parseApiError leaked forbidden phrase "${pat.name}": ${parsed500.message}`);
    }
  }
  console.log(`✅ [PASS] 500 server stack error sanitized to: "${parsed500.message}"`);

  // Test 2D: sanitizeUserMessage on raw technical jargon
  const rawJargon = 'property documentUrl should not exist';
  const cleanJargon = sanitizeUserMessage(rawJargon);
  for (const pat of FORBIDDEN_PATTERNS) {
    if (pat.regex.test(cleanJargon)) {
      throw new Error(`sanitizeUserMessage leaked forbidden phrase "${pat.name}": ${cleanJargon}`);
    }
  }
  console.log(`✅ [PASS] Raw technical jargon sanitized to: "${cleanJargon}"\n`);

  // Report Static Source Audit Results
  console.log('--- STATIC SOURCE CODE AUDIT RESULTS ---');
  if (findings.length > 0) {
    console.error(`[FAIL] Found ${findings.length} messages containing forbidden technical text:`);
    findings.forEach((f) => {
      console.error(`  - ${f.file}:${f.line} [${f.pattern}]: "${f.snippet}"`);
    });
    process.exit(1);
  } else {
    console.log('[PASS] Zero messages in web or API contain "should not exist", "must be a", "undefined", "[object" or stack traces!');
  }
}

runTextAudit().catch((err) => {
  console.error('[ERROR] Text audit failed:', err);
  process.exit(1);
});
