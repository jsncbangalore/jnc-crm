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
  ForgotPasswordVerifyDto,
  ForgotPasswordResetDto,
  RequestEmailChangeDto,
  VerifyEmailChangeDto,
} from './dto/login.dto';
import { getRoleRedirectPath } from './roles';
import { validatePasswordPolicy, needsRehash, getPasswordPolicy, PasswordPolicyDto } from '../common/password-policy';
import { isAllowedOrigin } from '../common/cors-config';
import { parseDeviceLabel } from '../common/device.util';

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

export function formatAuthUser(user: any): any {
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
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  /** Per-IP + per-account rate limit for platform login */
  private readonly PLATFORM_MAX_ATTEMPTS = 5;
  private readonly PLATFORM_WINDOW_MS = 15 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    @Inject(forwardRef(() => NotificationsService)) private notificationsService: NotificationsService,
  ) {}

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

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
    if (
      !loginDto ||
      !loginDto.password ||
      typeof loginDto.password !== 'string' ||
      loginDto.password.trim().length === 0 ||
      loginDto.password.length > 200
    ) {
      throw new BadRequestException('password must be a non-empty string, not whitespace-only, and max 200 characters');
    }

    const raw = ((loginDto.identifier || loginDto.username) ?? '').trim();
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
    return this._buildLoginResponse(matchedUser, ipAddress, loginDto.password, Boolean(loginDto.keepSignedIn), userAgent, 'company');
  }

  // ─── POST /auth/login/select-company ────────────────────────────────────────

  async selectCompany(dto: SelectCompanyDto, ipAddress?: string, userAgent?: string) {
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
    return this._buildLoginResponse(user, ipAddress, undefined, false, userAgent, 'company');
  }

  // ─── Platform Login Handler (used by PlatformAuthController) ───────────────

  async platformLogin(dto: PlatformLoginDto, ipAddress?: string, userAgent?: string) {
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
        tenant: { select: { id: true, code: true, name: true, status: true } },
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

    return this._buildLoginResponse(user, ipAddress, dto.password, Boolean(dto.keepSignedIn), userAgent, 'platform');
  }

  // ─── POST /auth/forgot-password/request (OTP Flow) ─────────────────────────

  async forgotPasswordRequest(
    dto: ForgotPasswordRequestDto,
    clientIp?: string,
    userAgent?: string,
  ) {
    const lower = (dto?.email || '').trim().toLowerCase();
    const now = new Date();

    // 1. Resend cooldown: 60 seconds per email
    const existingChallenge = await this.prisma.otpChallenge.findFirst({
      where: {
        emailNormalized: lower,
        purpose: 'password_reset',
        resendAfter: { gt: now },
        usedAt: null,
      },
    });

    if (existingChallenge) {
      await this._addArtificialDelay();
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
    const countLastHour = await this.prisma.otpChallenge.count({
      where: {
        emailNormalized: lower,
        purpose: 'password_reset',
        createdAt: { gte: oneHourAgo },
      },
    });

    if (countLastHour >= 3) {
      this.logger.warn(`[OTP_CHALLENGE] 3 codes/hour limit reached for ${maskIdentifier(lower)}`);
      await this._addArtificialDelay();
      return {
        message: 'If this account exists, we sent a code.',
        resendAfterSeconds: 60,
      };
    }

    // 3. Check if active account(s) exist for this email (Company users and Platform Owner)
    const users = await this.prisma.user.findMany({
      where: {
        email: { equals: lower, mode: 'insensitive' },
        deletedAt: null,
        isActive: true,
      },
      include: { tenant: true },
    });

    if (users.length === 0) {
      // Artificial delay to prevent timing-based user enumeration
      await this._addArtificialDelay();
      return {
        message: 'If this account exists, we sent a code.',
        resendAfterSeconds: 60,
      };
    }

    // 4. Generate cryptographically secure 6-digit verification code
    const code = crypto.randomInt(100000, 1000000).toString();
    const challengeId = crypto.randomUUID();
    const otpSecret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'jnc-otp-secret-key-2026';
    const codeHash = crypto
      .createHmac('sha256', otpSecret + challengeId)
      .update(code)
      .digest('hex');

    // 5. Invalidate older open challenges for this email
    await this.prisma.otpChallenge.updateMany({
      where: {
        emailNormalized: lower,
        purpose: 'password_reset',
        usedAt: null,
      },
      data: { usedAt: now },
    });

    // 6. Create active challenge with 10-minute validity and 60s resend lockout
    await this.prisma.otpChallenge.create({
      data: {
        id: challengeId,
        emailNormalized: lower,
        purpose: 'password_reset',
        codeHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        resendAfter: new Date(Date.now() + 60 * 1000),     // 60 seconds
        requestIp: maskIp(clientIp || '127.0.0.1'),
        requestUserAgent: userAgent ? userAgent.substring(0, 500) : 'unknown',
      },
    });

    // 7. Dispatch verification email (10-second timeout, logs only failure reason, never code)
    if (this.notificationsService) {
      const requestTime = new Date().toUTCString();
      const browserLabel = parseDeviceLabel(userAgent);

      const emailPromise = this.notificationsService.sendEmail({
        to: lower,
        subject: `${code} is your JNC CRM verification code`,
        text: `Hello,\n\nYour JNC CRM verification code is: ${code}\n\nThis code expires in 10 minutes. For your security, never share this code with anyone.\n\nRequest details:\n- Time: ${requestTime}\n- Browser: ${browserLabel}\n- IP: ${clientIp || 'Unknown'}\n\nIf you did not request this verification code, you can safely ignore this email.`,
        html: `<div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Password Reset Code</h2>
          <p style="color: #475569; font-size: 14px;">Use the 6-digit verification code below to reset your JNC CRM password:</p>
          <div style="background-color: #f1f5f9; border-radius: 10px; padding: 18px; text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #2563eb; font-family: monospace;">${code}</span>
          </div>
          <p style="color: #475569; font-size: 13px;">This code expires in <strong>10 minutes</strong>. For your security, <strong>never share this code with anyone</strong>.</p>
          <div style="border-top: 1px solid #e2e8f0; margin-top: 24px; padding-top: 16px; font-size: 12px; color: #64748b;">
            <div><strong>Request Time:</strong> ${requestTime}</div>
            <div style="margin-top: 4px;"><strong>Browser:</strong> ${browserLabel}</div>
            <div style="margin-top: 4px;"><strong>IP Address:</strong> ${clientIp || 'Unknown'}</div>
          </div>
        </div>`,
      });

      const timeoutPromise = new Promise<{ status: string; error?: string }>((_, reject) =>
        setTimeout(() => reject(new Error('Email dispatch timed out after 10 seconds')), 10000),
      );

      try {
        const res: any = await Promise.race([emailPromise, timeoutPromise]);
        if (res && res.status === 'failed') {
          this.logger.error(`[OTP_CHALLENGE] Email dispatch failure: ${res.error || res.reason || 'delivery failure'}`);
        }
      } catch (err: any) {
        this.logger.error(`[OTP_CHALLENGE] Email dispatch failed: ${err?.message || 'timeout/network error'}`);
      }
    }

    await this._addArtificialDelay();
    return {
      message: 'If this account exists, we sent a code.',
      resendAfterSeconds: 60,
    };
  }

  // ─── POST /auth/forgot-password/verify ──────────────────────────────────────

  async forgotPasswordVerify(dto: ForgotPasswordVerifyDto) {
    const lower = (dto?.email || '').trim().toLowerCase();
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        emailNormalized: lower,
        purpose: 'password_reset',
        usedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge || challenge.attempts >= 5 || new Date(challenge.expiresAt) < new Date()) {
      throw new BadRequestException('Code is incorrect or expired.');
    }

    const otpSecret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'jnc-otp-secret-key-2026';
    const expectedHash = crypto
      .createHmac('sha256', otpSecret + challenge.id)
      .update(dto.code ? dto.code.trim() : '')
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
          usedAt: newAttempts >= 5 ? new Date() : null, // Kill challenge after 5 failed attempts
        },
      }).catch(() => {});
      throw new BadRequestException('Code is incorrect or expired.');
    }

    // Mark challenge as used (single-use)
    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { usedAt: new Date() },
    });

    // Find accounts for this email (Company users + Platform Super Admin)
    const users = await this.prisma.user.findMany({
      where: {
        email: { equals: lower, mode: 'insensitive' },
        deletedAt: null,
        isActive: true,
      },
      include: {
        tenant: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    if (users.length === 0) {
      throw new BadRequestException('Code is incorrect or expired.');
    }

    const accounts = users.map((u) => ({
      accountId: u.id,
      label:
        u.role === 'platform_super_admin' && !u.tenantId
          ? 'Platform administration'
          : u.tenant?.name || 'Company CRM',
    }));

    // Issue signed 10-minute reset ticket bound to email
    const resetTicket = this.jwtService.sign(
      {
        sub: challenge.id,
        email: lower,
        purpose: 'password_reset_ticket',
        accountIds: accounts.map((a) => a.accountId),
      },
      {
        secret: process.env.JWT_SECRET,
        expiresIn: '10m',
        algorithm: 'HS256',
        issuer: 'jnc-crm-api',
        audience: 'jnc-crm-client',
      },
    );

    return { resetTicket, accounts };
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
        issuer: 'jnc-crm-api',
        audience: 'jnc-crm-client',
      });
    } catch {
      throw new BadRequestException(
        'Reset session is invalid or has expired. Please request a new verification code.',
      );
    }

    if (payload.purpose !== 'password_reset_ticket' || !payload.email) {
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

    // Validate password policy
    validatePasswordPolicy(dto.newPassword, { email: ticketEmail });
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    // Update the chosen accounts (works for Platform Super Admin and Tenant Users alike)
    const updateResult = await this.prisma.user.updateMany({
      where: {
        id: { in: dto.accountIds },
        deletedAt: null,
        isActive: true,
      },
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
      this.logger.error(`[RESET_PASSWORD] Failed to update user accounts: 0 rows modified.`);
      throw new BadRequestException('Unable to update password. User account not found or inactive.');
    }

    // Revoke all refresh sessions for updated users
    await this.prisma.refreshSession.updateMany({
      where: { userId: { in: dto.accountIds } },
      data: { isRevoked: true },
    });

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
    });

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
      this.notificationsService.sendEmail({
        to: ticketEmail,
        subject: 'Your JNC CRM password was changed',
        text: `Hello,\n\nYour JNC CRM password was successfully changed on ${changeTime} from IP address: ${clientIpMasked}.\n\nIf you did not make this change, please contact your administrator immediately.`,
        html: `<div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Password Changed</h2>
          <p style="color: #475569; font-size: 14px;">Your JNC CRM password was successfully changed on <strong>${changeTime}</strong> from IP address: <strong>${clientIpMasked}</strong>.</p>
          <p style="color: #dc2626; font-size: 13px;">If you did not make this change, please contact your administrator immediately.</p>
        </div>`,
      }).catch((err) => {
        this.logger.error(`[RESET_PASSWORD] Failed to dispatch password change notification: ${err?.message || 'error'}`);
      });
    }

    return { success: true, message: 'Password has been reset successfully. Please sign in.' };
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
  ) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    let payload: any;
    try {
      payload = this.jwtService.verify(rawRefreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
        algorithms: ['HS256'],
        issuer: 'jnc-crm-api',
        audience: 'jnc-crm-client',
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
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
                issuer: 'jnc-crm-api',
                audience: 'jnc-crm-client',
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
    if (allowedType === 'staff' && isPlatformUser) {
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

    return {
      user: formatAuthUser(user),
      redirectPath: isPlatformUser ? '/platform/companies' : this.getRedirectPath(user),
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
    };
  }

  async refreshToken(rawRefreshToken: string, ipAddress?: string, userAgent?: string) {
    return this._performRefresh(rawRefreshToken, ipAddress, 'staff', userAgent);
  }

  async refreshPlatformToken(rawRefreshToken: string, ipAddress?: string, userAgent?: string) {
    return this._performRefresh(rawRefreshToken, ipAddress, 'platform', userAgent);
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
      this.notificationsService.sendEmail({
        to: user.email,
        tenantId: user.tenantId || undefined,
        subject: 'Your JNC CRM password was changed',
        text: `Hello ${user.name || 'User'},\n\nYour password for JNC CRM was successfully changed on ${changeTime} from IP address: ${clientIp}.\n\nIf you did not perform this change, please contact your administrator immediately.`,
        html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #1e293b; margin-top: 0;">Password Changed</h2>
          <p style="color: #475569; font-size: 15px;">Hello <strong>${user.name || 'User'}</strong>,</p>
          <p style="color: #475569; font-size: 14px;">Your JNC CRM account password was successfully changed.</p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin: 16px 0; font-size: 13px; color: #334155;">
            <div><strong>Time:</strong> ${changeTime}</div>
            <div style="margin-top: 4px;"><strong>IP Address:</strong> ${clientIp}</div>
          </div>
          <p style="color: #dc2626; font-size: 13px;">If you did not make this change, please contact your administrator immediately.</p>
        </div>`,
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

  async logout(rawToken?: string, userId?: string, ipAddress?: string) {
    if (rawToken) {
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await this.prisma.refreshSession.updateMany({
        where: { tokenHash },
        data: { isRevoked: true },
      }).catch(() => {});
    }
    if (userId) {
      await this.prisma.auditLog.create({
        data: {
          tenantId: 'default-tenant-id',
          actorId: userId,
          action: 'LOGOUT',
          entityName: 'User',
          entityId: userId,
          ipAddress: ipAddress || '127.0.0.1',
        },
      }).catch(() => {});
    }
    return { success: true, message: 'Logged out successfully' };
  }

  // ─── Sign out of all devices (increments tokenVersion + revokes all) ────────

  async logoutAll(userId: string, ipAddress?: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    await this.prisma.refreshSession.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
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
    const session = await this.prisma.refreshSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) {
      throw new NotFoundException('Session not found or already revoked');
    }
    await this.prisma.refreshSession.update({
      where: { id: sessionId },
      data: { isRevoked: true },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: 'default-tenant-id',
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

  async requestEmailChange(userId: string, newEmail: string, clientIp?: string, userAgent?: string) {
    const lower = (newEmail || '').trim().toLowerCase();
    if (!lower || !lower.includes('@')) {
      throw new BadRequestException('A valid email address is required');
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
    const otpSecret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'jnc-otp-secret-key-2026';
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
      this.notificationsService.sendEmail({
        to: lower,
        subject: `${code} is your JNC CRM email confirmation code`,
        text: `Your confirmation code to change your email is: ${code}\nThis code expires in 10 minutes.`,
        html: `<div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h3 style="margin-top:0;">Confirm Your Email Change</h3>
          <p>Use the 6-digit verification code below to confirm this email address:</p>
          <div style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #2563eb; padding: 12px; background: #eff6ff; border-radius: 6px; text-align: center; margin: 16px 0;">
            ${code}
          </div>
          <p style="color: #64748b; font-size: 13px;">This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
        </div>`,
      }).catch((err: any) => {
        this.logger.error(`[EMAIL_CHANGE] Failed to send OTP: ${err?.message || 'error'}`);
      });
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

    const otpSecret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'jnc-otp-secret-key-2026';
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
  ) {
    const { passwordHash, ...result } = user;
    const resolvedUser = {
      ...result,
      tenantId: result.tenantId ?? (result.tenant ? result.tenant.id : null),
    };

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
      issuer: 'jnc-crm-api',
      audience: 'jnc-crm-client',
    });

    const refreshExpiry = isPlatform ? '8h' : effectiveKeepSignedIn ? '7d' : '12h';
    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: refreshExpiry,
      algorithm: 'HS256',
      issuer: 'jnc-crm-api',
      audience: 'jnc-crm-client',
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
    if (!stepUpToken) {
      throw new ForbiddenException('Step-up authentication required: x-step-up-token must be provided.');
    }
    try {
      const payload: any = this.jwtService.verify(stepUpToken, { secret: process.env.JWT_SECRET });
      if (payload.purpose !== 'platform_step_up' || payload.sub !== (actor.id || actor.sub)) {
        throw new UnauthorizedException('Invalid step-up token.');
      }
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired step-up authentication token.');
    }
  }

  /** Adds ~200–400 ms of artificial delay to make timing attacks harder */
  private _addArtificialDelay() {
    return new Promise((r) => setTimeout(r, 200 + Math.random() * 200));
  }
}
