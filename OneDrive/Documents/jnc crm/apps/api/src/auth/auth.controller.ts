/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disensify'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Controller, Post, Patch, Body, Req, Get, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  LoginDto,
  SelectCompanyDto,
  PlatformLoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RefreshTokenDto,
} from './dto/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class AuthController {
  constructor(private authService: AuthService) {}

  /** Staff login — IP rate limit: 10 attempts / 15 min */
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.authService.login(loginDto, ip);
  }

  /** Second step when multiple companies match — exchange selectionToken for real tokens */
  @Post('login/select-company')
  async selectCompany(@Body() dto: SelectCompanyDto, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.authService.selectCompany(dto, ip);
  }

  /** Platform super-admin only — rate limit: 5 attempts / 15 min */
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @Post('platform-login')
  async platformLogin(@Body() dto: PlatformLoginDto, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.authService.platformLogin(dto, ip);
  }

  /** Forgot password — sends reset link if email exists (no reveal) */
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.authService.forgotPassword(dto, ip);
  }

  /** Reset password with token from email link */
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('refresh')
  async refresh(@Body() refreshDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshDto);
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
    @Body() body: { name?: string; phone?: string },
  ) {
    return this.authService.updateProfile(user.id, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    const currentPass = body.currentPass || body.currentPassword;
    const newPass = body.newPass || body.newPassword;
    return this.authService.changePassword(user.id, currentPass, newPass);
  }
}
