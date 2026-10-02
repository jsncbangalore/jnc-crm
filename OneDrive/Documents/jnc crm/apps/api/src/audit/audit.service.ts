/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAuditLogDto {
  tenantId?: string;
  actorId?: string;
  actorName?: string;
  action: string;
  entityName: string;
  entityId: string;
  beforeState?: any;
  afterState?: any;
  ipAddress?: string;
}

export function extractClientIp(req: any): string {
  if (!req) return '127.0.0.1';
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    if (raw) return raw.trim();
  }
  return req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(dto: CreateAuditLogDto) {
    try {
      return await this.prisma.auditLog.create({
        data: {
          tenantId: dto.tenantId || null,
          actorId: dto.actorId,
          actorName: dto.actorName,
          action: dto.action,
          entityName: dto.entityName,
          entityId: dto.entityId,
          beforeState: dto.beforeState ? JSON.stringify(dto.beforeState) : null,
          afterState: dto.afterState ? JSON.stringify(dto.afterState) : null,
          ipAddress: dto.ipAddress || '127.0.0.1',
        },
      });
    } catch (e) {
      console.warn('AuditLog creation warning:', e);
      return null;
    }
  }

  async getLogs(query: {
    tenantId?: string;
    entityName?: string;
    entityId?: string;
    actorId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.entityName) where.entityName = query.entityName;
    if (query.entityId) where.entityId = query.entityId;
    if (query.actorId) where.actorId = query.actorId;
    if (query.search) {
      where.OR = [
        { actorName: { contains: query.search } },
        { action: { contains: query.search } },
        { entityName: { contains: query.search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: {
          actor: {
            select: { id: true, name: true, employeeCode: true, email: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
