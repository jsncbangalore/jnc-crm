const fs = require('fs');
let s = fs.readFileSync('apps/web/src/components/common/UnifiedRecordPaymentModal.tsx', 'utf8');
s = s.replace(/autoFocus\s+placeholder=["']0\.00["']/, 'data-testid="unified-payment-amount-input" autoFocus placeholder="0.00"');
fs.writeFileSync('apps/web/src/components/common/UnifiedRecordPaymentModal.tsx', s, 'utf8');
console.log('Included testid:', s.includes('unified-payment-amount-input'));
