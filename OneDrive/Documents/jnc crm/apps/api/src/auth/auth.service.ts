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
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
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

const GENERIC_ERROR = 'Invalid credentials.';

@Injectable()
export class AuthService {
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  /** Per-IP + per-account rate limit for /platform-login */
  private readonly PLATFORM_MAX_ATTEMPTS = 5;
  private readonly PLATFORM_WINDOW_MS = 15 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // ─── Lockout helpers ─────────────────────────────────────────────────────────

  private async checkAccountLockout(lockKey: string, user?: any) {
    const now = new Date();

    if (user && user.lockoutUntil) {
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
    }

    const lockoutRecord = await this.prisma.accountLockout.findUnique({
      where: { identityKey: lockKey },
    });

    if (lockoutRecord && lockoutRecord.lockedUntil) {
      if (new Date(lockoutRecord.lockedUntil) > now) {
        const remainingMinutes = Math.ceil(
          (new Date(lockoutRecord.lockedUntil).getTime() - now.getTime()) / 60000,
        );
        throw new UnauthorizedException(
          `Account is temporarily locked. Please try again in ${remainingMinutes} minute(s) or contact administrator.`,
        );
      } else {
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
      currentAttempts = (user.failedLoginAttempts || 0) + 1;
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
      const record = await this.prisma.accountLockout.upsert({
        where: { identityKey: lockKey },
        create: { identityKey: lockKey, failedAttempts: 1, lastAttemptAt: now },
        update: { failedAttempts: { increment: 1 }, lastAttemptAt: now },
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
        OR: [
          { email: { equals: lower, mode: 'insensitive' } },
          { employeeCode: { equals: upper, mode: 'insensitive' } },
        ],
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  // ─── POST /auth/login ────────────────────────────────────────────────────────

  async login(loginDto: LoginDto, ipAddress?: string) {
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
      await this.recordFailedAttempt(lockKey, undefined, ipAddress);
      throw new UnauthorizedException(GENERIC_ERROR);
    }

    // ── Block platform_super_admin on this endpoint ──────────────────────────
    const nonPlatformCandidates = candidates.filter((c) => c.role !== 'platform_super_admin');

    // ── Password check across all non-platform candidates ───────────────────
    const matched: any[] = [];
    for (const candidate of nonPlatformCandidates) {
      if (candidate.passwordHash && loginDto.password) {
        const ok = await bcrypt.compare(loginDto.password, candidate.passwordHash);
        if (ok) matched.push(candidate);
      }
    }

    if (matched.length === 0) {
      // Record failure against first non-platform candidate (or key-only)
      const firstUser = nonPlatformCandidates[0] ?? candidates[0];
      const failKey = firstUser?.tenantId
        ? `${(firstUser.email || lower).toLowerCase()}:${firstUser.tenantId}`
        : lockKey;
      await this.recordFailedAttempt(failKey, firstUser || undefined, ipAddress);
      throw new UnauthorizedException(GENERIC_ERROR);
    }

    // ── Multi-company case — return selectionToken ───────────────────────────
    if (!companyCode && matched.length > 1) {
      const companies = matched
        .filter((u) => u.tenant)
        .map((u) => ({ code: u.tenant.code, name: u.tenant.name }));

      const jti = crypto.randomUUID();
      // Embed matched user ids so we can verify in select-company
      const selectionToken = this.jwtService.sign(
        {
          jti,
          matchedIds: matched.map((u) => u.id),
          purpose: 'company_selection',
        },
        { secret: process.env.JWT_SECRET, expiresIn: '5m' },
      );

      return { requiresCompanySelection: true, companies, selectionToken };
    }

    // ── Single match ─────────────────────────────────────────────────────────
    const matchedUser = matched[0];
    const matchedLockKey = matchedUser.tenantId
      ? `${(matchedUser.email || lower).toLowerCase()}:${matchedUser.tenantId}`
      : (matchedUser.email || lower).toLowerCase();

    await this.checkAccountLockout(matchedLockKey, matchedUser);

    if (!matchedUser.isActive) {
      throw new UnauthorizedException(
        'This account has been deactivated. Please contact your company administrator.',
      );
    }
    if (matchedUser.tenant && matchedUser.tenant.status !== 'active') {
      throw new UnauthorizedException(
        `Your company account (${matchedUser.tenant.name || matchedUser.tenant.code}) is ${matchedUser.tenant.status}. Please contact platform support.`,
      );
    }

    await this.resetFailedAttempts(matchedLockKey, matchedUser.id);
    return this._buildLoginResponse(matchedUser, ipAddress, loginDto.password);
  }

  // ─── POST /auth/login/select-company ────────────────────────────────────────

  async selectCompany(dto: SelectCompanyDto, ipAddress?: string) {
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
      throw new UnauthorizedException(
        'This account has been deactivated. Please contact your company administrator.',
      );
    }
    if (user.tenant && user.tenant.status !== 'active') {
      throw new UnauthorizedException(
        `Your company account (${user.tenant.name || user.tenant.code}) is ${user.tenant.status}.`,
      );
    }

    await this.resetFailedAttempts(lockKey, user.id);
    return this._buildLoginResponse(user, ipAddress);
  }

  // ─── POST /auth/platform-login ───────────────────────────────────────────────

  async platformLogin(dto: PlatformLoginDto, ipAddress?: string) {
    const lower = dto.email.trim().toLowerCase();

    // We do NOT reveal whether the account exists or which check failed
    const auditBase = {
      entityName: 'PlatformLogin',
      entityId: lower,
      ipAddress: ipAddress || '127.0.0.1',
    };

    // Rate-limit check: per-IP key AND per-email key
    const ipKey = `platform-ip:${ipAddress || 'unknown'}`;
    const emailKey = `platform-email:${lower}`;
    await this.checkAccountLockout(ipKey);
    await this.checkAccountLockout(emailKey);

    const user = await this.prisma.user.findFirst({
      include: {
        tenant: { select: { id: true, code: true, name: true, status: true } },
      },
      where: {
        OR: [
          { email: { equals: lower, mode: 'insensitive' } },
          { employeeCode: { equals: dto.email.trim().toUpperCase(), mode: 'insensitive' } },
        ],
        role: 'platform_super_admin',
        tenantId: null,
        deletedAt: null,
      },
    });

    if (!user || !user.passwordHash) {
      await this.recordFailedAttempt(ipKey, undefined, ipAddress);
      await this.recordFailedAttempt(emailKey, undefined, ipAddress);
      await this._auditPlatformLogin(false, null, lower, ipAddress);
      throw new UnauthorizedException(GENERIC_ERROR);
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      await this.recordFailedAttempt(ipKey, undefined, ipAddress);
      await this.recordFailedAttempt(emailKey, user, ipAddress);
      await this._auditPlatformLogin(false, user.id, lower, ipAddress);
      throw new UnauthorizedException(GENERIC_ERROR);
    }

    // Lockout checks against the user record itself
    await this.checkAccountLockout(emailKey, user);

    if (!user.isActive) {
      await this._auditPlatformLogin(false, user.id, lower, ipAddress);
      throw new UnauthorizedException(GENERIC_ERROR);
    }

    // Reset rate-limit counters on success
    await this.resetFailedAttempts(ipKey);
    await this.resetFailedAttempts(emailKey, user.id);
    await this._auditPlatformLogin(true, user.id, lower, ipAddress);

    return this._buildLoginResponse(user, ipAddress, dto.password);
  }

  // ─── POST /auth/forgot-password ─────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto, _ipAddress?: string) {
    // Always return success — do NOT reveal whether email exists
    const lower = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: { email: { equals: lower, mode: 'insensitive' }, deletedAt: null, isActive: true },
    });

    if (!user) {
      // Simulate some DB time to prevent timing oracle
      await this._addArtificialDelay();
      return { message: 'If that email exists, a reset link has been sent.' };
    }

    // Invalidate old tokens
    await this.prisma.passwordResetToken
      .updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      })
      .catch(() => {});

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    // TODO: integrate email provider. For now log to console in dev.
    const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://admin.jsnc.co.in' : 'http://localhost:5173');
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] Password reset link for ${lower}: ${resetUrl}`);
    }
    // When a real email provider is configured, send here.

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  // ─── POST /auth/reset-password ───────────────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto) {
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

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          mustResetPassword: false,
          tokenVersion: { increment: 1 },
          failedLoginAttempts: 0,
          lockoutUntil: null,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId: record.userId },
        data: { isRevoked: true },
      }),
    ]);

    // Clear any AccountLockout rows too
    const lockKey = record.user.tenantId
      ? `${record.user.email.toLowerCase()}:${record.user.tenantId}`
      : record.user.email.toLowerCase();
    await this.prisma.accountLockout.delete({ where: { identityKey: lockKey } }).catch(() => {});

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

  // ─── POST /auth/refresh ──────────────────────────────────────────────────────

  async refreshToken(rawRefreshToken: string, ipAddress?: string) {
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
    const newTokens = this.generateTokens(user, session.familyId);
    const newTokenHash = crypto.createHash('sha256').update(newTokens.refreshToken).digest('hex');
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

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
      user,
      redirectPath: this.getRedirectPath(user),
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
    };
  }

  // ─── Change password (authenticated) ────────────────────────────────────────

  async changePassword(userId: string, currentPass: string, newPass: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    validatePasswordPolicy(newPass, { email: user.email, name: user.name });

    const isMatch = await bcrypt.compare(currentPass, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Current password does not match');
    }

    const passwordHash = await bcrypt.hash(newPass, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustResetPassword: false, tokenVersion: { increment: 1 } },
    });

    await this.prisma.refreshSession.updateMany({
      where: { userId },
      data: { isRevoked: true },
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

    return { message: 'Password updated successfully' };
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

  private async _buildLoginResponse(user: any, ipAddress?: string, rawPasswordToRehash?: string) {
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

    const tokens = this.generateTokens(resolvedUser);
    const tokenHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

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

    await this.prisma.auditLog
      .create({
        data: {
          tenantId: resolvedUser.tenantId || 'default-tenant-id',
          actorId: resolvedUser.id,
          actorName: resolvedUser.name,
          action: 'LOGIN',
          entityName: 'User',
          entityId: resolvedUser.id,
          afterState: JSON.stringify({
            email: resolvedUser.email,
            role: resolvedUser.role,
            tenant: resolvedUser.tenant?.code,
          }),
          ipAddress: ipAddress || '127.0.0.1',
        },
      })
      .catch(() => {});

    return {
      user: resolvedUser,
      redirectPath: this.getRedirectPath(resolvedUser),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  private async _auditPlatformLogin(
    success: boolean,
    userId: string | null,
    email: string,
    ipAddress?: string,
  ) {
    await this.prisma.auditLog
      .create({
        data: {
          tenantId: 'default-tenant-id',
          actorId: userId,
          actorName: email,
          action: success ? 'PLATFORM_LOGIN' : 'PLATFORM_LOGIN_FAILED',
          entityName: 'PlatformAuth',
          entityId: email,
          afterState: JSON.stringify({ success, email, ipAddress }),
          ipAddress: ipAddress || '127.0.0.1',
        },
      })
      .catch(() => {});
  }

  private generateTokens(user: any, familyId?: string) {
    const tenantId = user.tenantId ?? (user.tenant ? user.tenant.id : null);
    const resolvedFamilyId = familyId || crypto.randomUUID();
    const tokenId = crypto.randomUUID();

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
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: '15m',
      algorithm: 'HS256',
      issuer: 'jnc-crm-api',
      audience: 'jnc-crm-client',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
      algorithm: 'HS256',
      issuer: 'jnc-crm-api',
      audience: 'jnc-crm-client',
    });

    return { accessToken, refreshToken, familyId: resolvedFamilyId };
  }

  /** Adds ~200–400 ms of artificial delay to make timing attacks harder */
  private _addArtificialDelay() {
    return new Promise((r) => setTimeout(r, 200 + Math.random() * 200));
  }
}
