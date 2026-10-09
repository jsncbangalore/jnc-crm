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
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { NotificationsService } from '../notifications/notifications.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

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

    const tempPassword = dto.adminPassword || 'Admin@123456';
    const passwordHash = await bcrypt.hash(tempPassword, 10);
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
          mustResetPassword: true,
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

    // 3. Dispatch official credentials email to the newly created company's Super Admin
    let emailDispatched = false;
    let emailStatusMessage = 'Email not requested';

    if (dto.sendEmail !== false) {
      const frontendUrl = dto.appUrl || process.env.FRONTEND_URL || process.env.APP_URL || (process.env.NODE_ENV === 'production' ? 'https://admin.jsnc.co.in' : 'http://localhost:5173');
      const loginUrl = frontendUrl.endsWith('/login') ? frontendUrl : `${frontendUrl}/login`;

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
        await this.notificationsService.sendEmail({
          to: result.adminUser.email,
          subject: `[JNC CRM] Welcome! Your CRM Workspace Access Credentials for ${result.tenant.name}`,
          html: emailHtml,
          text: `Hello ${result.adminUser.name},\n\nYour company's CRM workspace has been provisioned:\n\nCompany: ${result.tenant.name} (${result.tenant.code})\nUser ID: ${result.adminUser.employeeCode}\nEmail: ${result.adminUser.email}\nTemporary Password: ${tempPassword}\nLogin URL: ${loginUrl}\n\nPlease change your temporary password upon first login.`,
          tenantId: result.tenant.id,
        });
        emailDispatched = true;
        emailStatusMessage = `Credentials email dispatched successfully to ${result.adminUser.email}`;
      } catch (err: any) {
        emailDispatched = false;
        emailStatusMessage = `Company created, but email could not be sent: ${err?.message || 'SMTP error'}`;
      }
    }

    return {
      message: 'Company workspace and Tenant Admin created successfully',
      emailDispatched,
      emailStatusMessage,
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
  async updateTenant(id: string, dto: UpdateTenantDto) {
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

    return updated;
  }

  /**
   * Delete / Soft Delete Tenant workspace
   */
  async deleteTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Company tenant not found');
    if (tenant.isInternal) {
      throw new ForbiddenException('This is the platform owner company and cannot be managed here.');
    }

    await this.prisma.tenant.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'suspended' },
    });

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

    const accessToken = this.jwtService.sign(payload, { expiresIn: '8h' });

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
    dto?: { newPassword?: string; adminEmail?: string; sendEmail?: boolean; appUrl?: string },
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

    // Generate strong password (minimum 12 chars using crypto.randomInt)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*()_+';
    let generatedPass = '';
    for (let i = 0; i < 14; i++) {
      generatedPass += chars.charAt(crypto.randomInt(0, chars.length));
    }
    const passwordToSet = dto?.newPassword?.trim() || generatedPass;

    const passwordHash = await bcrypt.hash(passwordToSet, 10);

    // Update password, email, increment tokenVersion (invalidates old tokens), and unlock account in database
    await this.prisma.user.update({
      where: { id: adminUser.id },
      data: {
        email: targetEmail,
        passwordHash,
        mustResetPassword: true,
        isActive: true,
        tokenVersion: { increment: 1 },
      },
    });

    // Clear any lockout record
    try {
      await this.prisma.accountLockout.deleteMany({
        where: {
          OR: [
            { identityKey: targetEmail },
            { identityKey: `${targetEmail}:${tenant.id}` },
            { identityKey: adminUser.email.toLowerCase() },
            { identityKey: `${adminUser.email.toLowerCase()}:${tenant.id}` },
          ],
        },
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

    if (dto?.sendEmail !== false) {
      const frontendUrl = dto?.appUrl || process.env.FRONTEND_URL || process.env.APP_URL || (process.env.NODE_ENV === 'production' ? 'https://admin.jsnc.co.in' : 'http://localhost:5173');
      const loginUrl = frontendUrl.endsWith('/login') ? frontendUrl : `${frontendUrl}/login`;

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
        await this.notificationsService.sendEmail({
          to: adminUser.email,
          subject: `[JNC CRM] Super Admin Access Credentials for ${tenant.name}`,
          html: emailHtml,
          text: `Hello ${adminUser.name},\n\nYour Super Admin credentials for ${tenant.name} have been updated:\n\nCompany: ${tenant.name} (${tenant.code})\nUser ID: ${adminUser.employeeCode}\nEmail: ${adminUser.email}\nPassword: ${passwordToSet}\nLogin URL: ${loginUrl}\n\nPlease change your password after logging in.`,
          tenantId: tenant.id,
        });
        emailDispatched = true;
        emailStatusMessage = `Credentials email sent successfully to ${adminUser.email}`;
      } catch (err: any) {
        emailDispatched = false;
        emailStatusMessage = `Password updated, but email sending failed: ${err?.message || 'SMTP error'}`;
      }
    }

    return {
      success: true,
      message: 'Super Admin password reset successfully',
      emailDispatched,
      emailStatusMessage,
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
   * List all platform administrators (tenantId is null)
   */
  async listPlatformAdmins() {
    return this.prisma.user.findMany({
      where: {
        role: {
          in: [
            'platform_super_admin',
            'platform_operations_manager',
            'platform_account_onboarding',
            'platform_client_support',
          ],
        },
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
   * Create a new platform administrator account with specific platform sub-role
   */
  async createPlatformAdmin(dto: { name: string; email: string; phone?: string; role?: string }, actor?: any) {
    const cleanEmail = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { email: cleanEmail },
    });
    if (existing) {
      throw new ConflictException(`User with email '${cleanEmail}' already exists`);
    }

    const validPlatformRoles = [
      'platform_super_admin',
      'platform_operations_manager',
      'platform_account_onboarding',
      'platform_client_support',
    ];
    const targetRole = validPlatformRoles.includes(dto.role || '') ? dto.role! : 'platform_super_admin';

    const count = await this.prisma.user.count({
      where: {
        role: { in: validPlatformRoles },
        tenantId: null,
      },
    });
    const employeeCode = `PSA-${String(count + 1).padStart(3, '0')}`;

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*()_+';
    let tempPassword = '';
    for (let i = 0; i < 14; i++) {
      tempPassword += chars.charAt(crypto.randomInt(0, chars.length));
    }
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const newUser = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: cleanEmail,
        phone: dto.phone?.trim() || null,
        employeeCode,
        role: targetRole,
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
    let emailStatusMessage = 'Email dispatch attempted';

    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || (process.env.NODE_ENV === 'production' ? 'https://admin.jsnc.co.in' : 'http://localhost:5173');
    const loginUrl = `${frontendUrl}/login`;

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
      <h1>Platform Administrator Account Created</h1>
      <p>JNC Master Control Center Access</p>
    </div>
    <div class="body">
      <p>Hello <strong>${newUser.name}</strong>,</p>
      <p>Your Platform Administrator account has been provisioned. Below are your official master credentials to sign in:</p>
      
      <div class="creds-box">
        <table class="table">
          <tr>
            <td class="label">User ID / Code:</td>
            <td><span class="code-badge">${employeeCode}</span></td>
          </tr>
          <tr>
            <td class="label">Login Email:</td>
            <td class="val font-mono">${cleanEmail}</td>
          </tr>
          <tr>
            <td class="label">Temporary Password:</td>
            <td><span class="pass-badge">${tempPassword}</span></td>
          </tr>
          <tr>
            <td class="label">Access Role:</td>
            <td class="val">Platform Super Administrator</td>
          </tr>
        </table>
      </div>

      <div class="btn-container">
        <a href="${loginUrl}" class="btn">Login to Platform Control Center</a>
      </div>
    </div>
    <div class="footer">
      <p style="margin: 0 0 4px;">For security, please change your temporary password upon your first sign in.</p>
      <p style="margin: 0;">JNC CRM Enterprise Platform</p>
    </div>
  </div>
</body>
</html>
    `;

    try {
      await this.notificationsService.sendEmail({
        to: cleanEmail,
        subject: `[JNC CRM] Your Platform Administrator Credentials [${employeeCode}]`,
        html: emailHtml,
        text: `Hello ${newUser.name},\n\nYour Platform Administrator account has been created:\n\nUser ID: ${employeeCode}\nEmail: ${cleanEmail}\nTemporary Password: ${tempPassword}\nLogin URL: ${loginUrl}\n\nPlease change your password upon first login.`,
      });
      emailDispatched = true;
      emailStatusMessage = `Credentials email sent successfully to ${cleanEmail}`;
    } catch (err: any) {
      emailDispatched = false;
      emailStatusMessage = `Account created, but email sending failed: ${err?.message || 'SMTP error'}`;
    }

    return {
      message: 'Platform administrator account created successfully',
      user: newUser,
      tempPassword,
      emailDispatched,
      emailStatusMessage,
    };
  }

  /**
   * Toggle active state for a platform administrator
   */
  async togglePlatformAdminActive(id: string, requestedState?: boolean) {
    const validPlatformRoles = [
      'platform_super_admin',
      'platform_operations_manager',
      'platform_account_onboarding',
      'platform_client_support',
    ];

    const target = await this.prisma.user.findFirst({
      where: { id, role: { in: validPlatformRoles }, tenantId: null },
    });
    if (!target) throw new NotFoundException('Platform administrator not found');

    const nextState = requestedState !== undefined ? requestedState : !target.isActive;

    if (!nextState) {
      const activeCount = await this.prisma.user.count({
        where: { role: { in: validPlatformRoles }, tenantId: null, isActive: true },
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

    return {
      message: `Platform administrator ${nextState ? 'activated' : 'deactivated'} successfully`,
      user: updated,
    };
  }

  /**
   * Reset credentials for a platform administrator and send credentials email
   */
  async resetPlatformAdminUserPassword(
    id: string,
    dto?: { newPassword?: string; sendEmail?: boolean; appUrl?: string },
  ) {
    const target = await this.prisma.user.findFirst({
      where: {
        id,
        role: {
          in: [
            'platform_super_admin',
            'platform_operations_manager',
            'platform_account_onboarding',
            'platform_client_support',
          ],
        },
        tenantId: null,
      },
    });
    if (!target) throw new NotFoundException('Platform administrator not found');

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*()_+';
    let generatedPass = '';
    for (let i = 0; i < 14; i++) {
      generatedPass += chars.charAt(crypto.randomInt(0, chars.length));
    }
    const passwordToSet = dto?.newPassword?.trim() || generatedPass;
    const passwordHash = await bcrypt.hash(passwordToSet, 10);

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustResetPassword: true,
        isActive: true,
        tokenVersion: { increment: 1 },
      },
    });

    // Clear any account lockout records
    try {
      const emailKey = `platform-email:${target.email.toLowerCase()}`;
      await this.prisma.accountLockout.deleteMany({
        where: {
          OR: [
            { identityKey: emailKey },
            { identityKey: target.email.toLowerCase() },
          ],
        },
      });
    } catch {}

    let emailDispatched = false;
    let emailStatusMessage = 'Email not requested';

    if (dto?.sendEmail !== false) {
      const frontendUrl = dto?.appUrl || process.env.FRONTEND_URL || process.env.APP_URL || (process.env.NODE_ENV === 'production' ? 'https://admin.jsnc.co.in' : 'http://localhost:5173');
      const platformLoginUrl = frontendUrl.endsWith('/platform/login') ? frontendUrl : `${frontendUrl}/platform/login`;

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
      <h1>Platform Master Credentials Reset</h1>
      <p>Platform Super Admin Access for JNC CRM</p>
    </div>
    <div class="body">
      <p>Hello <strong>${target.name}</strong>,</p>
      <p>Your Platform Super Administrator credentials for the JNC CRM Master Console have been reset. Below are your updated sign-in details:</p>
      
      <div class="creds-box">
        <table class="table">
          <tr>
            <td class="label">User ID / Code:</td>
            <td><span class="code-badge">${target.employeeCode}</span></td>
          </tr>
          <tr>
            <td class="label">Official Email:</td>
            <td class="val font-mono">${target.email}</td>
          </tr>
          <tr>
            <td class="label">New Password:</td>
            <td><span class="pass-badge">${passwordToSet}</span></td>
          </tr>
          <tr>
            <td class="label">Role:</td>
            <td class="val">Platform Super Admin</td>
          </tr>
        </table>
      </div>

      <div class="btn-container">
        <a href="${platformLoginUrl}" class="btn">Login to Master Console</a>
      </div>
    </div>
    <div class="footer">
      <p style="margin: 0 0 4px;">For security, please change your password upon logging in.</p>
      <p style="margin: 0;">JNC CRM Multi-Tenant Cloud Platform</p>
    </div>
  </div>
</body>
</html>
      `;

      try {
        await this.notificationsService.sendEmail({
          to: target.email,
          subject: `[JNC CRM] Platform Super Admin Access Credentials Reset`,
          html: emailHtml,
          text: `Hello ${target.name},\n\nYour Platform Super Admin credentials for JNC CRM have been updated:\n\nUser ID: ${target.employeeCode}\nEmail: ${target.email}\nNew Password: ${passwordToSet}\nPlatform Login URL: ${platformLoginUrl}\n\nPlease change your password upon logging in.`,
        });
        emailDispatched = true;
        emailStatusMessage = `Credentials email sent successfully to ${target.email}`;
      } catch (err: any) {
        emailDispatched = false;
        emailStatusMessage = `Password updated, but email sending failed: ${err?.message || 'SMTP error'}`;
      }
    }

    return {
      success: true,
      message: `Password for platform administrator ${target.name} has been reset successfully`,
      emailDispatched,
      emailStatusMessage,
      tempPassword: passwordToSet,
      user: target,
    };
  }

  /**
   * Real-time Platform Analytics Metrics for Super Admin Dashboard
   */
  async getAnalytics() {
    const totalCompanies = await this.prisma.tenant.count({
      where: { isInternal: false },
    });
    const activeCompanies = await this.prisma.tenant.count({
      where: { isInternal: false, status: 'active' },
    });
    const suspendedCompanies = await this.prisma.tenant.count({
      where: { isInternal: false, status: 'suspended' },
    });
    const trialCompanies = await this.prisma.tenant.count({
      where: { isInternal: false, status: 'trial' },
    });

    const tenants = await this.prisma.tenant.findMany({
      where: { isInternal: false },
      select: { maxUsers: true, planTier: true },
    });

    const totalLicenses = tenants.reduce((acc, t) => acc + (t.maxUsers || 0), 0);

    const totalActiveUsers = await this.prisma.user.count({
      where: {
        tenantId: { not: null },
        isActive: true,
        deletedAt: null,
      },
    });

    const planTierBreakdown = tenants.reduce((acc: Record<string, number>, t) => {
      const tier = t.planTier || 'standard';
      acc[tier] = (acc[tier] || 0) + 1;
      return acc;
    }, {});

    const recentTenants = await this.prisma.tenant.findMany({
      where: { isInternal: false },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        code: true,
        name: true,
        email: true,
        status: true,
        planTier: true,
        maxUsers: true,
        createdAt: true,
      },
    });

    return {
      totalCompanies,
      activeCompanies,
      suspendedCompanies,
      trialCompanies,
      totalLicenses,
      totalActiveUsers,
      planTierBreakdown,
      recentTenants,
    };
  }

  /**
   * Dispatch summary report email of all platform analytics directly to Super Admin
   */
  async sendSummaryReport(targetEmail?: string) {
    const analytics = await this.getAnalytics();
    const recipient = (targetEmail || process.env.PRIMARY_EMAIL_FROM || 'jsnetworkcommunication@gmail.com').trim();

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
    .card { max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #0f172a; padding: 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 4px 0 0; font-size: 13px; color: #94a3b8; }
    .body { padding: 28px; }
    .metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 20px 0; }
    .metric-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; text-align: center; }
    .metric-num { font-size: 22px; font-weight: 800; color: #2563eb; }
    .metric-label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; margin-top: 4px; }
    .table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 16px; }
    .table th { background: #f1f5f9; padding: 8px; text-align: left; color: #475569; font-weight: 700; }
    .table td { padding: 8px; border-bottom: 1px solid #f1f5f9; }
    .footer { border-top: 1px solid #f1f5f9; padding: 16px 28px; text-align: center; font-size: 12px; color: #94a3b8; background: #fafafa; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>JNC CRM SaaS Platform Executive Report</h1>
      <p>Real-Time Client Analytics & Operational Metrics</p>
    </div>
    <div class="body">
      <p>Hello Super Administrator,</p>
      <p>Here is your real-time SaaS client platform operational summary:</p>

      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-num">${analytics.totalCompanies}</div>
          <div class="metric-label">Client Companies</div>
        </div>
        <div class="metric-card">
          <div class="metric-num" style="color: #16a34a;">${analytics.activeCompanies}</div>
          <div class="metric-label">Active Workspaces</div>
        </div>
        <div class="metric-card">
          <div class="metric-num" style="color: #ea580c;">${analytics.totalActiveUsers}</div>
          <div class="metric-label">Active User Accounts</div>
        </div>
        <div class="metric-card">
          <div class="metric-num" style="color: #9333ea;">${analytics.totalLicenses}</div>
          <div class="metric-label">License Seats Allocated</div>
        </div>
      </div>

      <h3 style="font-size: 14px; font-weight: 700; margin-top: 24px;">Recent Client Company Provisioning</h3>
      <table class="table">
        <thead>
          <tr>
            <th>Company</th>
            <th>Code</th>
            <th>Plan</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${analytics.recentTenants.map(t => `
            <tr>
              <td><strong>${t.name}</strong><br><span style="font-size:11px; color:#64748b;">${t.email}</span></td>
              <td><code>${t.code}</code></td>
              <td style="text-transform: capitalize;">${t.planTier}</td>
              <td style="text-transform: capitalize; color: ${t.status === 'active' ? '#16a34a' : '#dc2626'}; font-weight: bold;">${t.status}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="footer">
      <p style="margin: 0;">Generated automatically by JNC CRM Platform Engine</p>
    </div>
  </div>
</body>
</html>
    `;

    await this.notificationsService.sendEmail({
      to: recipient,
      subject: `[JNC CRM] Executive Platform Analytics Report — ${analytics.activeCompanies} Active Companies`,
      html: emailHtml,
      text: `Executive SaaS Platform Analytics:\nTotal Companies: ${analytics.totalCompanies}\nActive Workspaces: ${analytics.activeCompanies}\nActive Users: ${analytics.totalActiveUsers}\nTotal Licenses Allocated: ${analytics.totalLicenses}`,
    });

    return {
      success: true,
      recipient,
      message: `Executive analytics report successfully sent to ${recipient}`,
      analytics,
    };
  }
}

