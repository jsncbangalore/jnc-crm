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

export interface StandardApiErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  field?: string;
  fieldErrors?: Array<{ field: string; message: string }>;
  requestId: string;
  timestamp?: string;
}

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string; user?: any; tenantId?: string }>();

    const requestId = (request.headers['x-request-id'] as string) || request.id || `req_${Date.now()}`;
    const tenantId = (request as any).user?.tenantId || (request as any).tenantId || (request.headers['x-tenant-id'] as string) || 'none';
    const userId = (request as any).user?.userId || (request as any).user?.id || 'none';
    const route = maskSensitiveUrl(request.originalUrl || request.url);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL';
    let message = 'An unexpected server error occurred. Please try again shortly.';
    let field: string | undefined = undefined;
    let fieldErrors: Array<{ field: string; message: string }> = [];

    if (exception instanceof HttpException) {
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

          const isDev = process.env.NODE_ENV !== 'production';
          if (isDev && extractedFields.length > 0) {
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
        message = 'The system needs an update. Nothing was lost. Ask your administrator.';
        field = this.extractSafeField(prismaErr.meta) || (rawCol.includes('.') ? rawCol.split('.').pop() : rawCol);
        fieldErrors = [];
        this.logger.error(
          `[${requestId}] [ADMIN ALERT] SCHEMA_OUT_OF_DATE: Migration pending on model="${model}", column="${rawCol}". ` +
          `Route=${request.method} ${route} | tenantId=${tenantId} userId=${userId}`
        );
      } else if (prismaCode === 'P1001' || prismaCode === 'P1002' || prismaCode === 'P2024') {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        code = 'SERVER_UPDATE_PENDING';
        message = 'Server update pending. Please try again in a few minutes.';
        fieldErrors = [];
      } else {
        // Other unknown Prisma errors become 500 INTERNAL with safe message
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        code = 'INTERNAL';
        message = 'An internal database error occurred.';
        fieldErrors = [];
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'INTERNAL';
      message = 'An unexpected server error occurred. Please try again shortly.';
    }

    // Always log full error stack for 500s server-side with requestId
    if (status >= 500 && status !== HttpStatus.SERVICE_UNAVAILABLE) {
      const errorStack = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`[${requestId}] Server Error ${status} (${code}) on ${request.method} ${route} | tenantId=${tenantId} userId=${userId}: ${errorStack}`);

      // Ensure 500s never leak SQL or stack traces to client
      message = 'An internal database error occurred.';
      fieldErrors = [];
    }

    message = this.sanitizeToPlainSentence(message);

    const errorBody: StandardApiErrorResponse = {
      statusCode: status,
      code,
      message,
      ...(field ? { field } : {}),
      fieldErrors,
      requestId,
      timestamp: new Date().toISOString(),
    };

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
