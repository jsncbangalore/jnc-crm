/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { maskSensitiveUrl } from './request-id.middleware';
import { humanizeField } from './validation-error.formatter';
import { redactSensitiveString } from './redact.util';
import { generateSupportCode } from './support-code.util';

export interface StandardApiErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  supportCode?: string;
  fieldErrors: Array<{ field: string; message: string }>;
  field?: string;
  unknownFields?: string[];
  timestamp?: string;
}

const FORBIDDEN_INTERNAL_PATTERNS = [
  /(\b(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|GROUP BY|ORDER BY|pg_|psql)\b)/i,
  /(\b(?:relation|column|table)\s+["'][a-zA-Z0-9_.-]+["'])/i,
  /(\b(?:Prisma|PrismaClient|P2002|P2003|P2025|P2021|P2022|P1001|P1002|P2024|P2034)\b)/i,
  /(\b(?:at\s+.*\(.*:\d+:\d+\)|node_modules|\/apps\/api|\/dist\/|C:\\|\\dist\\)\b)/i,
  /(\b(?:NODE_ENV|DATABASE_URL|DIRECT_URL|JWT_SECRET|JWT_REFRESH_SECRET|ENCRYPTION_KEY|OTP_SECRET|SMTP_PASS)\b)/i,
  /(\b(?:NestJS|Express|PostgreSQL|Fastify)\b)/i,
  /(Only\s+(?:Developer Leads|Project Managers|Tenant Admin|Admin|Platform Super Admin)\b)/i,
  /(You do not hold:\s+[a-zA-Z0-9_, -]+)/i,
  /(Cannot\s+(?:GET|POST|PUT|PATCH|DELETE)\s+\/.*)/i,
];

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string; user?: any; tenantId?: string }>();
    const isProduction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

    const requestId = (request.headers?.['x-request-id'] as string) || request.id || `req_${Date.now()}`;
    const tenantId = (request as any).user?.tenantId || (request as any).tenantId || (request.headers?.['x-tenant-id'] as string) || 'none';
    const userId = (request as any).user?.userId || (request as any).user?.id || 'none';
    const route = maskSensitiveUrl(request.originalUrl || request.url || '');

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL';
    let message = 'An unexpected server error occurred. Please try again shortly.';
    let field: string | undefined = undefined;
    let fieldErrors: Array<{ field: string; message: string }> = [];

    const isPayloadTooLarge =
      (exception as any)?.status === 413 ||
      (exception as any)?.statusCode === 413 ||
      (exception as any)?.type === 'entity.too.large' ||
      (exception as any)?.name === 'PayloadTooLargeException';

    if (isPayloadTooLarge) {
      status = HttpStatus.PAYLOAD_TOO_LARGE;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'Request payload is too large. Images must be compressed before upload.';
      fieldErrors = [];
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'object' && res !== null) {
        const obj = res as any;

        if (obj.code && typeof obj.code === 'string') {
          code = obj.code;
        } else {
          code = this.getDefaultCodeForStatus(status);
        }

        if (obj.field && typeof obj.field === 'string') {
          field = obj.field;
        }

        // Unknown field check:
        // Never send "property X should not exist" to browser; log it with requestId and return UNKNOWN_FIELD
        const isUnknownField =
          obj.code === 'UNKNOWN_FIELD' ||
          Boolean(obj.unknownFields) ||
          (Array.isArray(obj.message) && obj.message.some((m: string) => typeof m === 'string' && m.includes('should not exist'))) ||
          (typeof obj.message === 'string' && obj.message.includes('should not exist'));

        if (isUnknownField) {
          code = 'UNKNOWN_FIELD';
          const rawUnknowns = obj.unknownFields || (Array.isArray(obj.message) ? obj.message.filter((m: string) => typeof m === 'string' && m.includes('should not exist')) : [obj.message]);
          this.logger.warn(`[${requestId}] Rejected unrecognized parameter(s): ${JSON.stringify(rawUnknowns)} | tenantId=${tenantId} userId=${userId}`);

          const extractedFields = (Array.isArray(rawUnknowns) ? rawUnknowns : [rawUnknowns])
            .map((item: any) => {
              if (typeof item !== 'string') return '';
              const match = item.match(/property\s+([a-zA-Z0-9_.-]+)\s+should not exist/i);
              return match ? match[1] : item.replace(/^property\s+/i, '').replace(/\s+should not exist$/i, '').trim();
            })
            .filter(Boolean);

          if (extractedFields.length > 0) {
            field = extractedFields[0];
            message = `The submitted form contains unrecognized parameters: ${extractedFields.join(', ')}. Please refresh and try again.`;
            fieldErrors = extractedFields.map((f) => ({
              field: f,
              message: `Unrecognized parameter: ${f}`,
            }));
          } else {
            message = 'The submitted form contains unrecognized parameters. Please refresh and try again.';
            fieldErrors = [];
          }
        } else if (Array.isArray(obj.fieldErrors)) {
          fieldErrors = obj.fieldErrors.map((fe: any) => ({
            field: String(fe.field || 'general'),
            message: this.sanitizeToPlainSentence(String(fe.message || 'Invalid value')),
          }));
          if (fieldErrors.length > 0 && !field) {
            field = fieldErrors[0].field;
          }
          message = typeof obj.message === 'string'
            ? this.sanitizeToPlainSentence(obj.message)
            : 'Please correct the highlighted fields and try again.';
        } else if (obj.fieldErrors && typeof obj.fieldErrors === 'object') {
          fieldErrors = Object.entries(obj.fieldErrors).map(([f, msg]) => ({
            field: f,
            message: this.sanitizeToPlainSentence(String(msg || 'Invalid value')),
          }));
          if (fieldErrors.length > 0 && !field) {
            field = fieldErrors[0].field;
          }
          message = typeof obj.message === 'string'
            ? this.sanitizeToPlainSentence(obj.message)
            : 'Please correct the highlighted fields and try again.';
        } else if (Array.isArray(obj.message)) {
          code = 'VALIDATION_FAILED';
          message = 'Please correct the highlighted fields and try again.';
          fieldErrors = obj.message.map((raw: string) => this.parseClassValidatorString(raw));
          if (fieldErrors.length > 0 && !field) {
            field = fieldErrors[0].field;
          }
        } else if (typeof obj.message === 'string') {
          message = this.sanitizeToPlainSentence(obj.message);
        }
      } else if (typeof res === 'string') {
        code = this.getDefaultCodeForStatus(status);
        message = this.sanitizeToPlainSentence(res);
      }
    } else if (
      (exception as any)?.name === 'PrismaClientKnownRequestError' ||
      (exception as any)?.name === 'PrismaClientUnknownRequestError' ||
      (exception as any)?.name === 'PrismaClientRustPanicError' ||
      (exception as any)?.name === 'PrismaClientInitializationError' ||
      (exception as any)?.name === 'PrismaClientValidationError'
    ) {
      const prismaErr = exception as any;
      const prismaCode = prismaErr.code || (prismaErr.name === 'PrismaClientInitializationError' ? 'P1001' : 'UNKNOWN');
      const safeMeta: Record<string, any> = {};
      if (prismaErr.meta && typeof prismaErr.meta === 'object') {
        const allowedMetaKeys = ['target', 'field_name', 'column', 'table', 'modelName', 'path', 'database_error', 'constraint', 'cause'];
        for (const k of allowedMetaKeys) {
          if (prismaErr.meta[k] !== undefined) {
            safeMeta[k] = prismaErr.meta[k];
          }
        }
      }

      this.logger.error(
        `[${requestId}] Prisma Error ${prismaCode} on ${request.method} ${route} | tenantId=${tenantId} userId=${userId} | safeDetails=${JSON.stringify(safeMeta)}`
      );

      if (prismaCode === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'DUPLICATE';
        field = this.extractSafeField(prismaErr.meta) || 'record';
        const humanField = humanizeField(field);
        message = `A record with this ${humanField.toLowerCase()} already exists.`;
        fieldErrors = [{ field, message: `This ${humanField.toLowerCase()} is already in use.` }];
      } else if (prismaCode === 'P2003') {
        status = HttpStatus.CONFLICT;
        code = 'LINKED_RECORD_MISSING';
        field = this.extractSafeField(prismaErr.meta) || 'customerId';
        if (field === 'customerId' || field.toLowerCase().includes('customer')) {
          field = 'customerId';
          message = 'This customer is not registered yet.';
        } else {
          message = `The referenced ${humanizeField(field).toLowerCase()} does not exist or is missing.`;
        }
        fieldErrors = [{ field, message }];
      } else if (prismaCode === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        const recordType = prismaErr.meta?.modelName || 'Record';
        field = recordType;
        message = `The requested ${recordType.toLowerCase()} could not be found.`;
        fieldErrors = [];
      } else if (prismaCode === 'P2021' || prismaCode === 'P2022') {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        code = 'SCHEMA_OUT_OF_DATE';
        const model = prismaErr.meta?.modelName || 'unknown_model';
        const rawCol = prismaErr.meta?.column || prismaErr.meta?.table || 'unknown_column';
        message = 'The system is being updated. Please try again in a few minutes.';
        field = this.extractSafeField(prismaErr.meta) || (rawCol.includes('.') ? rawCol.split('.').pop() : rawCol);
        fieldErrors = [];
        this.logger.error(
          `[${requestId}] [ADMIN ALERT] SCHEMA_OUT_OF_DATE: Migration pending on model="${model}", column="${rawCol}". ` +
          `Route=${request.method} ${route} | tenantId=${tenantId} userId=${userId}`
        );
      } else if (prismaCode === 'P1001' || prismaCode === 'P1002' || prismaCode === 'P2024') {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        code = 'SERVER_UPDATE_PENDING';
        message = 'The system is being updated. Please try again in a few minutes.';
        fieldErrors = [];
      } else {
        // Other unknown Prisma errors become 500 INTERNAL with safe message
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        code = 'INTERNAL';
        message = 'We could not complete your request right now. Please try again in a few minutes.';
        fieldErrors = [];
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'INTERNAL';
      message = 'We could not complete your request right now. Please try again in a few minutes.';
    }

    const supportCode = generateSupportCode(requestId);
    const pathWithoutQuery = route.split('?')[0];

    // Always log full error stack for 500s server-side with requestId, errorClass, prismaCode and sanitized stack
    if (status >= 500) {
      const errorClass = (exception as any)?.name || (exception as any)?.constructor?.name || typeof exception;
      const prismaCode = (exception as any)?.code || ((exception as any)?.name === 'PrismaClientInitializationError' ? 'P1001' : undefined);
      const rawStack = exception instanceof Error ? (exception.stack || exception.message) : String(exception);
      const sanitizedStack = redactSensitiveString(
        rawStack
          .replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, '$1***$2')
          .replace(/(["']?(?:password|token|secret|jwt|apiKey|authorization)["']?\s*[:=]\s*["']?)([^"',\s\\]+)(["']?)/gi, '$1***$3')
          .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1***')
      );

      // EXACTLY ONE structured log line per Requirement 4
      this.logger.error(
        `[5XX] supportCode=${supportCode} requestId=${requestId} method=${request.method} path=${pathWithoutQuery} status=${status} errorClass=${errorClass} prismaCode=${prismaCode || 'NONE'} tenantId=${tenantId} userId=${userId} | Stack: ${sanitizedStack}`
      );

      // Ensure 500s never leak SQL or stack traces to client; use friendly messages
      if (status === HttpStatus.SERVICE_UNAVAILABLE || code === 'SCHEMA_OUT_OF_DATE' || code === 'SERVER_UPDATE_PENDING') {
        message = 'The system is being updated. Please try again in a few minutes.';
      } else if (pathWithoutQuery.includes('/auth/login') || pathWithoutQuery.includes('/platform-auth/login')) {
        message = 'We could not sign you in right now. Please try again in a few minutes.';
      } else {
        message = 'We could not complete your request right now. Please try again in a few minutes.';
      }
      fieldErrors = [];
    }

    // ─── STRICT PRODUCTION MASKS & GENERIC AUTH RESPONSES ───────────────────
    if (status === HttpStatus.TOO_MANY_REQUESTS || (status as number) === 429) {
      code = 'TOO_MANY_REQUESTS';
      const existingRetry = response.getHeader('Retry-After') || (exception as any)?.retryAfter || (exception as any)?.timeToBlockExpire;
      let retrySeconds = parseInt(String(existingRetry), 10);
      if (isNaN(retrySeconds) || retrySeconds <= 0) {
        retrySeconds = 900;
      }
      if (typeof response.setHeader === 'function') {
        response.setHeader('Retry-After', String(retrySeconds));
      }
      const minutes = Math.max(1, Math.ceil(retrySeconds / 60));
      // Standard 429 rate limit message: Too many attempts. Try again in / Please wait N minutes.
      message = `Too many attempts. Please wait ${minutes} minute${minutes === 1 ? '' : 's'}.`;
      field = undefined;
      fieldErrors = [];
    } else if (isProduction) {
      if (status === HttpStatus.UNAUTHORIZED) {
        const lower = message.toLowerCase();
        if (lower.includes('expired') || lower.includes('token') || lower.includes('session')) {
          message = 'Session expired. Please sign in again.';
        } else {
          message = 'Invalid credentials.';
        }
        field = undefined;
        fieldErrors = [];
      } else if (status === HttpStatus.FORBIDDEN) {
        message = 'You do not have permission to perform this action.';
        field = undefined;
        fieldErrors = [];
      } else if (status === HttpStatus.NOT_FOUND) {
        message = 'The requested resource could not be found.';
        field = undefined;
        fieldErrors = [];
      } else if (status === HttpStatus.SERVICE_UNAVAILABLE && (code === 'SCHEMA_OUT_OF_DATE' || code === 'SERVER_UPDATE_PENDING')) {
        field = undefined;
        fieldErrors = [];
        message = 'The system is being updated. Please try again in a few minutes.';
      } else if (status === HttpStatus.CONFLICT && code === 'LINKED_RECORD_MISSING') {
        if (field !== 'customerId') {
          field = undefined;
          message = 'The referenced record does not exist or has been removed.';
          fieldErrors = [];
        }
      }

      // Check if any forbidden internal pattern leaked into message
      for (const pat of FORBIDDEN_INTERNAL_PATTERNS) {
        if (pat.test(message)) {
          if (status === 404) message = 'The requested resource could not be found.';
          else if (status === 403) message = 'You do not have permission to perform this action.';
          else if (status === 401) message = 'Invalid credentials.';
          else if (status === 503) message = 'The system is being updated. Please try again in a few minutes.';
          else if (pathWithoutQuery.includes('/auth/login') || pathWithoutQuery.includes('/platform-auth/login'))
            message = 'We could not sign you in right now. Please try again in a few minutes.';
          else message = 'We could not complete your request right now. Please try again in a few minutes.';
          break;
        }
      }
    }

    message = this.sanitizeToPlainSentence(message);

    const errorBody: StandardApiErrorResponse & { retryAfter?: number; supportCode?: string } = {
      statusCode: status,
      code,
      message,
      requestId,
      fieldErrors: Array.isArray(fieldErrors) ? fieldErrors : [],
      ...(!isProduction ? { supportCode } : {}),
      ...(status === 429 && typeof response.getHeader === 'function' && response.getHeader('Retry-After')
        ? { retryAfter: parseInt(String(response.getHeader('Retry-After')), 10) }
        : {}),
      ...(!isProduction && field ? { field } : (isProduction && (code === 'VALIDATION_FAILED' || code === 'UNKNOWN_FIELD') && field ? { field } : {})),
      ...(code === 'UNKNOWN_FIELD' && fieldErrors.length > 0 ? { unknownFields: fieldErrors.map((f) => f.field) } : {}),
    };

    const reqOrigin = request.headers?.origin;
    if (typeof response.setHeader === 'function') {
      if (reqOrigin && typeof response.getHeader === 'function' && !response.getHeader('Access-Control-Allow-Origin')) {
        response.setHeader('Access-Control-Allow-Origin', reqOrigin);
        response.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      response.setHeader('x-support-code', supportCode);
      response.setHeader('x-request-id', requestId);
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('X-Frame-Options', 'DENY');
      response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
      response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none';");
    }

    return response.status(status).json(errorBody);
  }

  private extractSafeField(meta: any): string | undefined {
    if (!meta) return undefined;
    if (Array.isArray(meta.target)) return meta.target.join(', ');
    if (typeof meta.target === 'string') return meta.target;
    if (typeof meta.field_name === 'string') {
      const match = meta.field_name.match(/_([a-zA-Z0-9]+)_fkey/);
      if (match) return match[1];
      return meta.field_name.replace(/_fkey.*$/i, '').replace(/_id$/i, 'Id').trim();
    }
    if (typeof meta.column === 'string') {
      const parts = meta.column.split('.');
      return parts[parts.length - 1];
    }
    if (typeof meta.constraint === 'string') return meta.constraint;
    return undefined;
  }

  private getDefaultCodeForStatus(status: number): string {
    switch (status) {
      case 400: return 'BAD_REQUEST';
      case 401: return 'UNAUTHORIZED';
      case 403: return 'FORBIDDEN';
      case 404: return 'NOT_FOUND';
      case 409: return 'CONFLICT';
      case 413: return 'PAYLOAD_TOO_LARGE';
      case 422: return 'UNPROCESSABLE_ENTITY';
      case 429: return 'TOO_MANY_REQUESTS';
      default: return status >= 500 ? 'INTERNAL' : 'ERROR';
    }
  }

  private sanitizeToPlainSentence(raw: string): string {
    if (!raw || typeof raw !== 'string') return 'An error occurred. Please try again.';
    let s = raw.split('\n')[0].trim();
    if (s.startsWith('[object') || s.startsWith('{') || s.startsWith('[')) {
      return 'The server encountered an error processing your request.';
    }
    s = s
      .replace(/should not exist/i, 'is not recognized')
      .replace(/must be an? /i, 'must be a valid ')
      .replace(/must be a valid text string/i, 'must be a valid text entry')
      .replace(/must be a valid number/i, 'must be a valid number entry');

    if (!s.endsWith('.') && !s.endsWith('!') && !s.endsWith('?')) {
      s += '.';
    }
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  private parseClassValidatorString(raw: string): { field: string; message: string } {
    const parts = raw.split(' ');
    const field = parts[0] || 'general';
    return {
      field,
      message: this.sanitizeToPlainSentence(raw),
    };
  }
}
