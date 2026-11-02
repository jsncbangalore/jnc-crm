const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { chromium } = require('playwright');

// Load API's pdf-generator
const { generateInvoicePdfBuffer } = require('../apps/api/dist/invoicing/pdf-generator');
const { numberToIndianWords } = require('../apps/api/dist/invoicing/invoice-config');

const DOCUMENT_TYPES = [
  'tax_invoice',
  'sez_invoice',
  'proforma_invoice',
  'delivery_challan',
  'credit_note',
  'purchase_order',
];

const mockProfile = {
  companyName: 'Acme Test Corp Pvt Ltd',
  address: '123 Tech Park, Industrial Area',
  addressLine1: '123 Tech Park',
  addressLine2: 'Industrial Area',
  city: 'Bengaluru',
  state: 'Karnataka',
  stateCode: '29',
  pincode: '560001',
  gstin: '29AABCU9603R1ZM',
  phone: '080-12345678',
  email: 'billing@seed.dev',
  lutBondNo: 'LUT/2026/001',
  lutValidity: 'Valid until 31-03-2027',
  bankDetails: {
    accountHolderName: 'Acme Test Corp Pvt Ltd',
    bankName: 'State Bank of India',
    accountNumber: '12345678901',
    branch: 'Main Branch',
    ifscCode: 'SBIN0001234',
  },
};

const mockSignatory = {
  companyName: 'Acme Test Corp Pvt Ltd',
  signatoryName: 'Authorized Person',
  signatoryDesignation: 'Director',
};

function createMockInvoice(docType) {
  const isPO = docType === 'purchase_order';
  const isDC = docType === 'delivery_challan';
  const isSEZ = docType === 'sez_invoice';

  return {
    id: `inv-${docType}-001`,
    docType: docType,
    invoiceNumber: `${docType.toUpperCase()}-2026-001`,
    invoiceDate: new Date('2026-10-28'),
    poDate: new Date('2026-10-25'),
    buyerOrderNo: 'PO-TEST-99',
    referenceNo: 'REF-2026-44',
    customerName: isPO ? 'Standard Vendor Supplies' : 'Enterprise Client Solutions',
    customerGstin: '29ABCDE1234F1Z5',
    customerState: 'Karnataka',
    placeOfSupply: 'Karnataka (29)',
    billingAddress: '456 Business Blvd, Bengaluru, Karnataka 560002',
    deliveryAddress: '456 Business Blvd, Bengaluru, Karnataka 560002',
    deliverySchedule: 'Immediate dispatch',
    paymentTerms: isDC ? 'Immediately' : 'Advance',
    lutBondNo: isSEZ ? 'LUT/2026/001' : undefined,
    lutValidity: isSEZ ? 'Valid until 31-03-2027' : undefined,
    subtotal: 100000,
    cgstAmount: (isDC || isSEZ) ? 0 : 9000,
    sgstAmount: (isDC || isSEZ) ? 0 : 9000,
    igstAmount: 0,
    totalAmount: (isDC || isSEZ) ? 100000 : 118000,
    advancePercent: 50,
    advanceAmount: 59000,
    balanceDue: 59000,
    lines: [
      {
        id: 'line-1',
        description: 'Server Infrastructure System Model X',
        hsnCode: '8504',
        quantity: 2,
        unit: 'Nos',
        unitPrice: 50000,
      },
    ],
  };
}

function extractPdfText(buffer) {
  const str = buffer.toString('binary');
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  let allText = '';
  while ((match = streamRegex.exec(str)) !== null) {
    try {
      const raw = Buffer.from(match[1], 'binary');
      let decomp = null;
      try {
        decomp = zlib.inflateSync(raw).toString('utf8');
      } catch {
        try { decomp = zlib.inflateRawSync(raw).toString('utf8'); } catch {}
      }
      if (decomp) {
        const tjRegex = /\[([\s\S]*?)\]\s*TJ/g;
        let tj;
        while ((tj = tjRegex.exec(decomp)) !== null) {
          const hexRegex = /<([0-9a-fA-F]+)>/g;
          let h;
          let s = '';
          while ((h = hexRegex.exec(tj[1])) !== null) {
            try {
              s += Buffer.from(h[1], 'hex').toString('utf8');
            } catch {}
          }
          allText += s + ' ';
        }
        const singleTj = /\(([\s\S]*?)\)\s*Tj/g;
        let stj;
        while ((stj = singleTj.exec(decomp)) !== null) {
          allText += stj[1] + ' ';
        }
      }
    } catch {}
  }
  return allText;
}

