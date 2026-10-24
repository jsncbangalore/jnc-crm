/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
  Optional,
  Inject,
  forwardRef,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  LoginDto,
  SelectCompanyDto,
  PlatformLoginDto,
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
  VerifyTwoFactorDto,
  SendTwoFactorEmailDto,
  EnableTwoFactorDto,
  RegenerateBackupCodesDto,
  DisableTwoFactorDto,
} from './dto/login.dto';
import { getRoleRedirectPath } from './roles';
import { validatePasswordPolicy, needsRehash, getPasswordPolicy, PasswordPolicyDto } from '../common/password-policy';
import { isAllowedOrigin } from '../common/cors-config';
import { parseDeviceLabel } from '../common/device.util';
import {
  generateTotpSecret,
  generateTotpToken,
  verifyTotpToken,
  generateBackupCodes,
  hashBackupCode,
  verifyAndConsumeBackupCode,
  buildTotpUri,
} from '../common/totp.util';
import { encryptAtRest, decryptAtRest } from '../common/encryption.util';
import {
  TRUSTED_DEVICE_COOKIE_NAME,
  TRUSTED_DEVICE_MAX_AGE_MS,
  TRUSTED_DEVICE_ADMIN_MAX_AGE_MS,
  getTrustedDeviceCookieOptions,
} from '../common/cookie.util';
import { getProductName } from '../common/brand';
import { getEffectivePagesForUser } from './effective-page-access';

const GENERIC_ERROR = 'Invalid credentials.';
const DUMMY_HASH = '$2a$12$a8/MI7VqcmnIurecXxpSd.NGA0wvPwFlYxMl6qs4VAKG.iQ/Z9SAu';

export function maskIdentifier(id: string): string {
  if (!id) return '***';
  const clean = String(id).trim();
  if (clean.includes('@')) {
    const [name, domain] = clean.split('@');
    const maskedName = name.length <= 2 ? `${name}***` : `${name.slice(0, 3)}***`;
    return `${maskedName}@${domain}`;
  }
  return clean.length <= 4 ? `${clean}***` : `${clean.slice(0, 3)}***${clean.slice(-2)}`;
}

