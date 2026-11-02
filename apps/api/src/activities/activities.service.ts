import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopedUser } from '../auth/scoping.service';
import { requireTenantId } from '../common/tenant.util';
import { sanitizeHtml } from '../common/html-sanitize.util';


@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Projects ────────────────────────────────────────────────────────────────

  async listProjects(user: ScopedUser) {
    this.requireProjectAccessRole(user);
    const tenantId = requireTenantId(user);

    // Individual Developers see ONLY projects they are assigned to within tenant
    if (user.role === 'developer') {
      return this.prisma.project.findMany({
        where: {
          tenantId,
          assignments: {
            some: { userId: user.id },
          },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, name: true, employeeCode: true, email: true } },
          assignments: {
            include: {
              user: { select: { id: true, name: true, employeeCode: true, role: true, email: true } },
            },
          },
          _count: { select: { dailyLogs: true } },
        },
      });
    }

    // Super Admin, Tenant Admin, Admin, Project Manager, Developer Lead, Sub Admin see all projects within tenant
    return this.prisma.project.findMany({
      where: { tenantId },
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true, employeeCode: true, email: true } },
        assignments: {
          include: {
            user: { select: { id: true, name: true, employeeCode: true, role: true, email: true } },
          },
        },
        _count: { select: { dailyLogs: true } },
      },
    });
  }

  async createProject(user: ScopedUser, dto: { name: string; description?: string; status?: string }) {
    this.requireProjectCreationRole(user);
    const tenantId = requireTenantId(user);
    return this.prisma.project.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        status: dto.status || 'active',
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, employeeCode: true } },
        assignments: {
          include: {
            user: { select: { id: true, name: true, employeeCode: true, role: true } },
          },
        },
      },
    });
  }

  async updateProject(
    user: ScopedUser,
    id: string,
    dto: { name?: string; description?: string; status?: string },
  ) {
    this.requireProjectCreationRole(user);
    const tenantId = requireTenantId(user);
    const res = await this.prisma.project.updateMany({
      where: { id, tenantId },
      data: {
        name: dto.name?.trim(),
        description: dto.description?.trim(),
        status: dto.status,
      },
    });
    if (res.count === 0) throw new NotFoundException('Project not found');
    return this.findProjectOrFail(id, user);
  }

  async deleteProject(user: ScopedUser, id: string) {
    this.requireSuperAdminOrAdmin(user);
    const tenantId = requireTenantId(user);
    const res = await this.prisma.project.deleteMany({ where: { id, tenantId } });
    if (res.count === 0) throw new NotFoundException('Project not found');
    return { success: true };
  }

  // ─── Member Assignment (Developer Lead & Project Manager Access) ─────────────

  async getAssignableUsers(user: ScopedUser) {
    this.requireAssignmentRole(user);
    const tenantId = requireTenantId(user);
    return this.prisma.user.findMany({
      where: {
        tenantId,
        role: { in: ['sub_admin', 'project_manager', 'developer_lead', 'developer', 'employee'] },
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        employeeCode: true,
        role: true,
        email: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async assignMembers(user: ScopedUser, projectId: string, memberIds: string[]) {
    this.requireAssignmentRole(user);
    await this.findProjectOrFail(projectId, user);

    const tenantId = requireTenantId(user);

    // Delete existing assignments for this project
    await this.prisma.projectAssignment.deleteMany({
      where: { projectId },
    });

    // Create new assignments (strictly validated for this tenant)
    if (memberIds && memberIds.length > 0) {
      const validUsers = await this.prisma.user.findMany({
        where: { id: { in: memberIds }, tenantId, deletedAt: null },
        select: { id: true },
      });
      const validUserIds = validUsers.map((u) => u.id);

      if (validUserIds.length > 0) {
        await this.prisma.projectAssignment.createMany({
          data: validUserIds.map((userId) => ({
            projectId,
            userId,
            assignedById: user.id,
          })),
        });
      }
    }
    return this.prisma.project.findFirst({
      where: { id: projectId, tenantId },
      include: {
        assignments: {
          include: {
            user: { select: { id: true, name: true, employeeCode: true, role: true, email: true } },
          },
        },
      },
    });
  }

  // ─── Daily Logs ───────────────────────────────────────────────────────────────

  async listLogs(user: ScopedUser, projectId: string) {
    this.requireProjectAccessRole(user);
    await this.findProjectOrFail(projectId, user);

    // Individual Developer can ONLY see their own uploaded logs
    if (user.role === 'developer') {
      return this.prisma.projectDailyLog.findMany({
        where: {
          projectId,
          uploadedById: user.id,
        },
        orderBy: { logDate: 'desc' },
        include: {
          uploadedBy: { select: { id: true, name: true, employeeCode: true, role: true, email: true } },
        },
      });
    }

    // Super Admin, Admin, Project Manager, Developer Lead see ALL daily activity logs for this project
    return this.prisma.projectDailyLog.findMany({
      where: { projectId },
      orderBy: { logDate: 'desc' },
      include: {
        uploadedBy: { select: { id: true, name: true, employeeCode: true, role: true, email: true } },
      },
    });
  }

  async createLog(
    user: ScopedUser,
    projectId: string,
    dto: { fileName?: string; taskSummary?: string; records: any[] },
  ) {
    this.requireProjectAccessRole(user);
    await this.findProjectOrFail(projectId, user);

    // Check if developer is assigned to project if role is developer
    if (user.role === 'developer') {
      const assignment = await this.prisma.projectAssignment.findFirst({
        where: { projectId, userId: user.id },
      });
      if (!assignment) {
        throw new ForbiddenException('You are not assigned to this project.');
      }
    }

    const log = await this.prisma.projectDailyLog.create({
      data: {
        projectId,
        uploadedById: user.id,
        fileName: dto.fileName,
        taskSummary: sanitizeHtml(dto.taskSummary),
        recordsJson: JSON.stringify(dto.records),

        rawPayload: JSON.stringify({ uploadedBy: user.employeeCode, rows: dto.records.length }),
      },
      include: {
        uploadedBy: { select: { id: true, name: true, employeeCode: true, role: true } },
      },
    });

    this.logger.log(
      `Daily log submitted for project ${projectId} by ${user.employeeCode} (${user.role})`,
    );
    return log;
  }

  async deleteLog(user: ScopedUser, projectId: string, logId: string) {
    this.requireSuperAdminOrAdmin(user);
    await this.findProjectOrFail(projectId, user);
    const log = await this.prisma.projectDailyLog.findFirst({
      where: { id: logId, projectId },
    });
    if (!log) throw new NotFoundException('Daily log not found.');
    return this.prisma.projectDailyLog.deleteMany({ where: { id: logId, projectId } });
  }

  // ─── Role Guards ──────────────────────────────────────────────────────────────

  private requireProjectAccessRole(user: ScopedUser) {
    const allowed = [
      'platform_super_admin',
      'tenant_admin',
      'admin',
      'sub_admin',
      'project_manager',
      'developer_lead',
      'developer',
    ];
    if (!allowed.includes(user.role)) {
      throw new ForbiddenException('Access restricted to Project Team members.');
    }
  }

  private requireProjectCreationRole(user: ScopedUser) {
    const allowed = ['platform_super_admin', 'tenant_admin', 'admin', 'sub_admin', 'project_manager'];
    if (!allowed.includes(user.role)) {
      throw new ForbiddenException('Only Project Managers and Admins can create or edit projects.');
    }
  }

  private requireAssignmentRole(user: ScopedUser) {
    const allowed = ['platform_super_admin', 'tenant_admin', 'admin', 'sub_admin', 'developer_lead', 'project_manager'];
    if (!allowed.includes(user.role)) {
      throw new ForbiddenException('Only Developer Leads, Project Managers, and Admins can assign developers.');
    }
  }

  private requireSuperAdminOrAdmin(user: ScopedUser) {
    if (user.role !== 'platform_super_admin' && user.role !== 'tenant_admin' && user.role !== 'admin' && user.role !== 'sub_admin') {
      throw new ForbiddenException('Only Tenant Admin or Admin can delete records.');
    }
  }

  private async findProjectOrFail(id: string, user?: ScopedUser) {
    const tenantId = requireTenantId(user);
    const project = await this.prisma.project.findFirst({
      where: { id, tenantId },
    });
    if (!project) throw new NotFoundException(`Project not found.`);
    return project;
  }
}
