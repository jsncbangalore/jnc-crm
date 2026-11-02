/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  Controller,
  Post,
  Options,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/page-access.decorator';
import { parseExactOrigin } from '../common/public-cors';

// In-memory rate limiting stores
interface RateEntry {
  count: number;
  resetAt: number;
}

const ipRateLimits = new Map<string, RateEntry>();
const emailRateLimits = new Map<string, RateEntry>();

// Clean up stale rate limit entries periodically (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of ipRateLimits.entries()) {
    if (entry.resetAt <= now) ipRateLimits.delete(key);
  }
  for (const [key, entry] of emailRateLimits.entries()) {
    if (entry.resetAt <= now) emailRateLimits.delete(key);
  }
}, 10 * 60 * 1000);

export function getAllowedDemoOrigins(): string[] {
  const envDemoOrigins = process.env.PLATFORM_DEMO_ALLOWED_ORIGINS
    ? process.env.PLATFORM_DEMO_ALLOWED_ORIGINS.split(',')
    : [];
  const envAllowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [];
  const frontendUrl = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [];

  const combined = [...envDemoOrigins, ...envAllowedOrigins, ...frontendUrl, 'http://localhost:5173'];
  return combined
    .map((o) => parseExactOrigin(o.trim()))
    .filter((o): o is string => Boolean(o));
}

@Controller('public')
@Public()
export class DemoRequestController {
  private readonly logger = new Logger(DemoRequestController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Options('demo-request')
  @HttpCode(HttpStatus.NO_CONTENT)
  async handleDemoOptions(
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ) {
    res.removeHeader('Set-Cookie');
    res.removeHeader('set-cookie');
    res.removeHeader('Access-Control-Allow-Credentials');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const rawOrigin = req.headers.origin as string | undefined;
    if (rawOrigin) {
      const incomingOrigin = parseExactOrigin(rawOrigin);
      const allowedOrigins = getAllowedDemoOrigins();
      if (incomingOrigin && allowedOrigins.includes(incomingOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', incomingOrigin);
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
        res.setHeader('Access-Control-Max-Age', '86400');
      }
    }
    return res.status(HttpStatus.NO_CONTENT).end();
  }

  @Post('demo-request')
  @HttpCode(HttpStatus.OK)
  async handleDemoRequest(
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
    @Body() body: any,
  ) {
    // 1. Enforce No Cookies & No Credentials
    res.removeHeader('Set-Cookie');
    res.removeHeader('set-cookie');
    res.removeHeader('Access-Control-Allow-Credentials');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // 2. CORS Handling for Demo Request
    const rawOrigin = req.headers.origin as string | undefined;
    if (rawOrigin) {
      const incomingOrigin = parseExactOrigin(rawOrigin);
      const allowedOrigins = getAllowedDemoOrigins();
      if (incomingOrigin && allowedOrigins.includes(incomingOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', incomingOrigin);
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
      }
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    // 3. Body Size Limit (16KB)
    const rawBodyLength = req.headers['content-length']
      ? parseInt(req.headers['content-length'] as string, 10)
      : JSON.stringify(body || {}).length;
    if (rawBodyLength > 16384) {
      throw new HttpException('Payload Too Large', HttpStatus.PAYLOAD_TOO_LARGE);
    }

    // 4. Rate Limiting per IP (max 5 per 15 min) & per Email (max 3 per 1 hour)
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown-ip';

    const now = Date.now();
    const ipEntry = ipRateLimits.get(ip);
    if (ipEntry && ipEntry.resetAt > now) {
      if (ipEntry.count >= 5) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many demo requests from this IP address. Please try again later.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      ipEntry.count++;
    } else {
      ipRateLimits.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    }

    // 5. Anti-spam Honeypot Check
    const honeypotVal = body?._hp_company_trap || body?.honeypot || body?.hp_trap;
    const randomRef =
      'DEMO-' +
      crypto.randomBytes(4).toString('hex').toUpperCase() +
      '-' +
      crypto.randomBytes(4).toString('hex').toUpperCase();

    if (honeypotVal && typeof honeypotVal === 'string' && honeypotVal.trim() !== '') {
      this.logger.warn(`Bot detected on demo-request from IP=${ip}. Honeypot triggered.`);
      // Return unguessable reference number without creating DB record
      return res.status(HttpStatus.OK).json({
        status: 'SUCCESS',
        message: 'Demo walkthrough request registered successfully',
        referenceNumber: randomRef,
      });
    }

    // 6. Validation of Fields
    const errors: Record<string, string> = {};
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const company = typeof body?.company === 'string' ? body.company.trim() : '';
    const city = typeof body?.city === 'string' ? body.city.trim() : '';
    const solutionTrack =
      typeof body?.solutionTrack === 'string'
        ? body.solutionTrack.trim()
        : typeof body?.product === 'string'
        ? body.product.trim()
        : 'General Platform Overview';
    const message = typeof body?.message === 'string' ? body.message.trim() : '';

    if (!name || name.length < 2 || name.length > 100) {
      errors.name = 'Please provide a valid contact name (2-100 characters).';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      errors.email = 'Please provide a valid business email address.';
    }

    const cleanPhone = phone.replace(/[^\d+]/g, '');
    if (!phone || cleanPhone.length < 7 || cleanPhone.length > 20) {
      errors.phone = 'Please provide a valid phone number (at least 7 digits).';
    }

    if (Object.keys(errors).length > 0) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        errors,
      });
    }

    // Rate limiting per Email
    const emailLower = email.toLowerCase();
    const emailEntry = emailRateLimits.get(emailLower);
    if (emailEntry && emailEntry.resetAt > now) {
      if (emailEntry.count >= 3) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many demo requests for this email address. Please try again later.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      emailEntry.count++;
    } else {
      emailRateLimits.set(emailLower, { count: 1, resetAt: now + 60 * 60 * 1000 });
    }

    // 7. Resolve PLATFORM_LEADS_TENANT_ID
    const targetTenantId = process.env.PLATFORM_LEADS_TENANT_ID;
    if (!targetTenantId) {
      this.logger.error('PLATFORM_LEADS_TENANT_ID is not configured in environment.');
      throw new InternalServerErrorException('Demo requests are currently not configured.');
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [
          { id: targetTenantId },
          { code: targetTenantId },
        ],
        status: 'active',
        deletedAt: null,
      },
      select: { id: true, code: true, status: true, deletedAt: true },
    });

