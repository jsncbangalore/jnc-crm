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
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { NotificationsService } from '../notifications/notifications.service';
import * as bcrypt from 'bcryptjs';

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
   * List all tenant organizations (Platform Super Admin only)
   */
  async listTenants() {
    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
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

    return tenants;
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
    return tenant;
  }

  /**
   * Provision a new Tenant Company + Primary Tenant Admin Account
   */
  async createTenant(dto: CreateTenantDto) {
    const cleanCode = dto.code.trim().toUpperCase();
    const cleanSlug = (dto.slug || cleanCode.toLowerCase()).trim().replace(/[^a-z0-9-]/gi, '-');

    // 1. Check uniqueness
    const existing = await this.prisma.tenant.findFirst({
      where: {
        OR: [{ code: cleanCode }, { slug: cleanSlug }],
      },
    });

    if (existing) {
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

    return {
      message: 'Company workspace and Tenant Admin created successfully',
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

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: {
        ...dto,
      },
    });

    // If tenant email or phone was updated, synchronize with primary Super Admin user
    if (dto.email || dto.phone) {
      const adminUser =
        tenant.users.find((u) => u.role === 'tenant_admin' || u.role === 'super_admin' || u.role === 'admin') ||
        tenant.users[0];

      if (adminUser) {
        await this.prisma.user.update({
          where: { id: adminUser.id },
          data: {
            ...(dto.email ? { email: dto.email.trim() } : {}),
            ...(dto.phone ? { phone: dto.phone.trim() } : {}),
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
    if (id === 'default-tenant-id') {
      throw new BadRequestException('Primary system root company cannot be deleted');
    }

    await this.prisma.tenant.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'suspended' },
    });

    return { message: 'Company workspace deactivated successfully' };
  }

  /**
   * Salesforce-style Support Impersonation ("Login-As-Org Admin")
   * Allows Platform Super Admin to switch context into a subscriber org.
   */
  async impersonateTenant(id: string) {
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

    // Prefer tenant_admin or super_admin or first active user
    const targetUser =
      tenant.users.find((u) => u.role === 'tenant_admin' || u.role === 'super_admin' || u.role === 'admin') ||
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

    const accessToken = this.jwtService.sign(payload);

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

    // Find primary admin/super admin user
    const adminUser =
      tenant.users.find((u) => u.role === 'tenant_admin' || u.role === 'super_admin' || u.role === 'admin') ||
      tenant.users[0];

    if (!adminUser) {
      throw new BadRequestException('No active user accounts found in this company workspace to reset.');
    }

    // Determine target email: dto.adminEmail > tenant.email > adminUser.email
    const targetEmail = dto?.adminEmail?.trim() || tenant.email || adminUser.email;

    // Generate strong password if not supplied
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let generatedPass = '';
    for (let i = 0; i < 10; i++) {
      generatedPass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const passwordToSet = dto?.newPassword?.trim() || generatedPass;

    const passwordHash = await bcrypt.hash(passwordToSet, 10);

    // Update password, email, and unlock account in database
    await this.prisma.user.update({
      where: { id: adminUser.id },
      data: {
        email: targetEmail,
        passwordHash,
        mustResetPassword: true,
        isActive: true,
      },
    });

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
      const loginUrl = dto?.appUrl || process.env.APP_URL || 'http://localhost:5173/login';

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
          tenantId: 'default-tenant-id',
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
}

