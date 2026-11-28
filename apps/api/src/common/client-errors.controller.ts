/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Query,
  UseGuards,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { SanitizeText, TrimString } from './validation.transformers';
import { redactSensitiveString, cleanUrlPath } from './redact.util';
import { generateSupportCode } from './support-code.util';

export class ReportClientErrorDto {
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  id: string;

  @TrimString()
  @IsString()
  @IsOptional()
  @MaxLength(10)
  method?: string;

  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  route: string;

  @SanitizeText()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  page?: string;

  @IsOptional()
  status?: number | string;

  @SanitizeText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;

  @IsString()
  @IsOptional()
  @MaxLength(10000)
  componentStack?: string;

  @TrimString()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  buildVersion?: string;

  @TrimString()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  userId?: string;

  @TrimString()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  tenantId?: string;
}

// In-memory sliding window rate limiter (max 30 error reports per minute per IP)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

@Controller()
export class ClientErrorsController {
  private readonly logger = new Logger('ClientErrors');

  constructor(private readonly prisma: PrismaService) {}

  @Post(['client-errors', 'api/v1/client-errors'])
  async reportError(@Body() dto: ReportClientErrorDto, @Req() req: Request) {
    const ip = (req.ips && req.ips.length ? req.ips[0] : req.ip) || '127.0.0.1';
    const now = Date.now();
    const limiter = rateLimitMap.get(ip);

    if (limiter && limiter.resetAt > now) {
      if (limiter.count >= 30) {
        this.logger.warn(`Rate limit exceeded for client error reporting from IP ${ip}`);
        return { ok: false, error: 'Too many error reports. Please wait.' };
      }
      limiter.count += 1;
    } else {
      rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 });
    }

    const authUser = (req as any).user;
    const resolvedTenantId = authUser?.tenantId || dto.tenantId || null;
    const resolvedUserId = authUser?.id || authUser?.userId || dto.userId || null;

    let validTenantId: string | null = null;
    if (resolvedTenantId) {
      const exists = await this.prisma.tenant.findUnique({
        where: { id: resolvedTenantId },
        select: { id: true },
      });
      if (exists) validTenantId = exists.id;
    }

    let validUserId: string | null = null;
    if (resolvedUserId) {
      const exists = await this.prisma.user.findUnique({
        where: { id: resolvedUserId },
        select: { id: true },
      });
      if (exists) validUserId = exists.id;
    }

    const cleanId = (dto.id || (req.headers['x-request-id'] as string) || `ERR-${Date.now().toString(36).toUpperCase()}`).trim();

    // Enforce storing only method, URL path without query, status, requestId, page and a short message
    let method = (dto.method || '').trim().toUpperCase();
    let rawPath = dto.route || '';
    const routeParts = rawPath.split(/\s+/);
    if (!method && routeParts.length > 1 && /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/i.test(routeParts[0])) {
      method = routeParts[0].toUpperCase();
      rawPath = routeParts.slice(1).join(' ');
    }
    const safeUrlPath = cleanUrlPath(rawPath);
    const storedRoute = method ? `${method} ${safeUrlPath}` : safeUrlPath;
    const safePage = dto.page ? cleanUrlPath(dto.page) : null;

    let status = dto.status ? String(dto.status) : '';
    if (!status) {
      const statusMatch = dto.message.match(/Status\s*:?\s*(\d{3})/i);
      if (statusMatch) status = statusMatch[1];
    }

    // Short message, redacted of all personal data, tokens, passwords, emails, bank accounts
    const firstLine = (dto.message || '').split('\n')[0].trim();
    const safeMessage = redactSensitiveString(firstLine).slice(0, 255);
    const supportCode = generateSupportCode(cleanId);
    const conciseMetadata = [status ? `Status: ${status}` : null, `SupportCode: ${supportCode}`].filter(Boolean).join(' | ');

    try {
      await this.prisma.clientError.upsert({
        where: { id: cleanId },
        update: {
          message: safeMessage,
          route: storedRoute,
          page: safePage,
          componentStack: conciseMetadata,
          buildVersion: dto.buildVersion || null,
        },
        create: {
          id: cleanId,
          tenantId: validTenantId,
          userId: validUserId,
          route: storedRoute,
          page: safePage,
          message: safeMessage,
          componentStack: conciseMetadata,
          buildVersion: dto.buildVersion || '1.0.0',
        },
      });

      this.logger.log(`[CLIENT ERROR SAVED] supportCode=${supportCode} requestId=${cleanId} Route=${storedRoute} Page=${safePage || 'N/A'}: ${safeMessage}`);
      return { ok: true, id: cleanId, supportCode };
    } catch (err: any) {
      this.logger.error(`Failed to save client error [${cleanId}]: ${err.message}`);
      return { ok: false, error: 'Failed to record error.' };
    }
  }

  @Get(['admin/system-errors', 'api/v1/admin/system-errors', 'client-errors'])
  @UseGuards(AuthGuard('jwt'))
  async getSystemErrors(
    @Req() req: Request,
    @Query('search') search?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const user = (req as any).user;
    if (!user || (!['admin', 'administrator', 'tenant_admin', 'super_admin', 'platform_super_admin', 'platform_admin'].includes(user.role) && !user.isPlatformAdmin)) {
      throw new ForbiddenException('Admin access required to view system errors');
    }

    const page = Math.max(1, parseInt(pageStr || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitStr || '25', 10) || 25));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (user.tenantId && user.role !== 'platform_super_admin') {
      where.OR = [
        { tenantId: user.tenantId },
        { tenantId: null },
      ];
    }

    if (search && search.trim()) {
      const q = search.trim();
      const searchConditions = [
        { id: { contains: q, mode: 'insensitive' } },
        { message: { contains: q, mode: 'insensitive' } },
        { route: { contains: q, mode: 'insensitive' } },
        { page: { contains: q, mode: 'insensitive' } },
      ];
      where.AND = [{ OR: searchConditions }];
    }

    const [items, total] = await Promise.all([
      this.prisma.clientError.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, employeeCode: true, email: true } },
          tenant: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.clientError.count({ where }),
    ]);

    return {
      items: items.map((err) => ({
        id: err.id,
        referenceId: err.id,
        route: err.route,
        page: err.page || 'App',
        message: err.message,
        componentStack: err.componentStack,
        buildVersion: err.buildVersion,
        createdAt: err.createdAt.toISOString(),
        user: err.user ? { name: err.user.name, code: err.user.employeeCode } : null,
        tenant: err.tenant ? { name: err.tenant.name, code: err.tenant.code } : null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
