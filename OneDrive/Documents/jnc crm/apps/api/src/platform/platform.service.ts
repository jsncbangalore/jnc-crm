/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { NotificationsService } from '../notifications/notifications.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { ResetTenantAdminPasswordDto } from './dto/platform-admin.dto';
import { validatePasswordPolicy } from '../common/password-policy';

export interface CreateTenantDto {
  code: string;            // e.g. "VERTEX", "ACME"
  name: string;            // e.g. "Vertex Solutions Pvt Ltd"
  slug?: string;           // e.g. "vertex"
  planTier?: string;       // "starter" | "professional" | "enterprise"
  maxUsers?: number;
  adminName: string;       // Primary Company Admin Name
  adminEmail: string;      // Primary Company Admin Email
  adminPhone?: string;
  adminPassword?: string;  // Initial temporary password
  address?: string;
  city?: string;
  state?: string;
  gstin?: string;
  sendEmail?: boolean;     // Whether to dispatch official credentials email immediately
  appUrl?: string;         // Direct login portal URL
}

export interface UpdateTenantDto {
  name?: string;
  status?: string;         // "active" | "suspended" | "expired"
  planTier?: string;
  maxUsers?: number;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  gstin?: string;
  lutBondNo?: string;
  lutValidity?: string;
  invoicePrefix?: string;
  logoUrl?: string;
}

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * List all client tenant organizations (Platform Super Admin only).
   * Excludes internal platform owner companies (isInternal = false).
   */
  async listTenants() {
    const tenants = await this.prisma.tenant.findMany({
      where: {
        deletedAt: null,
        isInternal: false,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            users: true,
            leads: true,
            orders: true,
            invoices: true,
            mailAccounts: true,
          },
        },
      },
    });

    return tenants.map((tenant) => ({
      ...tenant,
      isPlatformOwnerTenant: false,
    }));
  }

  /**
   * Get tenant detail by ID
   */
  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            employeeCode: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            lastLoginAt: true,
          },
        },
        mailAccounts: {
          select: {
            id: true,
            name: true,
            email: true,
            smtpHost: true,
            purpose: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            leads: true,
            orders: true,
            invoices: true,
            skus: true,
            projects: true,
          },
        },
      },
    });

    if (!tenant) throw new NotFoundException('Company tenant not found');
    if (tenant.isInternal) {
      throw new ForbiddenException('This is the platform owner company and cannot be managed here.');
    }
    return tenant;
  }

  /**
   * Provision a new Tenant Company + Primary Tenant Admin Account and dispatch credentials email
   */
  async createTenant(dto: CreateTenantDto) {
    const cleanCode = dto.code.trim().toUpperCase();
    if (cleanCode === 'JNC' || cleanCode === 'JNC-ORG-001') {
      throw new BadRequestException(`Cannot provision tenant with reserved internal code '${cleanCode}'`);
    }
    const cleanSlug = (dto.slug || cleanCode.toLowerCase()).trim().replace(/[^a-z0-9-]/gi, '-');

    // 1. Check uniqueness and reject internal codes
    const existing = await this.prisma.tenant.findFirst({
      where: {
        OR: [{ code: cleanCode }, { slug: cleanSlug }],
      },
    });

    if (existing) {
      if (existing.isInternal) {
        throw new BadRequestException(`Cannot use code '${cleanCode}' reserved for platform owner company`);
      }
      throw new ConflictException(`Company with code '${cleanCode}' or slug '${cleanSlug}' already exists`);
    }

    const adminEmail = dto.adminEmail.trim().toLowerCase();
    const existingUser = await this.prisma.user.findFirst({
      where: { email: adminEmail },
    });
    if (existingUser) {
      throw new ConflictException(`User with email '${adminEmail}' is already registered in the system`);
    }

    let tempPassword = dto.adminPassword;
    if (tempPassword !== undefined && tempPassword !== null && tempPassword.trim().length > 0) {
      validatePasswordPolicy(tempPassword, { email: adminEmail, name: dto.adminName });
    } else {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789#@!$*-_';
      let generatedPass = '';
      for (let i = 0; i < 14; i++) {
        generatedPass += chars.charAt(crypto.randomInt(0, chars.length));
      }
      tempPassword = generatedPass;
    }
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const adminEmployeeCode = cleanCode.startsWith('JNC-') ? `${cleanCode}-SA-001` : `JNC-${cleanCode}-SA-001`;

    // 2. Transactional creation of Tenant + Company Admin
    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          code: cleanCode,
          name: dto.name.trim(),
          slug: cleanSlug,
          status: 'active',
          planTier: dto.planTier || 'standard',
          maxUsers: dto.maxUsers || 10,
          phone: dto.adminPhone || null,
          email: adminEmail,
          address: dto.address || null,
          city: dto.city || null,
          state: dto.state || 'Karnataka',
          gstin: dto.gstin || null,
          invoicePrefix: cleanCode,
        },
      });

      const adminUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          employeeCode: adminEmployeeCode,
          name: dto.adminName.trim(),
          email: adminEmail,
          phone: dto.adminPhone || null,
          passwordHash,
          role: 'tenant_admin',
          isActive: true,
          mustResetPassword: Boolean(!dto.adminPassword),
        },
      });

      // Also create default Main Warehouse for tenant
      await tx.warehouse.create({
        data: {
          tenantId: tenant.id,
          code: `${cleanCode}-WH-MAIN`,
          name: `${dto.name} Main Warehouse`,
          city: dto.city || 'Bengaluru',
          isActive: true,
        },
      });

      return { tenant, adminUser };
    });

    let emailDispatched = false;
    let emailStatusMessage = 'Email not requested';
    let mailInfo: { status: string; reason: string | null; provider: string } = {
      status: dto.sendEmail === false ? 'not_configured' : 'failed',
      reason: null,
      provider: this.notificationsService.getMailProvider(),
    };
    const baseFrontendUrl = (process.env.FRONTEND_URL || dto?.appUrl || process.env.APP_URL || 'https://admin.jsnc.co.in').replace(/\/$/, '');
    const loginUrl = `${baseFrontendUrl}/login`;

    if (dto.sendEmail !== false) {

      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #0f172a; padding: 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em; }
    .header p { margin: 4px 0 0; font-size: 13px; color: #94a3b8; }
    .body { padding: 28px; }
    .creds-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; margin: 20px 0; }
    .table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .table td { padding: 8px 4px; vertical-align: middle; }
    .label { width: 140px; color: #64748b; font-weight: 600; }
    .val { color: #0f172a; font-weight: 600; }
    .code-badge { font-family: monospace; font-size: 15px; font-weight: 700; color: #2563eb; }
    .pass-badge { font-family: monospace; font-size: 16px; font-weight: 700; color: #b91c1c; background: #fee2e2; padding: 4px 10px; border-radius: 6px; display: inline-block; }
    .btn-container { text-align: center; margin: 28px 0 10px; }
    .btn { display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 700; font-size: 14px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2); }
    .footer { border-top: 1px solid #f1f5f9; padding: 16px 28px; text-align: center; font-size: 12px; color: #94a3b8; background: #fafafa; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Welcome to JNC CRM Platform</h1>
      <p>Company Workspace Provisioned for ${result.tenant.name}</p>
    </div>
    <div class="body">
      <p>Hello <strong>${result.adminUser.name}</strong>,</p>
      <p>Your company's isolated CRM workspace has been successfully created. Below are your official Super Admin access credentials to sign in:</p>
      
      <div class="creds-box">
        <table class="table">
          <tr>
            <td class="label">Company:</td>
            <td class="val">${result.tenant.name} (${result.tenant.code})</td>
          </tr>
          <tr>
            <td class="label">User ID / Code:</td>
            <td><span class="code-badge">${result.adminUser.employeeCode}</span></td>
          </tr>
          <tr>
            <td class="label">Login Email:</td>
            <td class="val font-mono">${result.adminUser.email}</td>
          </tr>
          <tr>
            <td class="label">Temporary Password:</td>
            <td><span class="pass-badge">${tempPassword}</span></td>
          </tr>
          <tr>
            <td class="label">Access Role:</td>
            <td class="val">Company Super Admin (Tenant Admin)</td>
          </tr>
          <tr>
            <td class="label">User Seats:</td>
            <td class="val">${result.tenant.maxUsers} Licenses</td>
          </tr>
        </table>
      </div>

      <div class="btn-container">
        <a href="${loginUrl}" class="btn">Login to Your CRM Workspace</a>
      </div>
    </div>
    <div class="footer">
      <p style="margin: 0 0 4px;">For security, please change your temporary password upon your first sign in.</p>
      <p style="margin: 0;">JNC CRM Multi-Tenant Cloud Platform</p>
    </div>
  </div>
</body>
</html>
      `;

      try {
        const mailRes = await this.notificationsService.sendEmail({
          to: result.adminUser.email,
          subject: `[JNC CRM] Welcome! Your CRM Workspace Access Credentials for ${result.tenant.name}`,
          html: emailHtml,
          text: `Hello ${result.adminUser.name},\n\nYour company's CRM workspace has been provisioned:\n\nCompany: ${result.tenant.name} (${result.tenant.code})\nUser ID: ${result.adminUser.employeeCode}\nEmail: ${result.adminUser.email}\nTemporary Password: ${tempPassword}\nLogin URL: ${loginUrl}\n\nPlease change your temporary password upon first login.`,
          tenantId: result.tenant.id,
          purpose: 'tenant_provisioning',
          throwOnError: false,
        });
        mailInfo = {
          status: mailRes.status,
          reason: mailRes.reason,
          provider: mailRes.provider,
        };
        if (mailRes && mailRes.status === 'sent') {
          emailDispatched = true;
          emailStatusMessage = `Credentials email dispatched successfully to ${result.adminUser.email}`;
        } else {
          emailDispatched = false;
          emailStatusMessage = `Company created, but email could not be delivered (${mailRes?.reason || mailRes?.status || 'unconfirmed'})`;
        }
      } catch (err: any) {
        mailInfo.status = 'failed';
        mailInfo.reason = err?.message || 'unexpected_error';
        emailDispatched = false;
        emailStatusMessage = `Company created, but email could not be sent: ${err?.message || 'SMTP error'}`;
      }
    }

    return {
      message: 'Company workspace and Tenant Admin created successfully',
      emailDispatched,
      emailStatusMessage,
      mail: {
        status: emailDispatched ? 'sent' : (dto.sendEmail === false ? 'not_configured' : (mailInfo.status || 'failed')),
        reason: mailInfo.reason,
        provider: mailInfo.provider,
      },
      loginUrl: `${baseFrontendUrl}/login`,
      tenant: result.tenant,
      adminUser: {
        id: result.adminUser.id,
        employeeCode: result.adminUser.employeeCode,
        name: result.adminUser.name,
        email: result.adminUser.email,
        role: result.adminUser.role,
        tempPassword,
      },
    };
  }

  /**
   * Update Tenant configuration or status (suspend / activate)
   */
  async updateTenant(id: string, dto: UpdateTenantDto, actor?: any, ipAddress?: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { users: true },
    });
    if (!tenant) throw new NotFoundException('Company tenant not found');
    if (tenant.isInternal) {
      throw new ForbiddenException('This is the platform owner company and cannot be managed here.');
    }

    // Only allow updating basic company metadata, plan tier, users, and contact details
    // Invoicing, bank, and GST data are strictly restricted to tenant workspaces
    const {
      name,
      status,
      planTier,
      maxUsers,
      phone,
      email,
      invoicePrefix,
      logoUrl,
    } = dto;

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(planTier !== undefined ? { planTier } : {}),
        ...(maxUsers !== undefined ? { maxUsers: Number(maxUsers) } : {}),
        ...(phone !== undefined ? { phone: phone?.trim() } : {}),
        ...(email !== undefined ? { email: email?.trim() } : {}),
        ...(invoicePrefix !== undefined ? { invoicePrefix: invoicePrefix?.trim() } : {}),
        ...(logoUrl !== undefined ? { logoUrl } : {}),
      },
    });

    // If tenant email or phone was updated, synchronize with primary Super Admin user
    if (email || phone) {
      const adminUser =
        tenant.users.find((u) => u.role === 'tenant_admin' || u.role === 'admin') ||
        tenant.users[0];

      if (adminUser) {
        await this.prisma.user.update({
          where: { id: adminUser.id },
          data: {
            ...(email ? { email: email.trim().toLowerCase() } : {}),
            ...(phone ? { phone: phone.trim() } : {}),
          },
        });
      }
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: id,
          actorId: actor?.sub || actor?.id || 'platform-admin',
          actorName: actor?.name || 'Platform Administrator',
          action: dto.status === 'suspended' ? 'SUSPEND_TENANT' : 'UPDATE_TENANT',
          entityName: 'Tenant',
          entityId: id,
          afterState: JSON.stringify({ status: updated.status, name: updated.name, id }),
          ipAddress: ipAddress || '127.0.0.1',
        },
      });
    } catch {}

    return updated;
  }

  /**
   * Delete / Soft Delete Tenant workspace
   */
  async deleteTenant(id: string, actor?: any, ipAddress?: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Company tenant not found');
    if (tenant.isInternal) {
      throw new ForbiddenException('This is the platform owner company and cannot be managed here.');
    }

    await this.prisma.tenant.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'suspended' },
    });

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: id,
          actorId: actor?.sub || actor?.id || 'platform-admin',
          actorName: actor?.name || 'Platform Administrator',
          action: 'DELETE_TENANT',
          entityName: 'Tenant',
          entityId: id,
          afterState: JSON.stringify({ tenantId: id, status: 'suspended' }),
          ipAddress: ipAddress || '127.0.0.1',
        },
      });
    } catch {}

    return { message: 'Company workspace deactivated successfully' };
  }

  /**
   * Support Impersonation ("Login-As-Org Admin")
   * Allows Platform Super Admin to switch context into a subscriber org.
   */
  async impersonateTenant(id: string, actor?: any, ipAddress?: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        users: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          take: 5,
        },
      },
    });

    if (!tenant) throw new NotFoundException('Company workspace not found');
    if (tenant.isInternal) {
      throw new ForbiddenException('This is the platform owner company and cannot be managed here.');
    }

    // Prefer tenant_admin or admin or first active user
    const targetUser =
      tenant.users.find((u) => u.role === 'tenant_admin' || u.role === 'admin') ||
      tenant.users[0];

    if (!targetUser) {
      throw new BadRequestException('No active user accounts found in this company workspace.');
    }

    const payload = {
      sub: targetUser.id,
      email: targetUser.email,
      employeeCode: targetUser.employeeCode,
      role: targetUser.role,
      tenantId: tenant.id,
      isImpersonating: true,
      impersonatedTenantName: tenant.name,
      impersonatedTenantCode: tenant.code,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    });

    // Write audit log entry for impersonation
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId: actor?.sub || actor?.id || 'platform-admin',
          actorName: actor?.name || 'Platform Administrator',
          action: 'IMPERSONATION_START',
          entityName: 'Tenant',
          entityId: tenant.id,
          afterState: JSON.stringify({
            impersonatedUserId: targetUser.id,
            impersonatedUserEmail: targetUser.email,
            impersonatedRole: targetUser.role,
            tenantCode: tenant.code,
            tenantName: tenant.name,
          }),
          ipAddress: ipAddress || '127.0.0.1',
        },
      });
    } catch {
      // Non-blocking audit log
    }

    return {
      accessToken,
      user: {
        id: targetUser.id,
        tenantId: tenant.id,
        employeeCode: targetUser.employeeCode,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        isImpersonating: true,
        impersonatedTenantName: tenant.name,
        impersonatedTenantCode: tenant.code,
        tenant: {
          id: tenant.id,
          code: tenant.code,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          planTier: tenant.planTier,
          maxUsers: tenant.maxUsers,
          logoUrl: tenant.logoUrl,
          phone: tenant.phone,
          email: tenant.email,
          gstin: tenant.gstin,
          city: tenant.city,
          state: tenant.state,
        },
      },
    };
  }

  /**
   * Reset the Super Admin / Tenant Admin password for a client company
   * and optionally send them an official credentials email with user ID & login link.
   */
  async resetTenantAdminPassword(
    tenantId: string,
    dto?: ResetTenantAdminPasswordDto,
    actor?: any,
    ipAddress?: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        users: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!tenant) throw new NotFoundException('Company workspace not found');
    if (tenant.isInternal) {
      throw new ForbiddenException('This is the platform owner company and cannot be managed here.');
    }

    // Find primary admin user
    const adminUser =
      tenant.users.find((u) => u.role === 'tenant_admin' || u.role === 'admin') ||
      tenant.users[0];

    if (!adminUser) {
      throw new BadRequestException('No active user accounts found in this company workspace to reset.');
    }

    // Determine target email: dto.adminEmail > tenant.email > adminUser.email
    const targetEmail = (dto?.adminEmail?.trim() || tenant.email || adminUser.email).trim().toLowerCase();

    // Determine password to set
    let passwordToSet: string;
    if (dto?.newPassword !== undefined && dto?.newPassword !== null) {
      if (typeof dto.newPassword !== 'string' || dto.newPassword.trim().length === 0) {
        throw new BadRequestException('Custom password must be a non-empty string and cannot be whitespace only.');
      }
      if (dto.newPassword.length > 200) {
        throw new BadRequestException('Custom password must not exceed 200 characters.');
      }
      validatePasswordPolicy(dto.newPassword, { email: targetEmail, name: adminUser.name });
      passwordToSet = dto.newPassword;
    } else {
      // Generate strong password (minimum 14 chars using crypto.randomInt, HTML and email safe)
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789#@!$*-_';
      let generatedPass = '';
      for (let i = 0; i < 14; i++) {
        generatedPass += chars.charAt(crypto.randomInt(0, chars.length));
      }
      passwordToSet = generatedPass;
    }

    const passwordHash = await bcrypt.hash(passwordToSet, 12);

    const mustReset = dto?.mustResetPassword !== undefined
      ? Boolean(dto.mustResetPassword)
      : (dto?.newPassword ? false : true);

    // Update password, email, increment tokenVersion (invalidates old tokens), reset failed attempts and unlock account in database
    await this.prisma.user.update({
      where: { id: adminUser.id },
      data: {
        email: targetEmail,
        passwordHash,
        mustResetPassword: mustReset,
        isActive: true,
        failedLoginAttempts: 0,
        lockoutUntil: null,
        tokenVersion: { increment: 1 },
      },
    });

    // Clear all lockout records across all identity key variants
    try {
      const lockKeys = [
        targetEmail,
        targetEmail.toLowerCase(),
        `${targetEmail}:${tenant.id}`,
        `${targetEmail.toLowerCase()}:${tenant.id}`,
        `platform-email:${targetEmail}`,
        `platform-email:${targetEmail.toLowerCase()}`,
        adminUser.email.toLowerCase(),
        `${adminUser.email.toLowerCase()}:${tenant.id}`,
        `platform-email:${adminUser.email.toLowerCase()}`,
        adminUser.employeeCode.toLowerCase(),
        adminUser.employeeCode.toUpperCase(),
        `${adminUser.employeeCode.toLowerCase()}:${tenant.id}`,
        `platform-email:${adminUser.employeeCode.toLowerCase()}`,
      ];
      await this.prisma.accountLockout.deleteMany({
        where: { identityKey: { in: lockKeys } },
      });
    } catch {}

    // Also synchronize tenant official email if changed
    if (targetEmail && targetEmail !== tenant.email) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { email: targetEmail },
      });
    }

    adminUser.email = targetEmail;

    let emailDispatched = false;
    let emailStatusMessage = 'Email not requested';
    let mailInfo: { status: string; reason: string | null; provider: string } = {
      status: dto?.sendEmail === false ? 'not_configured' : 'failed',
      reason: null,
      provider: this.notificationsService.getMailProvider(),
    };
    const baseFrontendUrl = (process.env.FRONTEND_URL || dto?.appUrl || process.env.APP_URL || 'https://admin.jsnc.co.in').replace(/\/$/, '');
    const loginUrl = `${baseFrontendUrl}/login`;

    if (dto?.sendEmail !== false) {

      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #0f172a; padding: 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em; }
    .header p { margin: 4px 0 0; font-size: 13px; color: #94a3b8; }
    .body { padding: 28px; }
    .creds-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; margin: 20px 0; }
    .table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .table td { padding: 8px 4px; vertical-align: middle; }
    .label { width: 140px; color: #64748b; font-weight: 600; }
    .val { color: #0f172a; font-weight: 600; }
    .code-badge { font-family: monospace; font-size: 15px; font-weight: 700; color: #2563eb; }
    .pass-badge { font-family: monospace; font-size: 16px; font-weight: 700; color: #b91c1c; background: #fee2e2; padding: 4px 10px; border-radius: 6px; display: inline-block; }
    .btn-container { text-align: center; margin: 28px 0 10px; }
    .btn { display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 700; font-size: 14px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2); }
    .footer { border-top: 1px solid #f1f5f9; padding: 16px 28px; text-align: center; font-size: 12px; color: #94a3b8; background: #fafafa; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Company CRM Access Credentials</h1>
      <p>Super Admin Access for ${tenant.name}</p>
    </div>
    <div class="body">
      <p>Hello <strong>${adminUser.name}</strong>,</p>
      <p>The Super Admin credentials for your company's CRM workspace have been reset. Below are your updated access details to sign in to your dedicated environment:</p>
      
      <div class="creds-box">
        <table class="table">
          <tr>
            <td class="label">Company:</td>
            <td class="val">${tenant.name} (${tenant.code})</td>
          </tr>
          <tr>
            <td class="label">User ID / Code:</td>
            <td><span class="code-badge">${adminUser.employeeCode}</span></td>
          </tr>
          <tr>
            <td class="label">Login Email:</td>
            <td class="val font-mono">${adminUser.email}</td>
          </tr>
          <tr>
            <td class="label">New Password:</td>
            <td><span class="pass-badge">${passwordToSet}</span></td>
          </tr>
          <tr>
            <td class="label">Access Role:</td>
            <td class="val">Company Super Admin</td>
          </tr>
        </table>
      </div>

      <div class="btn-container">
        <a href="${loginUrl}" class="btn">Login to Company CRM</a>
      </div>
    </div>
    <div class="footer">
      <p style="margin: 0 0 4px;">For security, please change your password after logging in.</p>
      <p style="margin: 0;">JNC CRM Multi-Tenant Cloud Platform</p>
    </div>
  </div>
</body>
</html>
      `;

      try {
        const mailRes = await this.notificationsService.sendEmail({
          to: adminUser.email,
          subject: `[JNC CRM] Super Admin Access Credentials for ${tenant.name}`,
          html: emailHtml,
          text: `Hello ${adminUser.name},\n\nYour Super Admin credentials for ${tenant.name} have been updated:\n\nCompany: ${tenant.name} (${tenant.code})\nUser ID: ${adminUser.employeeCode}\nEmail: ${adminUser.email}\nPassword: ${passwordToSet}\nLogin URL: ${loginUrl}\n\nPlease change your password after logging in.`,
          tenantId: tenant.id,
          purpose: 'password_reset',
          throwOnError: false,
        });
        mailInfo = {
          status: mailRes.status,
          reason: mailRes.reason,
          provider: mailRes.provider,
        };
        if (mailRes && mailRes.status === 'sent') {
          emailDispatched = true;
          emailStatusMessage = `Credentials email sent successfully to ${adminUser.email}`;
        } else {
          emailDispatched = false;
          emailStatusMessage = `Password updated, but email could not be delivered (${mailRes?.reason || mailRes?.status || 'unconfirmed'})`;
        }
      } catch (err: any) {
        mailInfo.status = 'failed';
        mailInfo.reason = err?.message || 'unexpected_error';
        emailDispatched = false;
        emailStatusMessage = `Password updated, but email sending failed: ${err?.message || 'SMTP error'}`;
      }
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId: actor?.sub || actor?.id || 'platform-admin',
          actorName: actor?.name || 'Platform Administrator',
          action: 'RESET_TENANT_ADMIN_PASSWORD',
          entityName: 'User',
          entityId: adminUser.id,
          afterState: JSON.stringify({
            targetUserId: adminUser.id,
            targetEmail,
            mustResetPassword: mustReset,
            tenantId: tenant.id,
            tenantCode: tenant.code,
          }),
          ipAddress: ipAddress || '127.0.0.1',
        },
      });
    } catch {}

    return {
      success: true,
      message: 'Super Admin password reset successfully',
      emailDispatched,
      emailStatusMessage,
      mail: {
        status: emailDispatched ? 'sent' : (dto?.sendEmail === false ? 'not_configured' : (mailInfo.status || 'failed')),
        reason: mailInfo.reason,
        provider: mailInfo.provider,
      },
      loginUrl: `${baseFrontendUrl}/login`,
      adminUser: {
        id: adminUser.id,
        employeeCode: adminUser.employeeCode,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
      },
      tenant: {
        id: tenant.id,
        code: tenant.code,
        name: tenant.name,
      },
      tempPassword: passwordToSet,
    };
  }

  /**
   * List all platform super administrators (tenantId is null)
   */
  async listPlatformAdmins() {
    return this.prisma.user.findMany({
      where: {
        tenantId: null,
        deletedAt: null,
      },
      select: {
        id: true,
        employeeCode: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        mustResetPassword: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Create a new platform super administrator account
   */
  async createPlatformAdmin(
    dto: { name: string; email: string; phone?: string; role?: string },
    actor?: any,
    ipAddress?: string,
  ) {
    const cleanEmail = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { email: cleanEmail },
    });
    if (existing) {
      throw new ConflictException(`User with email '${cleanEmail}' already exists`);
    }

    const count = await this.prisma.user.count({
      where: { tenantId: null },
    });
    const employeeCode = `PSA-${String(count + 1).padStart(3, '0')}`;

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789#@!$*-_';
    let tempPassword = '';
    for (let i = 0; i < 14; i++) {
      tempPassword += chars.charAt(crypto.randomInt(0, chars.length));
    }
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const newUserRole = (dto.role?.trim() || 'platform_super_admin');

    const newUser = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: cleanEmail,
        phone: dto.phone?.trim() || null,
        employeeCode,
        role: newUserRole,
        tenantId: null,
        passwordHash,
        isActive: true,
        mustResetPassword: true,
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

    let emailDispatched = false;
    let emailStatusMessage = '';
    let mailInfo: { status: string; reason: string | null; provider: string } = {
      status: 'failed',
      reason: null,
      provider: this.notificationsService.getMailProvider(),
    };
    const frontendUrl = (process.env.FRONTEND_URL || 'https://admin.jsnc.co.in').replace(/\/$/, '');
    const loginUrl = `${frontendUrl}/platform/login`;

    try {
      const mailRes = await this.notificationsService.sendEmail({
        to: cleanEmail,
        subject: `[JNC CRM Platform] Welcome - Platform Super Admin Account Created`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <h2 style="color: #0f172a; margin-top: 0;">Platform Administrator Account Created</h2>
            <p>Hello <strong>${newUser.name}</strong>,</p>
            <p>Your Platform Super Admin account for JNC CRM has been created.</p>
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 20px 0; font-family: monospace; font-size: 14px;">
              <p style="margin: 4px 0;"><strong>Platform Login Portal:</strong> ${loginUrl}</p>
              <p style="margin: 4px 0;"><strong>User ID / Code:</strong> ${employeeCode}</p>
              <p style="margin: 4px 0;"><strong>Login Email:</strong> ${cleanEmail}</p>
              <p style="margin: 4px 0;"><strong>Temporary Password:</strong> <span style="color: #b91c1c; font-weight: bold;">${tempPassword}</span></p>
            </div>
            <p style="margin: 24px 0;">
              <a href="${loginUrl}" style="background: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Login to Platform Portal</a>
            </p>
            <p style="font-size: 12px; color: #64748b;">Note: Super admins must log in at the Platform Portal above. Please change your password upon first login.</p>
          </div>
        `,
        text: `Hello ${newUser.name},\n\nYour Platform Super Admin account for JNC CRM has been created.\n\nLogin Portal: ${loginUrl}\nUser ID: ${employeeCode}\nEmail: ${cleanEmail}\nTemporary Password: ${tempPassword}\n\nPlease change your password after logging in.`,
        purpose: 'admin_invite',
        throwOnError: false,
      });
      mailInfo = {
        status: mailRes.status,
        reason: mailRes.reason,
        provider: mailRes.provider,
      };
      if (mailRes && mailRes.status === 'sent') {
        emailDispatched = true;
        emailStatusMessage = `Credentials email sent successfully to ${cleanEmail}`;
      } else {
        emailDispatched = false;
        emailStatusMessage = `Account created, but email could not be delivered (${mailRes?.reason || mailRes?.status})`;
      }
    } catch (err: any) {
      this.logger.warn(`Could not send platform admin welcome email to ${cleanEmail}: ${err.message}`);
      mailInfo.status = 'failed';
      mailInfo.reason = err?.message || 'unexpected_error';
      emailStatusMessage = `Account created, but email delivery failed: ${err.message}`;
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: 'default-tenant-id',
          actorId: actor?.sub || actor?.id || 'platform-admin',
          actorName: actor?.name || 'Platform Administrator',
          action: 'CREATE_PLATFORM_ADMIN',
          entityName: 'PlatformAdmin',
          entityId: newUser.id,
          afterState: JSON.stringify({ newAdminId: newUser.id, email: newUser.email }),
          ipAddress: ipAddress || '127.0.0.1',
        },
      });
    } catch {}

    return {
      message: emailDispatched
        ? `Platform administrator account created successfully. Credentials emailed to ${cleanEmail}.`
        : `Platform administrator account created, but email delivery failed (${emailStatusMessage}). Please copy the temporary password below manually.`,
      user: newUser,
      tempPassword,
      emailDispatched,
      emailStatusMessage,
      mail: {
        status: emailDispatched ? 'sent' : (mailInfo.status || 'failed'),
        reason: mailInfo.reason,
        provider: mailInfo.provider,
      },
    };
  }

  /**
   * Toggle active state for a platform administrator
   */
  async togglePlatformAdminActive(id: string, requestedState?: boolean, actor?: any, ipAddress?: string) {
    const target = await this.prisma.user.findFirst({
      where: { id, role: 'platform_super_admin', tenantId: null },
    });
    if (!target) throw new NotFoundException('Platform administrator not found');

    const nextState = requestedState !== undefined ? requestedState : !target.isActive;

    if (!nextState) {
      const activeCount = await this.prisma.user.count({
        where: { role: 'platform_super_admin', tenantId: null, isActive: true },
      });
      if (activeCount <= 1) {
        throw new BadRequestException('Cannot deactivate the last active Platform Administrator.');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        isActive: nextState,
        tokenVersion: { increment: 1 },
      },
      select: {
        id: true,
        employeeCode: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
      },
    });

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: 'default-tenant-id',
          actorId: actor?.sub || actor?.id || 'platform-admin',
          actorName: actor?.name || 'Platform Administrator',
          action: 'TOGGLE_PLATFORM_ADMIN_ACTIVE',
          entityName: 'PlatformAdmin',
          entityId: id,
          afterState: JSON.stringify({ adminId: id, isActive: nextState }),
          ipAddress: ipAddress || '127.0.0.1',
        },
      });
    } catch {}

    return {
      message: `Platform administrator ${nextState ? 'activated' : 'deactivated'} successfully`,
      user: updated,
    };
  }

  /**
   * Reset credentials for a platform administrator
   */
  async resetPlatformAdminUserPassword(id: string) {
    const target = await this.prisma.user.findFirst({
      where: { id, role: 'platform_super_admin', tenantId: null },
    });
    if (!target) throw new NotFoundException('Platform administrator not found');

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789#@!$*-_';
    let tempPassword = '';
    for (let i = 0; i < 14; i++) {
      tempPassword += chars.charAt(crypto.randomInt(0, chars.length));
    }
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

    try {
      const lockKeys = [
        target.email.toLowerCase(),
        `platform-email:${target.email.toLowerCase()}`,
        target.employeeCode.toLowerCase(),
        target.employeeCode.toUpperCase(),
        `platform-email:${target.employeeCode.toLowerCase()}`,
        `platform-email:${target.employeeCode.toUpperCase()}`,
      ];
      await this.prisma.accountLockout.deleteMany({
        where: { identityKey: { in: lockKeys } },
      });
    } catch {}

    let emailDispatched = false;
    let emailStatusMessage = '';
    let mailInfo: { status: string; reason: string | null; provider: string } = {
      status: 'failed',
      reason: null,
      provider: this.notificationsService.getMailProvider(),
    };
    const frontendUrl = (process.env.FRONTEND_URL || 'https://admin.jsnc.co.in').replace(/\/$/, '');
    const loginUrl = `${frontendUrl}/platform/login`;

    try {
      const mailRes = await this.notificationsService.sendEmail({
        to: target.email,
        subject: `[JNC CRM Platform] Your Platform Super Admin Password Has Been Reset`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <h2 style="color: #0f172a; margin-top: 0;">Platform Administrator Password Reset</h2>
            <p>Hello <strong>${target.name}</strong>,</p>
            <p>Your Platform Super Admin password for JNC CRM has been reset.</p>
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 20px 0; font-family: monospace; font-size: 14px;">
              <p style="margin: 4px 0;"><strong>Platform Login Portal:</strong> ${loginUrl}</p>
              <p style="margin: 4px 0;"><strong>User ID / Code:</strong> ${target.employeeCode}</p>
              <p style="margin: 4px 0;"><strong>Login Email:</strong> ${target.email}</p>
              <p style="margin: 4px 0;"><strong>New Temporary Password:</strong> <span style="color: #b91c1c; font-weight: bold;">${tempPassword}</span></p>
            </div>
            <p style="margin: 24px 0;">
              <a href="${loginUrl}" style="background: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Login to Platform Portal</a>
            </p>
            <p style="font-size: 12px; color: #64748b;">Please change your password upon logging in.</p>
          </div>
        `,
        text: `Hello ${target.name},\n\nYour Platform Super Admin password for JNC CRM has been reset.\n\nLogin Portal: ${loginUrl}\nUser ID: ${target.employeeCode}\nEmail: ${target.email}\nTemporary Password: ${tempPassword}\n\nPlease change your password after logging in.`,
        purpose: 'password_reset',
        throwOnError: false,
      });
      mailInfo = {
        status: mailRes.status,
        reason: mailRes.reason,
        provider: mailRes.provider,
      };
      if (mailRes && mailRes.status === 'sent') {
        emailDispatched = true;
        emailStatusMessage = `Password reset email sent to ${target.email}`;
      } else {
        emailDispatched = false;
        emailStatusMessage = `Password reset, but email could not be delivered (${mailRes?.reason || mailRes?.status})`;
      }
    } catch (err: any) {
      this.logger.warn(`Could not send platform admin reset email to ${target.email}: ${err.message}`);
      mailInfo.status = 'failed';
      mailInfo.reason = err?.message || 'unexpected_error';
      emailStatusMessage = `Password reset, but email delivery failed: ${err.message}`;
    }

    return {
      message: emailDispatched
        ? `Password for platform administrator ${target.name} has been reset and emailed to ${target.email}.`
        : `Password for platform administrator ${target.name} has been reset, but email delivery failed (${emailStatusMessage}). Please copy the temporary password below manually.`,
      tempPassword,
      emailDispatched,
      emailStatusMessage,
      mail: {
        status: emailDispatched ? 'sent' : (mailInfo.status || 'failed'),
        reason: mailInfo.reason,
        provider: mailInfo.provider,
      },
      user: target,
    };
  }

  /**
   * Delete a platform administrator account
   */
  async deletePlatformAdmin(id: string, actor?: any, ipAddress?: string) {
    const target = await this.prisma.user.findFirst({
      where: { id, role: 'platform_super_admin', tenantId: null },
    });
    if (!target) throw new NotFoundException('Platform administrator not found');

    const totalAdmins = await this.prisma.user.count({
      where: { role: 'platform_super_admin', tenantId: null, deletedAt: null },
    });
    if (totalAdmins <= 1) {
      throw new BadRequestException('Cannot delete the last remaining Platform Administrator.');
    }

    await this.prisma.user.delete({ where: { id } }).catch(async () => {
      await this.prisma.user.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
    });

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: 'default-tenant-id',
          actorId: actor?.sub || actor?.id || 'platform-admin',
          actorName: actor?.name || 'Platform Administrator',
          action: 'DELETE_PLATFORM_ADMIN',
          entityName: 'PlatformAdmin',
          entityId: id,
          afterState: JSON.stringify({ adminId: id, email: target.email }),
          ipAddress: ipAddress || '127.0.0.1',
        },
      });
    } catch {}

    return { message: `Platform administrator ${target.name} (${target.email}) deleted successfully.` };
  }

  /**
   * List users/employees of a client company workspace
   */
  async listTenantUsers(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Client company workspace not found');

    return this.prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        employeeCode: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });
  }

  /**
   * Add a user/employee to a client company workspace with a specific role
   */
  async addTenantUser(
    tenantId: string,
    dto: { name: string; email: string; phone?: string; role?: string; employeeCode?: string; password?: string },
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Client company workspace not found');

    const cleanEmail = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email: cleanEmail, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(`A user with email '${cleanEmail}' already exists in this company.`);
    }

    const totalUsers = await this.prisma.user.count({
      where: { tenantId, deletedAt: null },
    });
    if (tenant.maxUsers && totalUsers >= tenant.maxUsers) {
      throw new BadRequestException(`Maximum user seat limit (${tenant.maxUsers}) reached for ${tenant.name}.`);
    }

    const count = totalUsers + 1;
    const userRole = dto.role || 'employee';
    const empCode = dto.employeeCode?.trim() || `${tenant.code}-EMP-${String(count).padStart(3, '0')}`;
    let rawPass: string;
    if (dto.password !== undefined && dto.password !== null) {
      if (typeof dto.password !== 'string' || dto.password.trim().length === 0) {
        throw new BadRequestException('Password must be a non-empty string and cannot be whitespace only.');
      }
      validatePasswordPolicy(dto.password, { email: cleanEmail, name: dto.name });
      rawPass = dto.password;
    } else {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789#@!$*-_';
      let generatedPass = '';
      for (let i = 0; i < 14; i++) {
        generatedPass += chars.charAt(crypto.randomInt(0, chars.length));
      }
      rawPass = generatedPass;
    }
    const passwordHash = await bcrypt.hash(rawPass, 12);

    const newUser = await this.prisma.user.create({
      data: {
        tenantId,
        employeeCode: empCode,
        name: dto.name.trim(),
        email: cleanEmail,
        phone: dto.phone?.trim() || null,
        passwordHash,
        role: userRole,
        isActive: true,
        mustResetPassword: true,
      },
      select: {
        id: true,
        employeeCode: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return {
      message: `User ${newUser.name} added to ${tenant.name} successfully`,
      user: newUser,
      tempPassword: rawPass,
    };
  }

  /**
   * Remove/delete a user/employee from a client company workspace
   */
  async deleteTenantUser(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User account not found in this company workspace');

    await this.prisma.user.delete({ where: { id: userId } }).catch(async () => {
      await this.prisma.user.update({
        where: { id: userId },
        data: { deletedAt: new Date(), isActive: false },
      });
    });

    return { message: `User ${user.name} removed from company successfully.` };
  }

  /**
   * Platform System Diagnostics & Deployment Telemetry (Platform Super Admin only)
   */
  async getSystemInfo() {
    let commit = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || '';
    if (!commit) {
      try {
        const { execSync } = require('child_process');
        commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
      } catch (_) {
        commit = 'local-dev';
      }
    }
    const buildTime =
      process.env.BUILD_TIME ||
      process.env.RENDER_BUILD_TIMESTAMP ||
      new Date().toISOString();

    return {
      commit,
      buildTime,
      nodeVersion: process.version,
      nodeEnv: process.env.NODE_ENV || 'development',
      renderServiceId: process.env.RENDER_SERVICE_ID || 'local',
      version: '1.0.0',
    };
  }
}

