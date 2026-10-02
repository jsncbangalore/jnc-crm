/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopedUser } from '../auth/scoping.service';
import { AuditService } from '../audit/audit.service';

export interface CreateTeamDto {
  name: string;
  allowedPages: string[];
}

export interface UpdateTeamDto {
  name?: string;
  allowedPages?: string[];
}

@Injectable()
export class TeamsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async findAll(creator: ScopedUser) {
    if (creator.role !== 'platform_super_admin' && creator.role !== 'super_admin' && creator.role !== 'tenant_admin' && creator.role !== 'admin') {
      throw new ForbiddenException('Access denied.');
    }

    const tenantId = creator.tenantId || 'default-tenant-id';

    const teams = await this.prisma.team.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { users: true }
        }
      }
    });

    return teams.map(team => ({
      ...team,
      allowedPages: JSON.parse(team.allowedPages || '[]'),
      userCount: team._count.users
    }));
  }

  async createTeam(dto: CreateTeamDto, creator: ScopedUser) {
    if (creator.role !== 'platform_super_admin' && creator.role !== 'super_admin' && creator.role !== 'tenant_admin' && creator.role !== 'admin') {
      throw new ForbiddenException('Access denied.');
    }

    const tenantId = creator.tenantId || 'default-tenant-id';

    const team = await this.prisma.team.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        allowedPages: JSON.stringify(dto.allowedPages || []),
      }
    });

    await this.auditService.log({
      tenantId,
      actorId: creator.id,
      actorName: creator.employeeCode,
      action: 'CREATE',
      entityName: 'Team',
      entityId: team.id,
      afterState: dto,
    });

    return { ...team, allowedPages: JSON.parse(team.allowedPages) };
  }

  async updateTeam(id: string, dto: UpdateTeamDto, creator: ScopedUser) {
    if (creator.role !== 'platform_super_admin' && creator.role !== 'super_admin' && creator.role !== 'tenant_admin' && creator.role !== 'admin') {
      throw new ForbiddenException('Access denied.');
    }

    const tenantId = creator.tenantId || 'default-tenant-id';

    const targetTeam = await this.prisma.team.findFirst({ where: { id, tenantId } });
    if (!targetTeam) throw new NotFoundException('Team not found');

    const updateData: any = {};
    if (dto.name) updateData.name = dto.name.trim();
    if (dto.allowedPages) updateData.allowedPages = JSON.stringify(dto.allowedPages);

    const updated = await this.prisma.team.update({
      where: { id },
      data: updateData,
    });

    await this.auditService.log({
      tenantId,
      actorId: creator.id,
      actorName: creator.employeeCode,
      action: 'UPDATE',
      entityName: 'Team',
      entityId: updated.id,
      afterState: dto,
    });

    return { ...updated, allowedPages: JSON.parse(updated.allowedPages) };
  }
}
