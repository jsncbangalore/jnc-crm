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
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  LoginDto,
  SelectCompanyDto,
  PlatformLoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RefreshTokenDto,
  UpdateProfileDto,
  ChangePasswordDto,
} from './dto/login.dto';
import { isAllowedOrigin } from '../common/cors-config';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from './current-user.decorator';
import { Response, Request } from 'express';

const REFRESH_COOKIE_NAME = 'jnc_refresh_token';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

function enforceCsrf(req: Request) {
  // 1. Require custom header X-Requested-With
  const xRequestedWith = req.headers['x-requested-with'];
  if (!xRequestedWith || xRequestedWith !== 'XMLHttpRequest') {
    throw new ForbiddenException('CSRF validation failed: Missing or invalid X-Requested-With header.');
  }

  // 2. Validate Origin if provided
  const origin = req.headers.origin;
  if (origin) {
    if (!isAllowedOrigin(origin)) {
      throw new ForbiddenException(`CSRF validation failed: Origin '${origin}' is not permitted.`);
    }
  }
}

@Controller('auth')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class AuthController {
  constructor(private authService: AuthService) {}

  /** Staff login — IP rate limit: 10 attempts / 15 min */
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    const result: any = await this.authService.login(loginDto, ip);

    if (result && result.refreshToken) {
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    }
    return result;
  }

  /** Second step when multiple companies match — exchange selectionToken for real tokens */
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  @Post('login/select-company')
  async selectCompany(
    @Body() dto: SelectCompanyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    const result: any = await this.authService.selectCompany(dto, ip);

    if (result && result.refreshToken) {
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    }
    return result;
  }

  /** Platform super-admin only — rate limit: 5 attempts / 15 min */
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @Post('platform-login')
  async platformLogin(
    @Body() dto: PlatformLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    const result: any = await this.authService.platformLogin(dto, ip);

    if (result && result.refreshToken) {
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    }
    return result;
  }

  /** Forgot password — sends reset link if email exists (no reveal) — rate limit: 5 / 15 min */
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.authService.forgotPassword(dto, ip);
  }

  /** Reset password with token from email link — rate limit: 5 / 15 min */
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  /** Refresh token rotation with CSRF protection */
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
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    }
    return result;
  }

  /** User logout — revokes server-side refresh token and clears cookie */
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    enforceCsrf(req);

    const tokenFromCookie = (req as any).cookies?.[REFRESH_COOKIE_NAME];
    const ip = req.ip || req.socket?.remoteAddress;
    await this.authService.logout(tokenFromCookie, undefined, ip);

    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
    return { success: true, message: 'Logged out successfully' };
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

    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
    return { success: true, message: 'Signed out of all devices successfully' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async getProfile(@CurrentUser() user: any) {
    return user;
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
  ) {
    return this.authService.changePassword(user.id, body.currentPass, body.newPass);
  }
}
