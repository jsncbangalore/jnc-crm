import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  UsePipes,
  UseGuards,
  ValidationPipe,
  ForbiddenException,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { PlatformLoginDto, RefreshTokenDto } from './dto/login.dto';
import { Response, Request } from 'express';
import { isAllowedOrigin } from '../common/cors-config';
import { CurrentUser } from './current-user.decorator';
import {
  PLATFORM_AUTH_COOKIE_PATH,
  PLATFORM_REFRESH_COOKIE_NAME,
  PLATFORM_SESSION_ACTIVE_COOKIE_NAME,
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
    const userAgent = req.headers['user-agent'] as string | undefined;
    // Platform super-admins NEVER get keepSignedIn (enforced false)
    const result: any = await this.authService.platformLogin({ ...dto, keepSignedIn: false }, ip, userAgent);

    if (result && result.refreshToken) {
      res.cookie(PLATFORM_REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions(PLATFORM_AUTH_COOKIE_PATH, false));
      res.cookie(PLATFORM_SESSION_ACTIVE_COOKIE_NAME, '1', getSessionIndicatorCookieOptions(false));
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

    const tokenFromCookie = (req as any).cookies?.[PLATFORM_REFRESH_COOKIE_NAME];
    const rawRefreshToken = tokenFromCookie || refreshDto.refreshToken;

    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string | undefined;
    const result = await this.authService.refreshPlatformToken(rawRefreshToken, ip, userAgent);

    if (result && result.refreshToken) {
      res.cookie(PLATFORM_REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions(PLATFORM_AUTH_COOKIE_PATH, false));
      res.cookie(PLATFORM_SESSION_ACTIVE_COOKIE_NAME, '1', getSessionIndicatorCookieOptions(false));
      return result;
    }
    return result;
  }

  /** Platform logout — revokes server-side refresh token and clears cookie */
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    enforceCsrf(req);

    const tokenFromCookie = (req as any).cookies?.[PLATFORM_REFRESH_COOKIE_NAME];
    const ip = req.ip || req.socket?.remoteAddress;
    await this.authService.logout(tokenFromCookie, undefined, ip);

    res.clearCookie(PLATFORM_REFRESH_COOKIE_NAME, {
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
    return { success: true, message: 'Platform super-admin logged out successfully' };
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

