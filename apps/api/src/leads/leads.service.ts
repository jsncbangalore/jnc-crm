/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopingService, ScopedUser } from '../auth/scoping.service';
import { CreateLeadDto, UpdateLeadDto, UpdateLeadStatusDto, CreateLeadActivityDto } from './dto/create-lead.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { requireTenantId } from '../common/tenant.util';
import { parsePagination } from '../common/pagination.util';
import { sanitizeHtml, stripAllHtml } from '../common/html-sanitize.util';
import { getEffectivePagesForUser } from '../auth/effective-page-access';
import { isPlatformOwner } from '../auth/roles';
import { normalizeToE164, comparePhoneNumbers } from '../common/shared-validation';
import { DocumentSeriesService } from '../common/document-series.service';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);
  private roundRobinIndex = 0;

  constructor(
    private prisma: PrismaService,
    private scopingService: ScopingService,
    private notificationsService: NotificationsService,
    private auditService: AuditService,
    private documentSeriesService: DocumentSeriesService,
  ) {}

  private normalizePhone(phone?: string): string {
    if (!phone) return '';
    return normalizeToE164(phone);
  }

  async getNextAssigneeId(tenantId: string): Promise<string | null> {
    let employees = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: 'employee',
        isActive: true,
        deletedAt: null,
      },
      orderBy: { employeeCode: 'asc' },
    });

    if (employees.length === 0) {
      employees = await this.prisma.user.findMany({
        where: {
          tenantId,
          role: { in: ['sub_admin', 'tenant_admin', 'admin'] },
          isActive: true,
          deletedAt: null,
        },
        orderBy: { employeeCode: 'asc' },
      });
    }

    if (employees.length === 0) return null;
    const assignee = employees[this.roundRobinIndex % employees.length];
    this.roundRobinIndex++;
    return assignee.id;
  }

  /**
   * Universal duplicate lead finder across all phone formats:
   * '9876543210', '+91 98765 43210', '+919876543210', and optional email.
   */
  async findDuplicateLead(tenantId: string, phone?: string, email?: string) {
    if (!phone && !email) return null;

    const normEmail = (email || '').trim().toLowerCase();
    const rawPhone = (phone || '').trim();
    const normPhone = rawPhone ? normalizeToE164(rawPhone) : '';
    const digitsOnly = rawPhone.replace(/\D/g, '');
    const tenDigits = digitsOnly.slice(-10);

    // 1. Build OR conditions for candidate leads
    const orConditions: any[] = [];
    if (normPhone) orConditions.push({ customerPhone: normPhone });
    if (rawPhone && rawPhone !== normPhone) orConditions.push({ customerPhone: rawPhone });
    if (tenDigits.length >= 7) {
      orConditions.push({ customerPhone: tenDigits });
      orConditions.push({ customerPhone: { contains: tenDigits } });
      const spaceFormat = `+91 ${tenDigits.slice(0, 5)} ${tenDigits.slice(5)}`;
      orConditions.push({ customerPhone: { contains: spaceFormat } });
    }
    if (normEmail) {
      orConditions.push({ customerEmail: { equals: normEmail, mode: 'insensitive' } });
    }

    if (orConditions.length > 0) {
      const candidates = await this.prisma.lead.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: orConditions,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { assignedTo: true },
      });

      for (const candidate of candidates) {
        if (normEmail && candidate.customerEmail && candidate.customerEmail.toLowerCase() === normEmail) {
          return candidate;
        }
        if (rawPhone && candidate.customerPhone && comparePhoneNumbers(candidate.customerPhone, rawPhone)) {
          return candidate;
        }
      }

      if (candidates.length > 0 && !rawPhone) {
        return candidates[0];
      }
    }

    // 2. Fallback SQL regex match on digits only for edge case formatting (dashes, parentheses, dots)
    if (tenDigits.length === 10) {
      try {
        const rawMatches = await this.prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "Lead"
          WHERE "tenantId" = ${tenantId}
            AND "deletedAt" IS NULL
            AND regexp_replace("customerPhone", '\D', '', 'g') LIKE ${'%' + tenDigits}
          ORDER BY "createdAt" DESC
          LIMIT 1
        `;
        if (rawMatches && rawMatches.length > 0) {
          return this.prisma.lead.findUnique({
            where: { id: rawMatches[0].id },
            include: { assignedTo: true },
          });
        }
      } catch (err: any) {
        this.logger.warn(`Fallback SQL duplicate check error: ${err.message}`);
      }
    }

    return null;
  }

  async createLead(dto: CreateLeadDto, actor?: ScopedUser) {
    const tenantId = requireTenantId(actor);
    const normPhone = normalizeToE164(dto.customerPhone);
    const existingLead = await this.findDuplicateLead(tenantId, dto.customerPhone, dto.customerEmail);

    if (existingLead && !dto.forceSave && !dto.allowDuplicate && dto.source !== 'web') {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'DUPLICATE_WARNING',
        message: `A lead with this contact already exists: ${existingLead.customerName} (${existingLead.leadNumber || existingLead.id}). Open it or save anyway.`,
        existingLead: {
          id: existingLead.id,
          leadNumber: existingLead.leadNumber,
          customerName: existingLead.customerName,
          customerPhone: existingLead.customerPhone,
          customerEmail: existingLead.customerEmail,
        },
      });
    }

    let assignedToId = dto.assignedToId;
    if (!assignedToId) {
      assignedToId = await this.getNextAssigneeId(tenantId);
    }

    let companyId: string | null = null;
    if (dto.companyName) {
      let company = await this.prisma.company.findFirst({
        where: { tenantId, name: { equals: dto.companyName.trim(), mode: 'insensitive' } },
      });
      if (!company) {
        company = await this.prisma.company.create({
          data: {
            tenantId,
            name: dto.companyName.trim(),
            city: dto.city,
          },
        });
      }
      companyId = company.id;
    }

    let leadNumber: string;
    try {
      const nextDoc = await this.documentSeriesService.getNextDocumentNumber(tenantId, 'lead');
      leadNumber = nextDoc.formattedNumber;
    } catch (err: any) {
      this.logger.warn(`DocumentSeries allocation fallback: ${err.message}`);
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { code: true } });
      const prefix = tenant?.code ? `${tenant.code}-LD` : 'LD';
      const count = await this.prisma.lead.count({ where: { tenantId } });
      leadNumber = `${prefix}-${String(count + 1).padStart(5, '0')}`;
    }

    let ownerDisplayName = 'Unassigned';
    if (assignedToId) {
      const assignedUser = await this.prisma.user.findUnique({
        where: { id: assignedToId },
        select: { name: true, employeeCode: true, email: true },
      });
      if (assignedUser) {
        ownerDisplayName = assignedUser.name || assignedUser.employeeCode || assignedUser.email?.split('@')[0] || 'Assigned';
      }
    }

    const lead = await this.prisma.lead.create({
      data: {
        tenantId,
        leadNumber,
        source: dto.source || 'manual',
        status: 'new',
        customerName: stripAllHtml(dto.customerName) || 'Lead',
        customerPhone: normPhone || stripAllHtml(dto.customerPhone) || '',
        customerEmail: stripAllHtml(dto.customerEmail),
        city: stripAllHtml(dto.city),
        state: stripAllHtml(dto.state),
        productCategory: stripAllHtml(dto.productCategory),
        productName: stripAllHtml(dto.productName),
        quantity: dto.quantity ? Number(dto.quantity) : 1,
        unit: stripAllHtml(dto.unit) || 'NOS',
        estimatedValue: dto.estimatedValue ? Number(dto.estimatedValue) : 0,
        urgency: (dto as any).urgency || 'standard',
        queryMessage: sanitizeHtml(dto.queryMessage),
        rawPayload: dto.rawPayload,
        isDuplicate: false,
        companyId,
        assignedToId,
        ownerDisplayName,
        lastActivityAt: new Date(),
        nextFollowUpAt: (dto as any).nextFollowUpAt ? new Date((dto as any).nextFollowUpAt) : null,
        lostReason: (dto as any).lostReason || null,
        createdById: actor?.id && actor.id !== 'system-webhook' ? actor.id : null,
      },

      include: {
        assignedTo: {
          select: { id: true, name: true, employeeCode: true, email: true },
        },
        company: true,
      },
    });

    if (assignedToId) {
      await this.notificationsService.createInAppTask({
        tenantId,
        leadId: lead.id,
        userId: assignedToId,
        title: `New Lead ${lead.leadNumber} assigned: ${lead.customerName}`,
        description: `Source: ${lead.source.toUpperCase()} | Product: ${lead.productCategory || lead.productName || 'N/A'} | City: ${lead.city || 'N/A'}. Follow up manually via call/email.`,
      });
    }

    await this.auditService.log({
      tenantId,
      actorId: actor?.id,
      actorName: actor ? actor.employeeCode : 'System Webhook',
      action: 'CREATE',
      entityName: 'Lead',
      entityId: lead.id,
      afterState: lead,
    });

    return lead;
  }

  async previewImport(records: any[], user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const evaluatedRows = [];
    const seenInSheet = new Map<string, number>();
    let duplicateCount = 0;
    let validCount = 0;

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const customerName = (r.contact_name || r.contactName || r.customer_name || r.customerName || r.name || r.Name || '').toString().trim();
      const companyName = (r.company_name || r.companyName || r.company || r.Company || '').toString().trim();
      const rawPhone = (r.phone || r.customerPhone || r.mobile || r.Mobile || r.contact || '').toString().trim();
      const customerPhone = this.normalizePhone(rawPhone);
      const customerEmail = (r.email || r.customerEmail || r.Email || '').toString().trim();
      const productCategory = (r.product_interest || r.productCategory || r.product || r.Product || r.sku || r.SKU || r.component || '').toString().trim();
      const city = (r.city || r.City || r.location || '').toString().trim();
      const estimatedValue = parseFloat(r.estimated_value || r.estimatedValue || r.value || r.Value || 0) || 0;
      const assignedTo = (r.assigned_to || r.assignedTo || r.rep || r.agent || '').toString().trim();
      const source = (r.source || r.Source || 'manual').toString().trim().toLowerCase();

      if (!customerName && !customerPhone && !companyName) {
        continue;
      }

      const phoneKey = customerPhone.slice(-10);
      let isDuplicate = false;
      let duplicateReason = '';
      let matchedLead = null;

      if (phoneKey && seenInSheet.has(phoneKey)) {
        isDuplicate = true;
        duplicateReason = `Duplicate of Row ${seenInSheet.get(phoneKey)} in this sheet`;
        duplicateCount++;
      } else if (customerPhone && customerPhone.length >= 7) {
        matchedLead = await this.prisma.lead.findFirst({
          where: {
            tenantId,
            OR: [
              { customerPhone: customerPhone },
              { customerPhone: { contains: phoneKey } },
            ],
            createdAt: { gte: thirtyDaysAgo },
            deletedAt: null,
          },
          include: {
            assignedTo: { select: { id: true, name: true, employeeCode: true } },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (matchedLead) {
          isDuplicate = true;
          duplicateReason = `Active in CRM (${matchedLead.leadNumber} — ${matchedLead.assignedTo?.name || 'Assigned'})`;
          duplicateCount++;
        } else {
          validCount++;
        }
      } else {
        validCount++;
      }

      if (phoneKey && !seenInSheet.has(phoneKey)) {
        seenInSheet.set(phoneKey, i + 1);
      }

      evaluatedRows.push({
        rowIndex: i + 1,
        customerName: customerName || 'Unnamed Contact',
        companyName,
        customerPhone,
        customerEmail,
        productCategory: productCategory || 'Electronic Components',
        city,
        estimatedValue,
        assignedTo,
        source: source || 'manual',
        isDuplicate,
        duplicateReason,
        matchedLeadNumber: matchedLead?.leadNumber,
        matchedAt: matchedLead?.createdAt,
        matchedAssignee: matchedLead?.assignedTo?.name,
        isValid: !!customerName && !!customerPhone,
      });
    }

    return {
      totalCount: evaluatedRows.length,
      duplicateCount,
      validCount,
      rows: evaluatedRows,
    };
  }

  async findAll(user: ScopedUser, query: {
    status?: string;
    source?: string;
    assignedToId?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const scopeWhere = this.scopingService.getLeadScope(user);
    const where: any = {
      ...scopeWhere,
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    }
    if (query.source) {
      where.source = query.source;
    }
    if ((query as any).urgency) {
      where.urgency = (query as any).urgency;
    }
    if (query.assignedToId) {
      where.assignedToId = query.assignedToId;
    }
    if (query.startDate && query.endDate) {
      where.createdAt = {
        gte: new Date(query.startDate),
        lte: new Date(query.endDate),
      };
    }
    if (query.search) {
      const rawSearch = query.search.trim();
      const searchOR: any[] = [
        { leadNumber: { contains: rawSearch, mode: 'insensitive' } },
        { customerName: { contains: rawSearch, mode: 'insensitive' } },
        { customerPhone: { contains: rawSearch, mode: 'insensitive' } },
        { customerEmail: { contains: rawSearch, mode: 'insensitive' } },
        { city: { contains: rawSearch, mode: 'insensitive' } },
        { productCategory: { contains: rawSearch, mode: 'insensitive' } },
        { productName: { contains: rawSearch, mode: 'insensitive' } },
      ];
      const digits = rawSearch.replace(/\D/g, '');
      if (digits.length >= 7) {
        searchOR.push({ customerPhone: { contains: digits.slice(-10) } });
      }
      if (scopeWhere.OR) {
        where.AND = [{ OR: scopeWhere.OR }, { OR: searchOR }];
        delete where.OR;
      } else {
        where.OR = searchOR;
      }
    }

    const { page, limit, skip, take } = parsePagination(query, 25, 100);

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: {
            select: { id: true, name: true, employeeCode: true, email: true },
          },
          company: true,
          contact: true,
          activities: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const scopeWhere = this.scopingService.getLeadScope(user);
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId, ...scopeWhere, deletedAt: null },
      include: {
        assignedTo: {
          select: { id: true, name: true, employeeCode: true, email: true },
        },
        company: true,
        contact: true,
        activities: {
          orderBy: { createdAt: 'desc' },
          include: {
            performedBy: {
              select: { id: true, name: true, employeeCode: true },
            },
          },
        },
        quotations: {
          include: {
            lines: {
              include: { sku: true },
            },
          },
        },
      },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    const effectivePages = await getEffectivePagesForUser(this.prisma, user);
    const hasQuotations = isPlatformOwner(user) || user.role === 'tenant_admin' || effectivePages.includes('quotations');
    if (!hasQuotations) {
      (lead as any).quotations = [];
    }

    return lead;
  }

  async updateLead(id: string, dto: UpdateLeadDto, user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const existing = await this.prisma.lead.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Lead not found');
    }

    let phoneToSave = existing.customerPhone;
    if (dto.customerPhone !== undefined) {
      const trimmedPhone = dto.customerPhone.trim();
      // If phone was NOT changed, accept existing legacy value without validation
      const isUnchanged =
        trimmedPhone === existing.customerPhone ||
        trimmedPhone.replace(/\D/g, '') === existing.customerPhone.replace(/\D/g, '');

      if (isUnchanged) {
        phoneToSave = existing.customerPhone;
      } else {
        // Phone was changed: validate strictly (10-digit Indian mobile starting with 6-9)
        const digits = trimmedPhone.replace(/\D/g, '');
        if (digits.length === 10) {
          if (!/^[6-9]/.test(digits)) {
            throw new BadRequestException('Mobile number must start with 6, 7, 8, or 9.');
          }
        } else {
          throw new BadRequestException('Enter a 10-digit mobile number.');
        }
        phoneToSave = normalizeToE164(trimmedPhone);
      }
    }

    let ownerDisplayNameToSet: string | undefined = undefined;
    if (dto.assignedToId !== undefined) {
      if (dto.assignedToId) {
        const assignedUser = await this.prisma.user.findUnique({
          where: { id: dto.assignedToId },
          select: { name: true, employeeCode: true, email: true },
        });
        ownerDisplayNameToSet = assignedUser ? (assignedUser.name || assignedUser.employeeCode || assignedUser.email?.split('@')[0]) : 'Assigned';
      } else {
        ownerDisplayNameToSet = 'Unassigned';
      }
    } else if (dto.ownerDisplayName !== undefined) {
      ownerDisplayNameToSet = dto.ownerDisplayName;
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        ...(dto.customerName !== undefined ? { customerName: dto.customerName } : {}),
        ...(dto.customerPhone !== undefined ? { customerPhone: phoneToSave } : {}),
        ...(dto.customerEmail !== undefined ? { customerEmail: dto.customerEmail || null } : {}),
        ...(dto.city !== undefined ? { city: dto.city || null } : {}),
        ...(dto.state !== undefined ? { state: dto.state || null } : {}),
        ...(dto.companyName !== undefined ? { companyName: dto.companyName || null } : {}),
        ...(dto.productCategory !== undefined ? { productCategory: dto.productCategory || null } : {}),
        ...(dto.productName !== undefined ? { productName: dto.productName || null } : {}),
        ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit || null } : {}),
        ...(dto.estimatedValue !== undefined ? { estimatedValue: dto.estimatedValue } : {}),
        ...(dto.queryMessage !== undefined ? { queryMessage: dto.queryMessage || null } : {}),
        ...(dto.urgency !== undefined ? { urgency: dto.urgency || null } : {}),
        ...(dto.assignedToId !== undefined ? { assignedToId: dto.assignedToId || null } : {}),
        ...(ownerDisplayNameToSet !== undefined ? { ownerDisplayName: ownerDisplayNameToSet } : {}),
        ...(dto.nextFollowUpAt !== undefined ? { nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : null } : {}),
        ...(dto.lostReason !== undefined ? { lostReason: dto.lostReason || null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        lastActivityAt: new Date(),
      },
      include: {
        assignedTo: { select: { id: true, name: true, employeeCode: true } },
      },
    });

    await this.auditService.log({
      tenantId,
      actorId: user.id,
      actorName: user.employeeCode,
      action: 'UPDATE',
      entityName: 'Lead',
      entityId: id,
      beforeState: { customerPhone: existing.customerPhone },
      afterState: { customerPhone: phoneToSave },
    });

    return updated;
  }

  async updateStatus(id: string, dto: UpdateLeadStatusDto, user: ScopedUser) {
    const lead = await this.findOne(id, user);

    const oldStatus = lead.status;
    const tenantId = requireTenantId(user);
    const updateRes = await this.prisma.lead.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        status: dto.status,
        lostReason: dto.status === 'lost' ? dto.lostReason : null,
        lastActivityAt: new Date(),
      },
    });
    if (updateRes.count === 0) {
      throw new NotFoundException('Lead not found');
    }
    const updated = await this.findOne(id, user);

    await this.prisma.statusHistory.create({
      data: {
        entityType: 'lead',
        entityId: id,
        fromStatus: oldStatus,
        toStatus: dto.status,
        changedById: user.id,
        note: dto.note || `Status changed from ${oldStatus} to ${dto.status}`,
      },
    });

    await this.prisma.leadActivity.create({
      data: {
        leadId: id,
        userId: user.id,
        type: 'status_change',
        title: `Status updated to ${dto.status.toUpperCase()}`,
        description: dto.note || (dto.lostReason ? `Reason: ${dto.lostReason}` : undefined),
        isCompleted: true,
        completedAt: new Date(),
      },
    });

    await this.auditService.log({
      tenantId: requireTenantId(user),
      actorId: user.id,
      actorName: user.employeeCode,
      action: 'STATUS_CHANGE',
      entityName: 'Lead',
      entityId: id,
      beforeState: { status: oldStatus },
      afterState: { status: dto.status, note: dto.note },
    });

    return updated;
  }

  async addActivity(leadId: string, dto: CreateLeadActivityDto & { sendEmailToCustomer?: boolean }, user: ScopedUser) {
    const lead = await this.findOne(leadId, user);
    const tenantId = requireTenantId(user);

    if (dto.type === 'email' && dto.sendEmailToCustomer && lead.customerEmail) {
      if (user.role !== 'platform_super_admin' && user.role !== 'tenant_admin' && user.role !== 'admin') {
        throw new ForbiddenException('Only Administrators are authorized to send direct outward emails from the CRM.');
      }
      try {
        const branding = await this.notificationsService.getBranding(tenantId);
        const sanitizedTitle = sanitizeHtml(dto.title);
        const sanitizedDesc = sanitizeHtml(dto.description);
        await this.notificationsService.sendEmail({
          tenantId,
          to: lead.customerEmail,
          subject: sanitizedTitle || `Update regarding your inquiry with ${branding.companyDisplayName}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <div style="background: #2E5EFF; color: white; padding: 16px; border-radius: 6px; text-align: center; margin-bottom: 20px;">
                <h2 style="margin: 0;">${branding.companyDisplayName}</h2>
              </div>
              <p>Dear <strong>${lead.customerName}</strong>,</p>
              <div style="background: #f8fafc; padding: 16px; border-radius: 6px; border-left: 4px solid #2E5EFF; margin: 16px 0; font-size: 14px; line-height: 1.6; color: #1e293b;">
                ${(sanitizedDesc || '').replace(/\n/g, '<br/>')}
              </div>
              <p style="font-size: 13px; color: #64748b;">
                Reference Inquiry: <strong>${lead.leadNumber}</strong>
              </p>
            </div>
          `,
          relatedEntityType: 'lead',
          relatedEntityId: leadId,
        });
      } catch (err: any) {
        this.logger.error(`Failed to send direct lead email: ${err.message}`);
      }
    }

    const activity = await this.prisma.leadActivity.create({
      data: {
        leadId,
        userId: user.id,
        type: dto.type,
        title: sanitizeHtml(dto.title),
        description: sanitizeHtml(dto.description),
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        isCompleted: dto.isCompleted !== undefined ? dto.isCompleted : true,
        completedAt: dto.isCompleted ? new Date() : null,
      },

      include: {
        performedBy: {
          select: { id: true, name: true, employeeCode: true },
        },
      },
    });

    return activity;
  }

  async commitImport(records: any[], user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const results = {
      totalRows: records.length,
      importedCount: 0,
      errors: [] as string[],
      createdLeadNumbers: [] as string[],
    };

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { code: true } });
    const prefix = tenant?.code ? `${tenant.code}-LD` : 'LD';

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      try {
        if (!r.customerName || !r.customerPhone) {
          results.errors.push(`Row ${i + 1}: Missing customer name or phone`);
          continue;
        }

        const normPhone = this.normalizePhone(r.customerPhone);
        const existing = await this.prisma.lead.findFirst({
          where: {
            tenantId,
            OR: [
              { customerPhone: { contains: normPhone.slice(-10) } },
              r.customerEmail ? { customerEmail: { equals: r.customerEmail.trim(), mode: 'insensitive' } } : undefined,
            ].filter(Boolean) as any,
            deletedAt: null,
          },
        });

        if (existing) {
          results.errors.push(`Row ${i + 1} (${r.customerName} - ${r.customerPhone}): Skipped duplicate (Already exists as ${existing.leadNumber})`);
          continue;
        }

        let companyId: string | null = null;
        if (r.companyName) {
          let comp = await this.prisma.company.findFirst({
            where: { tenantId, name: { equals: r.companyName.trim(), mode: 'insensitive' } },
          });
          if (!comp) {
            comp = await this.prisma.company.create({
              data: {
                tenantId,
                name: r.companyName.trim(),
                city: r.city,
              },
            });
          }
          companyId = comp.id;
        }

        let assignedToId: string | null = null;
        if (r.assignedTo) {
          const matchedUser = await this.prisma.user.findFirst({
            where: {
              tenantId,
              OR: [
                { name: { contains: r.assignedTo, mode: 'insensitive' } },
                { employeeCode: { equals: r.assignedTo, mode: 'insensitive' } },
                { email: { equals: r.assignedTo, mode: 'insensitive' } },
              ],
              isActive: true,
              deletedAt: null,
            },
          });
          if (matchedUser) {
            assignedToId = matchedUser.id;
          }
        }

        if (!assignedToId) {
          assignedToId = await this.getNextAssigneeId(tenantId);
        }

        const count = await this.prisma.lead.count({ where: { tenantId } });
        const leadNumber = `${prefix}-${String(count + 1).padStart(5, '0')}`;

        const lead = await this.prisma.lead.create({
          data: {
            tenantId,
            leadNumber,
            source: r.source || 'manual',
            status: 'new',
            customerName: r.customerName.trim(),
            customerPhone: this.normalizePhone(r.customerPhone),
            customerEmail: r.customerEmail?.trim() || undefined,
            city: r.city?.trim() || undefined,
            productCategory: r.productCategory?.trim() || 'Electronic Components',
            estimatedValue: Number(r.estimatedValue) || 0,
            queryMessage: r.queryMessage || `[Bulk Imported via Excel/CSV by ${user.employeeCode || user.id || 'Admin'}]`,
            isDuplicate: !!r.isDuplicate,
            companyId,
            assignedToId,
          },
        });

        await this.prisma.leadActivity.create({
          data: {
            leadId: lead.id,
            userId: user.id,
            type: 'note',
            title: 'Lead Bulk-Imported from Spreadsheet',
            description: `Imported via spreadsheet batch by ${user.employeeCode || user.id || 'Admin'}. Assigned to ${assignedToId}.`,
            isCompleted: true,
            completedAt: new Date(),
          },
        });

        results.importedCount++;
        results.createdLeadNumbers.push(leadNumber);
      } catch (err: any) {
        results.errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

    return results;
  }

  async shareLead(leadId: string, targetUserId: string, actor: ScopedUser) {
    const tenantId = requireTenantId(actor);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID ${leadId} not found in your company.`);
    }

    if (
      actor.role !== 'platform_super_admin' &&
      actor.role !== 'tenant_admin' &&
      actor.role !== 'admin' &&
      lead.assignedToId !== actor.id
    ) {
      throw new ForbiddenException('Only the lead owner or an Administrator can share this lead.');
    }

    const share = await this.prisma.leadShare.upsert({
      where: {
        leadId_userId: {
          leadId,
          userId: targetUserId,
        },
      },
      create: {
        tenantId,
        leadId,
        userId: targetUserId,
        sharedById: actor.id,
      },
      update: {},
    });

    await this.auditService.log({
      tenantId,
      actorId: actor.id,
      action: 'SHARE',
      entityName: 'Lead',
      entityId: leadId,
      afterState: { sharedWithUserId: targetUserId },
    });

    return share;
  }

  async getPipelineBoard(
    user: ScopedUser,
    query: {
      source?: string;
      urgency?: string;
      assignedToId?: string;
      search?: string;
      startDate?: string;
      endDate?: string;
    } = {},
  ) {
    const scopeWhere = this.scopingService.getLeadScope(user);
    const tenantId = requireTenantId(user);
    const baseWhere: any = {
      ...scopeWhere,
      deletedAt: null,
    };

    if (query.source && query.source !== 'all') {
      baseWhere.source = query.source;
    }
    if (query.urgency && query.urgency !== 'all') {
      baseWhere.urgency = query.urgency;
    }
    if (query.assignedToId && query.assignedToId !== 'all') {
      baseWhere.assignedToId = query.assignedToId;
    }
    if (query.startDate && query.endDate) {
      baseWhere.createdAt = {
        gte: new Date(query.startDate),
        lte: new Date(query.endDate),
      };
    }
    if (query.search) {
      const rawSearch = query.search.trim();
      const searchOR: any[] = [
        { leadNumber: { contains: rawSearch, mode: 'insensitive' } },
        { customerName: { contains: rawSearch, mode: 'insensitive' } },
        { customerPhone: { contains: rawSearch, mode: 'insensitive' } },
        { customerEmail: { contains: rawSearch, mode: 'insensitive' } },
        { city: { contains: rawSearch, mode: 'insensitive' } },
        { productCategory: { contains: rawSearch, mode: 'insensitive' } },
        { productName: { contains: rawSearch, mode: 'insensitive' } },
      ];
      const digits = rawSearch.replace(/\D/g, '');
      if (digits.length >= 7) {
        searchOR.push({ customerPhone: { contains: digits.slice(-10) } });
      }
      if (scopeWhere.OR) {
        baseWhere.AND = [{ OR: scopeWhere.OR }, { OR: searchOR }];
        delete baseWhere.OR;
      } else {
        baseWhere.OR = searchOR;
      }
    }

    const STAGES = ['new', 'contacted', 'qualified', 'quoted', 'won', 'lost'] as const;

    const allFilteredLeads = await this.prisma.lead.findMany({
      where: baseWhere,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        assignedTo: {
          select: { id: true, name: true, employeeCode: true, email: true },
        },
        company: { select: { id: true, name: true, city: true } },
        contact: { select: { id: true, name: true, phone: true, email: true } },
        quotations: {
          select: { id: true, quoteNumber: true, totalAmount: true, status: true },
          take: 5,
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const stagesData: Record<string, {
      id: string;
      label: string;
      count: number;
      totalValue: number;
      cards: any[];
      hasMore: boolean;
      totalCards: number;
    }> = {
      new: { id: 'new', label: 'New Inquiries', count: 0, totalValue: 0, cards: [], hasMore: false, totalCards: 0 },
      contacted: { id: 'contacted', label: 'Contacted', count: 0, totalValue: 0, cards: [], hasMore: false, totalCards: 0 },
      qualified: { id: 'qualified', label: 'Qualified Requirement', count: 0, totalValue: 0, cards: [], hasMore: false, totalCards: 0 },
      quoted: { id: 'quoted', label: 'Quoted / Proposal Sent', count: 0, totalValue: 0, cards: [], hasMore: false, totalCards: 0 },
      won: { id: 'won', label: 'Won / Closed', count: 0, totalValue: 0, cards: [], hasMore: false, totalCards: 0 },
      lost: { id: 'lost', label: 'Lost / Closed', count: 0, totalValue: 0, cards: [], hasMore: false, totalCards: 0 },
    };

    let newTodayCount = 0;
    let urgentCount = 0;
    let followUpsDueToday = 0;

    for (const lead of allFilteredLeads) {
      const st = (lead.status && stagesData[lead.status]) ? lead.status : 'new';
      const val = Number(lead.estimatedValue || 0);

      stagesData[st].count += 1;
      stagesData[st].totalValue += val;

      if (stagesData[st].cards.length < 30) {
        stagesData[st].cards.push(lead);
      }

      if (lead.createdAt && new Date(lead.createdAt) >= startOfToday) {
        newTodayCount++;
      }
      if (lead.urgency === 'urgent' || lead.urgency === 'high') {
        urgentCount++;
      }
      if (lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) <= endOfToday) {
        followUpsDueToday++;
      }
    }

    for (const st of STAGES) {
      stagesData[st].totalCards = stagesData[st].count;
      stagesData[st].hasMore = stagesData[st].count > 30;
    }

    const totalLeads = allFilteredLeads.length;
    const totalPipelineValue = STAGES.reduce((sum, s) => sum + stagesData[s].totalValue, 0);
    const wonCount = stagesData.won.count;
    const closedCount = stagesData.won.count + stagesData.lost.count;
    const winRate = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : (totalLeads > 0 ? Math.round((wonCount / totalLeads) * 100) : 0);

    const distinctSources = await this.prisma.lead.findMany({
      where: { tenantId, deletedAt: null },
      select: { source: true },
      distinct: ['source'],
    });
    const sourcesSet = new Set<string>(['manual', 'web', 'whatsapp', 'indiamart', 'facebook_lead_ads', 'instagram_lead_ads']);
    for (const s of distinctSources) {
      if (s.source) sourcesSet.add(s.source);
    }

    const employees = await this.prisma.user.findMany({
      where: { tenantId, isActive: true, deletedAt: null },
      select: { id: true, name: true, employeeCode: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });

    return {
      summary: {
        totalLeads,
        newToday: newTodayCount,
        urgentCount,
        pipelineValue: totalPipelineValue,
        winRate,
        followUpsDueToday,
      },
      stages: stagesData,
      sources: Array.from(sourcesSet),
      salesReps: employees,
      serverTime: new Date().toISOString(),
    };
  }
}
