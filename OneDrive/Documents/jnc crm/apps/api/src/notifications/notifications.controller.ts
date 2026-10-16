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

@Controller('notifications')
export class NotificationsController {
  constructor(
    private notificationsService: NotificationsService,
    private prisma: PrismaService,
  ) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getNotifications(
    @CurrentUser() user: ScopedUser,
    @Query('channel') channel?: string,
    @Query('search') search?: string,
  ) {
    const where: any = {};
    if (channel && channel !== 'all') {
      where.channel = channel;
    }
    if (search) {
      where.OR = [
        { recipient: { contains: search } },
        { subject: { contains: search } },
        { body: { contains: search } },
      ];
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

  /**
   * Sync incoming customer replies directly from GoDaddy IMAP
   */
  @Post('sync-godaddy')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async syncGoDaddy(@CurrentUser() user: ScopedUser) {
    return this.notificationsService.syncGoDaddyInbox();
  }

  /**
   * Webhook endpoint to receive incoming email reply payload / forward from GoDaddy / email server
   */
  @Post('inbound-email')
  async handleInboundEmail(
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

    // Find matching lead by customerEmail or phone
    const lead = await this.prisma.lead.findFirst({
      where: {
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
        channel: 'email_inbound',
        recipient: 'jayaraj@jsnc.co.in',
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
