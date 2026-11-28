/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { PageAccess, Public } from '../auth/page-access.decorator';
import { getEffectivePagesForUser } from '../auth/effective-page-access';
import { isPlatformOwner } from '../auth/roles';
import { isTenantAdminRole } from '../common/roles-permissions';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private notificationsService: NotificationsService,
    private prisma: PrismaService,
  ) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @PageAccess('notifications')
  async getNotifications(
    @CurrentUser() user: ScopedUser,
    @Query('channel') channel?: string,
    @Query('search') search?: string,
  ) {
    const where: any = {};
    if (user.tenantId) {
      where.tenantId = user.tenantId;
    }

    if (!isPlatformOwner(user) && !isTenantAdminRole(user.role)) {
      const effectivePages = await getEffectivePagesForUser(this.prisma, user);
      const allowedEntityTypes: string[] = ['general', 'system', 'voucher_notice', 'collection_notice', 'advance_notice', 'payment_advice', 'company_setup_request'];
      if (effectivePages.includes('leads') || effectivePages.includes('lead_flow')) allowedEntityTypes.push('lead');
      if (effectivePages.includes('orders')) allowedEntityTypes.push('order');
      if (effectivePages.includes('invoices')) allowedEntityTypes.push('invoice');
      if (effectivePages.includes('quotations')) allowedEntityTypes.push('quotation');
      if (effectivePages.includes('shipments')) allowedEntityTypes.push('shipment');
      if (effectivePages.includes('inventory')) allowedEntityTypes.push('sku', 'inventory');
      if (effectivePages.includes('suppliers') || effectivePages.includes('bills') || effectivePages.includes('purchase_bills')) allowedEntityTypes.push('supplier', 'purchase_bill');
      if (effectivePages.includes('ledger')) allowedEntityTypes.push('ledger', 'payment', 'voucher_notice');
      if (effectivePages.includes('daily_activities')) allowedEntityTypes.push('daily_activity');
      if (effectivePages.includes('users')) allowedEntityTypes.push('user');

      where.OR = [
        { relatedEntityType: null },
        { relatedEntityType: { in: allowedEntityTypes } },
      ];
    }

    if (channel && channel !== 'all') {
      where.channel = channel;
    }
    if (search) {
      const searchConditions = [
        { recipient: { contains: search } },
        { subject: { contains: search } },
        { body: { contains: search } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchConditions }];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    const items = await this.prisma.messageLog.findMany({
      where,
      take: 100,
      orderBy: { sentAt: 'desc' },
    });

    // Also count unread / recent
    const total = await this.prisma.messageLog.count({ where });

    return { items, total };
  }

  @Post('request-company-setup')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async requestCompanySetup(
    @CurrentUser() user: ScopedUser,
    @Body() body: { documentType?: string; missingFields?: string[] },
  ) {
    if (!user?.tenantId) {
      return { success: false, message: 'No company workspace attached to account.' };
    }

    const admins = await this.prisma.user.findMany({
      where: {
        tenantId: user.tenantId,
        role: { in: ['administrator', 'tenant_admin', 'admin'] },
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, name: true, email: true },
    });

    const missingText = Array.isArray(body?.missingFields) && body.missingFields.length > 0
      ? body.missingFields.join(', ')
      : 'Company Address, GSTIN, or Bank Details';
    const requesterName = (user as any).name || (user as any).email || user.employeeCode || 'Team Member';
    const docLabel = body?.documentType || 'Quotation / Tax Invoice';

    const logs = await Promise.all(
      (admins.length > 0 ? admins : [{ id: user.id, name: 'Administrator', email: process.env.EMAIL_FROM || 'admin@company.local' }]).map((admin) =>
        this.prisma.messageLog.create({
          data: {
            tenantId: user.tenantId!,
            channel: 'system_alert',
            recipient: admin.email || admin.name || 'Administrator',
            subject: `Company Profile Setup Needed for ${docLabel}`,
            body: `${requesterName} could not complete ${docLabel} creation because Company Setup in Branding & GST is incomplete. Missing: ${missingText}. Please update /settings/branding.`,
            status: 'sent',
            relatedEntityType: 'company_setup_request',
            relatedEntityId: user.tenantId,
          },
        }),
      ),
    );

    return {
      success: true,
      notifiedAdmins: admins.length,
      logIds: logs.map((l) => l.id),
      message: `Notification sent to ${admins.length || 1} company administrator(s) to complete ${missingText}.`,
    };
  }

  /**
   * Sync incoming customer replies directly from GoDaddy IMAP
   */
  @Post('sync-godaddy')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @PageAccess('notifications')
  async syncGoDaddy(@CurrentUser() user: ScopedUser) {
    return this.notificationsService.syncGoDaddyInbox();
  }

  /**
   * Webhook endpoint to receive incoming email reply payload / forward from GoDaddy / email server
   */
  @Post('inbound-email')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @PageAccess('notifications')
  async handleInboundEmail(
    @CurrentUser() user: ScopedUser,
    @Body()
    body: {
      from: string;
      to?: string;
      subject: string;
      text?: string;
      html?: string;
      leadNumber?: string;
    },
  ) {
    const fromEmail = body.from || 'client@example.com';
    const cleanFrom = fromEmail.replace(/.*<([^>]+)>.*/, '$1').trim();

    // Find matching lead scoped strictly to user's tenant
    const lead = await this.prisma.lead.findFirst({
      where: {
        ...(user?.tenantId ? { tenantId: user.tenantId } : {}),
        OR: [
          { customerEmail: { equals: cleanFrom } },
          body.leadNumber ? { leadNumber: { equals: body.leadNumber } } : undefined,
        ].filter(Boolean) as any,
        deletedAt: null,
      },
      include: { assignedTo: true },
    });

    const content = body.text || body.html || 'Customer email reply received.';

    // 1. Log inbound message in MessageLog
    const messageLog = await this.prisma.messageLog.create({
      data: {
        tenantId: lead?.tenantId || user?.tenantId || 'default-tenant-id',
        channel: 'email_inbound',
        recipient: body.to || process.env.EMAIL_FROM || 'system-inbound',
        subject: body.subject || `Reply from ${cleanFrom}`,
        body: content,
        status: 'received',
        relatedEntityType: lead ? 'lead' : undefined,
        relatedEntityId: lead ? lead.id : undefined,
      },
    });

    // 2. If lead found, append to LeadActivity timeline & create unread notification task
    if (lead) {
      await this.prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: lead.assignedToId || undefined,
          type: 'email',
          title: `Customer Email Reply: ${body.subject || 'No Subject'}`,
          description: content,
          isCompleted: true,
          completedAt: new Date(),
        },
      });

      // Update lead status to contacted/active if was new
      if (lead.status === 'new') {
        await this.prisma.lead.updateMany({
          where: { id: lead.id, tenantId: lead.tenantId },
          data: { status: 'contacted' },
        });
      }
    }

    return { success: true, messageId: messageLog.id, matchedLead: lead?.leadNumber };
  }
}
