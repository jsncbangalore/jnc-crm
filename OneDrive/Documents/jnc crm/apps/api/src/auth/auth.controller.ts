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
  Delete,
  Param,
  Body,
  Req,
  Res,
  Get,
  UseGuards,
  UsePipes,
  ValidationPipe,
  ForbiddenException,
  UnauthorizedException,
  ConflictException,
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
  ForgotPasswordRequestDto,
  ForgotPasswordLookupDto,
  ForgotPasswordVerifyPhoneDto,
  ForgotPasswordVerifyDto,
  ForgotPasswordResetDto,
  ForgotPasswordStartDto,
  ForgotPasswordVerifyPhoneFlowDto,
  ForgotPasswordVerifyEmailDto,
  ForgotPasswordSendCodeDto,
  ForgotPasswordVerifyCodeFlowDto,
  RequestPhoneChangeDto,
  VerifyPhoneChangeDto,
  RequestEmailChangeDto,
  VerifyEmailChangeDto,
  UpdateProfileDto,
  ChangePasswordDto,
  VerifyTwoFactorDto,
  SendTwoFactorEmailDto,
  EnableTwoFactorDto,
  RegenerateBackupCodesDto,
  DisableTwoFactorDto,
} from './dto/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from './current-user.decorator';
import { Response, Request } from 'express';
import { isAllowedOrigin } from '../common/cors-config';
import { Public, AuthOnly, PageAccess } from './page-access.decorator';
import { RolesGuard } from './roles.guard';
import {
  AUTH_COOKIE_PATH,
  REFRESH_COOKIE_NAME,
  PLATFORM_REFRESH_COOKIE_NAME,
  SESSION_ACTIVE_COOKIE_NAME,
  TRUSTED_DEVICE_COOKIE_NAME,
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
@AuthOnly()
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class AuthController {
  constructor(private authService: AuthService) {}

  /** Staff login — IP rate limit: 10 attempts / 15 min (relaxed in dev/test) */
  @Throttle({ default: { limit: process.env.NODE_ENV === 'production' ? 10 : 100, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @Public()
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;
    const trustedDeviceToken = (req as any).cookies?.[TRUSTED_DEVICE_COOKIE_NAME] || (req.headers['x-trusted-device'] as string | undefined);
    const result: any = await this.authService.login(loginDto, ip, userAgent, trustedDeviceToken);

    if (result && result.refreshToken) {
      const keepSignedIn = loginDto.keepSignedIn !== undefined ? Boolean(loginDto.keepSignedIn) : true;
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
  @Public()
  async selectCompany(
    @Body() dto: SelectCompanyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;
    const trustedDeviceToken = (req as any).cookies?.[TRUSTED_DEVICE_COOKIE_NAME] || (req.headers['x-trusted-device'] as string | undefined);
    const result: any = await this.authService.selectCompany(dto, ip, userAgent, trustedDeviceToken);

    if (result && result.refreshToken) {
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions(AUTH_COOKIE_PATH, true));
      res.cookie(SESSION_ACTIVE_COOKIE_NAME, '1', getSessionIndicatorCookieOptions(true));
      return result;
    }
    return result;
  }

  /** Second step of login: verify 2-step verification code (TOTP, backup code, or email OTP) */
  @Throttle({ default: { limit: 15, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login/verify-2fa')
  @Public()
  async verifyTwoFactor(
    @Body() dto: VerifyTwoFactorDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;
    const result: any = await this.authService.verifyTwoFactor(dto, ip, userAgent);

    if (result && result.refreshToken) {
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions(AUTH_COOKIE_PATH, true));
      res.cookie(SESSION_ACTIVE_COOKIE_NAME, '1', getSessionIndicatorCookieOptions(true));
    }
    if (result && result.trustedDeviceCookie) {
      res.cookie(
        result.trustedDeviceCookie.name,
        result.trustedDeviceCookie.value,
        result.trustedDeviceCookie.options,
      );
      delete result.trustedDeviceCookie;
    }
    return result;
  }

  /** Optional email code resend for 2-step verification (regular users only) */
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login/send-2fa-email')
  @Public()
  async sendTwoFactorEmail(
    @Body() dto: SendTwoFactorEmailDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;
    return this.authService.sendTwoFactorEmail(dto.loginTicket, ip, userAgent);
  }

  /** Returns current password policy rules and public sender address */
  @Get('password-policy')
  @Public()
  getPasswordPolicy() {
    return this.authService.getPasswordPolicy();
  }

  /** Step 1: Start hardened forgot password flow — rate limit: 15 / 15 min */
  @Throttle({ default: { limit: 15, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password/start')
  @Public()
  async forgotPasswordStart(@Body() dto: ForgotPasswordStartDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;
    return this.authService.forgotPasswordStart(dto, ip, userAgent);
  }

  /** Forgot password account lookup (legacy compatibility) — rate limit: 15 / 15 min */
  @Throttle({ default: { limit: 15, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password/lookup')
  @Public()
  async forgotPasswordLookup(@Body() dto: ForgotPasswordLookupDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.authService.forgotPasswordLookup(dto, ip);
  }

  /** Step 2: Forgot password verify registered mobile phone — rate limit: 15 / 15 min */
  @Throttle({ default: { limit: 15, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password/verify-phone')
  @Public()
  async forgotPasswordVerifyPhone(@Body() dto: any, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress;
    if (dto && dto.flowId) {
      return this.authService.forgotPasswordVerifyPhoneFlow(dto, ip);
    }
    return this.authService.forgotPasswordVerifyPhone(dto, ip);
  }

  /** Step 3: Verify registered email — rate limit: 15 / 15 min */
  @Throttle({ default: { limit: 15, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password/verify-email')
  @Public()
  async forgotPasswordVerifyEmail(@Body() dto: ForgotPasswordVerifyEmailDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.authService.forgotPasswordVerifyEmailFlow(dto, ip);
  }

  /** Step 4: Dispatch OTP to registered email — rate limit: 15 / 15 min */
  @Throttle({ default: { limit: 15, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password/send-code')
  @Public()
  async forgotPasswordSendCode(@Body() dto: ForgotPasswordSendCodeDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;
    return this.authService.forgotPasswordSendCode(dto, ip, userAgent);
  }

  /** Step 5: Verify OTP code and issue reset ticket — rate limit: 15 / 15 min */
  @Throttle({ default: { limit: 15, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password/verify-code')
  @Public()
  async forgotPasswordVerifyCode(@Body() dto: ForgotPasswordVerifyCodeFlowDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.authService.forgotPasswordVerifyCodeFlow(dto, ip);
  }

  /** Forgot password OTP request — rate limit: 15 / 15 min */
  @Throttle({ default: { limit: 15, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password/request')
  @Public()
  async forgotPasswordRequest(@Body() dto: ForgotPasswordRequestDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;
    return this.authService.forgotPasswordRequest(dto, ip, userAgent);
  }

  /** Forgot password OTP verify — rate limit: 15 / 15 min */
  @Throttle({ default: { limit: 15, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password/verify')
  @Public()
  async forgotPasswordVerify(@Body() dto: ForgotPasswordVerifyDto) {
    return this.authService.forgotPasswordVerify(dto);
  }

  /** Forgot password OTP reset — rate limit: 5 / 15 min */
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password/reset')
  @Public()
  async forgotPasswordReset(@Body() dto: ForgotPasswordResetDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.authService.forgotPasswordReset(dto, ip);
  }

  /** Forgot password backward compatible endpoint */
  @Throttle({ default: { limit: 15, ttl: 900000 } })
  @Post('forgot-password')
  @Public()
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;
    return this.authService.forgotPassword(dto, ip, userAgent);
  }

  /** Reset password endpoint (kept backward-compatible for one release) */
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @Post('reset-password')
  @Public()
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.authService.resetPassword(dto, ip);
  }

  /** Refresh token rotation with CSRF protection */
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @Public()
  async refresh(
    @Body() refreshDto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    enforceCsrf(req);

    const legacyRefresh = process.env.LEGACY_REFRESH_COOKIE || 'legacy_refresh_token';
    const tokenFromCookie = (req as any).cookies?.[REFRESH_COOKIE_NAME] || (req as any).cookies?.[legacyRefresh];
    const rawRefreshToken = tokenFromCookie || refreshDto.refreshToken;

    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;
    const expectedUserId = (req.headers['x-expected-user-id'] as string) || refreshDto.expectedUserId;
    const result = await this.authService.refreshToken(rawRefreshToken, ip, userAgent, expectedUserId);

    if (result && result.refreshToken) {
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions(AUTH_COOKIE_PATH, true));
      res.cookie(SESSION_ACTIVE_COOKIE_NAME, '1', getSessionIndicatorCookieOptions(true));
      return result;
    }
    return result;
  }

  /** User logout — revokes server-side refresh token and clears cookie */
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  @Public()
  async logout(
    @Body() body: any,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    enforceCsrf(req);

    const legacyRefresh = process.env.LEGACY_REFRESH_COOKIE || 'legacy_refresh_token';
    const tokenFromCookie = (req as any).cookies?.[REFRESH_COOKIE_NAME] || (req as any).cookies?.[legacyRefresh];
    const ip = req.ip || req.socket?.remoteAddress;
    const expectedUserId = body?.expectedUserId;
    await this.authService.logout(tokenFromCookie, expectedUserId, ip);

    res.clearCookie(REFRESH_COOKIE_NAME, {
      path: AUTH_COOKIE_PATH,
      httpOnly: true,
      sameSite: 'strict',
      secure: isSecureCookie(),
    });
    // Also clear legacy cookie name & paths
    res.clearCookie(legacyRefresh, {
      path: AUTH_COOKIE_PATH,
      httpOnly: true,
      sameSite: 'strict',
      secure: isSecureCookie(),
    });
    res.clearCookie(REFRESH_COOKIE_NAME, {
      path: '/api/v1',
      httpOnly: true,
      sameSite: 'strict',
      secure: isSecureCookie(),
    });
    res.clearCookie(legacyRefresh, {
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
    const legacySessionActive = process.env.LEGACY_SESSION_COOKIE || 'legacy_session_active';
    res.clearCookie(legacySessionActive, {
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

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @PageAccess('audit_logs')
  @Get('recent-signins')
  async getRecentSignIns(@CurrentUser() user: any) {
    if (user.role !== 'admin' && user.role !== 'tenant_admin' && user.role !== 'platform_super_admin') {
      throw new ForbiddenException('You do not have permission to view sign-in logs.');
    }
    return this.authService.getRecentSignIns(user.tenantId, 25);
  }

  /** Sign out of all devices (increments tokenVersion and revokes all refresh tokens) */
  @Post('logout-all')
  @Public()
  async logoutAll(
    @Body() body: any,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    enforceCsrf(req);

    let targetUserId: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const currentUser = await this.authService.validateAccessToken(token);
      if (currentUser?.id) {
        targetUserId = currentUser.id;
      }
    }

    const legacyRefresh = process.env.LEGACY_REFRESH_COOKIE || 'legacy_refresh_token';
    const tokenFromCookie = (req as any).cookies?.[REFRESH_COOKIE_NAME] || (req as any).cookies?.[legacyRefresh];
    if (tokenFromCookie) {
      const sessionUser = await this.authService.validateSessionFromCookie(tokenFromCookie);
      if (sessionUser?.id) {
        if (targetUserId && targetUserId !== sessionUser.id) {
          throw new ConflictException({
            statusCode: HttpStatus.CONFLICT,
            error: 'Conflict',
            code: 'SESSION_CHANGED',
            message: 'Session changed in another tab or window.',
          });
        }
        targetUserId = sessionUser.id;
      }
    }

    if (!targetUserId) {
      throw new UnauthorizedException('Not authenticated');
    }

    const ip = req.ip || req.socket?.remoteAddress;
    const expectedUserId = body?.expectedUserId;
    await this.authService.logoutAll(targetUserId, expectedUserId, ip);

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

  /** Read-only session probe returning strictly {signedIn, displayName, portal} — rate limited */
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get('session-probe')
  @Public()
  async sessionProbe(@Req() req: Request) {
    const legacyRefresh = process.env.LEGACY_REFRESH_COOKIE || 'legacy_refresh_token';
    const legacyPlatformRefresh = process.env.LEGACY_PLATFORM_REFRESH_COOKIE || 'legacy_platform_refresh';
    const tokenFromCookie =
      (req as any).cookies?.[REFRESH_COOKIE_NAME] ||
      (req as any).cookies?.[PLATFORM_REFRESH_COOKIE_NAME] ||
      (req as any).cookies?.[legacyRefresh] ||
      (req as any).cookies?.[legacyPlatformRefresh];

    if (!tokenFromCookie) {
      return { signedIn: false, displayName: null, portal: null };
    }

    const sessionUser = await this.authService.validateSessionFromCookie(tokenFromCookie);
    if (!sessionUser) {
      return { signedIn: false, displayName: null, portal: null };
    }

    const portal = sessionUser.role === 'platform_super_admin' && !sessionUser.tenantId ? 'platform' : 'staff';
    return {
      signedIn: true,
      displayName: sessionUser.name,
      portal,
    };
  }

  /** Protected user profile & effective page access data */
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async getProfile(@Req() req: Request, @CurrentUser() user: any) {
    let currentUser = user;
    if (!currentUser) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        currentUser = await this.authService.validateAccessToken(token);
      }
    }

    if (!currentUser) {
      throw new UnauthorizedException('Not authenticated');
    }

    const effectivePages = await this.authService.getEffectivePages(currentUser);
    return formatAuthUser(currentUser, effectivePages);
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
    const userAgent = req.headers['user-agent'] as string | undefined;
    const result: any = await this.authService.changePassword(
      user.id,
      body.currentPass,
      body.newPass,
      ip,
      userAgent,
      body.logoutOthers ?? true,
    );

    if (result && result.refreshToken) {
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions(AUTH_COOKIE_PATH, false));
      res.cookie(SESSION_ACTIVE_COOKIE_NAME, '1', getSessionIndicatorCookieOptions(false));
      const { refreshToken, ...rest } = result;
      return rest;
    }

    return result;
  }

  // ─── My Account: Active Sessions Management ────────────────────────────────

  @UseGuards(AuthGuard('jwt'))
  @Get('sessions')
  async getSessions(@CurrentUser() user: any, @Req() req: Request) {
    const tokenFromCookie = (req as any).cookies?.[REFRESH_COOKIE_NAME];
    return this.authService.getUserSessions(user.id, tokenFromCookie);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('sessions/:id')
  async revokeSession(
    @CurrentUser() user: any,
    @Param('id') sessionId: string,
    @Req() req: Request,
  ) {
    enforceCsrf(req);
    const ip = req.ip || req.socket?.remoteAddress;
    return this.authService.revokeSession(user.id, sessionId, ip);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('sessions')
  async revokeOtherSessions(
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    enforceCsrf(req);
    const tokenFromCookie = (req as any).cookies?.[REFRESH_COOKIE_NAME];
    const ip = req.ip || req.socket?.remoteAddress;
    return this.authService.revokeOtherSessions(user.id, tokenFromCookie, ip);
  }

  // ─── My Account: Sign-In Activity ──────────────────────────────────────────

  @UseGuards(AuthGuard('jwt'))
  @Get('activity')
  async getActivity(@CurrentUser() user: any) {
    return this.authService.getUserSignInActivity(user.id, 25);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('security-alert/signout-and-reset')
  async reportSuspiciousActivity(
    @CurrentUser() user: any,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    enforceCsrf(req);
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;

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

    return this.authService.reportSuspiciousActivityAndReset(user.id, ip, userAgent);
  }

  // ─── My Account: Email Change OTP ──────────────────────────────────────────

  @UseGuards(AuthGuard('jwt'))
  @Post('profile/email/request-otp')
  async requestEmailChangeOtp(
    @CurrentUser() user: any,
    @Body() body: RequestEmailChangeDto,
    @Req() req: Request,
  ) {
    enforceCsrf(req);
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;
    return this.authService.requestEmailChange(user.id, body.currentPassword, body.newEmail, ip, userAgent);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('profile/email/verify-otp')
  async verifyEmailChangeOtp(
    @CurrentUser() user: any,
    @Body() body: VerifyEmailChangeDto,
    @Req() req: Request,
  ) {
    enforceCsrf(req);
    return this.authService.verifyEmailChange(user.id, body.newEmail, body.code);
  }

  // ─── My Account: Mobile Phone Change OTP ────────────────────────────────────

  @UseGuards(AuthGuard('jwt'))
  @Post('profile/phone/request-otp')
  async requestPhoneChangeOtp(
    @CurrentUser() user: any,
    @Body() body: RequestPhoneChangeDto,
    @Req() req: Request,
  ) {
    enforceCsrf(req);
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;
    return this.authService.requestPhoneChange(user.id, body.currentPassword, body.newPhone, ip, userAgent);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('profile/phone/verify-otp')
  async verifyPhoneChangeOtp(
    @CurrentUser() user: any,
    @Body() body: VerifyPhoneChangeDto,
    @Req() req: Request,
  ) {
    enforceCsrf(req);
    return this.authService.verifyPhoneChange(user.id, body.newPhone, body.code);
  }

  // ─── 2-Step Verification (2FA) Endpoints ────────────────────────────────────

  private async resolveUserIdFromRequest(req: Request): Promise<string> {
    const authHeader = req.headers.authorization;
    const setupHeader = req.headers['x-setup-token'] as string | undefined;
    const token = setupHeader || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);
    return this.authService.resolveUserIdFromAuthOrSetupToken((req as any).user, token || undefined);
  }

  /** 2FA Status: returns whether 2FA is enabled, method, remaining backup codes, grace period */
  @Get('2fa/status')
  @Public()
  async getTwoFactorStatus(@Req() req: Request) {
    const userId = await this.resolveUserIdFromRequest(req);
    return this.authService.getTwoFactorStatus(userId);
  }

  /** 2FA Setup: generates TOTP secret and otpauth URI (never logged) */
  @Post('2fa/setup')
  @Public()
  async setupTwoFactor(@Req() req: Request) {
    const userId = await this.resolveUserIdFromRequest(req);
    return this.authService.setupTwoFactor(userId);
  }

  /** 2FA Enable: verifies code, enables TOTP, and issues 10 backup codes once */
  @HttpCode(HttpStatus.OK)
  @Post('2fa/enable')
  @Public()
  async enableTwoFactor(
    @Body() dto: EnableTwoFactorDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = await this.resolveUserIdFromRequest(req);
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;
    const result: any = await this.authService.enableTwoFactor(userId, dto.code, ip, userAgent);

    if (result && result.refreshToken) {
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions(AUTH_COOKIE_PATH, true));
      res.cookie(SESSION_ACTIVE_COOKIE_NAME, '1', getSessionIndicatorCookieOptions(true));
    }
    return result;
  }

  /** 2FA Regenerate Backup Codes: requires current password and current TOTP code */
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  @Post('2fa/backup-codes/regenerate')
  async regenerateBackupCodes(
    @CurrentUser() user: any,
    @Body() dto: RegenerateBackupCodesDto,
    @Req() req: Request,
  ) {
    enforceCsrf(req);
    return this.authService.regenerateBackupCodes(user.id, dto);
  }

  /** 2FA Disable: requires current password and current TOTP code (blocked if enforced by policy) */
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  @Post('2fa/disable')
  async disableTwoFactor(
    @CurrentUser() user: any,
    @Body() dto: DisableTwoFactorDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    enforceCsrf(req);
    res.clearCookie(TRUSTED_DEVICE_COOKIE_NAME, { path: '/' });
    return this.authService.disableTwoFactor(user.id, dto);
  }

  // ─── Trusted Devices Management (Devices Tab) ───────────────────────────────

  @UseGuards(AuthGuard('jwt'))
  @Get('devices/trusted')
  async getTrustedDevices(@CurrentUser() user: any) {
    return this.authService.getTrustedDevices(user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('devices/trusted/:id')
  async revokeTrustedDevice(
    @CurrentUser() user: any,
    @Param('id') deviceId: string,
    @Req() req: Request,
  ) {
    enforceCsrf(req);
    return this.authService.revokeTrustedDevice(user.id, deviceId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('devices/trusted')
  async revokeAllTrustedDevices(
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    enforceCsrf(req);
    return this.authService.revokeAllTrustedDevices(user.id);
  }
}
