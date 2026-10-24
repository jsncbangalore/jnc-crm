import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UsePipes,
  UseGuards,
  ValidationPipe,
  ForbiddenException,
  UnauthorizedException,
  ConflictException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { AuthService, formatAuthUser } from './auth.service';
import { PlatformLoginDto, RefreshTokenDto, VerifyTwoFactorDto, SendTwoFactorEmailDto } from './dto/login.dto';
import { Response, Request } from 'express';
import { isAllowedOrigin } from '../common/cors-config';
import { CurrentUser } from './current-user.decorator';
import { Public, AuthOnly } from './page-access.decorator';
import {
  AUTH_COOKIE_PATH,
  PLATFORM_AUTH_COOKIE_PATH,
  REFRESH_COOKIE_NAME,
  PLATFORM_REFRESH_COOKIE_NAME,
  PLATFORM_SESSION_ACTIVE_COOKIE_NAME,
  TRUSTED_DEVICE_COOKIE_NAME,
  getRefreshCookieOptions,
  getSessionIndicatorCookieOptions,
  isSecureCookie,
} from '../common/cookie.util';

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
@AuthOnly()
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class PlatformAuthController {
  constructor(private authService: AuthService) {}

  /** Platform super-admin only — rate limit: 10 attempts / 15 min (relaxed in dev/test) */
  @Throttle({ default: { limit: process.env.NODE_ENV === 'production' ? 10 : 100, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @Public()
  async login(
    @Body() dto: PlatformLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;
    const trustedDeviceToken = (req as any).cookies?.[TRUSTED_DEVICE_COOKIE_NAME] || (req.headers['x-trusted-device'] as string | undefined);
    // Platform super-admins NEVER get keepSignedIn (enforced false)
    const result: any = await this.authService.platformLogin({ ...dto, keepSignedIn: false }, ip, userAgent, trustedDeviceToken);

    if (result && result.refreshToken) {
      res.cookie(PLATFORM_REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions(PLATFORM_AUTH_COOKIE_PATH, false));
      res.cookie(PLATFORM_SESSION_ACTIVE_COOKIE_NAME, '1', getSessionIndicatorCookieOptions(false));
      return result;
    }
    return result;
  }

  /** Platform 2FA Verification — single-use ticket */
  @Throttle({ default: { limit: 15, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @Post('verify-2fa')
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
      res.cookie(PLATFORM_REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions(PLATFORM_AUTH_COOKIE_PATH, false));
      res.cookie(PLATFORM_SESSION_ACTIVE_COOKIE_NAME, '1', getSessionIndicatorCookieOptions(false));
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

  /** Platform 2FA email code resend (for normal users; rejects for admins) */
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @Post('send-2fa-email')
  @Public()
  async sendTwoFactorEmail(
    @Body() dto: SendTwoFactorEmailDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;
    return this.authService.sendTwoFactorEmail(dto.loginTicket, ip, userAgent);
  }

  /** Platform refresh token rotation with CSRF protection */
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @Public()
  async refresh(
    @Body() refreshDto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    enforceCsrf(req);

    const legacyPlatformRefresh = process.env.LEGACY_PLATFORM_REFRESH_COOKIE || 'legacy_platform_refresh';
    const tokenFromCookie = (req as any).cookies?.[PLATFORM_REFRESH_COOKIE_NAME] || (req as any).cookies?.[legacyPlatformRefresh];
    const rawRefreshToken = tokenFromCookie || refreshDto.refreshToken;

    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;
    const expectedUserId = (req.headers['x-expected-user-id'] as string) || refreshDto.expectedUserId;
    const result = await this.authService.refreshPlatformToken(rawRefreshToken, ip, userAgent, expectedUserId);

    if (result && result.refreshToken) {
      res.cookie(PLATFORM_REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions(PLATFORM_AUTH_COOKIE_PATH, false));
      res.cookie(PLATFORM_SESSION_ACTIVE_COOKIE_NAME, '1', getSessionIndicatorCookieOptions(false));
      return result;
    }
    return result;
  }

  /** Read-only platform session probe returning strictly {signedIn, displayName, portal} — rate limited */
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get('session-probe')
  @Public()
  async sessionProbe(@Req() req: Request) {
    const legacyPlatformRefresh = process.env.LEGACY_PLATFORM_REFRESH_COOKIE || 'legacy_platform_refresh';
    const legacyRefresh = process.env.LEGACY_REFRESH_COOKIE || 'legacy_refresh_token';
    const tokenFromCookie =
      (req as any).cookies?.[PLATFORM_REFRESH_COOKIE_NAME] ||
      (req as any).cookies?.[REFRESH_COOKIE_NAME] ||
      (req as any).cookies?.[legacyPlatformRefresh] ||
      (req as any).cookies?.[legacyRefresh];

    if (!tokenFromCookie) {
      return { signedIn: false, displayName: null, portal: null };
    }

    const sessionUser = await this.authService.validateSessionFromCookie(tokenFromCookie);
    if (!sessionUser) {
      return { signedIn: false, displayName: null, portal: null };
    }

    return {
      signedIn: true,
      displayName: sessionUser.name,
      portal: 'platform',
    };
  }

  /** Read platform profile — protected endpoint */
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async getProfile(@Req() req: Request, @CurrentUser() user?: any) {
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
    return {
      user: formatAuthUser(currentUser),
    };
  }

  /** Platform logout — revokes server-side refresh token and clears cookie */
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  @Public()
  async logout(
    @Body() body: any,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    enforceCsrf(req);

    const legacyPlatformRefresh = process.env.LEGACY_PLATFORM_REFRESH_COOKIE || 'legacy_platform_refresh';
    const tokenFromCookie = (req as any).cookies?.[PLATFORM_REFRESH_COOKIE_NAME] || (req as any).cookies?.[legacyPlatformRefresh];
    const ip = req.ip || req.socket?.remoteAddress;
    const expectedUserId = body?.expectedUserId;
    await this.authService.logout(tokenFromCookie, expectedUserId, ip);

    res.clearCookie(PLATFORM_REFRESH_COOKIE_NAME, {
      path: PLATFORM_AUTH_COOKIE_PATH,
      httpOnly: true,
      sameSite: 'strict',
      secure: isSecureCookie(),
    });
    res.clearCookie(legacyPlatformRefresh, {
      path: PLATFORM_AUTH_COOKIE_PATH,
      httpOnly: true,
      sameSite: 'strict',
      secure: isSecureCookie(),
    });
    res.clearCookie(PLATFORM_REFRESH_COOKIE_NAME, {
      path: '/api/v1',
      httpOnly: true,
      sameSite: 'strict',
      secure: isSecureCookie(),
    });
    res.clearCookie(legacyPlatformRefresh, {
      path: '/api/v1',
      httpOnly: true,
      sameSite: 'strict',
      secure: isSecureCookie(),
    });
    res.clearCookie(PLATFORM_SESSION_ACTIVE_COOKIE_NAME, {
      path: '/',
      httpOnly: false,
      sameSite: 'strict',
      secure: isSecureCookie(),
    });
    const legacyPlatformSession = process.env.LEGACY_PLATFORM_SESSION_COOKIE || 'legacy_platform_session_active';
    res.clearCookie(legacyPlatformSession, {
      path: '/',
      httpOnly: false,
      sameSite: 'strict',
      secure: isSecureCookie(),
    });
    res.clearCookie(TRUSTED_DEVICE_COOKIE_NAME, { path: '/' });
    const legacyTrustedDevice = process.env.LEGACY_TRUSTED_DEVICE_COOKIE || 'legacy_trusted_device';
    res.clearCookie(legacyTrustedDevice, { path: '/' });
    res.setHeader('Clear-Site-Data', '"cache", "storage"');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return { success: true, message: 'Platform super-admin logged out successfully' };
  }

  /** Platform logout all devices */
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

    const legacyPlatformRefresh = process.env.LEGACY_PLATFORM_REFRESH_COOKIE || 'legacy_platform_refresh';
    const tokenFromCookie = (req as any).cookies?.[PLATFORM_REFRESH_COOKIE_NAME] || (req as any).cookies?.[legacyPlatformRefresh];
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

    res.clearCookie(PLATFORM_REFRESH_COOKIE_NAME, {
      path: PLATFORM_AUTH_COOKIE_PATH,
      httpOnly: true,
      sameSite: 'strict',
      secure: isSecureCookie(),
    });
    res.clearCookie(PLATFORM_SESSION_ACTIVE_COOKIE_NAME, {
      path: '/',
      httpOnly: false,
      sameSite: 'strict',
      secure: isSecureCookie(),
    });
    res.setHeader('Clear-Site-Data', '"cache", "storage"');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return { success: true, message: 'Platform super-admin signed out of all devices successfully' };
  }

  /** Platform step-up authentication endpoint (re-enter password to receive 5-minute step-up token) */
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  @Post('step-up')
  async stepUp(
    @CurrentUser() user: any,
    @Body() body: { password?: string },
  ) {
    if (user.role !== 'platform_super_admin') {
      throw new ForbiddenException('Step-up authentication is only valid for platform administrators.');
    }
    if (!body?.password || typeof body.password !== 'string' || body.password.trim().length === 0) {
      throw new UnauthorizedException('Password is required for step-up verification.');
    }
    return this.authService.verifyPlatformStepUp(user.id, body.password);
  }
}

