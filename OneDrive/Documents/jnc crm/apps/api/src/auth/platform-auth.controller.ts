/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  UsePipes,
  ValidationPipe,
  ForbiddenException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { PlatformLoginDto, RefreshTokenDto } from './dto/login.dto';
import { Response, Request } from 'express';
import { isAllowedOrigin } from '../common/cors-config';

const PLATFORM_REFRESH_COOKIE = 'jnc_platform_refresh';

function getPlatformRefreshCookieOptions() {
  const isSecure =
    process.env.COOKIE_SECURE === 'false'
      ? false
      : (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging');
  const cookieDomain =
    process.env.COOKIE_DOMAIN ||
    (process.env.NODE_ENV === 'production' ? '.jsnc.co.in' : undefined);
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax' as const,
    path: '/api/v1',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  };
}

function enforceCsrf(req: Request) {
  const xRequestedWith = req.headers['x-requested-with'];
  if (!xRequestedWith || xRequestedWith !== 'XMLHttpRequest') {
    throw new ForbiddenException('CSRF validation failed: Missing or invalid X-Requested-With header.');
  }

  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin, process.env.FRONTEND_URL)) {
    throw new ForbiddenException(`CSRF validation failed: Origin '${origin}' is not permitted.`);
  }
}

@Controller('platform-auth')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class PlatformAuthController {
  constructor(private authService: AuthService) {}

  /** Platform super-admin only — rate limit: 10 attempts / 15 min (relaxed in dev/test) */
  @Throttle({ default: { limit: process.env.NODE_ENV === 'production' ? 10 : 100, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: PlatformLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    const result: any = await this.authService.platformLogin(dto, ip);

    if (result && result.refreshToken) {
      res.cookie(PLATFORM_REFRESH_COOKIE, result.refreshToken, getPlatformRefreshCookieOptions());
      return result;
    }
    return result;
  }

  /** Platform refresh token rotation with CSRF protection */
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Body() refreshDto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    enforceCsrf(req);

    const tokenFromCookie = (req as any).cookies?.[PLATFORM_REFRESH_COOKIE];
    const rawRefreshToken = tokenFromCookie || refreshDto.refreshToken;

    const ip = req.ip || req.socket?.remoteAddress;
    const result = await this.authService.refreshPlatformToken(rawRefreshToken, ip);

    if (result && result.refreshToken) {
      res.cookie(PLATFORM_REFRESH_COOKIE, result.refreshToken, getPlatformRefreshCookieOptions());
      return result;
    }
    return result;
  }

  /** Platform logout — revokes server-side refresh token and clears cookie */
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    enforceCsrf(req);

    const tokenFromCookie = (req as any).cookies?.[PLATFORM_REFRESH_COOKIE];
    const ip = req.ip || req.socket?.remoteAddress;
    await this.authService.logout(tokenFromCookie, undefined, ip);

    const cookieOpts = getPlatformRefreshCookieOptions();
    res.clearCookie(PLATFORM_REFRESH_COOKIE, {
      path: '/api/v1',
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieOpts.secure,
      ...(cookieOpts.domain ? { domain: cookieOpts.domain } : {}),
    });
    res.clearCookie(PLATFORM_REFRESH_COOKIE, {
      path: '/api/v1/platform-auth',
      httpOnly: true,
      sameSite: 'strict',
      secure: cookieOpts.secure,
    });
    res.setHeader('Clear-Site-Data', '"cache", "storage"');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return { success: true, message: 'Platform super-admin logged out successfully' };
  }
}
