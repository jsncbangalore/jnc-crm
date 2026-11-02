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
  fieldErrors: Array<{ field: string; message: string }>;
  requestId: string;
  timestamp?: string;
}

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    const requestId = (request.headers['x-request-id'] as string) || request.id || `req_${Date.now()}`;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'SERVER_ERROR';
    let message = 'An unexpected server error occurred. Please try again shortly.';
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
          this.logger.warn(`[${requestId}] Rejected unrecognized parameter(s): ${JSON.stringify(rawUnknowns)}`);
          message = 'The submitted form contains unrecognized parameters. Please refresh and try again.';
          fieldErrors = [];
        } else if (Array.isArray(obj.fieldErrors)) {
          fieldErrors = obj.fieldErrors.map((fe: any) => ({
            field: String(fe.field || 'general'),
            message: this.sanitizeToPlainSentence(String(fe.message || 'Invalid value')),
          }));
          message = typeof obj.message === 'string'
            ? this.sanitizeToPlainSentence(obj.message)
            : 'Please correct the highlighted fields and try again.';
        } else if (obj.fieldErrors && typeof obj.fieldErrors === 'object') {
          fieldErrors = Object.entries(obj.fieldErrors).map(([field, msg]) => ({
            field,
            message: this.sanitizeToPlainSentence(String(msg || 'Invalid value')),
          }));
          message = typeof obj.message === 'string'
            ? this.sanitizeToPlainSentence(obj.message)
            : 'Please correct the highlighted fields and try again.';
        } else if (Array.isArray(obj.message)) {
          code = 'VALIDATION_FAILED';
          message = 'Please correct the highlighted fields and try again.';
          fieldErrors = obj.message.map((raw: string) => this.parseClassValidatorString(raw));
        } else if (typeof obj.message === 'string') {
          message = this.sanitizeToPlainSentence(obj.message);
        }
      } else if (typeof res === 'string') {
        code = this.getDefaultCodeForStatus(status);
        message = this.sanitizeToPlainSentence(res);
      }
    } else if ((exception as any)?.name === 'PrismaClientKnownRequestError') {
      const prismaErr = exception as any;
      if (prismaErr.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'DUPLICATE_ENTRY';
        const target = Array.isArray(prismaErr.meta?.target)
          ? prismaErr.meta.target.join(', ')
          : (prismaErr.meta?.target || 'record');
        const humanTarget = humanizeField(target);
        message = `A record with this ${humanTarget.toLowerCase()} already exists.`;
        fieldErrors = [{ field: target, message: `This ${humanTarget.toLowerCase()} is already in use.` }];
      } else if (prismaErr.code === 'P2003') {
        status = HttpStatus.BAD_REQUEST;
        code = 'REFERENCE_NOT_FOUND';
        const field = prismaErr.meta?.field_name || 'referenced item';
        message = 'The referenced record does not exist or has been removed.';
        fieldErrors = [{ field, message: 'Referenced entity not found.' }];
      } else if (prismaErr.code === 'P2012') {
        status = HttpStatus.BAD_REQUEST;
        code = 'MISSING_FIELD';
        const path = prismaErr.meta?.path || 'field';
        message = `Required field "${path}" is missing.`;
        fieldErrors = [{ field: path, message: 'This field is required.' }];
      } else if (prismaErr.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'The requested record could not be found.';
      } else {
        status = HttpStatus.BAD_REQUEST;
        code = 'DATABASE_ERROR';
        message = 'A database constraint prevented this operation from completing.';
      }
    } else if ((exception as any)?.name === 'PrismaClientValidationError') {
      status = HttpStatus.BAD_REQUEST;
      code = 'INPUT_VALIDATION_FAILED';
      message = 'The submitted data format is invalid. Please check your inputs.';
      fieldErrors = [{ field: 'general', message: 'Input format validation failed.' }];
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'SERVER_ERROR';
      message = 'An unexpected server error occurred. Please try again shortly.';
    }

    // Always log details server-side with requestId for 500s
    if (status >= 500) {
      const errorStack = exception instanceof Error ? exception.stack : String(exception);
      const safeUrl = maskSensitiveUrl(request.originalUrl || request.url);
      this.logger.error(`[${requestId}] Server Error ${status} (${code}) on ${request.method} ${safeUrl}: ${errorStack}`);

      // Ensure 500s never leak SQL or traces to client
      message = 'An unexpected server error occurred. Please try again shortly.';
      fieldErrors = [];
    }

    message = this.sanitizeToPlainSentence(message);

    const errorBody: StandardApiErrorResponse = {
      statusCode: status,
      code,
      message,
      fieldErrors,
      requestId,
      timestamp: new Date().toISOString(),
    };

    return response.status(status).json(errorBody);
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
      default: return status >= 500 ? 'SERVER_ERROR' : 'ERROR';
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
