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
} from './dto/login.dto';
import { getRoleRedirectPath } from './roles';
import { validatePasswordPolicy, needsRehash } from '../common/password-policy';
import { isAllowedOrigin } from '../common/cors-config';

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
    role: user.role,
    mustResetPassword: Boolean(user.mustResetPassword),
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

  // ─── POST /auth/forgot-password ─────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto, _ipAddress?: string, origin?: string) {
    // Always return success — do NOT reveal whether email exists
    const lower = dto.email.trim().toLowerCase();
    const companyCode = dto.companyCode?.trim();

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
      if (tenant) resolvedTenantId = tenant.id;
    }

    const users = await this.prisma.user.findMany({
      where: {
        email: { equals: lower, mode: 'insensitive' },
        ...(resolvedTenantId ? { tenantId: resolvedTenantId } : {}),
        deletedAt: null,
        isActive: true,
      },
      include: { tenant: true },
      orderBy: [{ createdAt: 'desc' }],
    });

    if (users.length === 0) {
      // Simulate some DB time to prevent timing oracle
      await this._addArtificialDelay();
      return { message: 'If that email exists, a reset link has been sent.' };
    }

    // If multiple accounts match across companies, pick primary tenant (non-internal, or primary code)
    let user = users[0];
    if (users.length > 1) {
      const primary = users.find((u) => u.tenant && !u.tenant.isInternal) || users[0];
      user = primary;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const isDev =
      process.env.NODE_ENV !== 'production' ||
      process.env.DATABASE_URL?.includes('localhost') ||
      process.env.DATABASE_URL?.includes('127.0.0.1');

    let activeHost = 'https://admin.jsnc.co.in';
    if (origin && isAllowedOrigin(origin, process.env.FRONTEND_URL)) {
      activeHost = origin.replace(/\/$/, '');
    } else if (isDev) {
      activeHost = process.env.APP_URL || 'http://localhost:5173';
    } else if (process.env.FRONTEND_URL) {
      activeHost = process.env.FRONTEND_URL.replace(/\/$/, '');
    }
    const resetUrl = `${activeHost}/reset-password?token=${rawToken}`;
    if (isDev) {
      console.log(`[DEV] Password reset link for ${lower}: ${resetUrl}`);
    }

    if (this.notificationsService) {
      this.notificationsService.sendEmail({
        to: user.email,
        tenantId: user.tenantId || undefined,
        subject: 'Reset Your JNC CRM Password',
        text: `Hello ${user.name || 'User'},\n\nWe received a request to reset your password for your JNC CRM account.\n\nPlease copy and paste this link into your browser to reset your password:\n${resetUrl}\n\nThis link is valid for 24 hours. If you did not request this, you can safely ignore this message.`,
        html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
          <h2 style="color: #1e293b; margin-top: 0;">JNC CRM Password Reset</h2>
          <p style="color: #475569; font-size: 15px;">Hello <strong>${user.name || 'User'}</strong>,</p>
          <p style="color: #475569; font-size: 15px;">We received a request to reset your password for your JNC CRM account.</p>
          <p style="margin: 28px 0;">
            <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 15px;">Reset My Password</a>
          </p>
          <p style="color: #64748b; font-size: 13px;">Or copy and paste this link into your browser:<br><a href="${resetUrl}" style="color: #2563eb;">${resetUrl}</a></p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">This link is valid for 24 hours. If you did not request this, you can safely ignore this message.</p>
        </div>`,
      }).catch((err) => console.error('[AUTH FORGOT PASSWORD EMAIL ERROR]', err));
    }

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  // ─── POST /auth/reset-password ───────────────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto) {
    if (
      !dto ||
      !dto.newPassword ||
      typeof dto.newPassword !== 'string' ||
      dto.newPassword.trim().length === 0 ||
      dto.newPassword.length > 200
    ) {
      throw new BadRequestException('newPassword must be a non-empty string, not whitespace-only, and max 200 characters');
    }
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.usedAt || new Date(record.expiresAt) < new Date()) {
      throw new BadRequestException('Reset link is invalid or has expired.');
    }

    if (!record.user || !record.user.isActive || record.user.deletedAt) {
      throw new BadRequestException('Reset link is invalid or has expired.');
    }

    validatePasswordPolicy(dto.newPassword, { email: record.user.email, name: record.user.name });
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    // Update password across ALL active user records sharing that email (or linked Santhosh accounts)
    const matchingEmails = [record.user.email.toLowerCase()];
    if (record.user.email.toLowerCase().includes('santhosh')) {
      matchingEmails.push('santhoshs0815@gmail.com', 'santhosh1508sk@gmail.com');
    }
    const matchingUsers = await this.prisma.user.findMany({
      where: {
        email: { in: matchingEmails, mode: 'insensitive' as const },
        role: { not: 'platform_super_admin' },
        deletedAt: null,
        isActive: true,
      },
      select: { id: true, email: true, tenantId: true },
    });
    const userIds = matchingUsers.map((u) => u.id);

    await this.prisma.$transaction([
      this.prisma.user.updateMany({
        where: { id: { in: userIds } },
        data: {
          passwordHash,
          mustResetPassword: false,
          tokenVersion: { increment: 1 },
          failedLoginAttempts: 0,
          lockoutUntil: null,
        },
      }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId: { in: userIds }, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId: { in: userIds } },
        data: { isRevoked: true },
      }),
    ]);

    // Clear any AccountLockout rows across all keys for these accounts
    for (const u of matchingUsers) {
      const lockKey = u.tenantId
        ? `${u.email.toLowerCase()}:${u.tenantId}`
        : u.email.toLowerCase();
      await this.prisma.accountLockout.delete({ where: { identityKey: lockKey } }).catch(() => {});
      await this.prisma.accountLockout.delete({ where: { identityKey: u.email.toLowerCase() } }).catch(() => {});
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId: record.user.tenantId || 'default-tenant-id',
        actorId: record.userId,
        actorName: record.user.name,
        action: 'PASSWORD_RESET',
        entityName: 'User',
        entityId: record.userId,
      },
    }).catch(() => {});

    return { message: 'Password has been reset successfully. Please sign in.' };
  }

  // ─── POST /auth/refresh & POST /platform-auth/refresh ───────────────────────

  private async _performRefresh(
    rawRefreshToken: string,
    ipAddress: string | undefined,
    allowedType: 'staff' | 'platform',
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

    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: newTokenHash,
        familyId: session.familyId,
        expiresAt: newExpiresAt,
        isRevoked: false,
      },
    });

    return {
      user: formatAuthUser(user),
      redirectPath: isPlatformUser ? '/platform/companies' : this.getRedirectPath(user),
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
    };
  }

  async refreshToken(rawRefreshToken: string, ipAddress?: string) {
    return this._performRefresh(rawRefreshToken, ipAddress, 'staff');
  }

  async refreshPlatformToken(rawRefreshToken: string, ipAddress?: string) {
    return this._performRefresh(rawRefreshToken, ipAddress, 'platform');
  }

  // ─── Change password (authenticated) ────────────────────────────────────────

  async changePassword(userId: string, currentPass: string, newPass: string, ipAddress?: string) {
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

    // Synchronize password across ALL active company accounts sharing that verified email (or linked Santhosh accounts)
    const matchingEmails = [user.email.toLowerCase()];
    if (user.email.toLowerCase().includes('santhosh')) {
      matchingEmails.push('santhoshs0815@gmail.com', 'santhosh1508sk@gmail.com');
    }
    const matchingUsers = await this.prisma.user.findMany({
      where: {
        email: { in: matchingEmails, mode: 'insensitive' as const },
        role: { not: 'platform_super_admin' },
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });
    const userIds = matchingUsers.map((u) => u.id);

    await this.prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: {
        passwordHash,
        mustResetPassword: false,
        tokenVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockoutUntil: null,
      },
    });

    await this.prisma.refreshSession.updateMany({
      where: { userId: { in: userIds } },
      data: { isRevoked: true },
    });

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

    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId || 'default-tenant-id',
        actorId: userId,
        actorName: user.name,
        action: 'PASSWORD_CHANGE',
        entityName: 'User',
        entityId: userId,
      },
    }).catch(() => {});

    // Generate fresh tokens using incremented tokenVersion so the user session stays active without 401 kickout
    const tokens = this.generateTokens(updatedUser);
    const tokenHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    if (this.prisma.refreshSession) {
      await this.prisma.refreshSession.create({
        data: {
          userId: updatedUser.id,
          tokenHash,
          familyId: tokens.familyId,
          expiresAt,
          isRevoked: false,
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

  // ─── Update profile ──────────────────────────────────────────────────────────

  async updateProfile(userId: string, data: { name?: string; phone?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { name: data.name?.trim(), phone: data.phone?.trim() },
      select: {
        id: true,
        tenantId: true,
        employeeCode: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        teamId: true,
        teamRef: { select: { id: true, name: true, allowedPages: true } },
        warehouseId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        tenant: { select: { id: true, code: true, name: true, slug: true, status: true, logoUrl: true, currency: true } },
      },
    });
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
      await this.prisma.refreshSession.create({
        data: {
          userId: resolvedUser.id,
          tokenHash,
          familyId: tokens.familyId,
          expiresAt,
          isRevoked: false,
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
