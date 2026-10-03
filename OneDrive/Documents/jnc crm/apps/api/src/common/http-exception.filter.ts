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

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    const requestId = (request.headers['x-request-id'] as string) || request.id || 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: any = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'object' && (res as any).message ? (res as any).message : res;
    }

    // Always log details server-side with requestId
    if (status >= 500) {
      const errorStack = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`[${requestId}] Server Error 500 on ${request.method} ${request.url}: ${errorStack}`);

      // In production, mask 500 errors completely (no SQL, no Prisma error text, no stacks)
      if (process.env.NODE_ENV === 'production') {
        return response.status(status).json({
          statusCode: 500,
          message: 'Internal server error',
          requestId,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return response.status(status).json({
      statusCode: status,
      message,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
