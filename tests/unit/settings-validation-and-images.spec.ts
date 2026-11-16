import { describe, it, expect } from 'vitest';
import {
  VALID_GST_STATE_CODES,
  verifyGstinChecksum,
  validatePan,
  validateGstin,
  validateIfsc,
  cleanPan,
  cleanGstin,
  cleanIfsc,
} from '../../apps/web/src/utils/taxValidation';
import {
  validateImageFile,
} from '../../apps/web/src/utils/imageCompression';
import { GlobalHttpExceptionFilter } from '../../apps/api/src/common/http-exception.filter';
import { HttpStatus } from '@nestjs/common';

describe('Settings Validation & Image Rules', () => {
  describe('PAN Validation', () => {
    it('accepts valid 10-char PAN', () => {
      const res = validatePan('ABCDE1234F');
      expect(res.valid).toBe(true);
      expect(res.value).toBe('ABCDE1234F');
    });

    it('cleans lowercase and spaces on PAN', () => {
      const cleaned = cleanPan('  abcde 1234 f  ');
      expect(cleaned).toBe('ABCDE1234F');
      const res = validatePan(cleaned);
      expect(res.valid).toBe(true);
      expect(res.value).toBe('ABCDE1234F');
    });

    it('rejects invalid PAN formats', () => {
      // 9 chars
      expect(validatePan('ABCDE1234').valid).toBe(false);
      // Digit in first 5
      expect(validatePan('P0GPW1874N').valid).toBe(false);
      // Letter in 4 digits
      expect(validatePan('ABCDEA234F').valid).toBe(false);
      // Digit in last char
      expect(validatePan('ABCDE12345').valid).toBe(false);
    });

    it('handles optional vs required PAN', () => {
      expect(validatePan('', false).valid).toBe(true);
      expect(validatePan('', true).valid).toBe(false);
      expect(validatePan('', true).error).toBe('PAN is required.');
    });
  });

  describe('GSTIN Validation with State Code, Embedded PAN & Mod-36 Checksum', () => {
    // 29ABCDE1234F1ZW is valid Karnataka GSTIN
    const validGstin = '29ABCDE1234F1ZW';

    it('validates correct GSTIN format, valid state code, embedded PAN and checksum', () => {
      const res = validateGstin(validGstin, false, 'ABCDE1234F');
      expect(res.valid).toBe(true);
      expect(res.value).toBe(validGstin);
    });

    it('rejects invalid state code', () => {
      // 00 is not a valid state code
      const invalidState = '00ABCDE1234F1ZW';
      const res = validateGstin(invalidState);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('state code');
    });

    it('validates state codes 01-38, 97, 99 are all present in VALID_GST_STATE_CODES', () => {
      for (let i = 1; i <= 38; i++) {
        const code = String(i).padStart(2, '0');
        expect(VALID_GST_STATE_CODES.has(code)).toBe(true);
      }
      expect(VALID_GST_STATE_CODES.has('97')).toBe(true);
      expect(VALID_GST_STATE_CODES.has('99')).toBe(true);
      expect(VALID_GST_STATE_CODES.has('00')).toBe(false);
      expect(VALID_GST_STATE_CODES.has('39')).toBe(false);
    });

    it('rejects GSTIN when embedded PAN does not match provided PAN', () => {
      const res = validateGstin(validGstin, false, 'XYZAB9999C');
      expect(res.valid).toBe(false);
      expect(res.error).toBe('GSTIN does not match the provided PAN number.');
    });

    it('rejects invalid checksum digit', () => {
      // Alter last char from W to 5
      const badChecksum = '29ABCDE1234F1Z5';
      const res = validateGstin(badChecksum);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Invalid GSTIN checksum digit.');
    });

    it('verifies mod-36 checksum calculation', () => {
      expect(verifyGstinChecksum(validGstin)).toBe(true);
      expect(verifyGstinChecksum('29ABCDE1234F1ZA')).toBe(false);
      expect(verifyGstinChecksum('INVALID')).toBe(false);
    });
  });

  describe('IFSC Code Validation', () => {
    it('accepts valid 11-char IFSC code', () => {
      const res = validateIfsc('HDFC0001234');
      expect(res.valid).toBe(true);
      expect(res.value).toBe('HDFC0001234');
    });

    it('cleans lowercase and strips non-alphanumeric', () => {
      expect(cleanIfsc(' hdfc-0001234 ')).toBe('HDFC0001234');
    });

    it('rejects invalid IFSC codes', () => {
      // 5th character must be 0
      expect(validateIfsc('HDFC1001234').valid).toBe(false);
      // Less than 11 chars
      expect(validateIfsc('HDFC000123').valid).toBe(false);
      // More than 11 chars
      expect(validateIfsc('HDFC00012345').valid).toBe(false);
    });
  });

  describe('Image File Validation (Anti-SVG & Format Security)', () => {
    it('rejects SVG files to prevent XSS', () => {
      const fakeSvgFile = {
        name: 'seal.svg',
        type: 'image/svg+xml',
        size: 1024,
      } as any;
      const res = validateImageFile(fakeSvgFile);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('SVG images are not allowed');
    });

    it('accepts PNG and JPEG files', () => {
      const pngFile = { name: 'signature.png', type: 'image/png', size: 10240 } as any;
      const jpgFile = { name: 'stamp.jpeg', type: 'image/jpeg', size: 10240 } as any;
      expect(validateImageFile(pngFile).valid).toBe(true);
      expect(validateImageFile(jpgFile).valid).toBe(true);
    });
  });

  describe('GlobalHttpExceptionFilter - 413 Payload Too Large with CORS', () => {
    it('handles 413 error and attaches CORS origin headers', () => {
      const filter = new GlobalHttpExceptionFilter();
      let capturedStatus = 0;
      let capturedBody: any = null;
      const headers: Record<string, string> = {};

      const mockResponse: any = {
        status: (code: number) => {
          capturedStatus = code;
          return {
            json: (body: any) => {
              capturedBody = body;
              return body;
            },
          };
        },
        setHeader: (k: string, v: string) => {
          headers[k] = v;
        },
        getHeader: (k: string) => headers[k],
      };

      const mockRequest: any = {
        url: '/api/v1/invoices/settings/signatory',
        method: 'POST',
        headers: {
          origin: 'http://localhost:5173',
          'x-request-id': 'req_test_413',
        },
      };

      const mockHost: any = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => mockRequest,
        }),
      };

      const bodyError = {
        type: 'entity.too.large',
        status: 413,
        statusCode: 413,
        message: 'request entity too large',
      };

      filter.catch(bodyError, mockHost);

      expect(capturedStatus).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
      expect(capturedBody.code).toBe('PAYLOAD_TOO_LARGE');
      expect(capturedBody.message).toContain('Request payload is too large');
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
      expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    });
  });
});