export function maskIp(ip: string): string {
  if (!ip) return 'unknown';
  const clean = String(ip).trim();
  const v4Match = clean.match(/(\d+\.\d+)\.\d+\.\d+/);
  if (v4Match) {
    return `${v4Match[1]}.x.x`;
  }
  if (clean === '::1' || clean === '127.0.0.1') {
    return '127.0.x.x';
  }
  const parts = clean.split(':');
  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]}:*:*`;
  }
  return clean;
}

export function formatAuthUser(user: any, effectivePages?: string[]): any {
  if (!user) return null;
  const formatted: any = {
    id: user.id,
    name: user.name,
    email: user.email,
    employeeCode: user.employeeCode,
    phone: user.phone ?? null,
    photoUrl: user.photoUrl ?? null,
    role: user.role,
    mustResetPassword: Boolean(user.mustResetPassword),
    lastPasswordChangeAt: user.lastPasswordChangeAt ?? null,
    createdAt: user.createdAt ?? null,
    tenant: user.tenant
      ? {
          code: user.tenant.code,
          name: user.tenant.name,
          currency: user.tenant.currency || 'INR',
          logoUrl: user.tenant.logoUrl ?? null,
        }
      : null,
    teamId: user.teamId ?? null,
    warehouseId: user.warehouseId ?? null,
    effectivePages: effectivePages || user.effectivePages || [],
  };

  if (user.isImpersonating) {
    formatted.isImpersonating = true;
    formatted.impersonatedTenantName = user.impersonatedTenantName;
    formatted.impersonatedTenantCode = user.impersonatedTenantCode;
  }

  return formatted;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private static inMemoryOtpChallenges = new Map<string, any>();
  private static inMemoryResetTickets = new Map<string, any>();
  private static inMemoryPasswordResetFlows = new Map<string, any>();
  private static inMemoryPhoneAttemptBlocks = new Map<string, number>();
  private static inMemoryAccountHourlyPhoneAttempts = new Map<string, number[]>();
  private static inMemoryIpHourlyFlowStarts = new Map<string, number[]>();
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  /** Per-IP + per-account rate limit for platform login */
  private readonly PLATFORM_MAX_ATTEMPTS = 5;
  private readonly PLATFORM_WINDOW_MS = 15 * 60 * 1000;

  async getEffectivePages(user: any): Promise<string[]> {
    return getEffectivePagesForUser(this.prisma, {
      id: user.sub || user.id,
      role: user.role,
      tenantId: user.tenantId,
    });
  }

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    @Inject(forwardRef(() => NotificationsService)) private notificationsService: NotificationsService,
  ) {
    // Periodic background cleanup of expired password reset flows
    const cleanupTimer = setInterval(() => {
      this.cleanupExpiredPasswordResetFlows();
    }, 10 * 60 * 1000);
    if (cleanupTimer.unref) cleanupTimer.unref();
  }

  getPasswordPolicy(): PasswordPolicyDto {
    return getPasswordPolicy();
  }

  // ─── Lockout helpers ─────────────────────────────────────────────────────────

  private async checkAccountLockout(lockKey: string, user?: any) {
    const now = new Date();

    if (user) {
      if (user.lockoutUntil) {
        if (new Date(user.lockoutUntil) > now) {
          const remainingMinutes = Math.ceil(
            (new Date(user.lockoutUntil).getTime() - now.getTime()) / 60000,
          );
          throw new UnauthorizedException(
            `Account is temporarily locked. Please try again in ${remainingMinutes} minute(s) or contact administrator.`,
          );
        } else {
          await this.prisma.user
            .update({
              where: { id: user.id },
              data: { failedLoginAttempts: 0, lockoutUntil: null },
            })
            .catch(() => {});
        }
      } else if (
        user.failedLoginAttempts > 0 &&
        user.updatedAt &&
        now.getTime() - new Date(user.updatedAt).getTime() > this.LOCKOUT_DURATION_MS
      ) {
        // Expire stale failed attempts after lockout window
        await this.prisma.user
          .update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0 },
          })
          .catch(() => {});
      }
    }

    const lockoutRecord = await this.prisma.accountLockout.findUnique({
      where: { identityKey: lockKey },
    });

    if (lockoutRecord) {
      if (lockoutRecord.lockedUntil && new Date(lockoutRecord.lockedUntil) > now) {
        const remainingMinutes = Math.ceil(
          (new Date(lockoutRecord.lockedUntil).getTime() - now.getTime()) / 60000,
        );
        throw new UnauthorizedException(
          `Account is temporarily locked. Please try again in ${remainingMinutes} minute(s) or contact administrator.`,
        );
      } else if (
        (lockoutRecord.lockedUntil && new Date(lockoutRecord.lockedUntil) <= now) ||
        (lockoutRecord.lastAttemptAt &&
          now.getTime() - new Date(lockoutRecord.lastAttemptAt).getTime() > this.LOCKOUT_DURATION_MS)
      ) {
        await this.prisma.accountLockout
          .delete({ where: { identityKey: lockKey } })
          .catch(() => {});
      }
    }
  }

  private async recordFailedAttempt(lockKey: string, user?: any, ipAddress?: string) {
    const now = new Date();
    let currentAttempts = 0;

    if (user) {
      const isStale =
        user.updatedAt && now.getTime() - new Date(user.updatedAt).getTime() > this.LOCKOUT_DURATION_MS;
      currentAttempts = isStale ? 1 : (user.failedLoginAttempts || 0) + 1;
      const isLocked = currentAttempts >= this.MAX_FAILED_ATTEMPTS;
      const lockedUntil = isLocked ? new Date(now.getTime() + this.LOCKOUT_DURATION_MS) : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: currentAttempts, lockoutUntil: lockedUntil },
      });

      if (isLocked) {
        await this.prisma.auditLog
          .create({
            data: {
              tenantId: user.tenantId || null,
              actorId: user.id,
              actorName: user.name || lockKey,
              action: 'LOGIN_LOCKOUT',
              entityName: 'User',
              entityId: user.id,
              afterState: JSON.stringify({
                reason: 'Account locked after 5 consecutive failed login attempts',
                consecutiveFailedAttempts: currentAttempts,
                lockExpiresAt: lockedUntil?.toISOString(),
              }),
              ipAddress: ipAddress || '127.0.0.1',
            },
          })
          .catch(() => {});
      }
    } else {
      const existing = await this.prisma.accountLockout.findUnique({ where: { identityKey: lockKey } });
      const isStale =
        existing?.lastAttemptAt &&
        now.getTime() - new Date(existing.lastAttemptAt).getTime() > this.LOCKOUT_DURATION_MS;

      const record = await this.prisma.accountLockout.upsert({
        where: { identityKey: lockKey },
        create: { identityKey: lockKey, failedAttempts: 1, lastAttemptAt: now },
        update: {
          failedAttempts: isStale ? 1 : { increment: 1 },
          lastAttemptAt: now,
        },
      });

      currentAttempts = record.failedAttempts;
      if (currentAttempts >= this.MAX_FAILED_ATTEMPTS) {
        const lockedUntil = new Date(now.getTime() + this.LOCKOUT_DURATION_MS);
        await this.prisma.accountLockout.update({
          where: { identityKey: lockKey },
          data: { lockedUntil },
        });
      }
    }
  }

  private async resetFailedAttempts(lockKey: string, userId?: string) {
    if (userId) {
      await this.prisma.user
        .update({ where: { id: userId }, data: { failedLoginAttempts: 0, lockoutUntil: null } })
        .catch(() => {});
    }
    await this.prisma.accountLockout
      .delete({ where: { identityKey: lockKey } })
      .catch(() => {});
  }

  // ─── User lookup helper ──────────────────────────────────────────────────────

  private async findCandidates(raw: string, tenantId?: string) {
    const lower = raw.toLowerCase();
    const upper = raw.toUpperCase();
    const orConditions: any[] = [
      { email: { equals: lower, mode: 'insensitive' } },
      { employeeCode: { equals: upper, mode: 'insensitive' } },
    ];

    if (!raw.includes('@')) {
      orConditions.push({ email: { startsWith: `${lower}@`, mode: 'insensitive' } });
      orConditions.push({ name: { equals: raw, mode: 'insensitive' } });
      orConditions.push({ name: { startsWith: raw, mode: 'insensitive' } });
    }

    return this.prisma.user.findMany({
      include: {
        teamRef: { select: { id: true, name: true, allowedPages: true } },
        tenant: {
          select: {
            id: true,
            code: true,
            name: true,
            slug: true,
            status: true,
            logoUrl: true,
            currency: true,
          },
        },
      },
      where: {
        ...(tenantId ? { tenantId } : {}),
        OR: orConditions,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  // ─── POST /auth/login ────────────────────────────────────────────────────────

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string, trustedDeviceToken?: string) {
    if (
      !loginDto ||
      !loginDto.password ||
      typeof loginDto.password !== 'string' ||
      loginDto.password.trim().length === 0 ||
      loginDto.password.length > 200
    ) {
      throw new BadRequestException('password must be a non-empty string, not whitespace-only, and max 200 characters');
    }

    const raw = ((loginDto.identifier || loginDto.email || loginDto.username) ?? '').trim();
    const lower = raw.toLowerCase();
    const companyCode = loginDto.companyCode?.trim();

    // ── Resolve tenant if company code given ─────────────────────────────────
    let resolvedTenantId: string | undefined;
    if (companyCode) {
      const tenant = await this.prisma.tenant.findFirst({
        where: {
          deletedAt: null,
          OR: [
            { code: { equals: companyCode.toUpperCase(), mode: 'insensitive' } },
            { slug: { equals: companyCode.toLowerCase(), mode: 'insensitive' } },
            { id: { equals: companyCode } },
          ],
        },
      });
      if (!tenant) {
        // Run dummy hash to mitigate timing attacks
        await bcrypt.compare(loginDto.password, DUMMY_HASH);
        await this.recordLoginFailure(raw, undefined, undefined, 'TENANT_NOT_FOUND', 'company', ipAddress, userAgent);
        // Generic error — do not reveal whether company exists
        await this._addArtificialDelay();
        throw new UnauthorizedException(GENERIC_ERROR);
      }
      resolvedTenantId = tenant.id;
    }

    const lockKey = resolvedTenantId ? `${lower}:${resolvedTenantId}` : lower;
    await this.checkAccountLockout(lockKey);

    const candidates = await this.findCandidates(raw, resolvedTenantId);

    if (candidates.length === 0) {
      await bcrypt.compare(loginDto.password, DUMMY_HASH);
      await this.recordFailedAttempt(lockKey, undefined, ipAddress);
      await this.recordLoginFailure(raw, resolvedTenantId, undefined, 'USER_NOT_FOUND', 'company', ipAddress, userAgent);
      throw new UnauthorizedException(GENERIC_ERROR);
    }

    // ── Password check across all candidates ───────────────────────────────────
    const matched: any[] = [];
    for (const candidate of candidates) {
      if (candidate.passwordHash && loginDto.password) {
        const ok = await bcrypt.compare(loginDto.password, candidate.passwordHash);
        if (ok) matched.push(candidate);
      }
    }

    if (matched.length === 0) {
      // Record failure against first candidate (or key-only)
      const firstUser = candidates[0];
      const failKey = firstUser?.tenantId
        ? `${(firstUser.email || lower).toLowerCase()}:${firstUser.tenantId}`
        : lockKey;
      await this.recordFailedAttempt(failKey, firstUser || undefined, ipAddress);
      await this.recordLoginFailure(raw, firstUser?.tenantId || resolvedTenantId, firstUser?.id, 'BAD_PASSWORD', 'company', ipAddress, userAgent);
      throw new UnauthorizedException(GENERIC_ERROR);
    }

    // ── Multi-company case — return selectionToken ───────────────────────────
    const tenantMatched = matched.filter((u) => u.tenantId);
    if (!companyCode && tenantMatched.length > 1) {
      const distinctTenantIds = new Set(tenantMatched.map((u) => u.tenantId));
      if (distinctTenantIds.size > 1) {
        const companies = tenantMatched
          .filter((u) => u.tenant)
          .map((u) => ({ code: u.tenant.code, name: u.tenant.name }));
        const uniqueCompanies = Array.from(new Map(companies.map((c) => [c.code, c])).values());

        const jti = crypto.randomUUID();
        // Embed matched user ids so we can verify in select-company
        const selectionToken = this.jwtService.sign(
          {
            jti,
            matchedIds: tenantMatched.map((u) => u.id),
            purpose: 'company_selection',
          },
          { secret: process.env.JWT_SECRET, expiresIn: '5m' },
        );

        return { requiresCompanySelection: true, companies: uniqueCompanies, selectionToken };
      }
    }

    // ── Single match or multiple accounts in same tenant ────────────────────
    let matchedUser = matched[0];
    if (matched.length > 1) {
      const sorted = [...matched].sort((a, b) => {
        if (a.employeeCode?.includes('001') && !b.employeeCode?.includes('001')) return -1;
        if (b.employeeCode?.includes('001') && !a.employeeCode?.includes('001')) return 1;
        return 0;
      });
      matchedUser = sorted[0];
    }

    // Portal check: platform super admins cannot sign in through company login
    if (matchedUser.role === 'platform_super_admin' && !matchedUser.tenantId) {
      await this.recordLoginFailure(raw, null, matchedUser.id, 'PORTAL_MISMATCH', 'company', ipAddress, userAgent);
      throw new UnauthorizedException('Platform administrators must sign in through the platform portal.');
    }

    const matchedLockKey = matchedUser.tenantId
      ? `${(matchedUser.email || lower).toLowerCase()}:${matchedUser.tenantId}`
      : (matchedUser.email || lower).toLowerCase();

    await this.checkAccountLockout(matchedLockKey, matchedUser);

    if (!matchedUser.isActive) {
      await this.recordLoginFailure(raw, matchedUser.tenantId, matchedUser.id, 'ACCOUNT_DEACTIVATED', 'company', ipAddress, userAgent);
      throw new UnauthorizedException(
        'This account has been deactivated. Please contact your company administrator.',
      );
    }
    if (matchedUser.tenant && matchedUser.tenant.status !== 'active') {
      await this.recordLoginFailure(raw, matchedUser.tenantId, matchedUser.id, 'COMPANY_SUSPENDED', 'company', ipAddress, userAgent);
      throw new UnauthorizedException(
        `Your company account (${matchedUser.tenant.name || matchedUser.tenant.code}) is ${matchedUser.tenant.status}. Please contact platform support.`,
      );
    }

    await this.resetFailedAttempts(matchedLockKey, matchedUser.id);
    return this._buildLoginResponse(matchedUser, ipAddress, loginDto.password, Boolean(loginDto.keepSignedIn), userAgent, 'company', false, trustedDeviceToken);
  }

  // ─── POST /auth/login/select-company ────────────────────────────────────────

  async selectCompany(dto: SelectCompanyDto, ipAddress?: string, userAgent?: string, trustedDeviceToken?: string) {
    if (dto.password !== undefined) {
      if (
        typeof dto.password !== 'string' ||
        dto.password.trim().length === 0 ||
        dto.password.length > 200
      ) {
        throw new BadRequestException('password must be a non-empty string, not whitespace-only, and max 200 characters');
      }
    }
    // Verify selection token
    let payload: any;
    try {
      payload = this.jwtService.verify(dto.selectionToken, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Selection token is invalid or expired.');
    }

    if (payload.purpose !== 'company_selection' || !payload.jti || !payload.matchedIds) {
      throw new UnauthorizedException('Invalid selection token.');
    }

    // Single-use: check if jti already used
    const already = await this.prisma.usedSelectionToken.findUnique({
      where: { jti: payload.jti },
    });
    if (already) {
      throw new UnauthorizedException('This selection token has already been used.');
    }

    // Mark as used
    await this.prisma.usedSelectionToken.create({ data: { jti: payload.jti } });

    // Find the user for the requested company
    const companyCode = dto.companyCode.trim();
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { code: { equals: companyCode.toUpperCase(), mode: 'insensitive' } },
          { slug: { equals: companyCode.toLowerCase(), mode: 'insensitive' } },
        ],
      },
    });
    if (!tenant) {
      throw new UnauthorizedException(GENERIC_ERROR);
    }

    const user = await this.prisma.user.findFirst({
      where: {
        tenantId: tenant.id,
        id: { in: payload.matchedIds },
        deletedAt: null,
      },
      include: {
        teamRef: { select: { id: true, name: true, allowedPages: true } },
        tenant: {
          select: {
            id: true,
            code: true,
            name: true,
            slug: true,
            status: true,
            logoUrl: true,
            currency: true,
            requireTwoFactor: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException(GENERIC_ERROR);
    }

    // Run all the same checks
    const lockKey = `${(user.email || '').toLowerCase()}:${user.tenantId}`;
    await this.checkAccountLockout(lockKey, user);

    if (!user.isActive) {
      await this.recordLoginFailure(user.email || user.employeeCode, user.tenantId, user.id, 'ACCOUNT_DEACTIVATED', 'company', ipAddress, userAgent);
      throw new UnauthorizedException(
        'This account has been deactivated. Please contact your company administrator.',
      );
    }
    if (user.tenant && user.tenant.status !== 'active') {
      await this.recordLoginFailure(user.email || user.employeeCode, user.tenantId, user.id, 'COMPANY_SUSPENDED', 'company', ipAddress, userAgent);
      throw new UnauthorizedException(
        `Your company account (${user.tenant.name || user.tenant.code}) is ${user.tenant.status}.`,
      );
    }

    await this.resetFailedAttempts(lockKey, user.id);
    return this._buildLoginResponse(user, ipAddress, undefined, false, userAgent, 'company', false, trustedDeviceToken);
  }

  // ─── Platform Login Handler (used by PlatformAuthController) ───────────────

  async platformLogin(dto: PlatformLoginDto, ipAddress?: string, userAgent?: string, trustedDeviceToken?: string) {
    if (
      !dto ||
      !dto.password ||
      typeof dto.password !== 'string' ||
      dto.password.trim().length === 0 ||
      dto.password.length > 200
    ) {
      throw new BadRequestException('password must be a non-empty string, not whitespace-only, and max 200 characters');
    }

    const lower = (dto.email || '').trim().toLowerCase();

    // Rate-limit check: per-IP key AND per-email key
    const ipKey = `platform-ip:${ipAddress || 'unknown'}`;
    const emailKey = `platform-email:${lower}`;
    await this.checkAccountLockout(ipKey);
    await this.checkAccountLockout(emailKey);

    const platformOrConditions: any[] = [
      { email: { equals: lower, mode: 'insensitive' } },
      { employeeCode: { equals: lower.toUpperCase(), mode: 'insensitive' } },
    ];
    if (!lower.includes('@')) {
      platformOrConditions.push({ email: { startsWith: `${lower}@`, mode: 'insensitive' } });
      platformOrConditions.push({ name: { equals: lower, mode: 'insensitive' } });
    }

    const user = await this.prisma.user.findFirst({
      include: {
        tenant: { select: { id: true, code: true, name: true, status: true, requireTwoFactor: true } },
      },
      where: {
        OR: platformOrConditions,
        role: 'platform_super_admin',
        tenantId: null,
        deletedAt: null,
      },
    });

    if (!user || !user.passwordHash) {
      await bcrypt.compare(dto.password, DUMMY_HASH);
      await this.recordFailedAttempt(ipKey, undefined, ipAddress);
      await this.recordFailedAttempt(emailKey, undefined, ipAddress);
      await this.recordLoginFailure(lower, null, null, 'INVALID_CREDENTIALS', 'platform', ipAddress, userAgent);
      throw new UnauthorizedException(GENERIC_ERROR);
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      await this.recordFailedAttempt(ipKey, undefined, ipAddress);
      await this.recordFailedAttempt(emailKey, user, ipAddress);
      if (user.employeeCode) {
        await this.recordFailedAttempt(`platform-email:${user.employeeCode.toLowerCase()}`, user, ipAddress);
      }
      await this.recordLoginFailure(lower, null, user.id, 'BAD_PASSWORD', 'platform', ipAddress, userAgent);
      throw new UnauthorizedException(GENERIC_ERROR);
    }

    // Lockout checks against the user record itself
    await this.checkAccountLockout(emailKey, user);

    if (!user.isActive) {
      await this.recordLoginFailure(lower, null, user.id, 'ACCOUNT_DEACTIVATED', 'platform', ipAddress, userAgent);
      throw new UnauthorizedException(GENERIC_ERROR);
    }

    // Reset rate-limit counters on success across all key variants
    await this.resetFailedAttempts(ipKey);
    await this.resetFailedAttempts(emailKey, user.id);
    if (user.email) await this.resetFailedAttempts(`platform-email:${user.email.toLowerCase()}`, user.id);
    if (user.employeeCode) {
      await this.resetFailedAttempts(`platform-email:${user.employeeCode.toLowerCase()}`, user.id);
      await this.resetFailedAttempts(`platform-email:${user.employeeCode.toUpperCase()}`, user.id);
    }

    return this._buildLoginResponse(user, ipAddress, dto.password, Boolean(dto.keepSignedIn), userAgent, 'platform', false, trustedDeviceToken);
  }

  // ─── Email Outbox Dispatcher (Background with up to 3 retries) ────────────

  async dispatchOutboxItem(outboxId: string): Promise<void> {
    try {
      const item = await this.prisma.emailOutbox.findUnique({ where: { id: outboxId } });
      if (!item || item.isDecoy || item.status !== 'pending') return;

      let deliveryError: string | null = null;
      try {
        if (this.notificationsService) {
          const isReset = (item.subject || '').toLowerCase().includes('reset') || (item.subject || '').toLowerCase().includes('password');
          const res: any = await this.notificationsService.sendEmail({
            to: item.to,
            subject: item.subject,
            text: item.text || undefined,
            html: item.html || undefined,
            tenantId: item.tenantId || undefined,
            purpose: isReset ? 'password_reset_code' : 'two_factor_code',
          });
          if (res && res.status === 'failed') {
            deliveryError = res.error || res.reason || 'delivery failure';
          }
        }
      } catch (err: any) {
        deliveryError = err?.message || 'SMTP delivery failed';
      }

      if (!deliveryError) {
        await this.prisma.emailOutbox.update({
          where: { id: item.id },
          data: {
            status: 'sent',
            sentAt: new Date(),
            attempts: item.attempts + 1,
            text: null,
            html: null,
          },
        });
      } else {
        const attempts = item.attempts + 1;
        // Log ONLY failure reason, NEVER the verification code!
        this.logger.error(`[EMAIL_OUTBOX] Outbox item ${item.id} delivery attempt ${attempts} failed: ${deliveryError}`);
        await this.prisma.emailOutbox.update({
          where: { id: item.id },
          data: {
            attempts,
            lastError: deliveryError,
            status: attempts >= (item.maxAttempts || 3) ? 'failed' : 'pending',
            nextAttemptAt: new Date(Date.now() + attempts * 5000),
          },
        });
      }
    } catch (err: any) {
      this.logger.error(`[EMAIL_OUTBOX] Outbox processing failure: ${err?.message || 'internal error'}`);
    }
  }

  // ─── HARDENED FORGOT PASSWORD FLOW (Server-Enforced Stage State Machine) ────

  private signFlowToken(flowId: string): string {
    const secret = process.env.JWT_SECRET || 'crm-otp-secret-key-2026';
    const sig = crypto.createHmac('sha256', secret).update(flowId).digest('hex');
    return Buffer.from(JSON.stringify({ flowId, sig })).toString('base64url');
  }

  private parseAndVerifyFlowToken(token: string): string | null {
    if (!token) return null;
    try {
      const secret = process.env.JWT_SECRET || 'crm-otp-secret-key-2026';
      const raw = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
      if (!raw || !raw.flowId || !raw.sig) return null;
      const expectedSig = crypto.createHmac('sha256', secret).update(raw.flowId).digest('hex');
      const a = Buffer.from(raw.sig);
      const b = Buffer.from(expectedSig);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
      return raw.flowId;
    } catch {
      return null;
    }
  }

  private isStrictProduction(clientIp?: string): boolean {
    const isLocalhost =
      !clientIp ||
      clientIp === '127.0.0.1' ||
      clientIp === '::1' ||
      clientIp === 'localhost' ||
      clientIp.includes('127.0.0.1') ||
      clientIp.includes('::1') ||
      clientIp.startsWith('::ffff:');
    const isCloud = Boolean(process.env.RENDER || process.env.VERCEL || process.env.STRICT_PROD === 'true');
    return process.env.NODE_ENV === 'production' && isCloud && !isLocalhost;
  }

  private async createPasswordResetFlow(flowData: any, clientIp?: string): Promise<any> {
    try {
      if ((this.prisma as any).passwordResetFlow?.create) {
        return await (this.prisma as any).passwordResetFlow.create({ data: flowData });
      }
    } catch (err: any) {
      this.logger.warn(`[PASSWORD_RESET_FLOW] Table create fallback to memory: ${err?.message}`);
    }
    AuthService.inMemoryPasswordResetFlows.set(flowData.id, flowData);
    return flowData;
  }

  private async getPasswordResetFlow(flowId: string, clientIp?: string): Promise<any> {
    try {
      if ((this.prisma as any).passwordResetFlow?.findUnique) {
        const flow = await (this.prisma as any).passwordResetFlow.findUnique({
          where: { id: flowId },
        });
        if (flow) return flow;
      }
    } catch (err: any) {
      this.logger.warn(`[PASSWORD_RESET_FLOW] Table lookup fallback to memory: ${err?.message}`);
    }
    return AuthService.inMemoryPasswordResetFlows.get(flowId) || null;
  }

  private async updatePasswordResetFlow(flowId: string, expectedStage: string, updateData: any, clientIp?: string): Promise<any> {
    const flow = await this.getPasswordResetFlow(flowId, clientIp);
    if (!flow || flow.stage !== expectedStage) {
      return null;
    }
    if (new Date(flow.expiresAt).getTime() < Date.now()) {
      return null;
    }

    const updated = { ...flow, ...updateData };

    try {
      if ((this.prisma as any).passwordResetFlow?.update) {
        await (this.prisma as any).passwordResetFlow.update({
          where: { id: flowId },
          data: updateData,
        });
      }
    } catch (err: any) {
      this.logger.warn(`[PASSWORD_RESET_FLOW] Table update fallback to memory: ${err?.message}`);
    }

    AuthService.inMemoryPasswordResetFlows.set(flowId, updated);
    return updated;
  }

  private normalizePhone10Digits(phone: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
  }

  private constantTimeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  cleanupExpiredPasswordResetFlows() {
    const now = Date.now();
    for (const [id, flow] of AuthService.inMemoryPasswordResetFlows.entries()) {
      if (new Date(flow.expiresAt).getTime() < now) {
        AuthService.inMemoryPasswordResetFlows.delete(id);
      }
    }
    (this.prisma as any).passwordResetFlow?.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    }).catch(() => {});
  }

  private sendSecurityAlertEmail(toEmail: string, subject: string, userName?: string, clientIp?: string, tenantId?: string) {
    if (!this.notificationsService || !toEmail) return;
    const appName = getProductName();
    const maskedClientIp = maskIp(clientIp || '127.0.0.1');
    const timeStr = new Date().toUTCString();
    this.notificationsService.sendEmail({
      to: toEmail,
      subject: `${subject} - ${appName}`,
      text: `Hello ${userName || 'User'},\n\n${subject} on ${timeStr} from IP ${maskedClientIp}.\n\nIf this was not you, please ensure your account is secure.`,
      html: `<div style="font-family: Arial, sans-serif; max-width: 520px; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <h3 style="margin-top:0; color:#dc2626;">Security Alert</h3>
        <p style="color:#475569;">${subject} on <strong>${timeStr}</strong> from IP <strong>${maskedClientIp}</strong>.</p>
        <p style="color:#475569; font-size: 13px;">If you did not initiate this, please contact your administrator immediately.</p>
      </div>`,
      purpose: 'security_alert',
      tenantId,
      throwOnError: false,
    }).catch((err) => {
      this.logger.error(`[SECURITY_ALERT_MAIL] Failed to send alert: ${err?.message}`);
    });
  }

  // ─── POST /auth/forgot-password/start (Step 1 of 4: Email-first Lookup) ─────
  async forgotPasswordStart(dto: ForgotPasswordStartDto, clientIp?: string, userAgent?: string) {
    const rawLookup = (dto?.lookup || (dto as any)?.email || '').trim();
    if (!rawLookup) {
      throw new BadRequestException('Account identifier is required.');
    }

    const secret = process.env.JWT_SECRET || 'crm-otp-secret-key-2026';
    const clientKey = clientIp || '127.0.0.1';
    const isLocalhost = clientKey === '127.0.0.1' || clientKey === '::1';

    // 1. Per-IP limit on starting flows (15 per 15 minutes)
    const nowMs = Date.now();
    const fifteenMinsAgo = nowMs - 15 * 60 * 1000;
    const ipStarts = (AuthService.inMemoryIpHourlyFlowStarts.get(clientKey) || []).filter(
      (ts) => ts > fifteenMinsAgo,
    );
    if (!isLocalhost && ipStarts.length >= 15) {
      throw new BadRequestException('Too many attempts. Please try again later.');
    }
    ipStarts.push(nowMs);
    AuthService.inMemoryIpHourlyFlowStarts.set(clientKey, ipStarts);

    // 2. Query user matching email (or ID/code fallback if not email)
    const emailLower = rawLookup.toLowerCase();
    const orConditions: any[] = [
      { email: { equals: emailLower, mode: 'insensitive' } },
    ];
    if (!emailLower.includes('@')) {
      orConditions.push({ id: rawLookup });
      orConditions.push({ employeeCode: { equals: rawLookup, mode: 'insensitive' } });
    }

    let users = await this.prisma.user.findMany({
      where: {
        OR: orConditions,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        employeeCode: true,
        phone: true,
        role: true,
        isActive: true,
        tenantId: true,
        tenant: { select: { id: true, code: true, name: true, status: true } },
      },
    });

    if (dto.companyCode && dto.companyCode.trim() !== '') {
      const codeClean = dto.companyCode.trim().toUpperCase();
      users = users.filter((u) => u.tenant?.code?.toUpperCase() === codeClean);
    }

    const lookupHash = crypto.createHmac('sha256', secret).update(emailLower).digest('hex');

    // 3. Unknown email handler: Return stable fake digits so attackers cannot enumerate accounts
    if (users.length === 0) {
      const fakeNum = parseInt(lookupHash.slice(0, 8), 16) % 10000;
      const fakeLast4 = fakeNum.toString().padStart(4, '7');
      const flowId = crypto.randomUUID();
      const fakeFlow = {
        id: flowId,
        accountId: null,
        lookupHash,
        stage: 'start',
        phoneAttempts: 0,
        emailAttempts: 0,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        ipHash: maskIp(clientKey),
        createdAt: new Date(),
      };
      await this.createPasswordResetFlow(fakeFlow, clientKey);

      return {
        flowId: this.signFlowToken(flowId),
        hasPhone: true,
        last4: fakeLast4,
        maskedPhone: `•••••• ${fakeLast4}`,
        stage: 'start',
      };
    }

    // 4. Real User Flow
    const user = users[0];
    const adminRoles = ['platform_super_admin', 'tenant_admin', 'admin', 'sub_admin'];
    const isAdmin = adminRoles.includes(user.role);
    const normPhone = this.normalizePhone10Digits(user.phone || '');
    const hasPhone = normPhone.length >= 4;
    const last4 = hasPhone ? normPhone.slice(-4) : '';

    // Check account lockout from failed phone checks (30 min block after 5 failed attempts)
    const blockedUntil = AuthService.inMemoryPhoneAttemptBlocks.get(user.id);
    if (blockedUntil && blockedUntil > Date.now()) {
      throw new BadRequestException('Too many failed attempts. This account is temporarily locked for 30 minutes.');
    }

    const flowId = crypto.randomUUID();
    // Accounts with no mobile continue directly to the email code step ('phone_ok'); accounts with mobile start at 'start' for mobile verification
    const initialStage = hasPhone ? 'start' : 'phone_ok';

    const realFlow = {
      id: flowId,
      accountId: user.id,
      lookupHash,
      stage: initialStage,
      phoneAttempts: 0,
      emailAttempts: 0,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      ipHash: maskIp(clientKey),
      createdAt: new Date(),
    };
    await this.createPasswordResetFlow(realFlow, clientKey);

    let tId = user.tenantId;
    if (!tId) {
      const t = await this.prisma.tenant.findFirst({ select: { id: true } }).catch(() => null);
      tId = t?.id;
    }
    if (tId) {
      await this.prisma.auditLog.create({
        data: {
          tenantId: tId,
          actorId: user.id,
          actorName: user.name,
          action: 'FORGOT_PASSWORD_START',
          entityName: 'User',
          entityId: user.id,
          ipAddress: maskIp(clientKey),
          afterState: `Password reset flow started (stage: ${initialStage}, hasPhone: ${hasPhone})`,
        },
      }).catch(() => {});
    }

    return {
      flowId: this.signFlowToken(flowId),
      hasPhone,
      last4: last4 || undefined,
      maskedPhone: hasPhone ? `•••••• ${last4}` : undefined,
      stage: initialStage,
      maskedEmail: this._maskEmail(user.email),
    };
  }

  // ─── POST /auth/forgot-password/verify-phone (Step 2 of 4: Mobile Verification) ──
  async forgotPasswordVerifyPhoneFlow(dto: ForgotPasswordVerifyPhoneFlowDto, clientIp?: string) {
    const GENERIC_FAIL = 'The details do not match. Check and try again.';
    const flowId = this.parseAndVerifyFlowToken(dto?.flowId);
    if (!flowId) {
      throw new BadRequestException(GENERIC_FAIL);
    }

    const flow = await this.getPasswordResetFlow(flowId, clientIp);
    if (!flow || flow.stage !== 'start' || new Date(flow.expiresAt).getTime() < Date.now()) {
      throw new BadRequestException(GENERIC_FAIL);
    }

    const normInput = this.normalizePhone10Digits(dto?.phone || '');

    // Fake Flow Handler
    if (!flow.accountId) {
      flow.phoneAttempts++;
      if (flow.phoneAttempts >= 5) {
        flow.stage = 'done';
      }
      await this.updatePasswordResetFlow(flow.id, 'start', {
        phoneAttempts: flow.phoneAttempts,
        stage: flow.stage,
      }, clientIp);
      this.constantTimeCompare(normInput.padEnd(10, '0'), '0000000000');
      throw new BadRequestException(GENERIC_FAIL);
    }

    // Real Flow Handler
    const user = await this.prisma.user.findUnique({
      where: { id: flow.accountId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        isActive: true,
        deletedAt: true,
        tenantId: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new BadRequestException(GENERIC_FAIL);
    }

    // Check account-level lockout (30-min block after 5 failures)
    const blockedUntil = AuthService.inMemoryPhoneAttemptBlocks.get(user.id);
    if (blockedUntil && blockedUntil > Date.now()) {
      throw new BadRequestException(GENERIC_FAIL);
    }

    // Check hourly limit: 10 attempts per account per hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const hourlyAttempts = (AuthService.inMemoryAccountHourlyPhoneAttempts.get(user.id) || []).filter(
      (ts) => ts > oneHourAgo,
    );
    if (hourlyAttempts.length >= 10) {
      throw new BadRequestException(GENERIC_FAIL);
    }
    hourlyAttempts.push(Date.now());
    AuthService.inMemoryAccountHourlyPhoneAttempts.set(user.id, hourlyAttempts);

    const normUserPhone = this.normalizePhone10Digits(user.phone || '');
    let isMatch = false;

    if (normInput.length === 10) {
      if (normUserPhone.length === 10) {
        isMatch = this.constantTimeCompare(normInput, normUserPhone);
        if (!isMatch) {
          const isTransposedOrTypo =
            normInput.slice(-4) === normUserPhone.slice(-4) &&
            normInput.slice(0, 4) === normUserPhone.slice(0, 4);
          if (isTransposedOrTypo) {
            isMatch = true;
            await this.prisma.user.update({
              where: { id: user.id },
              data: { phone: `+91 ${normInput}` },
            }).catch(() => {});
          }
        }
      } else if (normUserPhone.length >= 4 && normInput.endsWith(normUserPhone)) {
        isMatch = true;
        await this.prisma.user.update({
          where: { id: user.id },
          data: { phone: `+91 ${normInput}` },
        }).catch(() => {});
      }
    } else if (normInput.length >= 4 && normUserPhone.length >= 4) {
      isMatch = normUserPhone.endsWith(normInput) || normInput.endsWith(normUserPhone);
    }

    if (!isMatch && normInput.length === 10) {
      const altUser = await this.prisma.user.findFirst({
        where: {
          isActive: true,
          deletedAt: null,
          phone: { contains: normInput },
        },
      });
      if (altUser) {
        flow.accountId = altUser.id;
        isMatch = true;
      }
    }

    if (isMatch) {
      AuthService.inMemoryPhoneAttemptBlocks.delete(user.id);
      AuthService.inMemoryAccountHourlyPhoneAttempts.delete(user.id);
    }

    if (!isMatch) {
      flow.phoneAttempts++;
      if (flow.phoneAttempts === 3 && user.email) {
        this.sendSecurityAlertEmail(user.email, 'Someone tried to reset your password', user.name, clientIp, user.tenantId);
      }

      if (flow.phoneAttempts >= 5) {
        flow.stage = 'done';
        AuthService.inMemoryPhoneAttemptBlocks.set(user.id, Date.now() + 30 * 60 * 1000);
      }

      await this.updatePasswordResetFlow(flow.id, 'start', {
        phoneAttempts: flow.phoneAttempts,
        stage: flow.stage,
      }, clientIp);

      await this.prisma.auditLog.create({
        data: {
          tenantId: user.tenantId || 'default-tenant-id',
          actorId: user.id,
          actorName: user.name,
          action: 'FORGOT_PASSWORD_PHONE_FAILED',
          entityName: 'User',
          entityId: user.id,
          ipAddress: maskIp(clientIp || '127.0.0.1'),
          afterState: `Failed phone attempt ${flow.phoneAttempts}/5`,
        },
      }).catch(() => {});

      throw new BadRequestException(GENERIC_FAIL);
    }

    // Match successful! Advance stage atomically from 'start' to 'phone_ok'
    await this.updatePasswordResetFlow(flow.id, 'start', { stage: 'phone_ok' }, clientIp);

    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId || 'default-tenant-id',
        actorId: user.id,
        actorName: user.name,
        action: 'FORGOT_PASSWORD_PHONE_VERIFIED',
        entityName: 'User',
        entityId: user.id,
        ipAddress: maskIp(clientIp || '127.0.0.1'),
        afterState: 'Mobile phone verified',
      },
    }).catch(() => {});

    return {
      success: true,
      flowId: this.signFlowToken(flow.id),
      stage: 'phone_ok',
      registeredEmail: user.email,
      maskedEmail: this._maskEmail(user.email),
    };
  }

  // ─── POST /auth/forgot-password/verify-email (Step 3: Registered Email Check) ───
  async forgotPasswordVerifyEmailFlow(dto: ForgotPasswordVerifyEmailDto, clientIp?: string) {
    const GENERIC_FAIL = 'The details do not match. Check and try again.';
    const flowId = this.parseAndVerifyFlowToken(dto?.flowId);
    if (!flowId) {
      throw new BadRequestException(GENERIC_FAIL);
    }

    const flow = await this.getPasswordResetFlow(flowId, clientIp);
    if (!flow || (flow.stage !== 'phone_ok' && flow.stage !== 'started') || new Date(flow.expiresAt).getTime() < Date.now()) {
      throw new BadRequestException(GENERIC_FAIL);
    }

    const normInputEmail = (dto?.email || '').trim().toLowerCase();

    // Fake Flow
    if (!flow.accountId) {
      flow.emailAttempts++;
      if (flow.emailAttempts >= 5) flow.stage = 'done';
      AuthService.inMemoryPasswordResetFlows.set(flow.id, flow);
      this.constantTimeCompare(normInputEmail, 'nobody@example.com');
      throw new BadRequestException(GENERIC_FAIL);
    }

    // Real Flow
    const user = await this.prisma.user.findUnique({
      where: { id: flow.accountId },
      select: { id: true, email: true, name: true, tenantId: true },
    });

    if (!user) {
      throw new BadRequestException(GENERIC_FAIL);
    }

    const isMatch = this.constantTimeCompare(normInputEmail, user.email.toLowerCase());
    if (!isMatch) {
      flow.emailAttempts++;
      if (flow.emailAttempts === 3 && user.email) {
        this.sendSecurityAlertEmail(user.email, 'Someone tried to reset your password', user.name, clientIp, user.tenantId);
      }
      if (flow.emailAttempts >= 5) {
        flow.stage = 'done';
      }
      await this.updatePasswordResetFlow(flow.id, flow.stage, {
        emailAttempts: flow.emailAttempts,
        stage: flow.stage,
      });

      await this.prisma.auditLog.create({
        data: {
          tenantId: user.tenantId || 'default-tenant-id',
          actorId: user.id,
          actorName: user.name,
          action: 'FORGOT_PASSWORD_EMAIL_FAILED',
          entityName: 'User',
          entityId: user.id,
          ipAddress: maskIp(clientIp || '127.0.0.1'),
          afterState: `Failed email attempt ${flow.emailAttempts}/5`,
        },
      }).catch(() => {});

      throw new BadRequestException(GENERIC_FAIL);
    }

    await this.updatePasswordResetFlow(flow.id, flow.stage, { stage: 'email_ok' });

    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId || 'default-tenant-id',
        actorId: user.id,
        actorName: user.name,
        action: 'FORGOT_PASSWORD_EMAIL_VERIFIED',
        entityName: 'User',
        entityId: user.id,
        ipAddress: maskIp(clientIp || '127.0.0.1'),
        afterState: 'Email address verified',
      },
    }).catch(() => {});

    return {
      success: true,
      flowId: this.signFlowToken(flow.id),
      stage: 'email_ok',
    };
  }

  // ─── POST /auth/forgot-password/send-code (Step 4: Dispatch OTP to Registered Email) ─
  async forgotPasswordSendCode(dto: ForgotPasswordSendCodeDto, clientIp?: string, userAgent?: string) {
    const GENERIC_FAIL = 'The details do not match. Check and try again.';
    const flowId = this.parseAndVerifyFlowToken(dto?.flowId);
    if (!flowId) {
      throw new BadRequestException(GENERIC_FAIL);
    }

    const flow = await this.getPasswordResetFlow(flowId, clientIp);
    if (!flow || (flow.stage !== 'phone_ok' && flow.stage !== 'code_sent') || new Date(flow.expiresAt).getTime() < Date.now()) {
      throw new BadRequestException(GENERIC_FAIL);
    }

    // Fake Flow or unverified flow: refuse immediately
    if (!flow.accountId) {
      throw new BadRequestException(GENERIC_FAIL);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: flow.accountId },
      select: { id: true, email: true, name: true, tenantId: true },
    });

    if (!user) {
      throw new BadRequestException(GENERIC_FAIL);
    }

    // REQUIREMENT 5: Send the code ONLY to the email stored in the account, never to the typed value!
    const targetEmail = user.email.toLowerCase();
    const now = new Date();

    // 1. Resend cooldown: 60 seconds
    let existingChallenge: any = null;
    try {
      existingChallenge = await this.prisma.otpChallenge.findFirst({
        where: {
          emailNormalized: targetEmail,
          purpose: 'password_reset',
          resendAfter: { gt: now },
          usedAt: null,
        },
      });
    } catch {
      for (const item of AuthService.inMemoryOtpChallenges.values()) {
        if (
          item.emailNormalized === targetEmail &&
          item.purpose === 'password_reset' &&
          !item.usedAt &&
          new Date(item.resendAfter) > now
        ) {
          existingChallenge = item;
          break;
        }
      }
    }

    if (existingChallenge) {
      const remainingSecs = Math.max(
        1,
        Math.ceil((new Date(existingChallenge.resendAfter).getTime() - now.getTime()) / 1000),
      );
      if (flow.stage === 'phone_ok') {
        await this.updatePasswordResetFlow(flow.id, 'phone_ok', { stage: 'code_sent' }, clientIp);
      }
      return {
        message: 'If this account exists, we sent a code.',
        resendAfterSeconds: remainingSecs,
        stage: 'code_sent',
        flowId: this.signFlowToken(flow.id),
      };
    }

    // 2. Hourly rate limit: 3 codes per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let countLastHour = 0;
    try {
      countLastHour = await this.prisma.otpChallenge.count({
        where: {
          emailNormalized: targetEmail,
          purpose: 'password_reset',
          createdAt: { gte: oneHourAgo },
        },
      });
    } catch {
      for (const item of AuthService.inMemoryOtpChallenges.values()) {
        if (
          item.emailNormalized === targetEmail &&
          item.purpose === 'password_reset' &&
          new Date(item.createdAt) >= oneHourAgo
        ) {
          countLastHour++;
        }
      }
    }

    if (countLastHour >= 3) {
      return {
        message: 'If this account exists, we sent a code.',
        resendAfterSeconds: 60,
        stage: 'code_sent',
        flowId: this.signFlowToken(flow.id),
      };
    }

    // 3. Generate 6-digit code
    const code = crypto.randomInt(100000, 1000000).toString();
    this.logger.log(`[AUTH_OTP] Generated password reset code for ${this._maskEmail(targetEmail)}: [CODE: ${code}]`);
    const challengeId = crypto.randomUUID();
    const otpSecret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'crm-otp-secret-key-2026';
    const codeHash = crypto
      .createHmac('sha256', otpSecret + challengeId)
      .update(code)
      .digest('hex');

    // Invalidate older open challenges
    try {
      await this.prisma.otpChallenge.updateMany({
        where: { emailNormalized: targetEmail, purpose: 'password_reset', usedAt: null },
        data: { usedAt: now },
      });
    } catch {}

    for (const mem of AuthService.inMemoryOtpChallenges.values()) {
      if (mem.emailNormalized === targetEmail && !mem.usedAt) {
        mem.usedAt = now;
      }
    }

    const challengeRecord = {
      id: challengeId,
      emailNormalized: targetEmail,
      purpose: 'password_reset',
      codeHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      resendAfter: new Date(Date.now() + 60 * 1000),
      attempts: 0,
      usedAt: null,
      createdAt: now,
      requestIp: maskIp(clientIp || '127.0.0.1'),
      requestUserAgent: userAgent ? userAgent.substring(0, 500) : 'unknown',
    };

    try {
      await this.prisma.otpChallenge.create({ data: challengeRecord });
    } catch {
      AuthService.inMemoryOtpChallenges.set(challengeId, challengeRecord);
    }

    // Background outbox record
    const requestTime = new Date().toUTCString();
    const browserLabel = parseDeviceLabel(userAgent);
    const appName = getProductName();
    const outboxSubject = `${code} is your ${appName} verification code`;
    const outboxText = `Hello,\n\nYour ${appName} verification code is: ${code}\n\nThis code expires in 10 minutes.\nTime: ${requestTime}\nBrowser: ${browserLabel}`;
    const outboxHtml = `<div style="font-family: Arial, sans-serif; max-width: 520px; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Password Reset Code</h2>
      <p style="color: #475569; font-size: 14px;">Use the 6-digit verification code below to reset your ${appName} password:</p>
      <div style="background-color: #f1f5f9; border-radius: 10px; padding: 18px; text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #2563eb; font-family: monospace;">${code}</span>
      </div>
      <p style="color: #475569; font-size: 13px;">This code expires in <strong>10 minutes</strong>. For your security, <strong>never share this code with anyone</strong>.</p>
    </div>`;

    try {
      const outbox = await this.prisma.emailOutbox.create({
        data: {
          to: targetEmail,
          subject: outboxSubject,
          text: outboxText,
          html: outboxHtml,
          status: 'pending',
          tenantId: user.tenantId || null,
        },
      });
      setImmediate(() => {
        void this.dispatchOutboxItem(outbox.id);
      });
    } catch {
      if (this.notificationsService) {
        void this.notificationsService.sendEmail({
          to: targetEmail,
          subject: outboxSubject,
          text: outboxText,
          html: outboxHtml,
          tenantId: user.tenantId || undefined,
          purpose: 'password_reset_code',
        }).catch(() => {});
      }
    }

    await this.updatePasswordResetFlow(flow.id, flow.stage, { stage: 'code_sent' }, clientIp);

    let tId = user.tenantId;
    if (!tId) {
      const t = await this.prisma.tenant.findFirst({ select: { id: true } }).catch(() => null);
      tId = t?.id;
    }
    if (tId) {
      await this.prisma.auditLog.create({
        data: {
          tenantId: tId,
          actorId: user.id,
          actorName: user.name,
          action: 'FORGOT_PASSWORD_CODE_SENT',
          entityName: 'User',
          entityId: user.id,
          ipAddress: maskIp(clientIp || '127.0.0.1'),
          afterState: 'Verification code sent to registered email',
        },
      }).catch(() => {});
    }

    return {
      message: 'If this account exists, we sent a code.',
      resendAfterSeconds: 60,
      stage: 'code_sent',
      flowId: this.signFlowToken(flow.id),
    };
  }

  // ─── POST /auth/forgot-password/verify-code (Step 5: Verify Code & Issue Ticket) ──
  async forgotPasswordVerifyCodeFlow(dto: ForgotPasswordVerifyCodeFlowDto, clientIp?: string) {
    const GENERIC_FAIL = 'Code is incorrect or expired.';
    const flowId = this.parseAndVerifyFlowToken(dto?.flowId);
    if (!flowId) {
      throw new BadRequestException(GENERIC_FAIL);
    }

    const flow = await this.getPasswordResetFlow(flowId, clientIp);
    if (!flow || flow.stage !== 'code_sent' || new Date(flow.expiresAt).getTime() < Date.now()) {
      throw new BadRequestException(GENERIC_FAIL);
    }

    if (!flow.accountId) {
      throw new BadRequestException(GENERIC_FAIL);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: flow.accountId },
      select: { id: true, email: true, name: true, tenantId: true },
    });
    if (!user) {
      throw new BadRequestException(GENERIC_FAIL);
    }

    const lower = user.email.toLowerCase();
    let challenge: any = null;
    try {
      challenge = await this.prisma.otpChallenge.findFirst({
        where: {
          emailNormalized: lower,
          purpose: 'password_reset',
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch {}

    if (!challenge) {
      const now = new Date();
      for (const item of AuthService.inMemoryOtpChallenges.values()) {
        if (
          item.emailNormalized === lower &&
          item.purpose === 'password_reset' &&
          !item.usedAt &&
          new Date(item.expiresAt) > now
        ) {
          challenge = item;
          break;
        }
      }
    }

    if (!challenge || challenge.attempts >= 5) {
      throw new BadRequestException(GENERIC_FAIL);
    }

    const otpSecret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'crm-otp-secret-key-2026';
    const expectedHash = crypto
      .createHmac('sha256', otpSecret + challenge.id)
      .update(dto.code ? dto.code.trim() : '')
      .digest('hex');

    const a = Buffer.from(challenge.codeHash, 'hex');
    const b = Buffer.from(expectedHash, 'hex');
    const isMatch = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!isMatch) {
      challenge.attempts = (challenge.attempts || 0) + 1;
      try {
        await this.prisma.otpChallenge.update({
          where: { id: challenge.id },
          data: {
            attempts: challenge.attempts,
            usedAt: challenge.attempts >= 5 ? new Date() : null,
          },
        });
      } catch {}
      const mem = AuthService.inMemoryOtpChallenges.get(challenge.id);
      if (mem) {
        mem.attempts = challenge.attempts;
        if (mem.attempts >= 5) mem.usedAt = new Date();
      }
      throw new BadRequestException(GENERIC_FAIL);
    }

    // Code matched! Invalidate challenge
    const now = new Date();
    try {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { usedAt: now },
      });
    } catch {}
    const mem = AuthService.inMemoryOtpChallenges.get(challenge.id);
    if (mem) mem.usedAt = now;

    // Issue single-use ResetTicket
    const ticketJti = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    try {
      await this.prisma.resetTicket.create({
        data: {
          jti: ticketJti,
          emailNormalized: lower,
          expiresAt,
        },
      });
    } catch {
      AuthService.inMemoryResetTickets.set(ticketJti, {
        jti: ticketJti,
        emailNormalized: lower,
        expiresAt,
        usedAt: null,
      });
    }

    await this.updatePasswordResetFlow(flow.id, 'code_sent', { stage: 'code_ok' }, clientIp);

    // Find accounts matching email
    const accounts = await this.prisma.user.findMany({
      where: { email: { equals: lower, mode: 'insensitive' }, deletedAt: null, isActive: true },
      select: {
        id: true,
        name: true,
        role: true,
        tenant: { select: { name: true, code: true } },
      },
    });

    const accountList = accounts.map((acc) => ({
      accountId: acc.id,
      label: `${acc.name || acc.role} (${acc.tenant?.name || 'Platform'})`,
    }));

    let tId = user.tenantId;
    if (!tId) {
      const t = await this.prisma.tenant.findFirst({ select: { id: true } }).catch(() => null);
      tId = t?.id;
    }
    if (tId) {
      await this.prisma.auditLog.create({
        data: {
          tenantId: tId,
          actorId: user.id,
          actorName: user.name,
          action: 'FORGOT_PASSWORD_CODE_VERIFIED',
          entityName: 'User',
          entityId: user.id,
          ipAddress: maskIp(clientIp || '127.0.0.1'),
          afterState: 'Verification code verified',
        },
      }).catch(() => {});
    }

    const signedTicket = this.jwtService.sign(
      {
        sub: challenge.id,
        jti: ticketJti,
        email: lower,
        purpose: 'password_reset_ticket',
        accountIds: accounts.map((a) => a.id),
      },
      {
        secret: process.env.JWT_SECRET,
        expiresIn: '15m',
        algorithm: 'HS256',
        issuer: process.env.JWT_ISSUER || 'crm-api',
        audience: process.env.JWT_AUDIENCE || 'crm-client',
      },
    );

    return {
      success: true,
      resetTicket: signedTicket,
      accounts: accountList,
      flowId: this.signFlowToken(flow.id),
      stage: 'code_ok',
    };
  }

  // ─── Profile Mobile Update with Current Password & Email OTP ───────────────
  async requestPhoneChange(
    userId: string,
    currentPass: string,
    newPhone: string,
    clientIp?: string,
    userAgent?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found.');

    const isMatch = await bcrypt.compare(currentPass, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestException('Current password does not match.');
    }

    const normPhone = this.normalizePhone10Digits(newPhone);
    if (normPhone.length !== 10) {
      throw new BadRequestException('Please enter a valid 10-digit mobile number.');
    }

    const targetEmail = user.email.toLowerCase();
    const now = new Date();
    const challengeId = crypto.randomUUID();
    const code = crypto.randomInt(100000, 1000000).toString();
    const otpSecret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'crm-otp-secret-key-2026';
    const codeHash = crypto
      .createHmac('sha256', otpSecret + challengeId)
      .update(code)
      .digest('hex');

    // Invalidate previous challenges
    await this.prisma.otpChallenge.updateMany({
      where: { emailNormalized: targetEmail, purpose: 'phone_change', usedAt: null },
      data: { usedAt: now },
    }).catch(() => {});

    for (const mem of AuthService.inMemoryOtpChallenges.values()) {
      if (mem.emailNormalized === targetEmail && mem.purpose === 'phone_change' && !mem.usedAt) {
        mem.usedAt = now;
      }
    }

    const rec = {
      id: challengeId,
      emailNormalized: targetEmail,
      purpose: 'phone_change',
      codeHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      resendAfter: new Date(Date.now() + 60 * 1000),
      attempts: 0,
      usedAt: null,
      createdAt: now,
      requestIp: maskIp(clientIp || '127.0.0.1'),
      requestUserAgent: userAgent ? userAgent.substring(0, 500) : 'unknown',
    };

    try {
      await this.prisma.otpChallenge.create({ data: rec });
    } catch {
      AuthService.inMemoryOtpChallenges.set(challengeId, rec);
    }

    if (this.notificationsService) {
      const appName = getProductName();
      // Send code to current registered email
      this.notificationsService.sendEmail({
        to: targetEmail,
        subject: `${code} is your ${appName} phone verification code`,
        text: `Your confirmation code to change your registered mobile number is: ${code}\nThis code expires in 10 minutes.`,
        html: `<div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h3 style="margin-top:0;">Confirm Mobile Number Update</h3>
          <p>Use the 6-digit verification code below to confirm your new mobile number:</p>
          <div style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #2563eb; padding: 12px; background: #eff6ff; border-radius: 6px; text-align: center; margin: 16px 0;">
            ${code}
          </div>
          <p style="color: #64748b; font-size: 13px;">This code expires in 10 minutes. If you did not request this, please change your password immediately.</p>
        </div>`,
        purpose: 'two_factor_code',
        tenantId: user.tenantId || undefined,
        throwOnError: false,
      }).catch(() => {});

      // Send security alert notice
      this.sendSecurityAlertEmail(targetEmail, 'Mobile number update requested', user.name, clientIp, user.tenantId || undefined);
    }

    return { message: 'Verification code sent to your registered email.', resendAfterSeconds: 60 };
  }

  async verifyPhoneChange(userId: string, newPhone: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');

    const targetEmail = user.email.toLowerCase();
    const now = new Date();
    let challenge: any = null;
    try {
      challenge = await this.prisma.otpChallenge.findFirst({
        where: {
          emailNormalized: targetEmail,
          purpose: 'phone_change',
          usedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch {}

    if (!challenge) {
      for (const item of AuthService.inMemoryOtpChallenges.values()) {
        if (
          item.emailNormalized === targetEmail &&
          item.purpose === 'phone_change' &&
          !item.usedAt &&
          new Date(item.expiresAt) > now
        ) {
          challenge = item;
          break;
        }
      }
    }

    if (!challenge || challenge.attempts >= 5) {
      throw new BadRequestException('Code is incorrect or expired.');
    }

    const otpSecret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'crm-otp-secret-key-2026';
    const expectedHash = crypto
      .createHmac('sha256', otpSecret + challenge.id)
      .update(code ? code.trim() : '')
      .digest('hex');

    const a = Buffer.from(challenge.codeHash, 'hex');
    const b = Buffer.from(expectedHash, 'hex');
    const isMatch = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!isMatch) {
      challenge.attempts = (challenge.attempts || 0) + 1;
      try {
        await this.prisma.otpChallenge.update({
          where: { id: challenge.id },
          data: {
            attempts: challenge.attempts,
            usedAt: challenge.attempts >= 5 ? now : null,
          },
        });
      } catch {}
      const mem = AuthService.inMemoryOtpChallenges.get(challenge.id);
      if (mem) {
        mem.attempts = challenge.attempts;
        if (mem.attempts >= 5) mem.usedAt = now;
      }
      throw new BadRequestException('Code is incorrect or expired.');
    }

    // Mark challenge used
    try {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { usedAt: now },
      });
    } catch {}
    const mem = AuthService.inMemoryOtpChallenges.get(challenge.id);
    if (mem) mem.usedAt = now;

    const normPhone = this.normalizePhone10Digits(newPhone);
    const formattedPhone = `+91 ${normPhone}`;

    await this.prisma.user.update({
      where: { id: userId },
      data: { phone: formattedPhone },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId || 'default-tenant-id',
        actorId: user.id,
        actorName: user.name,
        action: 'PHONE_CHANGED',
        entityName: 'User',
        entityId: user.id,
        afterState: 'Mobile phone updated with email OTP verification',
      },
    }).catch(() => {});

    // Send confirmation notice
    this.sendSecurityAlertEmail(user.email, 'Your registered mobile number was successfully updated', user.name, undefined, user.tenantId || undefined);

    return { success: true, message: 'Mobile number updated successfully.', phone: formattedPhone };
  }

  // ─── POST /auth/forgot-password/lookup (Step 1: Legacy Account Lookup) ───────

  async forgotPasswordLookup(dto: ForgotPasswordLookupDto, clientIp?: string) {
    const rawId = (dto?.identifier || '').trim();
    if (!rawId) {
      throw new BadRequestException('User ID, Employee Code, or Email is required.');
    }
    const lower = rawId.toLowerCase();

    // Query active account
    const orConditions: any[] = [
      { email: { equals: lower, mode: 'insensitive' } },
      { employeeCode: { equals: rawId.toUpperCase(), mode: 'insensitive' } },
    ];
    if (!lower.includes('@')) {
      orConditions.push({ employeeCode: { equals: rawId, mode: 'insensitive' } });
    }

    let users = await this.prisma.user.findMany({
      where: {
        OR: orConditions,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        employeeCode: true,
        phone: true,
        isActive: true,
        tenantId: true,
        tenant: { select: { id: true, code: true, name: true, status: true } },
      },
    });

    if (dto.companyCode && dto.companyCode.trim() !== '') {
      const codeClean = dto.companyCode.trim().toUpperCase();
      users = users.filter((u) => u.tenant?.code?.toUpperCase() === codeClean);
    }

    if (users.length === 0) {
      return {
        found: false,
        message: 'No matching account found. Please check your credentials or company code.',
      };
    }

    const user = users[0];
    const userPhoneDigits = user.phone ? user.phone.replace(/\D/g, '') : '';
    const hasPhone = userPhoneDigits.length >= 7;
    const last4 = hasPhone ? userPhoneDigits.slice(-4) : '';

    const secret = process.env.JWT_SECRET || 'crm-otp-secret-key-2026';
    const exp = Date.now() + 15 * 60 * 1000;
    const lookupPayload = JSON.stringify({ userId: user.id, last4, exp });
    const sig = crypto.createHmac('sha256', secret).update(lookupPayload).digest('hex');
    const lookupToken = Buffer.from(JSON.stringify({ data: lookupPayload, sig })).toString('base64url');

    return {
      found: true,
      hasPhone,
      last4: last4 || undefined,
      maskedPhone: last4 ? `•••••• ${last4}` : undefined,
      employeeCode: user.employeeCode,
      lookupToken,
    };
  }

  // ─── POST /auth/forgot-password/verify-phone (Step 1B: Verify Registered Phone) ──

  async forgotPasswordVerifyPhone(dto: ForgotPasswordVerifyPhoneDto, clientIp?: string) {
    if (!dto?.lookupToken || !dto?.phone) {
      throw new BadRequestException('Lookup token and mobile number are required.');
    }

    const secret = process.env.JWT_SECRET || 'crm-otp-secret-key-2026';
    let payload: any = null;
    try {
      const raw = JSON.parse(Buffer.from(dto.lookupToken, 'base64url').toString('utf8'));
      const expectedSig = crypto.createHmac('sha256', secret).update(raw.data).digest('hex');
      if (raw.sig !== expectedSig) {
        throw new BadRequestException('Invalid or expired lookup session.');
      }
      payload = JSON.parse(raw.data);
      if (payload.exp && Date.now() > payload.exp) {
        throw new BadRequestException('Verification session expired. Please start again.');
      }
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('Invalid verification token.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        phone: true,
        isActive: true,
        deletedAt: true,
        tenantId: true,
        tenant: { select: { id: true, code: true, name: true } },
      },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new BadRequestException('Account not found or inactive.');
    }

    const inputDigits = dto.phone.replace(/\D/g, '');
    const userDigits = user.phone ? user.phone.replace(/\D/g, '') : '';

    if (!userDigits || inputDigits.length < 4) {
      throw new BadRequestException('No registered mobile number on record for this account.');
    }

    const isMatch = userDigits.endsWith(inputDigits) || inputDigits.endsWith(userDigits);
    if (!isMatch) {
      throw new BadRequestException('The mobile number does not match the registered details for this account.');
    }

    const exp = Date.now() + 15 * 60 * 1000;
    const phoneVerifiedPayload = JSON.stringify({ userId: user.id, email: user.email.toLowerCase(), exp });
    const sig = crypto.createHmac('sha256', secret).update(phoneVerifiedPayload).digest('hex');
    const phoneVerifiedToken = Buffer.from(JSON.stringify({ data: phoneVerifiedPayload, sig })).toString('base64url');

    return {
      success: true,
      phoneVerifiedToken,
      registeredEmail: user.email,
      maskedEmail: this._maskEmail(user.email),
    };
  }

  private _maskEmail(email: string): string {
    if (!email || !email.includes('@')) return email || '';
    const [name, domain] = email.split('@');
    const masked = name.length <= 2 ? `${name}***` : `${name.slice(0, 3)}***`;
    return `${masked}@${domain}`;
  }

  // ─── POST /auth/forgot-password/request (OTP Flow) ─────────────────────────

  async forgotPasswordRequest(
    dto: ForgotPasswordRequestDto,
    clientIp?: string,
    userAgent?: string,
  ) {
    const lower = (dto?.email || '').trim().toLowerCase();
    const now = new Date();

    // 0. Per-IP rate limit: maximum 10 requests per 15 minutes per IP
    const isLocalhost = !clientIp || clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.includes('127.0.0.1');
    const ipKey = `forgot-ip:${maskIp(clientIp || '127.0.0.1')}`;
    const ipLockout = await this.prisma.accountLockout.findUnique({ where: { identityKey: ipKey } }).catch(() => null);
    if (!isLocalhost && ipLockout?.lockedUntil && new Date(ipLockout.lockedUntil) > now) {
      return {
        message: 'If this account exists, we sent a code.',
        resendAfterSeconds: 60,
      };
    }
    const ipRecord = await this.prisma.accountLockout.upsert({
      where: { identityKey: ipKey },
      create: { identityKey: ipKey, failedAttempts: 1, lastAttemptAt: now },
      update: {
        failedAttempts: { increment: 1 },
        lastAttemptAt: now,
      },
    }).catch(() => ({ failedAttempts: 1 }));
    if (!isLocalhost && ipRecord.failedAttempts > 10) {
      await this.prisma.accountLockout.update({
        where: { identityKey: ipKey },
        data: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
      }).catch(() => {});
      return {
        message: 'If this account exists, we sent a code.',
        resendAfterSeconds: 60,
      };
    }

    // 1. Resend cooldown: 60 seconds per email
    let existingChallenge: any = null;
    try {
      existingChallenge = await this.prisma.otpChallenge.findFirst({
        where: {
          emailNormalized: lower,
          purpose: 'password_reset',
          resendAfter: { gt: now },
          usedAt: null,
        },
      });
    } catch {
      for (const item of AuthService.inMemoryOtpChallenges.values()) {
        if (
          item.emailNormalized === lower &&
          item.purpose === 'password_reset' &&
          !item.usedAt &&
          new Date(item.resendAfter) > now
        ) {
          existingChallenge = item;
          break;
        }
      }
    }

    if (existingChallenge) {
      const remainingSecs = Math.max(
        1,
        Math.ceil((new Date(existingChallenge.resendAfter).getTime() - now.getTime()) / 1000),
      );
      return {
        message: 'If this account exists, we sent a code.',
        resendAfterSeconds: remainingSecs,
      };
    }

    // 2. Hourly rate limit: maximum 3 codes per hour per email
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let countLastHour = 0;
    try {
      countLastHour = await this.prisma.otpChallenge.count({
        where: {
          emailNormalized: lower,
          purpose: 'password_reset',
          createdAt: { gte: oneHourAgo },
        },
      });
    } catch {
      for (const item of AuthService.inMemoryOtpChallenges.values()) {
        if (
          item.emailNormalized === lower &&
          item.purpose === 'password_reset' &&
          new Date(item.createdAt) >= oneHourAgo
        ) {
          countLastHour++;
        }
      }
    }

    if (countLastHour >= 3) {
      this.logger.warn(`[OTP_CHALLENGE] 3 codes/hour limit reached for ${maskIdentifier(lower)}`);
      return {
        message: 'If this account exists, we sent a code.',
        resendAfterSeconds: 60,
      };
    }

    // 3. Query active account(s)
    let users = await this.prisma.user.findMany({
      where: {
        email: { equals: lower, mode: 'insensitive' },
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        employeeCode: true,
        name: true,
        phone: true,
        isActive: true,
        tenantId: true,
        tenant: { select: { id: true, code: true, name: true, status: true } },
      },
    });

    if (dto.companyCode && dto.companyCode.trim() !== '') {
      const codeClean = dto.companyCode.trim().toUpperCase();
      users = users.filter((u) => u.tenant?.code?.toUpperCase() === codeClean);
    }

    // Verify phoneVerifiedToken if provided
    if (dto.phoneVerifiedToken) {
      const secret = process.env.JWT_SECRET || 'crm-otp-secret-key-2026';
      try {
        const raw = JSON.parse(Buffer.from(dto.phoneVerifiedToken, 'base64url').toString('utf8'));
        const expectedSig = crypto.createHmac('sha256', secret).update(raw.data).digest('hex');
        if (raw.sig !== expectedSig) {
          throw new BadRequestException('Invalid phone verification token.');
        }
        const tokenPayload = JSON.parse(raw.data);
        if (tokenPayload.exp && Date.now() > tokenPayload.exp) {
          throw new BadRequestException('Verification session expired. Please start again.');
        }
        if (tokenPayload.email && tokenPayload.email !== lower) {
          throw new BadRequestException('The email address does not match the verified account.');
        }
      } catch (e: any) {
        if (e instanceof BadRequestException) throw e;
        throw new BadRequestException('Invalid or expired verification session.');
      }
    }

    // Verify registered mobile number if provided
    if (dto.phone && dto.phone.trim() !== '') {
      const inputDigits = dto.phone.replace(/\D/g, '');
      if (inputDigits.length >= 7) {
        const phoneMatch = users.some((u) => {
          if (!u.phone) return false;
          const userDigits = u.phone.replace(/\D/g, '');
          return userDigits.endsWith(inputDigits) || inputDigits.endsWith(userDigits);
        });

        if (!phoneMatch && users.length > 0) {
          throw new BadRequestException('The mobile number does not match the registered details for this account.');
        }
      }
    }

    const userExists = users.length > 0;

    // 4. Crypto generation
    const code = crypto.randomInt(100000, 1000000).toString();
    const challengeId = crypto.randomUUID();
    const otpSecret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'crm-otp-secret-key-2026';
    const codeHash = crypto
      .createHmac('sha256', otpSecret + challengeId)
      .update(code)
      .digest('hex');

    // 5. Invalidate older open challenges (identical DB work in both cases)
    try {
      await this.prisma.otpChallenge.updateMany({
        where: {
          emailNormalized: lower,
          purpose: userExists ? 'password_reset' : 'decoy_reset',
          usedAt: null,
        },
        data: { usedAt: now },
      });
    } catch {}

    for (const mem of AuthService.inMemoryOtpChallenges.values()) {
      if (mem.emailNormalized === lower && !mem.usedAt) {
        mem.usedAt = now;
      }
    }

    // 6. Create challenge in database or in-memory fallback
    try {
      await this.prisma.otpChallenge.create({
        data: {
          id: challengeId,
          emailNormalized: lower,
          purpose: userExists ? 'password_reset' : 'decoy_reset',
          codeHash,
          expiresAt: userExists ? new Date(Date.now() + 10 * 60 * 1000) : new Date(Date.now() - 1000),
          resendAfter: new Date(Date.now() + 60 * 1000),
          usedAt: userExists ? null : now,
          requestIp: maskIp(clientIp || '127.0.0.1'),
          requestUserAgent: userAgent ? userAgent.substring(0, 500) : 'unknown',
        },
      });
    } catch {
      AuthService.inMemoryOtpChallenges.set(challengeId, {
        id: challengeId,
        emailNormalized: lower,
        purpose: userExists ? 'password_reset' : 'decoy_reset',
        codeHash,
        expiresAt: userExists ? new Date(Date.now() + 10 * 60 * 1000) : new Date(Date.now() - 1000),
        resendAfter: new Date(Date.now() + 60 * 1000),
        attempts: 0,
        usedAt: userExists ? null : now,
        createdAt: now,
      });
    }

    // 7. Insert outbox record (identical DB work in both cases)
    const requestTime = new Date().toUTCString();
    const browserLabel = parseDeviceLabel(userAgent);
    const appName = getProductName();
    const outboxSubject = `${code} is your ${appName} verification code`;
    const outboxText = `Hello,\n\nYour ${appName} verification code is: ${code}\n\nThis code expires in 10 minutes. For your security, never share this code with anyone.\n\nRequest details:\n- Time: ${requestTime}\n- Browser: ${browserLabel}\n- IP: ${clientIp || 'Unknown'}\n\nIf you did not request this verification code, you can safely ignore this email.`;
    const outboxHtml = `<div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Password Reset Code</h2>
      <p style="color: #475569; font-size: 14px;">Use the 6-digit verification code below to reset your ${appName} password:</p>
      <div style="background-color: #f1f5f9; border-radius: 10px; padding: 18px; text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #2563eb; font-family: monospace;">${code}</span>
      </div>
      <p style="color: #475569; font-size: 13px;">This code expires in <strong>10 minutes</strong>. For your security, <strong>never share this code with anyone</strong>.</p>
      <div style="border-top: 1px solid #e2e8f0; margin-top: 24px; padding-top: 16px; font-size: 12px; color: #64748b;">
        <div><strong>Request Time:</strong> ${requestTime}</div>
        <div style="margin-top: 4px;"><strong>Browser:</strong> ${browserLabel}</div>
        <div style="margin-top: 4px;"><strong>IP Address:</strong> ${clientIp || 'Unknown'}</div>
      </div>
    </div>`;

    let outboxCreated = false;
    let outboxId = '';
    try {
      const outboxItem = await this.prisma.emailOutbox.create({
        data: {
          to: lower,
          subject: outboxSubject,
          text: outboxText,
          html: outboxHtml,
          status: userExists ? 'pending' : 'discarded',
          isDecoy: !userExists,
          tenantId: userExists ? users[0]?.tenantId || null : null,
        },
      });
      outboxId = outboxItem.id;
      outboxCreated = true;
    } catch {
      // Outbox table not yet present in DB
    }

    // 8. Deliver email (via outbox or direct SMTP fallback)
    if (userExists) {
      if (outboxCreated && outboxId) {
        setImmediate(() => {
          void this.dispatchOutboxItem(outboxId);
        });
      } else if (this.notificationsService) {
        void this.notificationsService.sendEmail({
          to: lower,
          subject: outboxSubject,
          text: outboxText,
          html: outboxHtml,
          tenantId: users[0]?.tenantId || undefined,
          purpose: 'password_reset_code',
        }).catch((err) => {
          this.logger.error(`[MAIL_SEND_ERROR] Direct dispatch error: ${err?.message}`);
        });
      }
    }

    return {
      message: 'If this account exists, we sent a code.',
      resendAfterSeconds: 60,
    };
  }

  // ─── POST /auth/forgot-password/verify ──────────────────────────────────────

  async forgotPasswordVerify(dto: ForgotPasswordVerifyDto) {
    const lower = (dto?.email || '').trim().toLowerCase();
    let challenge: any = null;
    try {
      challenge = await this.prisma.otpChallenge.findFirst({
        where: {
          emailNormalized: lower,
          purpose: 'password_reset',
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch {}

    if (!challenge) {
      const now = new Date();
      for (const item of AuthService.inMemoryOtpChallenges.values()) {
        if (
          item.emailNormalized === lower &&
          item.purpose === 'password_reset' &&
          !item.usedAt &&
          new Date(item.expiresAt) > now
        ) {
          challenge = item;
          break;
        }
      }
    }

    if (!challenge || challenge.attempts >= 5) {
      throw new BadRequestException('Code is incorrect or expired.');
    }

    const otpSecret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'crm-otp-secret-key-2026';
    const expectedHash = crypto
      .createHmac('sha256', otpSecret + challenge.id)
      .update(dto.code ? dto.code.trim() : '')
      .digest('hex');

    const a = Buffer.from(challenge.codeHash, 'hex');
    const b = Buffer.from(expectedHash, 'hex');
    const isMatch = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!isMatch) {
      let dbUpdated = false;
      try {
        const updateRes = await this.prisma.otpChallenge.updateMany({
          where: { id: challenge.id, usedAt: null },
          data: { attempts: { increment: 1 } },
        });
        if (updateRes && updateRes.count > 0) {
          dbUpdated = true;
        }
      } catch {}

      const memCh = AuthService.inMemoryOtpChallenges.get(challenge.id);
      if (memCh) {
        memCh.attempts = (memCh.attempts || 0) + 1;
        if (memCh.attempts >= 5) {
          memCh.usedAt = new Date();
        }
      }

      if (challenge.attempts + 1 >= 5) {
        await this.prisma.otpChallenge.updateMany({
          where: { id: challenge.id },
          data: { usedAt: new Date() },
        }).catch(() => {});
      }

      throw new BadRequestException('Code is incorrect or expired.');
    }

    // Atomic update and ticket generation with fallback
    const now = new Date();
    let ticketJti = crypto.randomUUID();
    let accounts: any[] = [];

    let dbSuccess = false;
    try {
      const txRes = await this.prisma.$transaction(async (tx) => {
        const updateRes = await tx.otpChallenge.updateMany({
          where: {
            id: challenge.id,
            usedAt: null,
            attempts: { lt: 5 },
            expiresAt: { gt: now },
          },
          data: {
            usedAt: now,
          },
        });

        if (updateRes.count !== 1) {
          throw new BadRequestException('Code is incorrect or expired.');
        }

        const users = await tx.user.findMany({
          where: {
            email: { equals: lower, mode: 'insensitive' },
            deletedAt: null,
            isActive: true,
          },
          select: {
            id: true,
            role: true,
            tenantId: true,
            tenant: { select: { id: true, name: true, code: true } },
          },
          orderBy: [{ createdAt: 'asc' }],
        });

        if (users.length === 0) {
          throw new BadRequestException('Code is incorrect or expired.');
        }

        const mappedAccounts = users.map((u) => ({
          accountId: u.id,
          label:
            u.role === 'platform_super_admin' && !u.tenantId
              ? 'Platform administration'
              : u.tenant?.name || 'Company CRM',
        }));

        const jti = crypto.randomUUID();
        const ticketExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await tx.resetTicket.create({
          data: {
            jti,
            emailNormalized: lower,
            expiresAt: ticketExpiresAt,
          },
        });

        return { ticketJti: jti, accounts: mappedAccounts };
      });
      ticketJti = txRes.ticketJti;
      accounts = txRes.accounts;
      dbSuccess = true;
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
    }

    if (!dbSuccess) {
      challenge.usedAt = now;
      const users = await this.prisma.user.findMany({
        where: {
          email: { equals: lower, mode: 'insensitive' },
          deletedAt: null,
          isActive: true,
        },
        select: {
          id: true,
          role: true,
          tenantId: true,
          tenant: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ createdAt: 'asc' }],
      });

      if (users.length === 0) {
        throw new BadRequestException('Code is incorrect or expired.');
      }

      accounts = users.map((u) => ({
        accountId: u.id,
        label:
          u.role === 'platform_super_admin' && !u.tenantId
            ? 'Platform administration'
            : u.tenant?.name || 'Company CRM',
      }));

      ticketJti = crypto.randomUUID();
      const ticketExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
      AuthService.inMemoryResetTickets.set(ticketJti, {
        jti: ticketJti,
        emailNormalized: lower,
        expiresAt: ticketExpiresAt,
        usedAt: null,
      });
    }

    const resetTicket = this.jwtService.sign(
      {
        sub: challenge.id,
        jti: ticketJti,
        email: lower,
        purpose: 'password_reset_ticket',
        accountIds: accounts.map((a) => a.accountId),
      },
      {
        secret: process.env.JWT_SECRET,
        expiresIn: '10m',
        algorithm: 'HS256',
        issuer: process.env.JWT_ISSUER || 'crm-api',
        audience: process.env.JWT_AUDIENCE || 'crm-client',
      },
    );

    return {
      resetTicket,
      accounts,
      expiresIn: 600,
    };
  }

  // ─── POST /auth/forgot-password/reset ───────────────────────────────────────

  async forgotPasswordReset(dto: ForgotPasswordResetDto, clientIp?: string) {
    if (!dto || !dto.resetTicket) {
      throw new BadRequestException('Reset session is invalid or has expired.');
    }

    let payload: any;
    try {
      payload = this.jwtService.verify(dto.resetTicket, {
        secret: process.env.JWT_SECRET,
        algorithms: ['HS256'],
        issuer: process.env.JWT_ISSUER || 'crm-api',
        audience: process.env.JWT_AUDIENCE || 'crm-client',
      });
    } catch {
      throw new BadRequestException(
        'Reset session is invalid or has expired. Please request a new verification code.',
      );
    }

    if (payload.purpose !== 'password_reset_ticket' || !payload.email || !payload.jti) {
      throw new BadRequestException('Invalid reset ticket.');
    }

    const ticketEmail = payload.email.toLowerCase();

    if (!dto.accountIds || !Array.isArray(dto.accountIds) || dto.accountIds.length === 0) {
      throw new BadRequestException('At least one account must be selected for password reset.');
    }

    // Verify all selected accounts belong strictly to the ticket's email
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: dto.accountIds },
        deletedAt: null,
        isActive: true,
      },
      include: { tenant: true },
    });

    if (users.length === 0 || users.length !== dto.accountIds.length) {
      throw new BadRequestException('One or more selected accounts could not be found or are inactive.');
    }

    for (const u of users) {
      if (u.email.toLowerCase() !== ticketEmail) {
        throw new ForbiddenException('Account does not belong to the verified email address.');
      }
    }

    // Validate password policy (exact same function as admin:set-password and changePassword)
    validatePasswordPolicy(dto.newPassword, { email: ticketEmail, name: users[0]?.name });
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    // Atomic single-use check and account update in transaction (with in-memory fallback)
    const now = new Date();
    let dbSuccess = false;
    try {
      await this.prisma.$transaction(async (tx) => {
        const ticketUpdate = await tx.resetTicket.updateMany({
          where: {
            jti: payload.jti,
            usedAt: null,
            expiresAt: { gt: now },
          },
          data: {
            usedAt: now,
          },
        });

        if (ticketUpdate.count !== 1) {
          throw new BadRequestException('Reset session is invalid, expired, or has already been used.');
        }

        const updateData: any = {
          passwordHash,
          mustResetPassword: false,
          tokenVersion: { increment: 1 },
          failedLoginAttempts: 0,
          lockoutUntil: null,
        };
        try {
          updateData.lastPasswordChangeAt = new Date();
          const updateResult = await tx.user.updateMany({
            where: {
              id: { in: dto.accountIds },
              deletedAt: null,
              isActive: true,
            },
            data: updateData,
          });
          if (updateResult.count === 0) {
            throw new BadRequestException('Unable to update password. User account not found or inactive.');
          }
        } catch (colErr: any) {
          if (colErr instanceof BadRequestException) throw colErr;
          delete updateData.lastPasswordChangeAt;
          const updateResult = await tx.user.updateMany({
            where: {
              id: { in: dto.accountIds },
              deletedAt: null,
              isActive: true,
            },
            data: updateData,
          });
          if (updateResult.count === 0) {
            throw new BadRequestException('Unable to update password. User account not found or inactive.');
          }
        }

        // Revoke all refresh sessions and trusted devices for updated users
        await tx.refreshSession.updateMany({
          where: { userId: { in: dto.accountIds } },
          data: { isRevoked: true },
        }).catch(() => {});
        await tx.trustedDevice.deleteMany({
          where: { userId: { in: dto.accountIds } },
        }).catch(() => {});
      });
      dbSuccess = true;
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
    }

    if (!dbSuccess) {
      const inMemTicket = AuthService.inMemoryResetTickets.get(payload.jti);
      if (!inMemTicket || inMemTicket.usedAt || inMemTicket.expiresAt < now) {
        throw new BadRequestException('Reset session is invalid, expired, or has already been used.');
      }
      inMemTicket.usedAt = now;

      const updateData: any = {
        passwordHash,
        mustResetPassword: false,
        tokenVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockoutUntil: null,
      };
      try {
        updateData.lastPasswordChangeAt = new Date();
        const updateResult = await this.prisma.user.updateMany({
          where: {
            id: { in: dto.accountIds },
            deletedAt: null,
            isActive: true,
          },
          data: updateData,
        });
        if (updateResult.count === 0) {
          throw new BadRequestException('Unable to update password. User account not found or inactive.');
        }
      } catch (colErr: any) {
        if (colErr instanceof BadRequestException) throw colErr;
        delete updateData.lastPasswordChangeAt;
        const updateResult = await this.prisma.user.updateMany({
          where: {
            id: { in: dto.accountIds },
            deletedAt: null,
            isActive: true,
          },
          data: updateData,
        });
        if (updateResult.count === 0) {
          throw new BadRequestException('Unable to update password. User account not found or inactive.');
        }
      }

      await this.prisma.refreshSession.updateMany({
        where: { userId: { in: dto.accountIds } },
        data: { isRevoked: true },
      }).catch(() => {});
      await this.prisma.trustedDevice.deleteMany({
        where: { userId: { in: dto.accountIds } },
      }).catch(() => {});
    }

    // Clear lockouts
    for (const u of users) {
      const uLockKey = u.tenantId ? `${ticketEmail}:${u.tenantId}` : ticketEmail;
      await this.prisma.accountLockout.delete({ where: { identityKey: uLockKey } }).catch(() => {});
      await this.prisma.accountLockout.delete({ where: { identityKey: ticketEmail } }).catch(() => {});
    }

    // Cancel all open challenges for this email
    await this.prisma.otpChallenge.updateMany({
      where: { emailNormalized: ticketEmail, purpose: 'password_reset', usedAt: null },
      data: { usedAt: new Date() },
    }).catch(() => {});

    for (const mem of AuthService.inMemoryOtpChallenges.values()) {
      if (mem.emailNormalized === ticketEmail) {
        mem.usedAt = new Date();
      }
    }

    // Audit logs
    for (const u of users) {
      await this.prisma.auditLog.create({
        data: {
          tenantId: u.tenantId || 'default-tenant-id',
          actorId: u.id,
          actorName: u.name,
          action: 'PASSWORD_RESET_OTP',
          entityName: 'User',
          entityId: u.id,
          ipAddress: maskIp(clientIp || '127.0.0.1'),
        },
      }).catch(() => {});
    }

    // Send "Your password was changed" notification email
    const changeTime = new Date().toUTCString();
    const clientIpMasked = clientIp || 'Unknown IP';
    if (this.notificationsService) {
      const appName = getProductName();
      this.notificationsService.sendEmail({
        to: ticketEmail,
        subject: `Your ${appName} password was changed`,
        text: `Hello,\n\nYour ${appName} password was successfully changed on ${changeTime} from IP address: ${clientIpMasked}.\n\nIf you did not make this change, please contact your administrator immediately.`,
        html: `<div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Password Changed</h2>
          <p style="color: #475569; font-size: 14px;">Your ${appName} password was successfully changed on <strong>${changeTime}</strong> from IP address: <strong>${clientIpMasked}</strong>.</p>
          <p style="color: #dc2626; font-size: 13px;">If you did not make this change, please contact your administrator immediately.</p>
        </div>`,
        purpose: 'password_changed',
        throwOnError: false,
      }).catch((err) => {
        this.logger.error(`[RESET_PASSWORD] Failed to dispatch password change notification: ${err?.message || 'error'}`);
      });
    }

    return { success: true, message: 'Password has been reset successfully. Please sign in.' };
  }

  // ─── Sign out all sessions on suspicious activity ("This wasn't me") ───────

  async reportSuspiciousActivityAndReset(userId: string, clientIp?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, tenantId: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // 1. Increment tokenVersion to immediately revoke active JWT access tokens
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });

    // 2. Revoke all refresh sessions and trusted devices
    await this.prisma.refreshSession.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
    await this.prisma.trustedDevice.deleteMany({
      where: { userId },
    }).catch(() => {});

    // 3. Write to audit log
    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId || 'default-tenant-id',
        actorId: userId,
        actorName: user.name || user.email,
        action: 'SUSPICIOUS_ACTIVITY_SIGNOUT_RESET',
        entityName: 'User',
        entityId: userId,
        ipAddress: maskIp(clientIp || '127.0.0.1'),
        afterState: JSON.stringify({
          alert: "This wasn't me",
          reportedAt: new Date().toISOString(),
          device: parseDeviceLabel(userAgent),
        }),
      },
    }).catch(() => {});

    // 4. Request password reset code
    if (user.email) {
      await this.forgotPasswordRequest({ email: user.email }, clientIp, userAgent).catch(() => {});
    }

    return {
      success: true,
      email: user.email,
      message: 'All sessions signed out. Security alert recorded and password reset code requested.',
    };
  }

  // Backward compatible wrapper
  async forgotPassword(dto: ForgotPasswordDto, clientIp?: string, userAgent?: string) {
    return this.forgotPasswordRequest({ email: dto.email }, clientIp, userAgent);
  }

  // Legacy link-based endpoint returns HTTP 410 Gone
  async resetPassword(_dto: ResetPasswordDto, _ipAddress?: string) {
    throw new HttpException(
      'Email reset links have been upgraded to 6-digit verification codes. Please request a new verification code.',
      HttpStatus.GONE,
    );
  }

  // ─── POST /auth/refresh & POST /platform-auth/refresh ───────────────────────

  private async _performRefresh(
    rawRefreshToken: string,
    ipAddress: string | undefined,
    allowedType: 'staff' | 'platform',
    userAgent?: string,
    expectedUserId?: string,
  ) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    let payload: any;
    try {
      payload = this.jwtService.verify(rawRefreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
        algorithms: ['HS256'],
        issuer: process.env.JWT_ISSUER || 'crm-api',
        audience: process.env.JWT_AUDIENCE || 'crm-client',
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Single account per browser: If the refresh cookie belongs to a different user than the tab expects,
    // do NOT rotate or revoke the token, and do NOT set any cookie. Return 409 SESSION_CHANGED immediately.
    let isImpersonationRefresh = false;
    let impersonatedUser: any = null;

    if (expectedUserId && payload.sub && payload.sub !== expectedUserId) {
      // Check if this is an impersonation refresh:
      // The refresh cookie belongs to a platform_super_admin, and expectedUserId belongs to a tenant user!
      const cookieUser = await this.prisma.user.findFirst({
        where: { id: payload.sub, deletedAt: null, isActive: true },
        select: { id: true, role: true, tenantId: true },
      });

      if (cookieUser && cookieUser.role === 'platform_super_admin' && !cookieUser.tenantId) {
        impersonatedUser = await this.prisma.user.findFirst({
          where: { id: expectedUserId, deletedAt: null, isActive: true },
          include: {
            tenant: {
              select: {
                id: true,
                code: true,
                name: true,
                slug: true,
                status: true,
                logoUrl: true,
                currency: true,
                deletedAt: true,
                isInternal: true,
              },
            },
          },
        });

        if (
          impersonatedUser &&
          impersonatedUser.tenant &&
          !impersonatedUser.tenant.isInternal &&
          !impersonatedUser.tenant.deletedAt &&
          impersonatedUser.tenant.status === 'active'
        ) {
          isImpersonationRefresh = true;
        }
      }

      if (!isImpersonationRefresh) {
        this.logger.warn(`[REFRESH_CONFLICT] Refresh expected user ${expectedUserId} but active cookie belongs to ${payload.sub}`);
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'SESSION_CHANGED',
          message: 'Session changed in another tab or window.',
        });
      }
    }

    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
    });

    // Reuse detection: If token was already revoked or not found
    if (!session || session.isRevoked) {
      if (session && session.isRevoked) {
        const timeSinceRevocation = Date.now() - new Date(session.updatedAt).getTime();
        // 120-second grace window to absorb multi-tab / concurrent request race conditions
        if (timeSinceRevocation < 120000) {
          const latestActiveSession = await this.prisma.refreshSession.findFirst({
            where: { familyId: session.familyId, isRevoked: false },
            orderBy: { createdAt: 'desc' },
          });
          if (latestActiveSession && new Date(latestActiveSession.expiresAt) > new Date()) {
            const user = await this.prisma.user.findFirst({
              where: { id: payload.sub, deletedAt: null },
              select: {
                id: true,
                tenantId: true,
                employeeCode: true,
                name: true,
                email: true,
                role: true,
                teamId: true,
                teamRef: { select: { id: true, name: true, allowedPages: true } },
                warehouseId: true,
                isActive: true,
                mustResetPassword: true,
                tokenVersion: true,
                tenant: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    slug: true,
                    status: true,
                    logoUrl: true,
                    currency: true,
                    deletedAt: true,
                  },
                },
              },
            });

            if (user && user.isActive) {
              if (isImpersonationRefresh && impersonatedUser) {
                const accessPayload = {
                  sub: impersonatedUser.id,
                  email: impersonatedUser.email,
                  role: impersonatedUser.role,
                  tenantId: impersonatedUser.tenantId,
                  employeeCode: impersonatedUser.employeeCode,
                  isImpersonating: true,
                  impersonatedTenantName: impersonatedUser.tenant.name,
                  impersonatedTenantCode: impersonatedUser.tenant.code,
                };
                const accessToken = this.jwtService.sign(accessPayload, {
                  secret: process.env.JWT_SECRET,
                  expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
                  algorithm: 'HS256',
                  issuer: process.env.JWT_ISSUER || 'crm-api',
                  audience: process.env.JWT_AUDIENCE || 'crm-client',
                });
                return {
                  user: formatAuthUser({
                    ...impersonatedUser,
                    isImpersonating: true,
                    impersonatedTenantName: impersonatedUser.tenant.name,
                    impersonatedTenantCode: impersonatedUser.tenant.code,
                  }),
                  redirectPath: '/',
                  accessToken,
                  refreshToken: undefined,
                };
              }

              const isPlatformUser = user.role === 'platform_super_admin' && !user.tenantId;
              const accessPayload = {
                sub: user.id,
                email: user.email,
                role: user.role,
                tenantId: user.tenantId,
                employeeCode: user.employeeCode,
                tokenVersion: user.tokenVersion ?? 0,
              };
              const accessToken = this.jwtService.sign(accessPayload, {
                secret: process.env.JWT_SECRET,
                expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
                algorithm: 'HS256',
                issuer: process.env.JWT_ISSUER || 'crm-api',
                audience: process.env.JWT_AUDIENCE || 'crm-client',
              });
              return {
                user: formatAuthUser(user),
                redirectPath: isPlatformUser ? '/platform/companies' : this.getRedirectPath(user),
                accessToken,
                refreshToken: undefined,
              };
            }
          }
        }

        // 10-second concurrent grace window: if this revoked session was rotated within the last 10 seconds,
        // do NOT revoke the family or increment tokenVersion, allowing concurrent requests to complete safely.
        if (timeSinceRevocation < 10000) {
          throw new UnauthorizedException('Session refresh in progress. Please retry.');
        }
      }

      if (!session) {
        throw new UnauthorizedException('Refresh session not found or expired. Please sign in again.');
      }

      const familyId = payload.familyId || session?.familyId;
      if (familyId) {
        await this.prisma.refreshSession.updateMany({
          where: { familyId },
          data: { isRevoked: true },
        }).catch(() => {});
      }
      await this.prisma.user.update({
        where: { id: payload.sub },
        data: { tokenVersion: { increment: 1 } },
      }).catch(() => {});

      await this.prisma.auditLog.create({
        data: {
          tenantId: payload.tenantId || 'default-tenant-id',
          actorId: payload.sub,
          actorName: payload.email,
          action: 'REFRESH_TOKEN_REUSE_DETECTED',
          entityName: 'UserSession',
          entityId: payload.sub,
          afterState: JSON.stringify({ familyId, ipAddress }),
          ipAddress: ipAddress || '127.0.0.1',
        },
      }).catch(() => {});

      throw new UnauthorizedException('Refresh token reuse detected. Session family has been revoked.');
    }

    if (new Date(session.expiresAt) < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: {
        id: true,
        tenantId: true,
        employeeCode: true,
        name: true,
        email: true,
        role: true,
        teamId: true,
        teamRef: { select: { id: true, name: true, allowedPages: true } },
        warehouseId: true,
        isActive: true,
        mustResetPassword: true,
        tokenVersion: true,
        tenant: {
          select: {
            id: true,
            code: true,
            name: true,
            slug: true,
            status: true,
            logoUrl: true,
            currency: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid or deactivated account');
    }

    // Strict portal separation: staff endpoints reject platform owner; platform endpoints reject tenant users
    const isPlatformUser = user.role === 'platform_super_admin' && !user.tenantId;
    if (allowedType === 'staff' && isPlatformUser && !isImpersonationRefresh) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (allowedType === 'platform' && !isPlatformUser) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.tokenVersion !== undefined && payload.tokenVersion !== user.tokenVersion) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    if (
      user.tenant &&
      (user.tenant.status !== 'active' || user.tenant.deletedAt !== null) &&
      user.role !== 'platform_super_admin'
    ) {
      throw new UnauthorizedException('Tenant is suspended or deactivated');
    }

    // Invalidate old token (Single-use rotation)
    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { isRevoked: true },
    });

    // Issue rotated token in same family
    const isPlatform = allowedType === 'platform' || user.role === 'platform_super_admin';
    const isKeepSignedIn = isPlatform ? false : Boolean(payload.keepSignedIn);
    const newTokens = this.generateTokens(user, session.familyId, isKeepSignedIn);
    const newTokenHash = crypto.createHash('sha256').update(newTokens.refreshToken).digest('hex');
    const sessionDurationMs = isPlatform
      ? 8 * 60 * 60 * 1000 // 8 hours hard session limit for platform admins
      : isKeepSignedIn
        ? 7 * 24 * 60 * 60 * 1000
        : 12 * 60 * 60 * 1000;
    const newExpiresAt = new Date(Date.now() + sessionDurationMs);

    const deviceLabel = parseDeviceLabel(userAgent || (session as any).userAgent);
    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: newTokenHash,
        familyId: session.familyId,
        expiresAt: newExpiresAt,
        isRevoked: false,
        userAgent: (userAgent || (session as any).userAgent || '').substring(0, 500) || null,
        ipAddress: maskIp(ipAddress || (session as any).ipAddress || '127.0.0.1'),
        lastUsedAt: new Date(),
        deviceLabel,
      },
    });

    if (isImpersonationRefresh && impersonatedUser) {
      const accessPayload = {
        sub: impersonatedUser.id,
        email: impersonatedUser.email,
        role: impersonatedUser.role,
        tenantId: impersonatedUser.tenantId,
        employeeCode: impersonatedUser.employeeCode,
        isImpersonating: true,
        impersonatedTenantName: impersonatedUser.tenant.name,
        impersonatedTenantCode: impersonatedUser.tenant.code,
      };
      const impersonatedAccessToken = this.jwtService.sign(accessPayload, {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
        algorithm: 'HS256',
        issuer: process.env.JWT_ISSUER || 'crm-api',
        audience: process.env.JWT_AUDIENCE || 'crm-client',
      });
      return {
        user: formatAuthUser({
          ...impersonatedUser,
          isImpersonating: true,
          impersonatedTenantName: impersonatedUser.tenant.name,
          impersonatedTenantCode: impersonatedUser.tenant.code,
        }),
        redirectPath: '/',
        accessToken: impersonatedAccessToken,
        refreshToken: newTokens.refreshToken,
      };
    }

    return {
      user: formatAuthUser(user),
      redirectPath: isPlatformUser ? '/platform/companies' : this.getRedirectPath(user),
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
    };
  }

  async refreshToken(rawRefreshToken: string, ipAddress?: string, userAgent?: string, expectedUserId?: string) {
    return this._performRefresh(rawRefreshToken, ipAddress, 'staff', userAgent, expectedUserId);
  }

  async refreshPlatformToken(rawRefreshToken: string, ipAddress?: string, userAgent?: string, expectedUserId?: string) {
    return this._performRefresh(rawRefreshToken, ipAddress, 'platform', userAgent, expectedUserId);
  }

  /**
   * Validates an active session from a refresh token cookie WITHOUT rotating or modifying the token.
   * Used by /auth/me on login pages to detect an already active browser session.
   */
  async validateSessionFromCookie(rawRefreshToken: string) {
    if (!rawRefreshToken) return null;
    let payload: any;
    try {
      payload = this.jwtService.verify(rawRefreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
        algorithms: ['HS256'],
        issuer: process.env.JWT_ISSUER || 'crm-api',
        audience: process.env.JWT_AUDIENCE || 'crm-client',
      });
    } catch {
      return null;
    }

    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
    });

    if (!session || session.isRevoked || new Date(session.expiresAt) < new Date()) {
      return null;
    }

    return this.findUserById(payload.sub);
  }

  /**
   * Validates an access token and returns user record if valid.
   */
  async validateAccessToken(accessToken: string) {
    if (!accessToken) return null;
    let payload: any;
    try {
      payload = this.jwtService.verify(accessToken, {
        secret: process.env.JWT_SECRET,
        algorithms: ['HS256'],
        issuer: process.env.JWT_ISSUER || 'crm-api',
        audience: process.env.JWT_AUDIENCE || 'crm-client',
      });
    } catch {
      return null;
    }

    return this.findUserById(payload.sub);
  }

  /**
   * Finds an active user by ID with tenant and team details.
   */
  async findUserById(userId: string) {
    if (!userId) return null;
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        tenantId: true,
        employeeCode: true,
        name: true,
        email: true,
        role: true,
        teamId: true,
        teamRef: { select: { id: true, name: true, allowedPages: true } },
        warehouseId: true,
        isActive: true,
        tokenVersion: true,
        tenant: {
          select: {
            id: true,
            code: true,
            name: true,
            slug: true,
            status: true,
            logoUrl: true,
            currency: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!user || !user.isActive) return null;
    if (user.tenant && (user.tenant.status !== 'active' || user.tenant.deletedAt !== null) && user.role !== 'platform_super_admin') {
      return null;
    }
    return user;
  }

  // ─── Change password (authenticated) ────────────────────────────────────────

  async changePassword(
    userId: string,
    currentPass: string,
    newPass: string,
    ipAddress?: string,
    userAgent?: string,
    logoutOthers: boolean = true,
  ) {
    if (
      !currentPass ||
      typeof currentPass !== 'string' ||
      currentPass.trim().length === 0 ||
      currentPass.length > 200
    ) {
      throw new BadRequestException('currentPass must be a non-empty string, not whitespace-only, and max 200 characters');
    }
    if (
      !newPass ||
      typeof newPass !== 'string' ||
      newPass.trim().length === 0 ||
      newPass.length > 200
    ) {
      throw new BadRequestException('newPass must be a non-empty string, not whitespace-only, and max 200 characters');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        teamRef: { select: { id: true, name: true, allowedPages: true } },
        tenant: {
          select: {
            id: true,
            code: true,
            name: true,
            slug: true,
            status: true,
            logoUrl: true,
            currency: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    validatePasswordPolicy(newPass, { email: user.email, name: user.name });

    const isMatch = await bcrypt.compare(currentPass, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Current password does not match');
    }

    const passwordHash = await bcrypt.hash(newPass, 12);

    // Update ONLY this user record
    const updateResult = await this.prisma.user.updateMany({
      where: { id: userId, deletedAt: null },
      data: {
        passwordHash,
        mustResetPassword: false,
        tokenVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockoutUntil: null,
        lastPasswordChangeAt: new Date(),
      },
    });

    if (updateResult.count === 0) {
      this.logger.error(`[CHANGE_PASSWORD] Failed to update user ${userId}: 0 rows updated in database.`);
      throw new BadRequestException('Unable to change password. User account not found or inactive.');
    }

    // Revoke previous refresh sessions if requested
    if (logoutOthers) {
      await this.prisma.refreshSession.updateMany({
        where: { userId },
        data: { isRevoked: true },
      });
    }

    // Password change removes all trusted devices
    await this.prisma.trustedDevice.deleteMany({
      where: { userId },
    }).catch(() => {});

    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId || 'default-tenant-id',
        actorId: userId,
        actorName: user.name,
        action: 'PASSWORD_CHANGE',
        entityName: 'User',
        entityId: userId,
        ipAddress: maskIp(ipAddress || '127.0.0.1'),
      },
    }).catch(() => {});

    // Send "Your password was changed" security notification email with time and IP
    const changeTime = new Date().toUTCString();
    const clientIp = ipAddress || 'Unknown IP';
    if (this.notificationsService) {
      const appName = getProductName();
      this.notificationsService.sendEmail({
        to: user.email,
        tenantId: user.tenantId || undefined,
        subject: `Your ${appName} password was changed`,
        text: `Hello ${user.name || 'User'},\n\nYour password for ${appName} was successfully changed on ${changeTime} from IP address: ${clientIp}.\n\nIf you did not perform this change, please contact your administrator immediately.`,
        html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #1e293b; margin-top: 0;">Password Changed</h2>
          <p style="color: #475569; font-size: 15px;">Hello <strong>${user.name || 'User'}</strong>,</p>
          <p style="color: #475569; font-size: 14px;">Your ${appName} account password was successfully changed.</p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin: 16px 0; font-size: 13px; color: #334155;">
            <div><strong>Time:</strong> ${changeTime}</div>
            <div style="margin-top: 4px;"><strong>IP Address:</strong> ${clientIp}</div>
          </div>
          <p style="color: #dc2626; font-size: 13px;">If you did not make this change, please contact your administrator immediately.</p>
        </div>`,
        purpose: 'password_changed',
        throwOnError: false,
      }).catch((err) => {
        this.logger.error(`[CHANGE_PASSWORD] Failed to send password changed notification email: ${err?.message || 'error'}`);
      });
    }

    const updatedUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        teamRef: { select: { id: true, name: true, allowedPages: true } },
        tenant: {
          select: {
            id: true,
            code: true,
            name: true,
            slug: true,
            status: true,
            logoUrl: true,
            currency: true,
          },
        },
      },
    });

    // Generate fresh tokens using incremented tokenVersion so the user session stays active without 401 kickout
    const tokens = this.generateTokens(updatedUser);
    const tokenHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    if (this.prisma.refreshSession) {
      const deviceLabel = parseDeviceLabel(userAgent);
      const maskedIp = maskIp(ipAddress || '127.0.0.1');
      await this.prisma.refreshSession.create({
        data: {
          userId: updatedUser.id,
          tokenHash,
          familyId: tokens.familyId,
          expiresAt,
          isRevoked: false,
          userAgent: userAgent ? userAgent.substring(0, 500) : null,
          ipAddress: maskedIp,
          lastUsedAt: new Date(),
          deviceLabel,
        },
      }).catch(() => {});
    }

    return {
      message: 'Password updated successfully',
      user: formatAuthUser(updatedUser),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // ─── Sign out (revokes single session) ───────────────────────────────────────

  async logout(rawToken?: string, expectedUserId?: string, ipAddress?: string) {
    let sessionUserId: string | null = null;
    let tokenHash: string | null = null;

    if (rawToken) {
      tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const session = await this.prisma.refreshSession.findUnique({
        where: { tokenHash },
      });
      if (session) {
        sessionUserId = session.userId;
      } else {
        try {
          const payload = this.jwtService.decode(rawToken) as any;
          if (payload?.sub) sessionUserId = payload.sub;
        } catch {}
      }

      // Check single account per browser constraint:
      // If expectedUserId is provided and the session belongs to a different user,
      // return 409 Conflict without revoking anything!
      if (expectedUserId && sessionUserId && sessionUserId !== expectedUserId) {
        this.logger.warn(`[LOGOUT_CONFLICT] Logout expected user ${expectedUserId} but session belongs to ${sessionUserId}`);
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'SESSION_CHANGED',
          message: 'Session changed in another tab or window.',
        });
      }

      await this.prisma.refreshSession.updateMany({
        where: { tokenHash },
        data: { isRevoked: true },
      }).catch(() => {});
    }

    const actorId = expectedUserId || sessionUserId;
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          tenantId: 'default-tenant-id',
          actorId,
          action: 'LOGOUT',
          entityName: 'User',
          entityId: actorId,
          ipAddress: ipAddress || '127.0.0.1',
        },
      }).catch(() => {});
    }
    return { success: true, message: 'Logged out successfully' };
  }

  // ─── Sign out of all devices (increments tokenVersion + revokes all) ────────

  async logoutAll(userId: string, expectedUserId?: string, ipAddress?: string) {
    if (expectedUserId && userId && userId !== expectedUserId) {
      this.logger.warn(`[LOGOUT_ALL_CONFLICT] Logout-all expected user ${expectedUserId} but authenticated user is ${userId}`);
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'SESSION_CHANGED',
        message: 'Session changed in another tab or window.',
      });
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    await this.prisma.refreshSession.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
    await this.prisma.trustedDevice.deleteMany({
      where: { userId },
    }).catch(() => {});
    await this.prisma.auditLog.create({
      data: {
        tenantId: 'default-tenant-id',
        actorId: userId,
        action: 'LOGOUT_ALL_DEVICES',
        entityName: 'User',
        entityId: userId,
        ipAddress: ipAddress || '127.0.0.1',
      },
    }).catch(() => {});
    return { success: true, message: 'Signed out of all devices successfully' };
  }

  async updateProfile(userId: string, data: { name?: string; phone?: string; photoUrl?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name !== undefined ? data.name?.trim() : undefined,
        phone: data.phone !== undefined ? data.phone?.trim() : undefined,
        photoUrl: data.photoUrl !== undefined ? data.photoUrl?.trim() : undefined,
      },
      select: {
        id: true,
        tenantId: true,
        employeeCode: true,
        name: true,
        email: true,
        phone: true,
        photoUrl: true,
        role: true,
        teamId: true,
        teamRef: { select: { id: true, name: true, allowedPages: true } },
        warehouseId: true,
        isActive: true,
        lastLoginAt: true,
        lastPasswordChangeAt: true,
        createdAt: true,
        tenant: { select: { id: true, code: true, name: true, slug: true, status: true, logoUrl: true, currency: true } },
      },
    });
  }

  // ─── Active Devices & Session Management ────────────────────────────────────

  async getUserSessions(userId: string, currentRefreshToken?: string) {
    const currentTokenHash = currentRefreshToken
      ? crypto.createHash('sha256').update(currentRefreshToken).digest('hex')
      : null;

    const sessions = await this.prisma.refreshSession.findMany({
      where: {
        userId,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    return sessions.map((s: any) => ({
      id: s.id,
      deviceLabel: s.deviceLabel || parseDeviceLabel(s.userAgent) || 'Web Browser',
      ipAddress: s.ipAddress || 'Unknown IP',
      userAgent: s.userAgent || 'Unknown',
      lastActive: s.lastUsedAt || s.updatedAt || s.createdAt,
      createdAt: s.createdAt,
      isCurrent: Boolean(currentTokenHash && s.tokenHash === currentTokenHash),
    }));
  }

  async revokeSession(userId: string, sessionId: string, clientIp?: string) {
    const session = await this.prisma.refreshSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException('Session not found or already revoked');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('Cannot revoke a session belonging to another user');
    }
    await this.prisma.refreshSession.update({
      where: { id: sessionId },
      data: { isRevoked: true },
    });
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tenantId: true },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: user?.tenantId || 'default-tenant-id',
        actorId: userId,
        action: 'REVOKE_SESSION',
        entityName: 'RefreshSession',
        entityId: sessionId,
        ipAddress: maskIp(clientIp || '127.0.0.1'),
      },
    }).catch(() => {});
    return { success: true, message: 'Device session signed out successfully' };
  }

  async revokeOtherSessions(userId: string, currentRefreshToken?: string, clientIp?: string) {
    const currentTokenHash = currentRefreshToken
      ? crypto.createHash('sha256').update(currentRefreshToken).digest('hex')
      : null;

    const whereClause: any = { userId, isRevoked: false };
    if (currentTokenHash) {
      whereClause.tokenHash = { not: currentTokenHash };
    }

    await this.prisma.refreshSession.updateMany({
      where: whereClause,
      data: { isRevoked: true },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: 'default-tenant-id',
        actorId: userId,
        action: 'REVOKE_OTHER_SESSIONS',
        entityName: 'User',
        entityId: userId,
        ipAddress: maskIp(clientIp || '127.0.0.1'),
      },
    }).catch(() => {});
    return { success: true, message: 'All other device sessions have been signed out' };
  }

  // ─── Sign-In Activity for My Account ───────────────────────────────────────

  async getUserSignInActivity(userId: string, limit: number = 25) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, employeeCode: true, name: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const logs = await this.prisma.auditLog.findMany({
      where: {
        OR: [{ actorId: userId }, { entityId: userId }],
        action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGIN', 'PLATFORM_LOGIN'] },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        afterState: true,
        ipAddress: true,
        timestamp: true,
      },
    });

    return logs.map((log: any) => {
      let details: any = {};
      if (log.afterState) {
        try {
          details = JSON.parse(log.afterState);
        } catch {
          details = {};
        }
      }
      const isSuccess = log.action === 'LOGIN_SUCCESS' || log.action === 'LOGIN' || log.action === 'PLATFORM_LOGIN';
      return {
        id: log.id,
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        timestamp: log.timestamp,
        ipAddress: details.ipMasked || maskIp(log.ipAddress || '127.0.0.1'),
        deviceLabel: parseDeviceLabel(details.userAgent),
        userAgent: details.userAgent || 'unknown',
        portal: details.portal || 'company',
      };
    });
  }

  // ─── Email Change with OTP Flow ─────────────────────────────────────────────

  async requestEmailChange(
    userId: string,
    currentPassword: string,
    newEmail: string,
    clientIp?: string,
    userAgent?: string,
  ) {
    if (!currentPassword) {
      throw new BadRequestException('Current password is required to change email address.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('User account not found.');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const lower = (newEmail || '').trim().toLowerCase();
    if (!lower || !lower.includes('@')) {
      throw new BadRequestException('A valid email address is required');
    }

    if (user.email.toLowerCase() === lower) {
      throw new BadRequestException('New email address must be different from current email address.');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: { email: { equals: lower, mode: 'insensitive' }, deletedAt: null },
    });
    if (existingUser) {
      throw new BadRequestException('This email is already in use by another account');
    }

    const now = new Date();
    const existingChallenge = await this.prisma.otpChallenge.findFirst({
      where: {
        emailNormalized: lower,
        purpose: 'email_change',
        resendAfter: { gt: now },
        usedAt: null,
      },
    });

    if (existingChallenge) {
      const remainingSecs = Math.max(
        1,
        Math.ceil((new Date(existingChallenge.resendAfter).getTime() - now.getTime()) / 1000),
      );
      return { message: 'Verification code sent.', resendAfterSeconds: remainingSecs };
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const challengeId = crypto.randomUUID();
    const otpSecret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'crm-otp-secret-key-2026';
    const codeHash = crypto.createHmac('sha256', otpSecret + challengeId).update(code).digest('hex');

    await this.prisma.otpChallenge.updateMany({
      where: { emailNormalized: lower, purpose: 'email_change', usedAt: null },
      data: { usedAt: now },
    });

    await this.prisma.otpChallenge.create({
      data: {
        id: challengeId,
        emailNormalized: lower,
        purpose: 'email_change',
        codeHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        resendAfter: new Date(Date.now() + 60 * 1000),
        requestIp: maskIp(clientIp || '127.0.0.1'),
        requestUserAgent: userAgent ? userAgent.substring(0, 500) : 'unknown',
      },
    });

    if (this.notificationsService) {
      const appName = getProductName();
      // 1. Send OTP verification code to new email address
      this.notificationsService.sendEmail({
        to: lower,
        subject: `${code} is your ${appName} email confirmation code`,
        text: `Your confirmation code to change your email is: ${code}\nThis code expires in 10 minutes.`,
        html: `<div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h3 style="margin-top:0;">Confirm Your Email Change</h3>
          <p>Use the 6-digit verification code below to confirm this email address:</p>
          <div style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #2563eb; padding: 12px; background: #eff6ff; border-radius: 6px; text-align: center; margin: 16px 0;">
            ${code}
          </div>
          <p style="color: #64748b; font-size: 13px;">This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
        </div>`,
        purpose: 'two_factor_code',
        throwOnError: false,
      }).catch((err: any) => {
        this.logger.error(`[EMAIL_CHANGE] Failed to send OTP: ${err?.message || 'error'}`);
      });

      // 2. Send security notice alert to the old (current) email address
      if (user.email) {
        const maskedIp = maskIp(clientIp || '127.0.0.1');
        const timeStr = new Date().toUTCString();
        this.notificationsService.sendEmail({
          to: user.email,
          subject: `Security Alert: Email change requested for your ${appName} account`,
          text: `Hello ${user.name || 'User'},\n\nA request was made on ${timeStr} from IP ${maskedIp} to change your account email address to ${lower}.\n\nIf you did not initiate this change, please sign in and change your password immediately.`,
          html: `<div style="font-family: Arial, sans-serif; max-width: 520px; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h3 style="margin-top:0; color:#dc2626;">Security Alert: Email Change Requested</h3>
            <p style="color:#475569;">A request was made on <strong>${timeStr}</strong> from IP <strong>${maskedIp}</strong> to change your ${appName} login email to <strong>${lower}</strong>.</p>
            <p style="color:#475569; font-size: 13px;">A 6-digit confirmation code was sent to the new email address. If you did <strong>not</strong> make this request, please contact your administrator and change your password immediately.</p>
          </div>`,
          purpose: 'security_alert',
          throwOnError: false,
        }).catch((err: any) => {
          this.logger.error(`[EMAIL_CHANGE] Failed to send alert to old email: ${err?.message || 'error'}`);
        });
      }
    }

    return { message: 'Verification code sent to your new email.', resendAfterSeconds: 60 };
  }

  async verifyEmailChange(userId: string, newEmail: string, code: string) {
    const lower = (newEmail || '').trim().toLowerCase();
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        emailNormalized: lower,
        purpose: 'email_change',
        usedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge || challenge.attempts >= 5 || new Date(challenge.expiresAt) < new Date()) {
      throw new BadRequestException('Code is incorrect or expired.');
    }

    const otpSecret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'crm-otp-secret-key-2026';
    const expectedHash = crypto
      .createHmac('sha256', otpSecret + challenge.id)
      .update(code ? code.trim() : '')
      .digest('hex');

    const a = Buffer.from(challenge.codeHash, 'hex');
    const b = Buffer.from(expectedHash, 'hex');
    const isMatch = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!isMatch) {
      const newAttempts = challenge.attempts + 1;
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts: newAttempts,
          usedAt: newAttempts >= 5 ? new Date() : null,
        },
      }).catch(() => {});
      throw new BadRequestException('Code is incorrect or expired.');
    }

    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { usedAt: new Date() },
    });

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { email: lower, tokenVersion: { increment: 1 } },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId || 'default-tenant-id',
        actorId: userId,
        action: 'EMAIL_CHANGED',
        entityName: 'User',
        entityId: userId,
      },
    }).catch(() => {});

    return { success: true, message: 'Email address updated successfully' };
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────────

  getRedirectPath(user: any): string {
    return getRoleRedirectPath(user);
  }

  // ─── Sign-In Auditing & Recent Sign-Ins ──────────────────────────────────────

  async recordLoginFailure(
    identifier: string,
    tenantId: string | null | undefined,
    userId: string | null | undefined,
    reasonCode: string,
    portal: 'company' | 'platform',
    ipAddress?: string,
    userAgent?: string,
  ) {
    const maskedId = maskIdentifier(identifier);
    const maskedIpAddress = maskIp(ipAddress || '127.0.0.1');
    await this.prisma.auditLog
      .create({
        data: {
          tenantId: tenantId || 'default-tenant-id',
          actorId: userId || null,
          actorName: maskedId,
          action: 'LOGIN_FAILED',
          entityName: portal === 'platform' ? 'PlatformAuth' : 'User',
          entityId: userId || maskedId,
          afterState: JSON.stringify({
            maskedIdentifier: maskedId,
            ipMasked: maskedIpAddress,
            userAgent: userAgent || 'unknown',
            reasonCode,
            portal,
          }),
          ipAddress: maskedIpAddress,
        },
      })
      .catch(() => {});
  }

  async getRecentSignIns(tenantId?: string | null, limit: number = 25) {
    const whereClause: any = {
      action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGIN', 'PLATFORM_LOGIN', 'PLATFORM_LOGIN_FAILED'] },
    };
    if (tenantId) {
      whereClause.tenantId = tenantId;
    }

    const logs = await this.prisma.auditLog.findMany({
      where: whereClause,
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        actorName: true,
        entityName: true,
        entityId: true,
        afterState: true,
        ipAddress: true,
        timestamp: true,
      },
    });

    return logs.map((log) => {
      let details: any = {};
      if (log.afterState) {
        try {
          details = JSON.parse(log.afterState);
        } catch {
          details = {};
        }
      }
      const isSuccess = log.action === 'LOGIN_SUCCESS' || log.action === 'LOGIN' || log.action === 'PLATFORM_LOGIN';
      const portal = details.portal || (log.entityName === 'PlatformAuth' ? 'platform' : 'company');
      const maskedIdentifier = details.maskedIdentifier || maskIdentifier(log.actorName || log.entityId);
      const maskedIp = details.ipMasked || maskIp(log.ipAddress || '127.0.0.1');

      return {
        id: log.id,
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        action: isSuccess ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED',
        maskedIdentifier,
        ipAddress: maskedIp,
        userAgent: details.userAgent || 'unknown',
        reasonCode: details.reasonCode || (isSuccess ? 'SUCCESS' : 'UNKNOWN_FAILURE'),
        portal,
        timestamp: log.timestamp,
      };
    });
  }

  private async _buildLoginResponse(
    user: any,
    ipAddress?: string,
    rawPasswordToRehash?: string,
    keepSignedIn: boolean = false,
    userAgent?: string,
    portal: 'company' | 'platform' = 'company',
    bypass2Fa: boolean = false,
    trustedDeviceToken?: string,
  ) {
    const { passwordHash, ...result } = user;
    const resolvedUser = {
      ...result,
      tenantId: result.tenantId ?? (result.tenant ? result.tenant.id : null),
    };

    let gracePeriodInfo: { twoFactorGracePeriod?: { active: boolean; daysRemaining: number } } = {};

    if (!bypass2Fa) {
      // 1. Fetch fresh user state including twoFactor and tenant configuration
      const freshUser = await this.prisma.user.findUnique({
        where: { id: resolvedUser.id },
        include: { twoFactor: true, tenant: true },
      });

      if (freshUser?.twoFactor?.enabledAt) {
        // User has 2FA enabled: check for valid trusted device cookie
        const isTrusted = await this.verifyTrustedDevice(resolvedUser.id, trustedDeviceToken);
        if (!isTrusted) {
          // Device is not trusted: issue LoginTicket and require 2FA verification
          const loginTicket = await this.createLoginTicket(resolvedUser.id);
          const chosenMethod = freshUser.twoFactor.method || 'totp';
          let methods: string[] = [];
          if (chosenMethod === 'email') {
            methods = ['email'];
          } else {
            // Authenticator app user: only app or backup codes, NEVER email
            methods = ['totp', 'backup_code'];
          }
          return {
            requiresTwoFactor: true,
            methods,
            loginTicket,
          };
        }
      } else {
        // User does not have 2FA enabled: check if role or tenant enforces it
        const isEnforced = this.isUserTwoFactorEnforced(freshUser || resolvedUser);
        if (isEnforced) {
          const grace = await this.evaluateGracePeriod(freshUser || resolvedUser);
          if (grace.isGraceExpired) {
            // Grace period expired: user can ONLY reach the setup screen
            const setupToken = this.jwtService.sign(
              {
                sub: resolvedUser.id,
                role: resolvedUser.role,
                tenantId: resolvedUser.tenantId,
                purpose: 'two_factor_setup',
              },
              {
                secret: process.env.JWT_SECRET,
                expiresIn: '15m',
                issuer: process.env.JWT_ISSUER || 'crm-api',
                audience: process.env.JWT_AUDIENCE || 'crm-client',
              },
            );
            return {
              requiresTwoFactorSetup: true,
              setupToken,
              user: formatAuthUser(freshUser || resolvedUser),
              message: '2-Step verification is required. Please set up two-factor authentication to continue.',
            };
          } else if (grace.isGraceActive) {
            gracePeriodInfo = {
              twoFactorGracePeriod: {
                active: true,
                daysRemaining: grace.daysRemaining,
              },
            };
          }
        }
      }
    }

    await this.prisma.user
      .update({ where: { id: resolvedUser.id }, data: { lastLoginAt: new Date() } })
      .catch(() => {});

    // Transparent password rehashing if cost < 12
    if (passwordHash && rawPasswordToRehash && needsRehash(passwordHash)) {
      const newHash = await bcrypt.hash(rawPasswordToRehash, 12);
      await this.prisma.user.update({
        where: { id: resolvedUser.id },
        data: { passwordHash: newHash },
      }).catch(() => {});
    }

    // Check if new device before recording this session
    if (this.prisma.refreshSession && resolvedUser.email) {
      try {
        const priorSession = await this.prisma.refreshSession.findFirst({
          where: {
            userId: resolvedUser.id,
            userAgent: userAgent ? userAgent.substring(0, 500) : null,
          },
        });
        if (!priorSession) {
          void this.sendSecurityNotification(resolvedUser.id, 'new_device_login', {
            userAgent,
            ipAddress,
            time: new Date(),
          });
        }
      } catch {
        // Safe fallback if pre-migration
      }
    }

    const isPlatform = portal === 'platform' || resolvedUser.role === 'platform_super_admin';
    const effectiveKeepSignedIn = isPlatform ? false : keepSignedIn;
    const tokens = this.generateTokens(resolvedUser, undefined, effectiveKeepSignedIn);
    const tokenHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
    const expiresAt = new Date(
      Date.now() +
        (isPlatform
          ? 8 * 60 * 60 * 1000 // 8 hours hard session limit for platform super-admin
          : effectiveKeepSignedIn
            ? 7 * 24 * 60 * 60 * 1000
            : 12 * 60 * 60 * 1000)
    );

    if (this.prisma.refreshSession) {
      const deviceLabel = parseDeviceLabel(userAgent);
      const maskedIp = maskIp(ipAddress || '127.0.0.1');
      await this.prisma.refreshSession.create({
        data: {
          userId: resolvedUser.id,
          tokenHash,
          familyId: tokens.familyId,
          expiresAt,
          isRevoked: false,
          userAgent: userAgent ? userAgent.substring(0, 500) : null,
          ipAddress: maskedIp,
          lastUsedAt: new Date(),
          deviceLabel,
        },
      }).catch(() => {});
    }

    const maskedId = maskIdentifier(resolvedUser.email || resolvedUser.employeeCode || resolvedUser.name);
    const maskedIpAddress = maskIp(ipAddress || '127.0.0.1');

    await this.prisma.auditLog
      .create({
        data: {
          tenantId: resolvedUser.tenantId || 'default-tenant-id',
          actorId: resolvedUser.id,
          actorName: resolvedUser.name || maskedId,
          action: 'LOGIN_SUCCESS',
          entityName: portal === 'platform' ? 'PlatformAuth' : 'User',
          entityId: resolvedUser.id,
          afterState: JSON.stringify({
            maskedIdentifier: maskedId,
            ipMasked: maskedIpAddress,
            userAgent: userAgent || 'unknown',
            reasonCode: 'SUCCESS',
            portal,
            keepSignedIn: Boolean(effectiveKeepSignedIn),
          }),
          ipAddress: maskedIpAddress,
        },
      })
      .catch(() => {});

    return {
      user: formatAuthUser(resolvedUser),
      redirectPath: portal === 'platform' ? '/platform/companies' : this.getRedirectPath(resolvedUser),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      ...gracePeriodInfo,
    };
  }

  private generateTokens(user: any, familyId?: string, keepSignedIn: boolean = false) {
    const tenantId = user.tenantId ?? (user.tenant ? user.tenant.id : null);
    const resolvedFamilyId = familyId || crypto.randomUUID();
    const tokenId = crypto.randomUUID();

    const isPlatform = user.role === 'platform_super_admin';
    const effectiveKeepSignedIn = isPlatform ? false : Boolean(keepSignedIn);

    const payload = {
      sub: user.id,
      tenantId,
      org_id: tenantId,
      email: user.email,
      role: user.role,
      employee_code: user.employeeCode,
      employeeCode: user.employeeCode,
      tokenVersion: user.tokenVersion ?? 0,
      familyId: resolvedFamilyId,
      jti: tokenId,
      keepSignedIn: effectiveKeepSignedIn,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      algorithm: 'HS256',
      issuer: process.env.JWT_ISSUER || 'crm-api',
      audience: process.env.JWT_AUDIENCE || 'crm-client',
    });

    const refreshExpiry = isPlatform ? '8h' : effectiveKeepSignedIn ? '7d' : '12h';
    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: refreshExpiry,
      algorithm: 'HS256',
      issuer: process.env.JWT_ISSUER || 'crm-api',
      audience: process.env.JWT_AUDIENCE || 'crm-client',
    });

    return { accessToken, refreshToken, familyId: resolvedFamilyId };
  }

  /** Platform Step-Up Authentication: issues a 5-minute step-up token upon valid password re-entry */
  async verifyPlatformStepUp(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.role !== 'platform_super_admin' || !user.isActive) {
      throw new UnauthorizedException('Invalid platform administrator account.');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid password for step-up authentication.');
    }
    const stepUpToken = this.jwtService.sign(
      {
        sub: user.id,
        role: user.role,
        purpose: 'platform_step_up',
      },
      {
        secret: process.env.JWT_SECRET,
        expiresIn: '5m',
      },
    );
    return {
      success: true,
      stepUpToken,
      expiresIn: 300,
    };
  }

  /** Validates 5-minute step-up token for sensitive platform actions */
  async validateStepUp(actor: any, stepUpToken?: string) {
    if (stepUpToken) {
      try {
        const payload: any = this.jwtService.verify(stepUpToken, { secret: process.env.JWT_SECRET });
        if (payload.purpose !== 'platform_step_up' || payload.sub !== (actor?.id || actor?.sub)) {
          throw new UnauthorizedException('Invalid step-up token.');
        }
        return true;
      } catch {
        throw new UnauthorizedException('Invalid or expired step-up authentication token.');
      }
    }

    // If step-up is strictly required by config, enforce it
    if (process.env.ENFORCE_PLATFORM_STEP_UP === 'true') {
      throw new ForbiddenException('Step-up authentication required: x-step-up-token must be provided.');
    }

    // Authenticated platform super admin is authorized
    if (actor && (actor.role === 'platform_super_admin' || actor.isPlatformAdmin || actor.role === 'super_admin')) {
      return true;
    }

    throw new ForbiddenException('Step-up authentication required: x-step-up-token must be provided.');
  }

  /** Adds ~200–400 ms of artificial delay to make timing attacks harder */
  private _addArtificialDelay() {
    return new Promise((r) => setTimeout(r, 200 + Math.random() * 200));
  }

  // ─── 2-Step Verification (2FA) Helpers & Enforcement ───────────────────────

  isUserTwoFactorEnforced(user: any): boolean {
    if (!user) return false;
    if (user.role === 'platform_super_admin' || user.role === 'tenant_admin') {
      return true;
    }
    if (user.tenant?.requireTwoFactor === true) {
      return true;
    }
    return false;
  }

  async evaluateGracePeriod(user: any): Promise<{
    isRequired: boolean;
    isGraceActive: boolean;
    isGraceExpired: boolean;
    daysRemaining: number;
  }> {
    const isRequired = this.isUserTwoFactorEnforced(user);
    if (!isRequired) {
      return { isRequired: false, isGraceActive: false, isGraceExpired: false, daysRemaining: 0 };
    }

    let firstLogin = user.firstLoginAfter2FaReleaseAt ? new Date(user.firstLoginAfter2FaReleaseAt) : null;
    if (!firstLogin) {
      firstLogin = new Date();
      await this.prisma.user.update({
        where: { id: user.id },
        data: { firstLoginAfter2FaReleaseAt: firstLogin },
      }).catch(() => {});
    }

    const now = Date.now();
    const elapsed = now - firstLogin.getTime();
    const gracePeriodMs = 7 * 24 * 60 * 60 * 1000; // 7 days

    if (elapsed <= gracePeriodMs) {
      const remainingMs = gracePeriodMs - elapsed;
      const daysRemaining = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
      return {
        isRequired: true,
        isGraceActive: true,
        isGraceExpired: false,
        daysRemaining,
      };
    } else {
      return {
        isRequired: true,
        isGraceActive: false,
        isGraceExpired: true,
        daysRemaining: 0,
      };
    }
  }

  async verifyTrustedDevice(userId: string, rawToken?: string): Promise<boolean> {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
      return false;
    }
    const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
    const now = new Date();
    const device = await this.prisma.trustedDevice.findFirst({
      where: {
        userId,
        tokenHash,
        expiresAt: { gt: now },
      },
    });
    if (!device) return false;

    await this.prisma.trustedDevice.update({
      where: { id: device.id },
      data: { lastUsedAt: now },
    }).catch(() => {});

    return true;
  }

  async createLoginTicket(userId: string): Promise<string> {
    const jti = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    await this.prisma.loginTicket.create({
      data: {
        jti,
        userId,
        expiresAt,
        attempts: 0,
      },
    });
    return jti;
  }

  async recordTwoFactorFailedAttempt(lockKey: string, user: any) {
    const now = new Date();
    const existing = await this.prisma.accountLockout.findUnique({ where: { identityKey: lockKey } });
    const isStale =
      existing?.lastAttemptAt &&
      now.getTime() - new Date(existing.lastAttemptAt).getTime() > this.LOCKOUT_DURATION_MS;

    const currentAttempts = isStale ? 1 : (existing?.failedAttempts || 0) + 1;
    const isLocked = currentAttempts >= 10;
    const lockedUntil = isLocked ? new Date(now.getTime() + this.LOCKOUT_DURATION_MS) : null;

    await this.prisma.accountLockout.upsert({
      where: { identityKey: lockKey },
      create: {
        identityKey: lockKey,
        failedAttempts: 1,
        lastAttemptAt: now,
        lockedUntil: null,
      },
      update: {
        failedAttempts: currentAttempts,
        lastAttemptAt: now,
        lockedUntil: isLocked ? lockedUntil : existing?.lockedUntil,
      },
    });

    if (isLocked && lockedUntil) {
      if (user && user.id) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { lockoutUntil: lockedUntil },
        }).catch(() => {});
        await this.prisma.auditLog.create({
          data: {
            tenantId: user.tenantId || null,
            actorId: user.id,
            actorName: user.name || user.email || lockKey,
            action: 'LOGIN_LOCKOUT',
            entityName: 'User',
            entityId: user.id,
            afterState: JSON.stringify({
              reason: 'Account locked after 10 consecutive failed 2FA verification attempts in 15 minutes',
              attempts: currentAttempts,
              lockExpiresAt: lockedUntil.toISOString(),
            }),
            ipAddress: '127.0.0.1',
          },
        }).catch(() => {});
      }
    }
  }

  async sendSecurityNotification(
    userId: string,
    type: '2fa_enabled' | '2fa_disabled' | 'backup_codes_regenerated' | 'new_device_login',
    metadata?: any,
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, tenantId: true },
      });
      if (!user || !user.email) return;

      let subject = '';
      let text = '';
      let html = '';
      const timeStr = (metadata?.time ? new Date(metadata.time) : new Date()).toUTCString();

      const appName = getProductName();
      if (type === '2fa_enabled') {
        subject = 'Security Notice: 2-Step Verification Enabled';
        text = `Hello ${user.name || ''},\n\n2-Step Verification has been enabled for your ${appName} account at ${timeStr}.\n\nIf you did not make this change, please contact your administrator immediately.`;
        html = `<div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #0f172a; margin-top: 0;">2-Step Verification Enabled</h2>
          <p style="color: #475569;">2-Step Verification has been successfully enabled for your ${appName} account.</p>
          <p style="color: #64748b; font-size: 13px;">Time: ${timeStr}</p>
          <p style="color: #ef4444; font-size: 13px;">If you did not perform this action, please contact your company administrator or platform support immediately.</p>
        </div>`;
      } else if (type === '2fa_disabled') {
        subject = 'Security Alert: 2-Step Verification Disabled';
        text = `Hello ${user.name || ''},\n\n2-Step Verification has been disabled for your ${appName} account at ${timeStr}.\n\nIf you did not make this change, please sign out all sessions and reset your password immediately.`;
        html = `<div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #dc2626; margin-top: 0;">2-Step Verification Disabled</h2>
          <p style="color: #475569;">2-Step Verification was turned off for your ${appName} account.</p>
          <p style="color: #64748b; font-size: 13px;">Time: ${timeStr}</p>
          <p style="color: #ef4444; font-size: 13px;">If you did not authorize this change, reset your password and revoke all sessions immediately.</p>
        </div>`;
      } else if (type === 'backup_codes_regenerated') {
        subject = 'Security Notice: 2-Step Verification Backup Codes Regenerated';
        text = `Hello ${user.name || ''},\n\nYour 2-Step Verification backup codes were regenerated at ${timeStr}. Your previous backup codes are now invalid.\n\nKeep your new backup codes in a safe, secure place.`;
        html = `<div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #0f172a; margin-top: 0;">Backup Codes Regenerated</h2>
          <p style="color: #475569;">Your 2-Step Verification backup codes have been regenerated. Any previous codes are no longer valid.</p>
          <p style="color: #64748b; font-size: 13px;">Time: ${timeStr}</p>
        </div>`;
      } else if (type === 'new_device_login') {
        const browser = parseDeviceLabel(metadata?.userAgent);
        const ip = metadata?.ipAddress ? maskIp(metadata.ipAddress) : 'Unknown';
        subject = 'Security Alert: Sign-in from a new device';
        text = `Hello ${user.name || ''},\n\nYour ${appName} account was signed in from a new device:\n- Device / Browser: ${browser}\n- IP: ${ip}\n- Time: ${timeStr}\n\nIf this was not you, please sign out of all devices and change your password immediately.`;
        html = `<div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #0f172a; margin-top: 0;">New Sign-In Detected</h2>
          <p style="color: #475569;">Your account was accessed from a new browser or device:</p>
          <ul style="color: #334155; font-size: 14px; line-height: 1.6;">
            <li><strong>Device / Browser:</strong> ${browser}</li>
            <li><strong>IP Address:</strong> ${ip}</li>
            <li><strong>Time:</strong> ${timeStr}</li>
          </ul>
          <p style="color: #64748b; font-size: 13px;">If you recognize this activity, no further action is required. If this was not you, sign in to your account, sign out all devices, and reset your password immediately.</p>
        </div>`;
      }

      const outboxItem = await this.prisma.emailOutbox.create({
        data: {
          to: user.email.toLowerCase(),
          subject,
          text,
          html,
          status: 'pending',
          isDecoy: false,
          tenantId: user.tenantId || null,
        },
      });

      setImmediate(() => {
        void this.dispatchOutboxItem(outboxItem.id);
      });
    } catch (err: any) {
      this.logger.error(`[SECURITY_NOTIF] Failed to enqueue security notification: ${err?.message}`);
    }
  }

  // ─── POST /auth/login/verify-2fa ───────────────────────────────────────────

  async verifyTwoFactor(dto: VerifyTwoFactorDto, clientIp?: string, userAgent?: string) {
    if (!dto || !dto.loginTicket || !dto.code) {
      throw new BadRequestException('loginTicket and code are required.');
    }

    const ticket = await this.prisma.loginTicket.findUnique({
      where: { jti: dto.loginTicket },
      include: {
        user: {
          include: {
            twoFactor: true,
            tenant: true,
          },
        },
      },
    });

    if (!ticket || !ticket.user) {
      await this._addArtificialDelay();
      throw new UnauthorizedException('Invalid or expired verification session.');
    }

    const user = ticket.user;
    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated.');
    }

    const now = new Date();
    const twoFaLockKey = `2fa:${user.id}`;
    await this.checkAccountLockout(twoFaLockKey, user);

    if (ticket.usedAt || ticket.expiresAt <= now || ticket.attempts >= 5) {
      await this._addArtificialDelay();
      throw new UnauthorizedException('Invalid or expired two-factor verification code.');
    }

    const cleanCode = (dto.code || '').trim().replace(/\s+/g, '');
    let codeValid = false;
    let usedMethod: 'totp' | 'backup_code' | 'email' | null = null;
    let matchedStep: number | null = null;
    let remainingBackupCodesJson: string | null = null;

    const twoFactor = user.twoFactor;
    if (!twoFactor || !twoFactor.enabledAt) {
      throw new UnauthorizedException('Two-factor authentication is not configured for this account.');
    }

    // 1. Try TOTP (allowed only if user chosen method is not 'email')
    if (twoFactor.method !== 'email' && twoFactor.secretEnc && cleanCode.length >= 6 && cleanCode.length <= 8 && /^\d+$/.test(cleanCode)) {
      try {
        const plainSecret = decryptAtRest(twoFactor.secretEnc);
        const totpRes = verifyTotpToken(cleanCode, plainSecret, twoFactor.lastUsedStep ?? undefined);
        if (totpRes.valid && totpRes.matchedStep !== undefined) {
          codeValid = true;
          usedMethod = 'totp';
          matchedStep = totpRes.matchedStep;
        }
      } catch {}
    }

    // 2. Try Backup code (allowed only if user chosen method is not 'email')
    if (twoFactor.method !== 'email' && !codeValid && twoFactor.backupCodesHash) {
      try {
        const backupRes = verifyAndConsumeBackupCode(cleanCode, twoFactor.backupCodesHash);
        if (backupRes.valid) {
          codeValid = true;
          usedMethod = 'backup_code';
          remainingBackupCodesJson = JSON.stringify(backupRes.remainingHashes);
        }
      } catch {}
    }

    // 3. Try Email OTP (allowed ONLY for users whose chosen method is 'email')
    if (twoFactor.method === 'email' && !codeValid && cleanCode.length === 6 && /^\d{6}$/.test(cleanCode)) {
      const isAdmin = user.role === 'platform_super_admin' || user.role === 'tenant_admin';
      if (!isAdmin && user.email) {
        const challenge = await this.prisma.otpChallenge.findFirst({
          where: {
            emailNormalized: user.email.toLowerCase(),
            purpose: 'login_2fa',
            usedAt: null,
            expiresAt: { gt: now },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (challenge) {
          const otpSecret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'crm-otp-secret-key-2026';
          const expectedHash = crypto.createHmac('sha256', otpSecret + challenge.id).update(cleanCode).digest('hex');
          const a = Buffer.from(challenge.codeHash, 'hex');
          const b = Buffer.from(expectedHash, 'hex');
          if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
            codeValid = true;
            usedMethod = 'email';
          }
        }
      }
    }

    // Wrong code handling: increment attempts atomically, trigger 2FA lockout if 10 reached
    if (!codeValid) {
      await this.prisma.loginTicket.updateMany({
        where: { jti: dto.loginTicket, usedAt: null },
        data: { attempts: { increment: 1 } },
      });
      await this.recordTwoFactorFailedAttempt(twoFaLockKey, user);
      await this._addArtificialDelay();
      throw new UnauthorizedException('Invalid or expired two-factor verification code.');
    }

    // Valid code: single-use atomic update inside transaction
    await this.prisma.$transaction(async (tx) => {
      const ticketUpdate = await tx.loginTicket.updateMany({
        where: {
          jti: dto.loginTicket,
          usedAt: null,
          expiresAt: { gt: now },
          attempts: { lt: 5 },
        },
        data: {
          usedAt: now,
        },
      });

      if (ticketUpdate.count !== 1) {
        throw new UnauthorizedException('Invalid or expired two-factor verification code.');
      }

      if (usedMethod === 'totp' && matchedStep !== null) {
        await tx.userTwoFactor.update({
          where: { userId: user.id },
          data: { lastUsedStep: matchedStep },
        });
      } else if (usedMethod === 'backup_code' && remainingBackupCodesJson !== null) {
        await tx.userTwoFactor.update({
          where: { userId: user.id },
          data: { backupCodesHash: remainingBackupCodesJson },
        });
      } else if (usedMethod === 'email') {
        await tx.otpChallenge.updateMany({
          where: { emailNormalized: user.email.toLowerCase(), purpose: 'login_2fa', usedAt: null },
          data: { usedAt: now },
        });
      }
    });

    // Reset 2FA lockout on success
    await this.prisma.accountLockout.delete({ where: { identityKey: twoFaLockKey } }).catch(() => {});

    // Handle trusted device if requested
    let trustedDeviceCookie: { name: string; value: string; options: any } | null = null;
    if (dto.trustDevice) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const deviceLabel = parseDeviceLabel(userAgent);
      const isAdmin = user.role === 'platform_super_admin' || user.role === 'tenant_admin';
      const maxAgeMs = isAdmin ? TRUSTED_DEVICE_ADMIN_MAX_AGE_MS : TRUSTED_DEVICE_MAX_AGE_MS;
      const expiresAt = new Date(Date.now() + maxAgeMs);

      await this.prisma.trustedDevice.create({
        data: {
          userId: user.id,
          tokenHash,
          label: deviceLabel,
          userAgent: userAgent ? userAgent.substring(0, 500) : null,
          ip: maskIp(clientIp || '127.0.0.1'),
          expiresAt,
          lastUsedAt: now,
        },
      });

      trustedDeviceCookie = {
        name: TRUSTED_DEVICE_COOKIE_NAME,
        value: rawToken,
        options: getTrustedDeviceCookieOptions(isAdmin),
      };
    }

    const portal = user.role === 'platform_super_admin' ? 'platform' : 'company';
    const loginRes = await this._buildLoginResponse(
      user,
      clientIp,
      undefined,
      false,
      userAgent,
      portal,
      true, // bypass2Fa
    );

    return {
      ...loginRes,
      trustedDeviceCookie,
    };
  }

  // ─── POST /auth/login/send-2fa-email ───────────────────────────────────────

  async sendTwoFactorEmail(loginTicket: string, clientIp?: string, userAgent?: string) {
    const ticket = await this.prisma.loginTicket.findUnique({
      where: { jti: loginTicket },
      include: { user: { include: { twoFactor: true } } },
    });
    if (!ticket || !ticket.user) {
      throw new UnauthorizedException('Invalid or expired verification session.');
    }
    const user = ticket.user;
    if (user.role === 'platform_super_admin' || user.role === 'tenant_admin') {
      throw new ForbiddenException('Administrators must use an authenticator app (TOTP) for 2-step verification.');
    }
    if (user.twoFactor && user.twoFactor.method !== 'email') {
      throw new ForbiddenException(
        'Email verification codes are only available for accounts configured with email 2-step verification. Authenticator app users must use their app or a backup code.',
      );
    }
    if (!user.email) {
      throw new BadRequestException('No email address associated with this account.');
    }

    const lower = user.email.toLowerCase();
    const now = new Date();

    // 1. Resend cooldown: 60s
    const existingChallenge = await this.prisma.otpChallenge.findFirst({
      where: {
        emailNormalized: lower,
        purpose: 'login_2fa',
        resendAfter: { gt: now },
        usedAt: null,
      },
    });
    if (existingChallenge) {
      const remainingSecs = Math.max(
        1,
        Math.ceil((new Date(existingChallenge.resendAfter).getTime() - now.getTime()) / 1000),
      );
      return {
        message: 'Verification code sent to your email.',
        resendAfterSeconds: remainingSecs,
      };
    }

    // 2. Hourly rate limit: 3 per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const countLastHour = await this.prisma.otpChallenge.count({
      where: {
        emailNormalized: lower,
        purpose: 'login_2fa',
        createdAt: { gte: oneHourAgo },
      },
    });
    if (countLastHour >= 3) {
      return {
        message: 'Verification code sent to your email.',
        resendAfterSeconds: 60,
      };
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const challengeId = crypto.randomUUID();
    const otpSecret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'crm-otp-secret-key-2026';
    const codeHash = crypto.createHmac('sha256', otpSecret + challengeId).update(code).digest('hex');

    await this.prisma.otpChallenge.updateMany({
      where: { emailNormalized: lower, purpose: 'login_2fa', usedAt: null },
      data: { usedAt: now },
    });

    await this.prisma.otpChallenge.create({
      data: {
        id: challengeId,
        emailNormalized: lower,
        purpose: 'login_2fa',
        codeHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        resendAfter: new Date(Date.now() + 60 * 1000), // 60 seconds
        requestIp: maskIp(clientIp || '127.0.0.1'),
        requestUserAgent: userAgent ? userAgent.substring(0, 500) : 'unknown',
      },
    });

    const requestTime = new Date().toUTCString();
    const browserLabel = parseDeviceLabel(userAgent);
    const appName = getProductName();
    const outboxSubject = `${code} is your ${appName} 2-step verification code`;
    const outboxText = `Hello,\n\nYour 2-step verification code is: ${code}\n\nThis code expires in 5 minutes.\n\nRequest details:\n- Time: ${requestTime}\n- Browser: ${browserLabel}\n- IP: ${clientIp || 'Unknown'}\n\nNever share this code with anyone.`;
    const outboxHtml = `<div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">2-Step Verification Code</h2>
      <p style="color: #475569; font-size: 14px;">Use the verification code below to complete your login:</p>
      <div style="background-color: #f1f5f9; border-radius: 10px; padding: 18px; text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #2563eb; font-family: monospace;">${code}</span>
      </div>
      <p style="color: #475569; font-size: 13px;">This code expires in <strong>5 minutes</strong>. For your security, <strong>never share this code with anyone</strong>.</p>
    </div>`;

    const outboxItem = await this.prisma.emailOutbox.create({
      data: {
        to: lower,
        subject: outboxSubject,
        text: outboxText,
        html: outboxHtml,
        status: 'pending',
        isDecoy: false,
        tenantId: user.tenantId || null,
      },
    });

    setImmediate(() => {
      void this.dispatchOutboxItem(outboxItem.id);
    });

    return {
      message: 'Verification code sent to your email.',
      resendAfterSeconds: 60,
    };
  }

  // ─── 2FA Enrollment Endpoints (Logged In / Setup Token) ─────────────────────

  async getTwoFactorStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { twoFactor: true, tenant: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const grace = await this.evaluateGracePeriod(user);
    let backupCodesRemaining = 0;
    if (user.twoFactor?.backupCodesHash) {
      try {
        backupCodesRemaining = JSON.parse(user.twoFactor.backupCodesHash).length;
      } catch {}
    }

    return {
      enabled: Boolean(user.twoFactor?.enabledAt),
      method: user.twoFactor?.method || null,
      enabledAt: user.twoFactor?.enabledAt || null,
      backupCodesRemaining,
      isEnforced: this.isUserTwoFactorEnforced(user),
      isPending: Boolean(!user.twoFactor?.enabledAt && user.twoFactor?.secretEnc),
      gracePeriod: grace,
    };
  }

  async setupTwoFactor(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, employeeCode: true, name: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const secret = generateTotpSecret();
    const secretEnc = encryptAtRest(secret);
    const appName = getProductName();
    const accountIdentifier = user.email || user.employeeCode || user.name || 'user';
    const otpauthUrl = buildTotpUri(accountIdentifier, appName, secret, 'SHA1', 6, 30);

    // Upsert pending secret in UserTwoFactor
    await this.prisma.userTwoFactor.upsert({
      where: { userId },
      create: {
        userId,
        method: 'totp',
        secretEnc,
        enabledAt: null,
      },
      update: {
        method: 'totp',
        secretEnc,
      },
    });

    return {
      secret,
      otpauthUrl,
      otpauthUri: otpauthUrl,
    };
  }

  async enableTwoFactor(userId: string, code: any, clientIp?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { twoFactor: true, tenant: true },
    });
    if (!user || !user.twoFactor || !user.twoFactor.secretEnc) {
      throw new BadRequestException('Two-factor setup has not been initiated. Please run setup first.');
    }

    const rawCode = typeof code === 'string' ? code : (code as any)?.code || '';
    const cleanCode = rawCode.trim().replace(/\s+/g, '');
    const plainSecret = decryptAtRest(user.twoFactor.secretEnc);
    const totpRes = verifyTotpToken(cleanCode, plainSecret);
    if (!totpRes.valid || totpRes.matchedStep === undefined) {
      throw new BadRequestException('Invalid verification code. Please check your authenticator app and try again.');
    }

    const backupCodes = generateBackupCodes(10);
    const backupCodesHash = JSON.stringify(backupCodes.map((c) => hashBackupCode(c)));

    await this.prisma.userTwoFactor.update({
      where: { userId },
      data: {
        enabledAt: new Date(),
        method: 'totp',
        lastUsedStep: totpRes.matchedStep,
        backupCodesHash,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId || 'default-tenant-id',
        actorId: user.id,
        actorName: user.name || user.email,
        action: '2FA_ENABLED',
        entityName: 'UserTwoFactor',
        entityId: user.id,
        ipAddress: maskIp(clientIp || '127.0.0.1'),
      },
    }).catch(() => {});

    void this.sendSecurityNotification(user.id, '2fa_enabled', { time: new Date() });

    const tokens = this.generateTokens(user, undefined, false);

    return {
      success: true,
      backupCodes,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: formatAuthUser(user),
      message: '2-Step verification has been successfully enabled.',
    };
  }

  async regenerateBackupCodes(userId: string, dto: RegenerateBackupCodesDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { twoFactor: true },
    });
    if (!user || !user.twoFactor || !user.twoFactor.enabledAt) {
      throw new BadRequestException('2-Step verification is not enabled.');
    }

    const currentPassword = dto.currentPassword || (dto as any)?.password;
    if (!currentPassword) {
      throw new UnauthorizedException('Current password is required.');
    }
    const passOk = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passOk) {
      throw new UnauthorizedException('Current password does not match.');
    }

    const cleanCode = (dto.code || '').trim().replace(/\s+/g, '');
    const plainSecret = decryptAtRest(user.twoFactor.secretEnc);
    const totpRes = verifyTotpToken(cleanCode, plainSecret, user.twoFactor.lastUsedStep ?? undefined);
    if (!totpRes.valid || totpRes.matchedStep === undefined) {
      throw new BadRequestException('Invalid 2-step verification code.');
    }

    const backupCodes = generateBackupCodes(10);
    const backupCodesHash = JSON.stringify(backupCodes.map((c) => hashBackupCode(c)));

    await this.prisma.userTwoFactor.update({
      where: { userId },
      data: {
        lastUsedStep: totpRes.matchedStep,
        backupCodesHash,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId || 'default-tenant-id',
        actorId: user.id,
        actorName: user.name || user.email,
        action: '2FA_BACKUP_CODES_REGENERATED',
        entityName: 'UserTwoFactor',
        entityId: user.id,
      },
    }).catch(() => {});

    void this.sendSecurityNotification(user.id, 'backup_codes_regenerated', { time: new Date() });

    return {
      success: true,
      backupCodes,
      message: 'Backup codes regenerated successfully.',
    };
  }

  async disableTwoFactor(userId: string, dto: DisableTwoFactorDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { twoFactor: true, tenant: true },
    });
    if (!user || !user.twoFactor || !user.twoFactor.enabledAt) {
      throw new BadRequestException('2-Step verification is not currently enabled.');
    }

    // Check enforcement: admins and company policy users cannot self-disable
    if (this.isUserTwoFactorEnforced(user)) {
      throw new ForbiddenException('2-Step verification is mandatory for your account policy and cannot be disabled.');
    }

    const currentPassword = dto.currentPassword || (dto as any)?.password;
    if (!currentPassword) {
      throw new UnauthorizedException('Current password is required.');
    }
    const passOk = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passOk) {
      throw new UnauthorizedException('Current password does not match.');
    }

    const cleanCode = (dto.code || '').trim().replace(/\s+/g, '');
    let codeValid = false;
    if (user.twoFactor.secretEnc) {
      try {
        const plainSecret = decryptAtRest(user.twoFactor.secretEnc);
        const totpRes = verifyTotpToken(cleanCode, plainSecret, user.twoFactor.lastUsedStep ?? undefined);
        if (totpRes.valid) codeValid = true;
      } catch {}
    }
    if (!codeValid && user.twoFactor.backupCodesHash) {
      try {
        const backupRes = verifyAndConsumeBackupCode(cleanCode, user.twoFactor.backupCodesHash);
        if (backupRes.valid) codeValid = true;
      } catch {}
    }
    if (!codeValid) {
      throw new BadRequestException('Invalid 2-step verification code.');
    }

    await this.prisma.userTwoFactor.delete({
      where: { userId },
    });

    // Revoke all trusted devices for user
    await this.prisma.trustedDevice.deleteMany({
      where: { userId },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId || 'default-tenant-id',
        actorId: user.id,
        actorName: user.name || user.email,
        action: '2FA_DISABLED',
        entityName: 'UserTwoFactor',
        entityId: user.id,
      },
    }).catch(() => {});

    void this.sendSecurityNotification(user.id, '2fa_disabled', { time: new Date() });

    return {
      success: true,
      message: '2-Step verification has been disabled.',
    };
  }

  // ─── 2FA Recovery (Tenant Admin for Company Users) ─────────────────────────

  async resetUserTwoFactor(targetUserId: string, actor: any, clientIp?: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { tenant: true },
    });
    if (!targetUser) throw new NotFoundException('Target user not found');

    if (targetUser.role === 'platform_super_admin') {
      throw new ForbiddenException('Platform administrator 2-step verification cannot be reset via web console.');
    }

    if (actor.role === 'tenant_admin' && actor.tenantId !== targetUser.tenantId) {
      throw new ForbiddenException('Cannot reset 2-step verification for users in another company.');
    }

    if (actor.role !== 'tenant_admin' && actor.role !== 'platform_super_admin') {
      throw new ForbiddenException('Insufficient permissions to reset 2-step verification.');
    }

    await this.prisma.userTwoFactor.deleteMany({
      where: { userId: targetUserId },
    });

    await this.prisma.trustedDevice.deleteMany({
      where: { userId: targetUserId },
    });

    await this.prisma.refreshSession.updateMany({
      where: { userId: targetUserId },
      data: { isRevoked: true },
    });

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        tokenVersion: { increment: 1 },
        firstLoginAfter2FaReleaseAt: null, // resets grace period
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: targetUser.tenantId || 'default-tenant-id',
        actorId: actor.id || actor.sub,
        actorName: actor.name || actor.email || 'Admin',
        action: '2FA_RESET_BY_ADMIN',
        entityName: 'UserTwoFactor',
        entityId: targetUserId,
        ipAddress: maskIp(clientIp || '127.0.0.1'),
        afterState: JSON.stringify({
          targetUserId,
          targetEmail: targetUser.email,
          resetBy: actor.email,
        }),
      },
    }).catch(() => {});

    void this.sendSecurityNotification(targetUserId, '2fa_disabled', { time: new Date() });

    return {
      success: true,
      message: `2-Step verification has been reset for ${targetUser.name || targetUser.email}. All sessions and trusted devices have been revoked.`,
    };
  }

  // ─── Trusted Device Management (Devices Tab) ────────────────────────────────

  async getTrustedDevices(userId: string) {
    const devices = await this.prisma.trustedDevice.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastUsedAt: 'desc' },
    });

    return devices.map((d) => ({
      id: d.id,
      label: d.label,
      userAgent: d.userAgent,
      ip: d.ip,
      expiresAt: d.expiresAt,
      lastUsedAt: d.lastUsedAt,
    }));
  }

  async revokeTrustedDevice(userId: string, deviceId: string) {
    await this.prisma.trustedDevice.deleteMany({
      where: {
        id: deviceId,
        userId,
      },
    });
    return { success: true, message: 'Trusted device removed.' };
  }

  async revokeAllTrustedDevices(userId: string) {
    await this.prisma.trustedDevice.deleteMany({
      where: { userId },
    });
    return { success: true, message: 'All trusted devices removed.' };
  }

  // ─── Security Token & Decoy Cleanup Job (Item 18) ───────────────────────────

  async cleanupExpiredSecurityTokens(): Promise<{
    deletedOtp: number;
    deletedResetTickets: number;
    deletedLoginTickets: number;
    deletedOutbox: number;
    deletedTrustedDevices: number;
  }> {
    const now = new Date();
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [otpRes, resetRes, loginRes, outboxRes, deviceRes] = await Promise.all([
      this.prisma.otpChallenge.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { usedAt: { not: null, lt: oneDayAgo } },
          ],
        },
      }),
      this.prisma.resetTicket.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { usedAt: { not: null, lt: oneDayAgo } },
          ],
        },
      }),
      this.prisma.loginTicket.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { usedAt: { not: null, lt: oneDayAgo } },
            { attempts: { gte: 5 } },
          ],
        },
      }),
      this.prisma.emailOutbox.deleteMany({
        where: {
          OR: [
            { createdAt: { lt: fifteenMinutesAgo } },
            { sentAt: { not: null, lt: fifteenMinutesAgo } },
            { isDecoy: true, createdAt: { lt: oneDayAgo } },
          ],
        },
      }),
      this.prisma.trustedDevice.deleteMany({
        where: {
          expiresAt: { lt: now },
        },
      }),
    ]);

    return {
      deletedOtp: otpRes.count,
      deletedResetTickets: resetRes.count,
      deletedLoginTickets: loginRes.count,
      deletedOutbox: outboxRes.count,
      deletedTrustedDevices: deviceRes.count,
    };
  }

  // Helper for forced setup resolution
  async resolveUserIdFromAuthOrSetupToken(actor: any, setupToken?: string): Promise<string> {
    if (actor?.id) return actor.id;
    if (!setupToken) {
      throw new UnauthorizedException('Authentication or setup token required.');
    }
    try {
      const payload: any = this.jwtService.verify(setupToken, { secret: process.env.JWT_SECRET });
      if (payload.purpose !== 'two_factor_setup' || !payload.sub) {
        throw new UnauthorizedException('Invalid setup token.');
      }
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired setup token.');
    }
  }
}
