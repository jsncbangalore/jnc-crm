/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';
import { deriveAesKey, encryptAtRest, decryptAtRest } from '../../apps/api/src/common/encryption.util';

describe('Encryption Key Derivation & AES-256-GCM Round-Trip Suite', () => {
  it('1. 32-character UTF-8 key derives exactly 32 bytes and round-trips encrypt/decrypt', () => {
    const rawKey32Char = '12345678901234567890123456789012'; // 32 ASCII chars = 32 bytes
    const derived = deriveAesKey(rawKey32Char);

    expect(derived).toBeInstanceOf(Buffer);
    expect(derived.length).toBe(32);

    const testSecret = 'SensitiveCustomerPAN12345';
    const encrypted = encryptAtRest(testSecret, rawKey32Char);
    expect(encrypted).not.toBeNull();
    expect(encrypted).toContain(':');

    const decrypted = decryptAtRest(encrypted, rawKey32Char);
    expect(decrypted).toBe(testSecret);
  });

  it('2. 64-character Hexadecimal key derives exactly 32 bytes and round-trips encrypt/decrypt', () => {
    const rawKey64Hex = crypto.randomBytes(32).toString('hex'); // 64 hex characters
    expect(rawKey64Hex.length).toBe(64);

    const derived = deriveAesKey(rawKey64Hex);
    expect(derived).toBeInstanceOf(Buffer);
    expect(derived.length).toBe(32);
    expect(derived.equals(Buffer.from(rawKey64Hex, 'hex'))).toBe(true);

    const testSecret = 'SensitiveBankIFSCAndAccount9999';
    const encrypted = encryptAtRest(testSecret, rawKey64Hex);
    expect(encrypted).not.toBeNull();

    const decrypted = decryptAtRest(encrypted, rawKey64Hex);
    expect(decrypted).toBe(testSecret);
  });

  it('3. 32-byte Base64 key derives exactly 32 bytes and round-trips encrypt/decrypt', () => {
    const rawKey32ByteBase64 = crypto.randomBytes(32).toString('base64'); // 44 chars base64
    const derived = deriveAesKey(rawKey32ByteBase64);

    expect(derived).toBeInstanceOf(Buffer);
    expect(derived.length).toBe(32);
    expect(derived.equals(Buffer.from(rawKey32ByteBase64, 'base64'))).toBe(true);

    const testSecret = 'SensitiveEncryptionPayload_GSTIN_29AABCU9603R1ZM';
    const encrypted = encryptAtRest(testSecret, rawKey32ByteBase64);
    expect(encrypted).not.toBeNull();

    const decrypted = decryptAtRest(encrypted, rawKey32ByteBase64);
    expect(decrypted).toBe(testSecret);
  });

  it('4. Arbitrary passphrase string hashes to exactly 32-byte SHA-256 digest', () => {
    const rawPassphrase = 'MyUltraSecurePassphraseForCustomTenantStorage12345!';
    const derived = deriveAesKey(rawPassphrase);

    expect(derived).toBeInstanceOf(Buffer);
    expect(derived.length).toBe(32);

    const testSecret = 'ArbitraryPassphrasePayload';
    const encrypted = encryptAtRest(testSecret, rawPassphrase);
    const decrypted = decryptAtRest(encrypted, rawPassphrase);
    expect(decrypted).toBe(testSecret);
  });

  it('5. Decryption with a wrong key fails safely and returns null without crashing', () => {
    const keyA = crypto.randomBytes(32).toString('hex');
    const keyB = crypto.randomBytes(32).toString('hex');

    const encrypted = encryptAtRest('SecretDataForUser42', keyA);
    const decryptedWithWrongKey = decryptAtRest(encrypted, keyB);

    expect(decryptedWithWrongKey).toBeNull();
  });

  it('6. Key Compatibility: decrypts fixture encrypted by OLD key handling (base64 32-byte path)', () => {
    // Fixture generated with the old implementation:
    // oldKey = Buffer.from('ASNFZ4mrze8BI0VniavN7wEjRWeJq83vASNFZ4mrze8=', 'base64')
    // plaintext = 'production_legacy_secret_value_12345'
    const liveBase64Key = 'ASNFZ4mrze8BI0VniavN7wEjRWeJq83vASNFZ4mrze8='; // 44 characters
    const legacyFixture = '00112233445566778899aabb:2a18def4c34639f69ce461f65aae4700:cd3443f57d82cb26f49dff7f65c4513c9e0e51f633f4c3424e8fe0d2cba9b2a5c8275f49';

    // Verify new deriveAesKey produces identical 32-byte key buffer as the legacy Buffer.from(key, 'base64')
    const oldBuffer = Buffer.from(liveBase64Key, 'base64');
    const newDerivedBuffer = deriveAesKey(liveBase64Key);
    expect(newDerivedBuffer.equals(oldBuffer)).toBe(true);

    // Verify decryptAtRest successfully decrypts the legacy fixture to original plaintext
    const decrypted = decryptAtRest(legacyFixture, liveBase64Key);
    expect(decrypted).toBe('production_legacy_secret_value_12345');
  });

  it('7. Format Differentiation: 44-char base64, 64-char hex, and 32-char text keys are never confused', () => {
    const base64Key44 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='; // 44 chars
    const hexKey64 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 64 chars
    const textKey32 = 'my_super_secure_exact_32_bytes!!'; // 32 chars

    expect(base64Key44.length).toBe(44);
    expect(hexKey64.length).toBe(64);
    expect(textKey32.length).toBe(32);

    // 1. 44-char base64 cannot match 64-hex or 32-text
    expect(/^[0-9a-fA-F]{64}$/.test(base64Key44)).toBe(false);
    expect(base64Key44.length === 32).toBe(false);
    expect(/^[A-Za-z0-9+/=]{43,44}$/.test(base64Key44)).toBe(true);

    // 2. 64-char hex cannot match 43/44 base64 or 32-text
    expect(/^[0-9a-fA-F]{64}$/.test(hexKey64)).toBe(true);
    expect(/^[A-Za-z0-9+/=]{43,44}$/.test(hexKey64)).toBe(false);
    expect(hexKey64.length === 32).toBe(false);

    // 3. 32-char text cannot match 64-hex or 43/44 base64
    expect(/^[0-9a-fA-F]{64}$/.test(textKey32)).toBe(false);
    expect(/^[A-Za-z0-9+/=]{43,44}$/.test(textKey32)).toBe(false);
    expect(Buffer.from(textKey32, 'utf8').length).toBe(32);

    // Verify deriveAesKey derives valid distinct 32-byte keys for each without confusion
    const b64Derived = deriveAesKey(base64Key44);
    const hexDerived = deriveAesKey(hexKey64);
    const textDerived = deriveAesKey(textKey32);

    expect(b64Derived.length).toBe(32);
    expect(hexDerived.length).toBe(32);
    expect(textDerived.length).toBe(32);

    expect(b64Derived.equals(hexDerived)).toBe(false);
    expect(b64Derived.equals(textDerived)).toBe(false);
    expect(hexDerived.equals(textDerived)).toBe(false);
  });
});
