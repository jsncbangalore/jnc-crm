/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopedUser } from '../auth/scoping.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

export interface CreateUserDto {
  name: string;
  email: string;
  phone: string;
  role: 'platform_super_admin' | 'tenant_admin' | 'admin' | 'sub_admin' | 'employee' | 'store_manager' | 'project_manager' | 'developer_lead' | 'developer';
  teamId?: string;
  warehouseId?: string;
}

export interface UpdateUserDto {
  name?: string;
  phone?: string;
  role?: 'platform_super_admin' | 'tenant_admin' | 'admin' | 'sub_admin' | 'employee' | 'store_manager' | 'project_manager' | 'developer_lead' | 'developer';
  teamId?: string;
  warehouseId?: string;
  isActive?: boolean;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private auditService: AuditService,
  ) {}

  async generateEmployeeCode(tenantId: string | null, role: string): Promise<string> {
    if (role === 'platform_super_admin') {
      const count = await this.prisma.user.count({
        where: { role: 'platform_super_admin' },
      });
      const sequence = String(count + 1).padStart(3, '0');
      return `PSA-${sequence}`;
    }

    const tenant = tenantId
      ? await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { code: true },
        })
      : null;
    let orgPrefix = tenant?.code || 'JNC-ORG';
    if (orgPrefix === 'JNC-ORG-001' || orgPrefix === 'default-tenant-id' || orgPrefix === 'JNC') {
      orgPrefix = 'JNC-ORG';
    } else if (!orgPrefix.startsWith('JNC-')) {
      orgPrefix = `JNC-${orgPrefix}`;
    }

    const prefixMap: Record<string, string> = {
      super_admin: `${orgPrefix}-SA`,
      tenant_admin: `${orgPrefix}-AD`,
      admin: `${orgPrefix}-AD`,
      sub_admin: `${orgPrefix}-SUB`,
      employee: `${orgPrefix}-EMP`,
      store_manager: `${orgPrefix}-STM`,
      project_manager: `${orgPrefix}-PM`,
      developer_lead: `${orgPrefix}-LEAD`,
      developer: `${orgPrefix}-DEV`,
    };

    const prefix = prefixMap[role] || `${orgPrefix}-EMP`;
    const count = await this.prisma.user.count({
      where: {
        tenantId,
        employeeCode: { startsWith: prefix },
      },
    });

    const sequence = String(count + 1).padStart(3, '0');
    return `${prefix}-${sequence}`;
  }

  generateTempPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pass = 'Org#';
    for (let i = 0; i < 6; i++) {
      const idx = crypto.randomInt(0, chars.length);
      pass += chars[idx];
    }
    return pass;
  }

  async createUser(dto: CreateUserDto, creator: ScopedUser) {
    if (dto.role === 'platform_super_admin') {
      if (creator.role !== 'platform_super_admin') {
        throw new ForbiddenException('Only Platform Super Admins can create platform administrators.');
      }
      const emailClean = dto.email.trim().toLowerCase();
      const existing = await this.prisma.user.findFirst({
        where: { email: emailClean, deletedAt: null },
      });
      if (existing) {
        throw new BadRequestException(`A user with email "${dto.email}" already exists.`);
      }

      const employeeCode = await this.generateEmployeeCode(null, 'platform_super_admin');
      const tempPassword = this.generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      const newUser = await this.prisma.user.create({
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

      return {
        user: newUser,
        tempPassword,
        message: 'Platform administrator account created successfully.',
      };
    }

    const tenantId = creator.tenantId || 'default-tenant-id';

    if (creator.role !== 'platform_super_admin' && creator.role !== 'super_admin' && creator.role !== 'tenant_admin' && creator.role !== 'admin') {
      throw new ForbiddenException('Only Administrators can create company users.');
    }

    // License user limit check
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { maxUsers: true, name: true, code: true },
    });
    const currentUsersCount = await this.prisma.user.count({
      where: { tenantId, deletedAt: null },
    });

    if (tenant && currentUsersCount >= tenant.maxUsers) {
      throw new BadRequestException(`Company user license limit reached (${tenant.maxUsers} users). Upgrade plan to add more members.`);
    }

    const emailClean = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email: emailClean },
    });
    if (existing) {
      throw new BadRequestException(`A user with email "${dto.email}" already exists in this company.`);
    }

    const employeeCode = await this.generateEmployeeCode(tenantId, dto.role);
    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const newUser = await this.prisma.user.create({
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
    if (creator.role !== 'platform_super_admin' && creator.role !== 'super_admin' && creator.role !== 'tenant_admin' && creator.role !== 'admin') {
      throw new ForbiddenException('Access denied: User management is restricted to Administrators.');
    }

    const isPlatformOwner = creator.role === 'platform_super_admin';
    const where: any = { deletedAt: null };

    if (!isPlatformOwner) {
      where.tenantId = creator.tenantId || 'default-tenant-id';
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
    const where: any =
      creator.role === 'platform_super_admin'
        ? { id, deletedAt: null }
        : { id, tenantId: creator.tenantId || 'default-tenant-id', deletedAt: null };

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

    if (!user) throw new NotFoundException('User not found in your company');
    return user;
  }

  async updateUser(id: string, dto: UpdateUserDto, modifier: ScopedUser) {
    if (modifier.role !== 'platform_super_admin' && modifier.role !== 'super_admin' && modifier.role !== 'tenant_admin' && modifier.role !== 'admin') {
      throw new ForbiddenException('Only Administrators can edit users.');
    }

    const where: any =
      modifier.role === 'platform_super_admin'
        ? { id, deletedAt: null }
        : { id, tenantId: modifier.tenantId || 'default-tenant-id', deletedAt: null };

    const user = await this.prisma.user.findFirst({ where });
    if (!user) throw new NotFoundException('User not found in your company');

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        phone: dto.phone?.trim(),
        role: dto.role,
        teamId: dto.teamId !== undefined ? dto.teamId : undefined,
        warehouseId: dto.warehouseId !== undefined ? dto.warehouseId : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
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

    return updated;
  }

  async resetCredentials(id: string, modifier: ScopedUser) {
    const where: any =
      modifier.role === 'platform_super_admin'
        ? { id, deletedAt: null }
        : { id, tenantId: modifier.tenantId || 'default-tenant-id', deletedAt: null };

    const user = await this.prisma.user.findFirst({ where });
    if (!user) throw new NotFoundException('User not found in your company');

    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustResetPassword: true,
        failedLoginAttempts: 0,
        lockoutUntil: null,
      },
    });

    return {
      message: `Password reset successfully for ${user.name}`,
      tempPassword,
    };
  }

  async toggleActive(id: string, modifier: ScopedUser) {
    const where: any =
      modifier.role === 'platform_super_admin'
        ? { id, deletedAt: null }
        : { id, tenantId: modifier.tenantId || 'default-tenant-id', deletedAt: null };

    const user = await this.prisma.user.findFirst({ where });
    if (!user) throw new NotFoundException('User not found in your company');

    if (user.id === modifier.id) {
      throw new BadRequestException('You cannot deactivate your own account.');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive },
    });

    return { id: updated.id, isActive: updated.isActive };
  }

  async deleteUser(id: string, modifier: ScopedUser) {
    const where: any =
      modifier.role === 'platform_super_admin'
        ? { id, deletedAt: null }
        : { id, tenantId: modifier.tenantId || 'default-tenant-id', deletedAt: null };

    const user = await this.prisma.user.findFirst({ where });
    if (!user) throw new NotFoundException('User not found in your company');

    if (user.id === modifier.id) {
      throw new BadRequestException('You cannot delete your own account.');
    }

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    return { message: `User ${user.name} removed successfully.` };
  }
}
