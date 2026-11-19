/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const fs = require('fs');

let c = fs.readFileSync('apps/api/src/inventory/inventory.service.ts', 'utf8');

c = c.replace(
  "const cleanKey = key.replace(/^\\uFEFF/, '').trim();",
  "const cleanKey = key.replace(/^\\uFEFF/, '').trim().toLowerCase().replace(/[\\s_\\-\\/]+/g, '');"
);

c = c.replace(
  /const skuCode = \([^)]+\)\.toString\(\)\.trim\(\);\s*const name = \([^)]+\)\.toString\(\)\.trim\(\);/,
  `const skuCode = (row.skucode || row.sku || row.itemcode || row.componentitemcodesku || row.partnumber || row['SKU Code'] || row['skuCode'] || '').toString().trim();
          const name = (row.name || row.productname || row.description || row.itemname || row.partvalue || row.equipmentname || row.specs || row.partspecs || row.partname || '').toString().trim();`
);

c = c.replace("const category = (row.category || row['Category'] || 'PA System').toString().trim();", "const category = (row.category || row.type || 'PA System').toString().trim();");
c = c.replace("const hsnCode = (row.hsnCode || row['hsn_code'] || row['HSN'] || row['HSN Code'] || '').toString().trim() || undefined;", "const hsnCode = (row.hsncode || row.hsn || '').toString().trim() || undefined;");
c = c.replace("const packageType = (row.packageType || row['Package'] || row['Package Type'] || 'Unit').toString().trim();", "const packageType = (row.packagetype || row.package || row.unit || 'Unit').toString().trim();");
c = c.replace("const unitPrice = parseFloat(row.unitPrice || row['Unit Price'] || row['Price'] || row['Selling Price'] || 0) || 0;", "const unitPrice = parseFloat(row.unitprice || row.price || row.sellingprice || 0) || 0;");
c = c.replace("const costPrice = parseFloat(row.costPrice || row['Cost Price'] || row['Cost'] || 0) || (unitPrice * 0.75);", "const costPrice = parseFloat(row.costprice || row.cost || 0) || (unitPrice * 0.75);");
c = c.replace("const taxRate = parseFloat(row.taxRate || row['tax_rate'] || row['Tax Rate'] || row['GST'] || row['GST Rate'] || 18) || 18.0;", "const taxRate = parseFloat(row.taxrate || row.gst || row.gstrate || 18) || 18.0;");
c = c.replace("const reorderPoint = parseInt(row.reorderPoint || row['Reorder Point'] || row['Min Stock'] || 10, 10) || 10;", "const reorderPoint = parseInt(row.reorderpoint || row.minstock || 10, 10) || 10;");
c = c.replace("const reorderQty = parseInt(row.reorderQty || row['Reorder Qty'] || row['Reorder Quantity'] || 50, 10) || 50;", "const reorderQty = parseInt(row.reorderqty || row.reorderquantity || 50, 10) || 50;");
c = c.replace("const quantityOnHand = parseInt(row.quantityOnHand || row['Quantity'] || row['Qty'] || row['Stock'] || row['On Hand'] || 0, 10) || 0;", "const quantityOnHand = parseInt(row.quantityonhand || row.quantity || row.qty || row.stock || row.onhand || 0, 10) || 0;");
c = c.replace("const supplierName = (row.supplierName || row['Supplier'] || row['Supplier Name'] || '').toString().trim();", "const supplierName = (row.suppliername || row.supplier || '').toString().trim();");
c = c.replace("const binCode = (row.binCode || row['Bin'] || row['Location'] || '').toString().trim();", "const binCode = (row.bincode || row.bin || row.location || '').toString().trim();");
c = c.replace(/const batchNo = \(row\.batchNo \|\| row\['Batch'\] \|\| row\['Lot'\] \|\| `BATCH-\$\{new Date\(\)\.getFullYear\(\)\}-IMP`\)\.toString\(\)\.trim\(\);/, "const batchNo = (row.batchno || row.batch || row.lot || `BATCH-${new Date().getFullYear()}-IMP`).toString().trim();");

fs.writeFileSync('apps/api/src/inventory/inventory.service.ts', c);
