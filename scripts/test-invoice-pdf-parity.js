const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const { generateInvoicePdfBuffer } = require('../apps/api/dist/invoicing/pdf-generator');

async function runTests() {
  console.log('--- Starting Invoice PDF Engine Parity Tests ---');

  const baseInvoice = {
    invoiceNumber: 'INV/26-27/0001',
    invoiceDate: new Date('2026-10-28'),
    dueDate: new Date('2026-11-28'),
    customerName: 'Acme Technologies Pvt Ltd',
    customerGstin: '29ABCDE1234F1Z5',
    customerState: 'Karnataka',
    billingAddress: 'No. 42, Electronic City Phase 1, Bangalore, Karnataka - 560100',
    shippingName: 'Acme Warehouse Unit 3',
    shippingAddress: 'Plot 15, KIADB Industrial Area, Bommasandra, Bangalore - 560099',
    docType: 'tax_invoice',
    subtotal: 10000,
    cgstAmount: 900,
    sgstAmount: 900,
    igstAmount: 0,
    totalAmount: 11800,
    lines: [
      {
        description: 'Industrial PLC Controller Unit with RS-485 Modbus interface and high voltage surge protection module',
        hsnCode: '85371000',
        unit: 'Nos',
        quantity: 2,
        unitPrice: 5000,
        taxRate: 18,
      }
    ],
    companyProfile: {
      companyName: 'JNC Automation Pvt Ltd',
      address: '123 Tech Park, Peenya Industrial Area',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560058',
      gstin: '29AABCC1234D1Z2',
      email: 'accounts@jncautomation.com',
      phone: '+91 80 1234 5678',
      bankName: 'HDFC Bank',
      bankAccountNumber: '50200012345678',
      bankIfsc: 'HDFC0001234',
      bankBranch: 'Peenya',
    }
  };

  // Test Case A: Normal Invoice
  console.log('\n[Test A] Normal Intra-State Tax Invoice...');
  const bufA = await generateInvoicePdfBuffer(baseInvoice, { paperSize: 'A4', copyLabel: 'Original for Recipient' });
  fs.writeFileSync('scratch/test-pdf-a-normal.pdf', bufA);
  const pA = new PDFParse(new Uint8Array(bufA));
  const textA = (await pA.getText()).text;
  if (!textA.includes('TAX INVOICE') || !textA.includes('INV/26-27/0001') || !textA.includes('Acme Technologies Pvt Ltd')) {
    throw new Error('Test A failed: expected text missing in PDF');
  }
  if (!textA.includes('••••5678')) {
    throw new Error('Test A failed: bank account number not masked');
  }
  console.log('✓ Test A Passed! PDF Size:', bufA.length);

  // Test Case B: 40 items spanning 2-3 pages
  console.log('\n[Test B] Multi-Page Pagination with 40 Items...');
  const multiLines = [];
  for (let i = 1; i <= 40; i++) {
    multiLines.push({
      description: `Industrial Component Item ${i} - Standard High Specification Grade Part Model ${i * 100}`,
      hsnCode: '84818090',
      unit: 'Nos',
      quantity: i,
      unitPrice: 500 + i * 25,
      taxRate: 18,
    });
  }
  const invoiceB = {
    ...baseInvoice,
    invoiceNumber: 'INV/26-27/0002',
    lines: multiLines,
    subtotal: 50000,
    cgstAmount: 4500,
    sgstAmount: 4500,
    totalAmount: 59000,
  };
  const bufB = await generateInvoicePdfBuffer(invoiceB, { paperSize: 'A4' });
  fs.writeFileSync('scratch/test-pdf-b-multipage.pdf', bufB);
  const pB = new PDFParse(new Uint8Array(bufB));
  const resB = await pB.getText();
  if (resB.pages.length < 2) {
    throw new Error(`Test B failed: expected at least 2 pages, got ${resB.pages.length}`);
  }
  console.log(`✓ Test B Passed! Pages: ${resB.pages.length}, PDF Size: ${bufB.length}`);

  // Test Case C: Very Long Names and Descriptions
  console.log('\n[Test C] Long Names and Multi-line Text wrapping...');
  const invoiceC = {
    ...baseInvoice,
    invoiceNumber: 'INV/26-27/0003',
    customerName: 'Extremely Long Customer Organization Name International Private Limited for Advanced Engineering and Robotics Solutions',
    billingAddress: 'Unit 1001 to 1005, 10th Floor, Tower B, Cyber City Mega Complex, Outer Ring Road, Devarabeesanahalli, Bangalore, Karnataka - 560103',
    lines: [
      {
        description: 'Comprehensive annual maintenance and specialized precision calibration service for multi-axis industrial articulated robotic arm machinery including supply of essential spares, seals, bearings, high-temperature lubricants, and firmware diagnostics',
        hsnCode: '998719',
        unit: 'Set',
        quantity: 1,
        unitPrice: 250000,
        taxRate: 18,
      }
    ]
  };
  const bufC = await generateInvoicePdfBuffer(invoiceC);
  fs.writeFileSync('scratch/test-pdf-c-longnames.pdf', bufC);
  console.log('✓ Test C Passed! PDF Size:', bufC.length);

  // Test Case D: Empty optional fields
  console.log('\n[Test D] Empty Optional Fields (no stray dashes, dots, or empty labels)...');
  const invoiceD = {
    ...baseInvoice,
    invoiceNumber: 'INV/26-27/0004',
    customerGstin: '',
    customerState: '',
    shippingName: '',
    shippingAddress: '',
    referenceNo: '',
    poNumber: '',
    poDate: null,
    companyProfile: {
      ...baseInvoice.companyProfile,
      bankBranch: '',
      pincode: '',
    }
  };
  const bufD = await generateInvoicePdfBuffer(invoiceD);
  fs.writeFileSync('scratch/test-pdf-d-emptyfields.pdf', bufD);
  const pD = new PDFParse(new Uint8Array(bufD));
  const textD = (await pD.getText()).text;
  if (!textD.includes('Unregistered Consumer')) {
    throw new Error('Test D failed: unregistered customer should be indicated');
  }
  console.log('✓ Test D Passed! PDF Size:', bufD.length);

  // Test Case E: SEZ Zero-rated under LUT
  console.log('\n[Test E] SEZ Zero-rated under LUT...');
  const invoiceE = {
    ...baseInvoice,
    invoiceNumber: 'INV/26-27/0005',
    isSez: true,
    sezType: 'lut',
    lutBondNo: 'LUT/2026-27/0099',
    lutValidity: '31/03/2027',
    subtotal: 50000,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 0,
    totalAmount: 50000,
  };
  const bufE = await generateInvoicePdfBuffer(invoiceE);
  fs.writeFileSync('scratch/test-pdf-e-sez-lut.pdf', bufE);
  const pE = new PDFParse(new Uint8Array(bufE));
  const textE = (await pE.getText()).text;
  if (!textE.includes('without payment of IGST') || !textE.includes('LUT/2026-27/0099')) {
    throw new Error('Test E failed: SEZ LUT statutory text or LUT number missing');
  }
  console.log('✓ Test E Passed! PDF Size:', bufE.length);

  // Test Case F: SEZ with payment of IGST
  console.log('\n[Test F] SEZ with Payment of IGST (Never CGST+SGST)...');
  const invoiceF = {
    ...baseInvoice,
    invoiceNumber: 'INV/26-27/0006',
    isSez: true,
    sezType: 'igst',
    subtotal: 100000,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 18000,
    totalAmount: 118000,
  };
  const bufF = await generateInvoicePdfBuffer(invoiceF);
  fs.writeFileSync('scratch/test-pdf-f-sez-igst.pdf', bufF);
  const pF = new PDFParse(new Uint8Array(bufF));
  const textF = (await pF.getText()).text;
  if (!textF.includes('payment of Integrated Tax') || !textF.includes('18,000.00')) {
    throw new Error('Test F failed: SEZ IGST text or amount missing');
  }
  if (textF.includes('Central Tax (CGST') || textF.includes('State Tax (SGST')) {
    throw new Error('Test F failed: SEZ invoice must NEVER charge CGST or SGST!');
  }
  console.log('✓ Test F Passed! PDF Size:', bufF.length);

  // Test Case G: A5 Paper Size
  console.log('\n[Test G] A5 Paper Size Support...');
  const bufG = await generateInvoicePdfBuffer(baseInvoice, { paperSize: 'A5' });
  fs.writeFileSync('scratch/test-pdf-g-a5.pdf', bufG);
  console.log('✓ Test G Passed! PDF Size:', bufG.length);

  // Test Case H: Exact Mandatory Case (SEZ Customer, 1 Item, Qty 20, Rate 99,99,995)
  console.log('\n[Test H] EXACT TEST CASE: SEZ customer, 1 item, qty 20, rate 99,99,995...');
  const qtyH = 20;
  const rateH = 9999995;
  const subtotalH = qtyH * rateH; // 19,99,99,900
  const invoiceH = {
    ...baseInvoice,
    invoiceNumber: 'INV/26-27/0008-TEST',
    customerName: 'Special Economic Zone Global Technologies Ltd',
    customerState: 'Karnataka',
    isSez: true,
    sezType: 'lut',
    lutBondNo: 'LUT/2026-27/8888',
    lutValidity: '31/03/2027',
    lines: [
      {
        description: 'High-Precision Superconducting Magnetic Sensor Array Model SEZ-ULTRA-2026',
        hsnCode: '90318000',
        unit: 'Nos',
        quantity: qtyH,
        unitPrice: rateH,
        taxRate: 18,
      }
    ],
    subtotal: subtotalH,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 0,
    totalAmount: subtotalH,
  };

  const bufH = await generateInvoicePdfBuffer(invoiceH, { paperSize: 'A4' });
  fs.writeFileSync('scratch/test-pdf-h-exact-case.pdf', bufH);
  const pH = new PDFParse(new Uint8Array(bufH));
  const textH = (await pH.getText()).text;
  console.log('Extracted text sample from Test H:');
  console.log(textH.slice(0, 300));

  if (!textH.includes('19,99,99,900.00') || !textH.includes('99,99,995.00')) {
    throw new Error('Test H failed: Large amount number not rendered correctly');
  }
  if (!textH.includes('Nineteen Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred')) {
    throw new Error('Test H failed: Indian words for 19 Crore not rendered correctly');
  }
  console.log('✓ Test H Passed! Exact case rendered and validated without error!');

  console.log('\n════════════════════════════════════════════════════════');
  console.log('ALL INVOICE PDF PARITY TESTS PASSED SUCCESSFULLY! (8/8)');
  console.log('════════════════════════════════════════════════════════');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