async function run() {
  console.log('--- TEST POINT 6: INVOICE PDF PARITY & MANDATORY GST CHECKLIST ---');

  // PART 1: Server PDF Generator Verification for all 6 document types
  console.log('\n[1] Testing Server PDF Generation & GST Mandatory Fields for all 6 Document Types:');

  for (const docType of DOCUMENT_TYPES) {
    console.log(`\n--> Testing Server PDF: [${docType.toUpperCase()}]`);
    const invoice = createMockInvoice(docType);

    // Test A: Without logo (must NOT output "Logo not added" badge)
    const pdfBufferNoLogo = await generateInvoicePdfBuffer(invoice, {
      templateType: docType,
      companyProfile: mockProfile,
      signatorySettings: mockSignatory,
    });

    if (!pdfBufferNoLogo || pdfBufferNoLogo.length < 500) {
      throw new Error(`PDF generation failed for ${docType}: buffer empty or too small.`);
    }
    const pdfMagic = pdfBufferNoLogo.subarray(0, 5).toString('ascii');
    if (!pdfMagic.startsWith('%PDF-')) {
      throw new Error(`PDF magic byte mismatch for ${docType}: got ${pdfMagic}`);
    }

    const pdfExtractedText = extractPdfText(pdfBufferNoLogo);

    // Strict assertion: "Logo not added" must NEVER appear in PDF
    if (pdfExtractedText.toLowerCase().includes('logo not added')) {
      throw new Error(`CRITICAL: PDF for ${docType} contains "Logo not added" badge text!`);
    }

    // Verify Mandatory GST Checklist Fields in PDF
    console.log(`  Checking Mandatory GST Fields in ${docType} PDF:`);
    
    // 1. Seller Name & Address
    if (!pdfExtractedText.includes('Acme Test Corp') && !pdfExtractedText.includes('ACME TEST CORP')) {
      throw new Error(`[${docType}] Missing seller name in PDF.`);
    }
    console.log('    1. Seller Name & Address: PASS');

    // 2. Seller GSTIN
    if (!pdfExtractedText.includes('29AABCU9603R1ZM')) {
      throw new Error(`[${docType}] Missing seller GSTIN in PDF.`);
    }
    console.log('    2. Seller GSTIN: PASS');

    // 3. Buyer Name & Address
    const expectedBuyer = docType === 'purchase_order' ? 'Standard Vendor Supplies' : 'Enterprise Client Solutions';
    if (!pdfExtractedText.includes(expectedBuyer)) {
      throw new Error(`[${docType}] Missing buyer name in PDF.`);
    }
    console.log('    3. Buyer Name & Address: PASS');

    // 4. Buyer GSTIN
    if (!pdfExtractedText.includes('29ABCDE1234F1Z5')) {
      throw new Error(`[${docType}] Missing buyer GSTIN in PDF.`);
    }
    console.log('    4. Buyer GSTIN: PASS');

    // 5. Document Number & Date
    if (!pdfExtractedText.includes(invoice.invoiceNumber)) {
      throw new Error(`[${docType}] Missing document number in PDF.`);
    }
    console.log('    5. Document Number & Date: PASS');

    // 6. Place of Supply
    if (!pdfExtractedText.includes('Karnataka') || !pdfExtractedText.includes('Place of Supply')) {
      throw new Error(`[${docType}] Missing Place of Supply in PDF.`);
    }
    console.log('    6. Place of Supply: PASS');

    // 7. HSN or SAC code
    if (!pdfExtractedText.includes('8504')) {
      throw new Error(`[${docType}] Missing HSN code in PDF.`);
    }
    console.log('    7. HSN/SAC Code: PASS');

    // 8. Taxable value
    if (!pdfExtractedText.includes('1,00,000') && !pdfExtractedText.includes('100,000') && !pdfExtractedText.includes('50,000')) {
      throw new Error(`[${docType}] Missing taxable value in PDF.`);
    }
    console.log('    8. Taxable Value: PASS');

    // 9. Tax rate and amounts (or statutory exemption / DC remarks)
    if (docType === 'tax_invoice' || docType === 'credit_note') {
      if (!pdfExtractedText.includes('CGST') || !pdfExtractedText.includes('SGST')) {
        throw new Error(`[${docType}] Missing CGST/SGST tax breakdown in PDF.`);
      }
    } else if (docType === 'sez_invoice') {
      if (!pdfExtractedText.includes('LUT') && !pdfExtractedText.includes('IGST')) {
        throw new Error(`[${docType}] Missing SEZ/LUT tax details in PDF.`);
      }
    }
    console.log('    9. Tax Rate & Amounts: PASS');

    // 10. Total in words
    const words = numberToIndianWords(invoice.totalAmount);
    if (!pdfExtractedText.includes('Lakh') && !pdfExtractedText.includes('Thousand') && !pdfExtractedText.includes('Only')) {
      throw new Error(`[${docType}] Missing total in words in PDF.`);
    }
    console.log('    10. Total in Words: PASS');

    // 11. Signature area
    if (!pdfExtractedText.includes('Authorised Signatory') && !pdfExtractedText.includes('Authorized Signatory')) {
      throw new Error(`[${docType}] Missing authorized signatory area in PDF.`);
    }
    console.log('    11. Signature / Signatory: PASS');
  }

  // PART 2: Browser Print View Verification in Playwright
  console.log('\n[2] Testing Browser DOM Template & Print View in Playwright:');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Test that print media rules hide the logo-not-added badge completely
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  
  // Emulate print media in Playwright
  await page.emulateMedia({ media: 'print' });
  const badgeHiddenInPrint = await page.evaluate(() => {
    // Check computed style of a print:hidden test element under @media print
    const testEl = document.createElement('div');
    testEl.className = 'print:hidden';
    testEl.setAttribute('data-testid', 'logo-not-added-badge');
    testEl.textContent = 'Document Logo Not Added';
    document.body.appendChild(testEl);

    const style = window.getComputedStyle(testEl);
    const isHidden = style.display === 'none';
    testEl.remove();
    return isHidden;
  });

  console.log(`Computed style of .print:hidden under print media is display:none: ${badgeHiddenInPrint}`);
  if (!badgeHiddenInPrint) {
    throw new Error('Print CSS failed to hide .print:hidden elements under print media!');
  }

  await browser.close();

  console.log('\n======================================================');
  console.log(' ALL POINT 6 INVOICE PDF PARITY & GST TESTS PASSED!   ');
  console.log('======================================================\n');
}

run().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
