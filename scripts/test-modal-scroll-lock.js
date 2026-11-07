// Unit test for modal scroll lock with counter and padding-right compensation
const assert = require('assert');

// Simulate DOM environment
const style = {
  overflow: '',
  paddingRight: '',
};

global.window = {
  innerWidth: 1920,
  getComputedStyle: () => ({ paddingRight: '0px' }),
};

global.document = {
  body: { style },
  documentElement: {
    clientWidth: 1905, // 15px scrollbar width
    style: { overflow: '' },
  },
};

// Replicate the exact logic from AccessibleModal.tsx
let modalScrollLockCount = 0;
let previousBodyOverflow = '';
let previousHtmlOverflow = '';
let previousBodyPaddingRight = '';

function lockModalScroll() {
  if (typeof document === 'undefined') return;
  if (modalScrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousHtmlOverflow = document.documentElement.style.overflow;
    previousBodyPaddingRight = document.body.style.paddingRight;

    // Compensate for scrollbar width so background page does not jump
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      const currentPadding = parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }
  modalScrollLockCount++;
}

function unlockModalScroll() {
  if (typeof document === 'undefined') return;
  if (modalScrollLockCount > 0) {
    modalScrollLockCount--;
  }
  if (modalScrollLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
    document.documentElement.style.overflow = previousHtmlOverflow;
    document.body.style.paddingRight = previousBodyPaddingRight;
  }
}

function getModalScrollLockCount() {
  return modalScrollLockCount;
}

console.log('=== TEST 1: Open Modal 1 -> Open Modal 2 -> Close Modal 1 -> Close Modal 2 ===');
assert.strictEqual(style.overflow, '');
assert.strictEqual(style.paddingRight, '');

lockModalScroll(); // Modal 1 opens
assert.strictEqual(getModalScrollLockCount(), 1);
assert.strictEqual(style.overflow, 'hidden');
assert.strictEqual(style.paddingRight, '15px');
console.log('✓ Modal 1 locked: overflow="hidden", paddingRight="15px"');

lockModalScroll(); // Modal 2 opens
assert.strictEqual(getModalScrollLockCount(), 2);
assert.strictEqual(style.overflow, 'hidden');
assert.strictEqual(style.paddingRight, '15px');
console.log('✓ Modal 2 stacked: count=2, overflow stays "hidden"');

unlockModalScroll(); // Modal 1 closes first
assert.strictEqual(getModalScrollLockCount(), 1);
assert.strictEqual(style.overflow, 'hidden', 'Overflow must remain locked when 1 modal is still open');
assert.strictEqual(style.paddingRight, '15px');
console.log('✓ Modal 1 closed first: count=1, background is STILL locked (no early unlock)');

unlockModalScroll(); // Modal 2 closes
assert.strictEqual(getModalScrollLockCount(), 0);
assert.strictEqual(style.overflow, '');
assert.strictEqual(style.paddingRight, '');
console.log('✓ Modal 2 closed: count=0, overflow and paddingRight completely restored');

console.log('\n=== TEST 2: Open Modal 1 -> Open Modal 2 -> Close Modal 2 -> Close Modal 1 ===');
lockModalScroll(); // Modal 1 opens
assert.strictEqual(getModalScrollLockCount(), 1);
assert.strictEqual(style.overflow, 'hidden');
assert.strictEqual(style.paddingRight, '15px');

lockModalScroll(); // Modal 2 opens
assert.strictEqual(getModalScrollLockCount(), 2);
assert.strictEqual(style.overflow, 'hidden');

unlockModalScroll(); // Modal 2 closes first
assert.strictEqual(getModalScrollLockCount(), 1);
assert.strictEqual(style.overflow, 'hidden', 'Overflow must remain locked');
assert.strictEqual(style.paddingRight, '15px');
console.log('✓ Modal 2 closed first: count=1, background remains locked');

unlockModalScroll(); // Modal 1 closes
assert.strictEqual(getModalScrollLockCount(), 0);
assert.strictEqual(style.overflow, '');
assert.strictEqual(style.paddingRight, '');
console.log('✓ Modal 1 closed: count=0, overflow and paddingRight completely restored');

console.log('\n>>> ALL MODAL SCROLL LOCK UNIT TESTS PASSED 100%! <<<\n');
