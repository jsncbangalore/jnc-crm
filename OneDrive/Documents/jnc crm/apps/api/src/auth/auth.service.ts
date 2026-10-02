/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RefreshTokenDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private async checkAccountLockout(lockKey: string, user?: any) {
    const now = new Date();

    if (user && user.lockoutUntil) {
      if (new Date(user.lockoutUntil) > now) {
        const remainingMinutes = Math.ceil((new Date(user.lockoutUntil).getTime() - now.getTime()) / 60000);
        throw new UnauthorizedException(
          `Account is temporarily locked due to 5 consecutive failed login attempts. Please try again in ${remainingMinutes} minute(s) or contact administrator.`
        );
      } else {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockoutUntil: null },
        });
      }
    }

    const lockoutRecord = await this.prisma.accountLockout.findUnique({
      where: { identityKey: lockKey },
    });

    if (lockoutRecord && lockoutRecord.lockedUntil) {
      if (new Date(lockoutRecord.lockedUntil) > now) {
        const remainingMinutes = Math.ceil((new Date(lockoutRecord.lockedUntil).getTime() - now.getTime()) / 60000);
        throw new UnauthorizedException(
          `Account is temporarily locked due to 5 consecutive failed login attempts. Please try again in ${remainingMinutes} minute(s) or contact administrator.`
        );
      } else {
        try {
          await this.prisma.accountLockout.delete({
            where: { identityKey: lockKey },
          });
        } catch (e) {}
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
        data: {
          failedLoginAttempts: currentAttempts,
          lockoutUntil: lockedUntil,
        },
      });

      if (isLocked) {
        try {
          await this.prisma.auditLog.create({
            data: {
              tenantId: user.tenantId || 'default-tenant-id',
              actorId: user.id,
              actorName: user.name || lockKey,
              action: 'LOGIN_LOCKOUT',
              entityName: 'User',
              entityId: user.id,
              afterState: JSON.stringify({
                reason: 'Account locked for 15 minutes after 5 consecutive failed login attempts',
                consecutiveFailedAttempts: currentAttempts,
                lockExpiresAt: lockedUntil?.toISOString(),
              }),
              ipAddress: ipAddress || '127.0.0.1',
            },
          });
        } catch (e) {}

        throw new UnauthorizedException(
          'Account locked: 5 consecutive failed login attempts exceeded. This account has been locked for 15 minutes.'
        );
      }
    } else {
      const record = await this.prisma.accountLockout.upsert({
        where: { identityKey: lockKey },
        create: {
          identityKey: lockKey,
          failedAttempts: 1,
          lastAttemptAt: now,
        },
        update: {
          failedAttempts: { increment: 1 },
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

        throw new UnauthorizedException(
          'Account locked: 5 consecutive failed login attempts exceeded. This account has been locked for 15 minutes.'
        );
      }
    }
  }

  private async resetFailedAttempts(lockKey: string, userId?: string) {
    if (userId) {
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { failedLoginAttempts: 0, lockoutUntil: null },
        });
      } catch (e) {}
    }
    try {
      await this.prisma.accountLockout.delete({
        where: { identityKey: lockKey },
      });
    } catch (e) {}
  }

  async validateUser(username: string, pass: string, companyCode?: string, ipAddress?: string): Promise<any> {
    const raw = (username || '').trim();
    const lower = raw.toLowerCase();
    const upper = raw.toUpperCase();

    await this.checkAccountLockout(lower);

    // Strict Tenant constraint if company code or subdomain is provided
    let tenantFilter: any = {};
    if (companyCode && companyCode.trim()) {
      const cleanCompanyCode = companyCode.trim();
      const tenant = await this.prisma.tenant.findFirst({
        where: {
          deletedAt: null,
          OR: [
            { code: { equals: cleanCompanyCode.toUpperCase(), mode: 'insensitive' } },
            { slug: { equals: cleanCompanyCode.toLowerCase(), mode: 'insensitive' } },
            { id: { equals: cleanCompanyCode } },
          ],
        },
      });
      if (!tenant) {
        throw new UnauthorizedException(`Company code '${companyCode}' not found or inactive.`);
      }
      tenantFilter = { tenantId: tenant.id };
    }

    // Strict candidates matching exact email or exact employee code
    const candidates = await this.prisma.user.findMany({
      include: {
        teamRef: { select: { id: true, name: true, allowedPages: true } },
        tenant: { select: { id: true, code: true, name: true, slug: true, status: true, logoUrl: true, currency: true } },
      },
      where: {
        ...tenantFilter,
        OR: [
          { email: { equals: lower, mode: 'insensitive' } },
          { employeeCode: { equals: upper, mode: 'insensitive' } },
        ],
        deletedAt: null,
      },
      orderBy: [
        { createdAt: 'desc' },
      ],
    });

    if (candidates.length === 0) {
      await this.recordFailedAttempt(lower, undefined, ipAddress);
      throw new UnauthorizedException('Invalid credentials. User not found.');
    }

    // Iterate through matching candidates to find the one whose password matches
    let matchedUser: any = null;
    for (const candidate of candidates) {
      if (candidate.passwordHash) {
        const isHashMatch = await bcrypt.compare(pass, candidate.passwordHash);
        if (isHashMatch) {
          matchedUser = candidate;
          break;
        }
      }
    }

    if (!matchedUser) {
      const lockKey = candidates[0].email ? candidates[0].email.toLowerCase() : lower;
      await this.recordFailedAttempt(lockKey, candidates[0], ipAddress);
      throw new UnauthorizedException('Invalid credentials. Incorrect password.');
    }

    const lockKey = matchedUser.email ? matchedUser.email.toLowerCase() : lower;
    await this.checkAccountLockout(lockKey, matchedUser);

    if (!matchedUser.isActive) {
      throw new UnauthorizedException('This account has been deactivated. Please contact your company administrator.');
    }

    if (
      matchedUser.tenant &&
      matchedUser.tenant.status !== 'active' &&
      matchedUser.role !== 'platform_super_admin'
    ) {
      throw new UnauthorizedException(`Your company account (${matchedUser.tenant.name || matchedUser.tenant.code}) is ${matchedUser.tenant.status}. Please contact platform support.`);
    }

    await this.resetFailedAttempts(lockKey, matchedUser.id);

    const { passwordHash, ...result } = matchedUser;
    const resolvedTenantId = result.tenantId || (result.tenant ? result.tenant.id : 'default-tenant-id');
    return {
      ...result,
      tenantId: resolvedTenantId,
    };
  }

  async login(loginDto: LoginDto, ipAddress?: string) {
    const user = await this.validateUser(loginDto.username, loginDto.password, loginDto.companyCode, ipAddress);
    const tokens = this.generateTokens(user);

    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    } catch (e) {}

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: user.tenantId || 'default-tenant-id',
          actorId: user.id,
          actorName: user.name,
          action: 'LOGIN',
          entityName: 'User',
          entityId: user.id,
          afterState: JSON.stringify({ email: user.email, role: user.role, tenant: user.tenant?.code }),
          ipAddress: ipAddress || '127.0.0.1',
        },
      });
    } catch (e) {}

    return {
      user,
      ...tokens,
    };
  }

  async changePassword(userId: string, currentPass: string, newPass: string) {
    if (!newPass || newPass.length < 6) {
      throw new BadRequestException('New password must be at least 6 characters long');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isMatch = await bcrypt.compare(currentPass, user.passwordHash);

    if (!isMatch) {
      throw new UnauthorizedException('Current password does not match');
    }

    const passwordHash = await bcrypt.hash(newPass, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustResetPassword: false },
    });

    return { message: 'Password updated successfully' };
  }

  async refreshToken(dto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify(dto.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
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
          tenant: { select: { id: true, code: true, name: true, slug: true, status: true, logoUrl: true, currency: true } },
        },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return {
        user,
        ...this.generateTokens(user),
      };
    } catch (e) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private generateTokens(user: any) {
    const payload = {
      sub: user.id,
      tenantId: user.tenantId || (user.tenant ? user.tenant.id : 'default-tenant-id'),
      email: user.email,
      role: user.role,
      employeeCode: user.employeeCode,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRATION || '1d',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d',
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async updateProfile(userId: string, data: { name?: string; phone?: string }) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name?.trim(),
        phone: data.phone?.trim(),
      },
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

    return updated;
  }
}
