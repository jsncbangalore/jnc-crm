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
  tenant_admin: 'AD',
  admin: 'ADM',
  sub_admin: 'SUB',
  project_manager: 'PM',
  developer_lead: 'LEAD',
  store_manager: 'STM',
  finance: 'FIN',
  accountant: 'ACC',
  employee: 'EMP',
  developer: 'DEV',
  client: 'CLI',
  customer: 'CUST',
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

    const tenantCode = (tenant?.code || 'JNC').toUpperCase();
    const roleCode = ROLE_CODE_MAP[role] || 'EMP';
    const prefix = `${tenantCode}-${roleCode}`;

    const users = await db.user.findMany({
      where: {
        tenantId,
        employeeCode: { startsWith: prefix },
      },
      select: { employeeCode: true },
    });

    let maxSeq = 0;
    for (const u of users) {
      const match = u.employeeCode.match(new RegExp(`^${prefix}-(\\d+)$`));
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
    }

    return `${prefix}-${String(maxSeq + 1).padStart(3, '0')}`;
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

    try {
      const branding = await this.notificationsService.getBranding(tenantId);
      await this.notificationsService.sendEmail({
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
      });
    } catch (emailErr: any) {
      this.logger.warn(`Could not dispatch welcome email for ${newUser.employeeCode}: ${emailErr.message}`);
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
      message: `User ${newUser.name} [${newUser.employeeCode}] created successfully.`,
    };
  }

  async findAll(creator: ScopedUser, query?: { search?: string; role?: string; isActive?: string }) {
    const isPlatform = isPlatformOwner(creator);
    const where: any = { deletedAt: null };

    if (!isPlatform) {
      where.tenantId = requireTenantId(creator);
    } else {
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

    const items = await this.prisma.user.findMany({
      where,
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
      },
    });

    return { items, total: items.length };
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

    // Rule: Strictly lower rank check for modifying users
    if (!isPlatform && user.id !== modifier.id) {
      const modifierRank = ROLE_RANKS[modifier.role] || 0;
      const targetRank = ROLE_RANKS[user.role] || 0;
      if (targetRank >= modifierRank) {
        throw new ForbiddenException('You cannot modify a user with an equal or higher role rank.');
      }
    }

    // Role assignment hierarchy check
    if (dto.role) {
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
      if (targetRank >= modifierRank) {
        throw new ForbiddenException('You cannot reset credentials for a user with an equal or higher role rank.');
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

    // Send credentials email
    try {
      const tenant = user.tenantId
        ? await this.prisma.tenant.findUnique({
            where: { id: user.tenantId },
            select: { name: true, code: true },
          })
        : null;

      const branding = await this.notificationsService.getBranding(user.tenantId || undefined);
      await this.notificationsService.sendEmail({
        tenantId: user.tenantId || 'JNC',
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
      });
    } catch (err: any) {
      this.logger.warn(`Could not send password reset email to ${user.email}: ${err.message}`);
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
      message: `Password reset successfully for ${user.name}`,
      tempPassword,
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
      if (targetRank >= modifierRank) {
        throw new ForbiddenException('You cannot change status for a user with an equal or higher role rank.');
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
      if (targetRank >= modifierRank) {
        throw new ForbiddenException('You cannot delete a user with an equal or higher role rank.');
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
}
