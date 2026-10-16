/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopedUser } from '../auth/scoping.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { requireTenantId } from '../common/tenant.util';
import { parsePagination } from '../common/pagination.util';
import { ROLE_RANKS, isPlatformOwner, ALL_ROLES, UserRole } from '../auth/roles';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

export { CreateUserDto, UpdateUserDto };

export function generateSecurePassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%^&*';
  const all = upper + lower + digits + special;

  let pass = '';
  pass += upper[crypto.randomInt(0, upper.length)];
  pass += lower[crypto.randomInt(0, lower.length)];
  pass += digits[crypto.randomInt(0, digits.length)];
  pass += special[crypto.randomInt(0, special.length)];

  for (let i = pass.length; i < length; i++) {
    pass += all[crypto.randomInt(0, all.length)];
  }

  const arr = pass.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

const ROLE_CODE_MAP: Record<string, string> = {
  platform_super_admin: 'PSA',
  tenant_admin: 'TAD',
  admin: 'ADM',
  sub_admin: 'SUB',
  project_manager: 'PM',
  developer_lead: 'LEAD',
  store_manager: 'STM',
  finance: 'FIN',
  accountant: 'ACC',
  employee: 'EMP',
  developer: 'DEV',
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private auditService: AuditService,
  ) {}

  generateTempPassword(): string {
    return generateSecurePassword(14);
  }

  async generateEmployeeCode(tenantId: string | null, role: string, tx?: any): Promise<string> {
    const db = tx || this.prisma;
    if (role === 'platform_super_admin') {
      const users = await db.user.findMany({
        where: { role: 'platform_super_admin' },
        select: { employeeCode: true },
      });
      let maxSeq = 0;
      for (const u of users) {
        const match = u.employeeCode.match(/PSA-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeq) maxSeq = num;
        }
      }
      return `PSA-${String(maxSeq + 1).padStart(3, '0')}`;
    }

    const tenant = tenantId
      ? await db.tenant.findUnique({
          where: { id: tenantId },
          select: { code: true },
        })
      : null;

    const rawCode = (tenant?.code || 'DEFAULT').toUpperCase();
    const cleanTenantCode = rawCode.startsWith('JNC-') ? rawCode.replace('JNC-', '') : rawCode;
    const roleCode = ROLE_CODE_MAP[role] || 'EMP';
    const standardPrefix = `JNC-${cleanTenantCode}-${roleCode}`;
    const legacyPrefix = `${cleanTenantCode}-${roleCode}`;

    const users = await db.user.findMany({
      where: {
        tenantId,
        OR: [
          { employeeCode: { startsWith: standardPrefix } },
          { employeeCode: { startsWith: legacyPrefix } },
        ],
      },
      select: { employeeCode: true },
    });

    let maxSeq = 0;
    for (const u of users) {
      const match = u.employeeCode.match(new RegExp(`(?:${standardPrefix}|${legacyPrefix})-(\\d+)$`));
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
    }

    return `${standardPrefix}-${String(maxSeq + 1).padStart(3, '0')}`;
  }

  async createUser(dto: CreateUserDto, creator: ScopedUser) {
    const emailClean = dto.email.trim().toLowerCase();
    const isPlatform = isPlatformOwner(creator);

    // Platform Super Admin Creation
    if (dto.role === 'platform_super_admin') {
      if (!isPlatform) {
        throw new ForbiddenException('Only Platform Super Admins can create platform administrators.');
      }
      const existing = await this.prisma.user.findFirst({
        where: { email: emailClean, deletedAt: null },
      });
      if (existing) {
        throw new BadRequestException(`A user with email "${emailClean}" already exists.`);
      }

      const tempPassword = generateSecurePassword(14);
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      let newUser: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const employeeCode = await this.generateEmployeeCode(null, 'platform_super_admin');
          newUser = await this.prisma.user.create({
            data: {
              tenantId: null,
              employeeCode,
              name: dto.name.trim(),
              email: emailClean,
              phone: dto.phone?.trim() || null,
              passwordHash,
              role: 'platform_super_admin',
              isActive: true,
              mustResetPassword: true,
              createdById: creator.id,
            },
            select: {
              id: true,
              tenantId: true,
              employeeCode: true,
              name: true,
              email: true,
              phone: true,
              role: true,
              isActive: true,
              mustResetPassword: true,
              lastLoginAt: true,
              createdAt: true,
            },
          });
          break;
        } catch (err: any) {
          if (err.code === 'P2002' && attempt < 4) continue;
          throw err;
        }
      }

      return {
        user: newUser,
        tempPassword,
        message: 'Platform administrator account created successfully.',
      };
    }

    // Role Hierarchy Check
    const creatorRank = ROLE_RANKS[creator.role] || 0;
    const targetRank = ROLE_RANKS[dto.role] || 0;
    if (targetRank >= creatorRank && !isPlatform) {
      throw new ForbiddenException(
        `You cannot create a user with role "${dto.role}". Your role must be strictly higher in rank.`,
      );
    }

    // Only platform_super_admin can create tenant_admin
    if (dto.role === 'tenant_admin' && !isPlatform) {
      throw new ForbiddenException('Only Platform Super Admins can create Company Administrators (Tenant Admins).');
    }

    const tenantId = requireTenantId(creator);

    // License user limit check
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { maxUsers: true, name: true, code: true },
    });
    const currentUsersCount = await this.prisma.user.count({
      where: { tenantId, deletedAt: null },
    });

    if (tenant && currentUsersCount >= tenant.maxUsers) {
      throw new BadRequestException(
        `Company user license limit reached (${tenant.maxUsers} users). Upgrade plan to add more members.`,
      );
    }

    // Email uniqueness within tenant
    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email: emailClean, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException(`A user with email "${emailClean}" already exists in this company.`);
    }

    // Verify teamId and warehouseId belong to same tenant
    if (dto.teamId) {
      const team = await this.prisma.team.findFirst({
        where: { id: dto.teamId, tenantId },
      });
      if (!team) {
        throw new BadRequestException('The selected team does not exist or does not belong to your organization.');
      }
    }

    if (dto.warehouseId) {
      const wh = await this.prisma.warehouse.findFirst({
        where: { id: dto.warehouseId, tenantId, deletedAt: null },
      });
      if (!wh) {
        throw new BadRequestException('The selected warehouse does not exist or does not belong to your organization.');
      }
    }

    const tempPassword = generateSecurePassword(14);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    let newUser: any = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const employeeCode = await this.generateEmployeeCode(tenantId, dto.role);
        newUser = await this.prisma.user.create({
          data: {
            tenantId,
            employeeCode,
            name: dto.name.trim(),
            email: emailClean,
            phone: dto.phone?.trim() || null,
            passwordHash,
            role: dto.role,
            teamId: dto.teamId || null,
            warehouseId: dto.warehouseId || null,
            isActive: true,
            mustResetPassword: true,
            createdById: creator.id,
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
            mustResetPassword: true,
            lastLoginAt: true,
            createdAt: true,
          },
        });
        break;
      } catch (err: any) {
        if (err.code === 'P2002' && attempt < 4) continue;
        throw err;
      }
    }

    let emailSent = false;
    let emailError: string | undefined = undefined;
    let mailInfo: { status: string; reason: string | null; provider: string } = {
      status: 'failed',
      reason: null,
      provider: this.notificationsService.getMailProvider(),
    };

    try {
      const branding = await this.notificationsService.getBranding(tenantId);
      const mailRes = await this.notificationsService.sendEmail({
        tenantId,
        to: newUser.email,
        subject: `Welcome to ${branding.companyDisplayName} - Your Login Credentials [${newUser.employeeCode}]`,
        html: `
          <h3>Welcome to ${branding.companyDisplayName}</h3>
          <p>Dear ${newUser.name},</p>
          <p>Your company workspace account has been created.</p>
          <p><strong>Login Details:</strong></p>
          <ul>
            <li><strong>Company Code:</strong> <code>${tenant?.code || 'JNC'}</code></li>
            <li><strong>Username / Employee Code:</strong> <code>${newUser.employeeCode}</code></li>
            <li><strong>Temporary Password:</strong> <code>${tempPassword}</code></li>
          </ul>
          <p><em>Note: You will be prompted to set your password upon first login.</em></p>
        `,
        relatedEntityType: 'user',
        relatedEntityId: newUser.id,
        purpose: 'user_invite',
        throwOnError: false,
      });
      mailInfo = {
        status: mailRes.status,
        reason: mailRes.reason,
        provider: mailRes.provider,
      };
      emailSent = mailRes.status === 'sent';
      if (!emailSent) {
        emailError = mailRes.error || `Email delivery failed (${mailRes.reason || mailRes.status})`;
      }
    } catch (emailErr: any) {
      emailError = emailErr.message || 'Email delivery failed';
      mailInfo.status = 'failed';
      mailInfo.reason = emailErr.message || 'unexpected_error';
      this.logger.warn(`Could not dispatch welcome email for ${newUser.employeeCode}: ${emailError}`);
    }

    await this.auditService.log({
      tenantId,
      actorId: creator.id,
      actorName: creator.employeeCode,
      action: 'CREATE',
      entityName: 'User',
      entityId: newUser.id,
      afterState: { employeeCode: newUser.employeeCode, email: newUser.email, role: newUser.role },
    });

    return {
      user: newUser,
      tempPassword,
      emailSent,
      emailError,
      mail: {
        status: emailSent ? 'sent' : (mailInfo.status || 'failed'),
        reason: mailInfo.reason,
        provider: mailInfo.provider,
      },
      message: emailSent
        ? `User ${newUser.name} [${newUser.employeeCode}] created successfully. Credentials emailed to ${newUser.email}.`
        : `User ${newUser.name} [${newUser.employeeCode}] created, but email delivery failed (${emailError}). Please copy the temporary password below manually.`,
    };
  }

  async findAll(creator: ScopedUser, query?: { search?: string; role?: string; isActive?: string; tenantId?: string; page?: number; limit?: number }) {
    const isPlatform = isPlatformOwner(creator);
    const where: any = { deletedAt: null };

    if (!isPlatform) {
      where.tenantId = requireTenantId(creator);
    } else {
      if (query?.tenantId) {
        where.tenantId = query.tenantId;
      }
      if (query?.role === 'platform_super_admin') {
        where.role = 'platform_super_admin';
      }
    }

    if (query?.search) {
      where.AND = [
        {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
            { employeeCode: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    if (query?.role) {
      where.role = query.role;
    }

    if (query?.isActive !== undefined && query?.isActive !== '') {
      where.isActive = query.isActive === 'true';
    }

    const { page, limit, skip, take } = parsePagination(query, 50, 100);

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'asc' },
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
          mustResetPassword: true,
          lastLoginAt: true,
          createdAt: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              employeeCode: true,
            },
          },
          tenant: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string, creator: ScopedUser) {
    const isPlatform = isPlatformOwner(creator);
    const where: any = isPlatform
      ? { id, deletedAt: null }
      : { id, tenantId: requireTenantId(creator), deletedAt: null };

    const user = await this.prisma.user.findFirst({
      where,
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
        mustResetPassword: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateUser(id: string, dto: UpdateUserDto, modifier: ScopedUser) {
    const isPlatform = isPlatformOwner(modifier);
    const where: any = isPlatform
      ? { id, deletedAt: null }
      : { id, tenantId: requireTenantId(modifier), deletedAt: null };

    const user = await this.prisma.user.findFirst({ where });
    if (!user) throw new NotFoundException('User not found');

    // Rule: Nobody can change their own role
    if (user.id === modifier.id && dto.role && dto.role !== modifier.role) {
      throw new BadRequestException('You cannot change your own role.');
    }

    // Rule: Rank check for modifying users
    if (!isPlatform && user.id !== modifier.id) {
      const modifierRank = ROLE_RANKS[modifier.role] || 0;
      const targetRank = ROLE_RANKS[user.role] || 0;
      if (modifier.role !== 'tenant_admin') {
        if (targetRank >= modifierRank) {
          throw new ForbiddenException('You cannot modify a user with an equal or higher role rank.');
        }
      } else {
        if (targetRank > modifierRank || user.role === 'platform_super_admin') {
          throw new ForbiddenException('You cannot modify a platform administrator.');
        }
      }
    }

    // Role assignment hierarchy check
    if (dto.role && dto.role !== user.role) {
      const newRank = ROLE_RANKS[dto.role] || 0;
      const modifierRank = ROLE_RANKS[modifier.role] || 0;
      if (newRank >= modifierRank && !isPlatform) {
        throw new ForbiddenException(`You do not have permission to assign role "${dto.role}".`);
      }
      if (dto.role === 'tenant_admin' && !isPlatform) {
        throw new ForbiddenException('Only Platform Super Admins can assign the Company Administrator role.');
      }
    }

    // Rule: The last active tenant_admin cannot be demoted, deactivated or deleted
    if (user.role === 'tenant_admin' && user.tenantId) {
      const isDemoting = dto.role && dto.role !== 'tenant_admin';
      const isDeactivating = dto.isActive === false && user.isActive;
      if (isDemoting || isDeactivating) {
        const activeAdminsCount = await this.prisma.user.count({
          where: { tenantId: user.tenantId, role: 'tenant_admin', isActive: true, deletedAt: null },
        });
        if (activeAdminsCount <= 1) {
          throw new BadRequestException('Cannot demote or deactivate the last active Company Administrator of this company.');
        }
      }
    }

    // Validate email if changed
    if (dto.email) {
      const cleanEmail = dto.email.trim().toLowerCase();
      if (cleanEmail !== user.email) {
        const duplicate = await this.prisma.user.findFirst({
          where: {
            tenantId: user.tenantId,
            email: cleanEmail,
            deletedAt: null,
            NOT: { id: user.id },
          },
        });
        if (duplicate) {
          throw new BadRequestException(`Email "${cleanEmail}" is already in use.`);
        }
      }
    }

    // Validate teamId and warehouseId
    const targetTenantId = user.tenantId;
    if (dto.teamId && targetTenantId) {
      const team = await this.prisma.team.findFirst({
        where: { id: dto.teamId, tenantId: targetTenantId },
      });
      if (!team) {
        throw new BadRequestException('The selected team does not belong to this organization.');
      }
    }

    if (dto.warehouseId && targetTenantId) {
      const wh = await this.prisma.warehouse.findFirst({
        where: { id: dto.warehouseId, tenantId: targetTenantId, deletedAt: null },
      });
      if (!wh) {
        throw new BadRequestException('The selected warehouse does not belong to this organization.');
      }
    }

    // Invalidate sessions if deactivated
    const deactivating = dto.isActive === false && user.isActive;

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        email: dto.email ? dto.email.trim().toLowerCase() : undefined,
        phone: dto.phone?.trim(),
        role: dto.role,
        teamId: dto.teamId !== undefined ? dto.teamId : undefined,
        warehouseId: dto.warehouseId !== undefined ? dto.warehouseId : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
        tokenVersion: deactivating ? { increment: 1 } : undefined,
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
        mustResetPassword: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    await this.auditService.log({
      tenantId: user.tenantId || requireTenantId(modifier),
      actorId: modifier.id,
      actorName: modifier.employeeCode,
      action: 'UPDATE',
      entityName: 'User',
      entityId: user.id,
      afterState: dto,
    });

    return updated;
  }

  async resetCredentials(id: string, modifier: ScopedUser) {
    const isPlatform = isPlatformOwner(modifier);
    const where: any = isPlatform
      ? { id, deletedAt: null }
      : { id, tenantId: requireTenantId(modifier), deletedAt: null };

    const user = await this.prisma.user.findFirst({ where });
    if (!user) throw new NotFoundException('User not found');

    // Hierarchy check
    if (!isPlatform && user.id !== modifier.id) {
      const modifierRank = ROLE_RANKS[modifier.role] || 0;
      const targetRank = ROLE_RANKS[user.role] || 0;
      if (modifier.role !== 'tenant_admin') {
        if (targetRank >= modifierRank) {
          throw new ForbiddenException('You cannot reset credentials for a user with an equal or higher role rank.');
        }
      } else {
        if (targetRank > modifierRank || user.role === 'platform_super_admin') {
          throw new ForbiddenException('You cannot reset credentials for a platform administrator.');
        }
      }
    }

    const tempPassword = generateSecurePassword(14);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustResetPassword: true,
        failedLoginAttempts: 0,
        lockoutUntil: null,
        tokenVersion: { increment: 1 },
      },
    });

    // Clear AccountLockout rows
    const lockKeys: string[] = [user.email.toLowerCase(), user.employeeCode];
    if (user.tenantId) {
      lockKeys.push(`${user.email.toLowerCase()}:${user.tenantId}`);
      lockKeys.push(`${user.employeeCode}:${user.tenantId}`);
    }
    await this.prisma.accountLockout.deleteMany({
      where: { identityKey: { in: lockKeys } },
    });

    let emailSent = false;
    let emailError: string | undefined = undefined;
    let mailInfo: { status: string; reason: string | null; provider: string } = {
      status: 'failed',
      reason: null,
      provider: this.notificationsService.getMailProvider(),
    };

    // Send credentials email
    try {
      const tenant = user.tenantId
        ? await this.prisma.tenant.findUnique({
            where: { id: user.tenantId },
            select: { name: true, code: true },
          })
        : null;

      const branding = await this.notificationsService.getBranding(user.tenantId || undefined);
      const mailRes = await this.notificationsService.sendEmail({
        tenantId: user.tenantId || undefined,
        to: user.email,
        subject: `[${branding.companyDisplayName}] Your Credentials Have Been Reset`,
        html: `
          <h3>Credentials Reset</h3>
          <p>Hello ${user.name},</p>
          <p>Your password for ${branding.companyDisplayName} has been reset by an administrator.</p>
          <p><strong>Your Temporary Credentials:</strong></p>
          <ul>
            <li><strong>Company Code:</strong> <code>${tenant?.code || 'JNC'}</code></li>
            <li><strong>Employee Code:</strong> <code>${user.employeeCode}</code></li>
            <li><strong>New Temporary Password:</strong> <code>${tempPassword}</code></li>
          </ul>
          <p>You will be required to change your password immediately upon login.</p>
        `,
        relatedEntityType: 'user',
        relatedEntityId: user.id,
        purpose: 'password_reset',
        throwOnError: false,
      });
      mailInfo = {
        status: mailRes.status,
        reason: mailRes.reason,
        provider: mailRes.provider,
      };
      emailSent = mailRes.status === 'sent';
      if (!emailSent) {
        emailError = mailRes.error || `Email delivery failed (${mailRes.reason || mailRes.status})`;
      }
    } catch (err: any) {
      emailError = err.message || 'Email delivery failed';
      mailInfo.status = 'failed';
      mailInfo.reason = err.message || 'unexpected_error';
      this.logger.warn(`Could not send password reset email to ${user.email}: ${emailError}`);
    }

    await this.auditService.log({
      tenantId: user.tenantId || requireTenantId(modifier),
      actorId: modifier.id,
      actorName: modifier.employeeCode,
      action: 'RESET_PASSWORD',
      entityName: 'User',
      entityId: user.id,
      afterState: { email: user.email, employeeCode: user.employeeCode },
    });

    return {
      message: emailSent
        ? `Password reset successfully for ${user.name}. Credentials sent to ${user.email}.`
        : `Password reset successfully for ${user.name}, but email delivery failed (${emailError}). Please copy the temporary password below manually.`,
      tempPassword,
      emailSent,
      emailError,
      mail: {
        status: emailSent ? 'sent' : (mailInfo.status || 'failed'),
        reason: mailInfo.reason,
        provider: mailInfo.provider,
      },
    };
  }

  async toggleActive(id: string, modifier: ScopedUser) {
    const isPlatform = isPlatformOwner(modifier);
    const where: any = isPlatform
      ? { id, deletedAt: null }
      : { id, tenantId: requireTenantId(modifier), deletedAt: null };

    const user = await this.prisma.user.findFirst({ where });
    if (!user) throw new NotFoundException('User not found');

    if (user.id === modifier.id) {
      throw new BadRequestException('You cannot deactivate your own account.');
    }

    if (!isPlatform) {
      const modifierRank = ROLE_RANKS[modifier.role] || 0;
      const targetRank = ROLE_RANKS[user.role] || 0;
      if (modifier.role !== 'tenant_admin') {
        if (targetRank >= modifierRank) {
          throw new ForbiddenException('You cannot change status for a user with an equal or higher role rank.');
        }
      } else {
        if (targetRank > modifierRank || user.role === 'platform_super_admin') {
          throw new ForbiddenException('You cannot change status for a platform administrator.');
        }
      }
    }

    // Last active tenant_admin check
    if (user.role === 'tenant_admin' && user.isActive && user.tenantId) {
      const activeAdminsCount = await this.prisma.user.count({
        where: { tenantId: user.tenantId, role: 'tenant_admin', isActive: true, deletedAt: null },
      });
      if (activeAdminsCount <= 1) {
        throw new BadRequestException('Cannot deactivate the last active Company Administrator of this company.');
      }
    }

    const nextActive = !user.isActive;
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        isActive: nextActive,
        tokenVersion: nextActive ? undefined : { increment: 1 },
      },
    });

    await this.auditService.log({
      tenantId: user.tenantId || requireTenantId(modifier),
      actorId: modifier.id,
      actorName: modifier.employeeCode,
      action: nextActive ? 'ACTIVATE' : 'DEACTIVATE',
      entityName: 'User',
      entityId: user.id,
      afterState: { isActive: nextActive },
    });

    return { id: updated.id, isActive: updated.isActive };
  }

  async deleteUser(id: string, modifier: ScopedUser) {
    const isPlatform = isPlatformOwner(modifier);
    const where: any = isPlatform
      ? { id, deletedAt: null }
      : { id, tenantId: requireTenantId(modifier), deletedAt: null };

    const user = await this.prisma.user.findFirst({ where });
    if (!user) throw new NotFoundException('User not found');

    if (user.id === modifier.id) {
      throw new BadRequestException('You cannot delete your own account.');
    }

    if (!isPlatform) {
      const modifierRank = ROLE_RANKS[modifier.role] || 0;
      const targetRank = ROLE_RANKS[user.role] || 0;
      if (modifier.role !== 'tenant_admin') {
        if (targetRank >= modifierRank) {
          throw new ForbiddenException('You cannot delete a user with an equal or higher role rank.');
        }
      } else {
        if (targetRank > modifierRank || user.role === 'platform_super_admin') {
          throw new ForbiddenException('You cannot delete a platform administrator.');
        }
      }
    }

    // Last active tenant_admin check
    if (user.role === 'tenant_admin' && user.tenantId) {
      const activeAdminsCount = await this.prisma.user.count({
        where: { tenantId: user.tenantId, role: 'tenant_admin', isActive: true, deletedAt: null },
      });
      if (activeAdminsCount <= 1) {
        throw new BadRequestException('Cannot delete the last active Company Administrator of this company.');
      }
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        tokenVersion: { increment: 1 },
      },
    });

    await this.auditService.log({
      tenantId: user.tenantId || requireTenantId(modifier),
      actorId: modifier.id,
      actorName: modifier.employeeCode,
      action: 'DELETE',
      entityName: 'User',
      entityId: user.id,
      afterState: { deletedAt: new Date() },
    });

    return { message: `User ${user.name} removed successfully.` };
  }

  async previewImportUsers(records: any[], creator: ScopedUser) {
    const isPlatform = isPlatformOwner(creator);
    const tenantId = requireTenantId(creator);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, code: true, name: true, maxUsers: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const maxUsers = tenant.maxUsers ?? 50;
    const currentUsersCount = await this.prisma.user.count({
      where: { tenantId, deletedAt: null },
    });

    const existingUsers = await this.prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      select: { email: true, employeeCode: true },
    });
    const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));

    const creatorRank = ROLE_RANKS[creator.role] || 0;
    const valid: any[] = [];
    const errors: any[] = [];
    const seenBatchEmails = new Set<string>();

    const teams = await this.prisma.team.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });
    const teamMap = new Map(teams.map((t) => [t.name.toLowerCase().trim(), t.id]));

    let simulatedSeq = currentUsersCount + 1;

    for (let i = 0; i < (records || []).length; i++) {
      const row = records[i] || {};
      const rowNum = i + 1;
      const name = (row.name || row['Full Name'] || row['name'] || '').trim();
      const email = (row.email || row['Email Address'] || row['Email'] || row['email'] || '').trim().toLowerCase();
      const phone = (row.phone || row['Phone Number'] || row['Phone'] || row['phone'] || '').trim();
      const rawRole = (row.role || row['Role'] || row['role'] || 'employee').trim().toLowerCase();
      const teamName = (row.teamName || row['Team Name'] || row.team || '').trim();

      const rowErrors: string[] = [];
      if (!name) rowErrors.push('Full name is required');
      if (!email) {
        rowErrors.push('Email address is required');
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        rowErrors.push('Invalid email address format');
      } else if (existingEmails.has(email)) {
        rowErrors.push(`Email "${email}" already registered in this company`);
      } else if (seenBatchEmails.has(email)) {
        rowErrors.push(`Duplicate email "${email}" within import file`);
      }

      const validRoles = ['admin', 'sub_admin', 'employee', 'store_manager', 'project_manager'];
      let role = rawRole;
      if (!validRoles.includes(role)) {
        role = 'employee';
      }
      const targetRank = ROLE_RANKS[role] || 0;
      if (targetRank >= creatorRank && !isPlatform) {
        rowErrors.push(`Role "${role}" requires higher rank than creator`);
      }

      let teamId: string | null = null;
      if (teamName) {
        teamId = teamMap.get(teamName.toLowerCase()) || null;
      }

      if (rowErrors.length > 0) {
        errors.push({ row: rowNum, data: { name, email, phone, role, teamName }, errors: rowErrors });
      } else {
        seenBatchEmails.add(email);
        const roleShort = ROLE_CODE_MAP[role] || 'EMP';
        const rawCode = (tenant.code || 'DEFAULT').toUpperCase();
        const cleanTenant = rawCode.startsWith('JNC-') ? rawCode.replace('JNC-', '') : rawCode;
        const previewCode = `JNC-${cleanTenant}-${roleShort}-${String(simulatedSeq).padStart(3, '0')}`;
        simulatedSeq++;

        valid.push({
          row: rowNum,
          name,
          email,
          phone,
          role,
          teamId,
          teamName: teamName || null,
          previewCode,
        });
      }
    }

    const availableSlots = Math.max(0, maxUsers - currentUsersCount);
    const capacityExceeded = valid.length > availableSlots;

    return {
      totalRows: (records || []).length,
      validRows: valid.length,
      errorRows: errors.length,
      availableSlots,
      currentUsersCount,
      maxUsers,
      capacityExceeded,
      valid,
      errors,
    };
  }

  async commitImportUsers(records: any[], creator: ScopedUser) {
    const preview = await this.previewImportUsers(records, creator);
    if (preview.valid.length === 0) {
      throw new BadRequestException('No valid user records to import.');
    }
    if (preview.capacityExceeded) {
      throw new BadRequestException(
        `User license capacity exceeded (${preview.valid.length} users requested, ${preview.availableSlots} available). Upgrade plan to add more members.`,
      );
    }

    const tenantId = requireTenantId(creator);
    const createdUsers: any[] = [];

    for (const item of preview.valid) {
      const tempPassword = generateSecurePassword(14);
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const employeeCode = await this.generateEmployeeCode(tenantId, item.role);

      const user = await this.prisma.user.create({
        data: {
          tenantId,
          employeeCode,
          name: item.name,
          email: item.email,
          phone: item.phone || null,
          passwordHash,
          role: item.role,
          teamId: item.teamId || null,
          isActive: true,
          mustResetPassword: true,
          createdById: creator.id,
        },
        select: {
          id: true,
          employeeCode: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          mustResetPassword: true,
          createdAt: true,
        },
      });

      createdUsers.push({
        user,
        tempPassword,
      });

      await this.auditService.log({
        tenantId,
        actorId: creator.id,
        actorName: creator.employeeCode,
        action: 'IMPORT_USER',
        entityName: 'User',
        entityId: user.id,
        afterState: { employeeCode: user.employeeCode, email: user.email, role: user.role },
      });
    }

    return {
      success: true,
      count: createdUsers.length,
      users: createdUsers,
      message: `Successfully imported ${createdUsers.length} users. Temporary credentials generated.`,
    };
  }
}