    if (!tenant) {
      this.logger.error(`Target demo tenant ${targetTenantId} not found or inactive.`);
      throw new InternalServerErrorException('Configured demo workspace is not active.');
    }

    // 8. Duplicate check within target tenant
    const normPhone = phone ? phone.replace(/[^0-9]/g, '').slice(-10) : '';
    if (normPhone && normPhone.length >= 7) {
      const existing = await this.prisma.lead.findFirst({
        where: {
          tenantId: tenant.id,
          customerPhone: { contains: normPhone },
          deletedAt: null,
        },
      });
      if (existing) {
        try {
          await this.prisma.leadActivity.create({
            data: {
              leadId: existing.id,
              type: 'note',
              title: 'Demo Walkthrough Request (Duplicate Submission)',
              description: `Track: ${solutionTrack || 'General'}, Note: ${message || 'Rapid redelivery'}`,
            },
          });
        } catch {}
        return res.status(HttpStatus.OK).json({
          status: 'SUCCESS',
          message: 'Demo walkthrough request registered successfully (existing contact updated)',
          referenceNumber: randomRef,
          leadNumber: existing.leadNumber,
          isDuplicate: true,
        });
      }
    }

    // 9. Create Lead in target tenant
    const prefix = tenant.code ? `${tenant.code}-LD` : 'LD';
    const count = await this.prisma.lead.count({ where: { tenantId: tenant.id } });
    const leadNumber = `${prefix}-${String(count + 1).padStart(5, '0')}`;

    let lead;
    try {
      lead = await this.prisma.lead.create({
        data: {
          tenantId: tenant.id,
          leadNumber,
          source: 'website_demo',
          status: 'new',
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
          city: city || undefined,
          productCategory: solutionTrack,
          queryMessage: message ? `[Track: ${solutionTrack}] ${message}` : `[Track: ${solutionTrack}] Walkthrough request`,
          rawPayload: JSON.stringify({
            source: 'website_demo',
            solutionTrack,
            company,
            ip,
            userAgent: req.headers['user-agent'] || 'unknown',
            referenceNumber: randomRef,
          }),
        },
      });
    } catch (err: any) {
      // Handle race condition: check if a concurrent request created the lead
      if (normPhone && normPhone.length >= 7) {
        const existing = await this.prisma.lead.findFirst({
          where: {
            tenantId: tenant.id,
            customerPhone: { contains: normPhone },
            deletedAt: null,
          },
        });
        if (existing) {
          try {
            await this.prisma.leadActivity.create({
              data: {
                leadId: existing.id,
                type: 'note',
                title: 'Demo Walkthrough Request (Concurrent Submission)',
                description: `Track: ${solutionTrack || 'General'}, Note: ${message || 'Concurrent submission handled'}`,
              },
            });
          } catch {}
          return res.status(HttpStatus.OK).json({
            status: 'SUCCESS',
            message: 'Demo walkthrough request registered successfully',
            referenceNumber: randomRef,
            leadNumber: existing.leadNumber,
            isDuplicate: true,
          });
        }
      }
      throw err;
    }

    this.logger.log(`Created website_demo lead ${lead.leadNumber} (Ref: ${randomRef}) for tenant ${targetTenantId}`);

    return res.status(HttpStatus.OK).json({
      status: 'SUCCESS',
      message: 'Demo walkthrough request registered successfully',
      referenceNumber: randomRef,
      leadNumber: lead.leadNumber,
    });
  }
}
