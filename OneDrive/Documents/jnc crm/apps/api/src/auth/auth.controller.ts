/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  Controller,
  Post,
  Patch,
  Body,
  Req,
  Res,
  Get,
  UseGuards,
  UsePipes,
  ValidationPipe,
  ForbiddenException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService, formatAuthUser } from './auth.service';
import {
  LoginDto,
  SelectCompanyDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RefreshTokenDto,
  UpdateProfileDto,
  ChangePasswordDto,
} from './dto/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from './current-user.decorator';
import { Response, Request } from 'express';
import { isAllowedOrigin } from '../common/cors-config';
import {
  AUTH_COOKIE_PATH,
  REFRESH_COOKIE_NAME,
  SESSION_ACTIVE_COOKIE_NAME,
  getRefreshCookieOptions,
  getSessionIndicatorCookieOptions,
  isSecureCookie,
} from '../common/cookie.util';

function enforceCsrf(req: Request) {
  // 1. Require custom header X-Requested-With
  const xRequestedWith = req.headers['x-requested-with'];
  if (!xRequestedWith || xRequestedWith !== 'XMLHttpRequest') {
    throw new ForbiddenException('CSRF validation failed: Missing or invalid X-Requested-With header.');
  }

  // 2. Validate Origin if provided
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin, process.env.FRONTEND_URL)) {
    throw new ForbiddenException(`CSRF validation failed: Origin '${origin}' is not permitted.`);
  }
}

@Controller('auth')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class AuthController {
  constructor(private authService: AuthService) {}

  /** Staff login — IP rate limit: 10 attempts / 15 min (relaxed in dev/test) */
  @Throttle({ default: { limit: process.env.NODE_ENV === 'production' ? 10 : 100, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;
    const result: any = await this.authService.login(loginDto, ip, userAgent);

    if (result && result.refreshToken) {
      const keepSignedIn = Boolean(loginDto.keepSignedIn);
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions(AUTH_COOKIE_PATH, keepSignedIn));
      res.cookie(SESSION_ACTIVE_COOKIE_NAME, '1', getSessionIndicatorCookieOptions(keepSignedIn));
      return result;
    }
    return result;
  }

  /** Second step when multiple companies match — exchange selectionToken for real tokens */
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login/select-company')
  async selectCompany(
    @Body() dto: SelectCompanyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;
    const result: any = await this.authService.selectCompany(dto, ip, userAgent);

    if (result && result.refreshToken) {
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions(AUTH_COOKIE_PATH, false));
      res.cookie(SESSION_ACTIVE_COOKIE_NAME, '1', getSessionIndicatorCookieOptions(false));
      return result;
    }
    return result;
  }

  /** Forgot password — sends reset link if email exists (no reveal) — rate limit: 15 / 15 min */
  @Throttle({ default: { limit: 15, ttl: 900000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress;
    const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : undefined);
    return this.authService.forgotPassword(dto, ip, origin);
  }

  /** Reset password with token from email link — rate limit: 5 / 15 min */
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  /** Refresh token rotation with CSRF protection */
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Body() refreshDto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    enforceCsrf(req);

    const tokenFromCookie = (req as any).cookies?.[REFRESH_COOKIE_NAME];
    const rawRefreshToken = tokenFromCookie || refreshDto.refreshToken;

    const ip = req.ip || req.socket?.remoteAddress;
    const result = await this.authService.refreshToken(rawRefreshToken, ip);

    if (result && result.refreshToken) {
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions(AUTH_COOKIE_PATH, false));
      res.cookie(SESSION_ACTIVE_COOKIE_NAME, '1', getSessionIndicatorCookieOptions(false));
      return result;
    }
    return result;
  }

  /** User logout — revokes server-side refresh token and clears cookie */
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    enforceCsrf(req);

    const tokenFromCookie = (req as any).cookies?.[REFRESH_COOKIE_NAME];
    const ip = req.ip || req.socket?.remoteAddress;
    await this.authService.logout(tokenFromCookie, undefined, ip);

    res.clearCookie(REFRESH_COOKIE_NAME, {
      path: AUTH_COOKIE_PATH,
      httpOnly: true,
      sameSite: 'strict',
      secure: isSecureCookie(),
    });
    // Also clear legacy path if any
    res.clearCookie(REFRESH_COOKIE_NAME, {
      path: '/api/v1',
      httpOnly: true,
      sameSite: 'strict',
      secure: isSecureCookie(),
    });
    res.clearCookie(SESSION_ACTIVE_COOKIE_NAME, {
      path: '/',
      httpOnly: false,
      sameSite: 'strict',
      secure: isSecureCookie(),
    });
    res.setHeader('Clear-Site-Data', '"cache", "storage"');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return { success: true, message: 'Logged out successfully' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('recent-signins')
  async getRecentSignIns(@CurrentUser() user: any) {
    if (user.role !== 'admin' && user.role !== 'tenant_admin' && user.role !== 'platform_super_admin') {
      throw new ForbiddenException('You do not have permission to view sign-in logs.');
    }
    return this.authService.getRecentSignIns(user.tenantId, 25);
  }

  /** Sign out of all devices (increments tokenVersion and revokes all refresh tokens) */
  @UseGuards(AuthGuard('jwt'))
  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: any,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    enforceCsrf(req);

    const ip = req.ip || req.socket?.remoteAddress;
    await this.authService.logoutAll(user.id, ip);

    res.clearCookie(REFRESH_COOKIE_NAME, {
      path: AUTH_COOKIE_PATH,
      httpOnly: true,
      sameSite: 'strict',
      secure: isSecureCookie(),
    });
    res.clearCookie(SESSION_ACTIVE_COOKIE_NAME, {
      path: '/',
      httpOnly: false,
      sameSite: 'strict',
      secure: isSecureCookie(),
    });
    res.setHeader('Clear-Site-Data', '"cache", "storage"');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return { success: true, message: 'Signed out of all devices successfully' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async getProfile(@CurrentUser() user: any) {
    return formatAuthUser(user);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('profile')
  async updateProfile(
    @CurrentUser() user: any,
    @Body() body: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.id, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: any,
    @Body() body: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    const result: any = await this.authService.changePassword(user.id, body.currentPass, body.newPass, ip);

    if (result && result.refreshToken) {
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions(AUTH_COOKIE_PATH, false));
      res.cookie(SESSION_ACTIVE_COOKIE_NAME, '1', getSessionIndicatorCookieOptions(false));
      const { refreshToken, ...rest } = result;
      return rest;
    }

    return result;
  }
}
