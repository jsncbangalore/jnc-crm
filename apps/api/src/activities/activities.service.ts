import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as XLSX from 'xlsx';
import { parseExcelSafely } from '../common/safe-excel-parser';
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

    const isManagerOrAdmin = [
      'platform_super_admin',
      'platform_admin',
      'tenant_admin',
      'administrator',
      'admin',
      'sub_administrator',
      'sub_admin',
      'project_manager',
      'developer_lead',
    ].includes(user.role);

    // Individual contributors see assigned projects or general team projects
    if (!isManagerOrAdmin) {
      return this.prisma.project.findMany({
        where: {
          tenantId,
          OR: [
            { assignments: { some: { userId: user.id } } },
            { createdById: user.id },
            { name: 'General Daily Activities' },
          ],
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

    const isManagerOrAdmin = [
      'platform_super_admin',
      'platform_admin',
      'tenant_admin',
      'administrator',
      'admin',
      'sub_administrator',
      'sub_admin',
      'project_manager',
      'developer_lead',
    ].includes(user.role);

    // Individual contributors can ONLY see their own uploaded logs (privacy protection)
    if (!isManagerOrAdmin) {
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

  // ─── Today's Attendance & Activity Template / Upload ──────────────────────────

  async getTodayTemplate(user: ScopedUser) {
    this.requireProjectAccessRole(user);
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const sampleRows = [
      {
        'Date (YYYY-MM-DD)': todayStr,
        'Employee Code': user.employeeCode || '',
        'Task Summary': 'Completed daily operations and task assignments',
        'Hours Spent': 8,
        'Status': 'Completed',
        'Remarks': 'On schedule',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Activities');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return {
      filename: `daily_activity_template_${todayStr}.xlsx`,
      date: todayStr,
      base64: (buf as Buffer).toString('base64'),
    };
  }

  async uploadTodayTemplate(
    user: ScopedUser,
    file: Express.Multer.File | undefined,
    body?: any,
  ) {
    this.requireProjectAccessRole(user);
    const tenantId = requireTenantId(user);

    let rows: any[] = [];
    const fileName = file?.originalname || 'daily_activity.xlsx';

    if (file) {
      rows = parseExcelSafely(file, { maxSizeBytes: 10 * 1024 * 1024, maxRows: 5000, maxColumns: 100 });
    } else if (body?.records && Array.isArray(body.records)) {
      rows = body.records;
    } else {
      throw new BadRequestException('Please select an Excel file or provide activity rows to upload.');
    }

    if (rows.length === 0) {
      throw new BadRequestException('The spreadsheet has no data rows.');
    }

    // Verify Date: ONLY today's date is allowed!
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`; // YYYY-MM-DD

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rawDate = row['Date (YYYY-MM-DD)'] ?? row['Date'] ?? row['date'] ?? row['logDate'];
      if (!rawDate) {
        throw new BadRequestException(`Row ${i + 1} is missing a Date. Only today's date (${todayStr}) is allowed.`);
      }

      let parsedDateStr = '';
      if (rawDate instanceof Date) {
        const ry = rawDate.getFullYear();
        const rm = String(rawDate.getMonth() + 1).padStart(2, '0');
        const rd = String(rawDate.getDate()).padStart(2, '0');
        parsedDateStr = `${ry}-${rm}-${rd}`;
      } else {
        const s = String(rawDate).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
          parsedDateStr = s.substring(0, 10);
        } else if (/^\d{2}[-/]\d{2}[-/]\d{4}/.test(s)) {
          const parts = s.split(/[-/]/);
          if (parts[2].length === 4) {
            parsedDateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        } else {
          parsedDateStr = s;
        }
      }

      if (parsedDateStr !== todayStr) {
        throw new BadRequestException(
          `Only today's date (${todayStr}) is allowed. Row ${i + 1} has date '${rawDate}'. Yesterday or past dates cannot be entered.`,
        );
      }
    }

    // Find or create default project
    let projectId = body?.projectId;
    if (projectId) {
      await this.findProjectOrFail(projectId, user);
    } else {
      let defaultProject = await this.prisma.project.findFirst({
        where: { tenantId, name: 'General Daily Activities' },
      });
      if (!defaultProject) {
        defaultProject = await this.prisma.project.create({
          data: {
            tenantId,
            name: 'General Daily Activities',
            description: 'Daily team attendance and activity tracking',
            status: 'active',
            createdById: user.id,
          },
        });
      }
      projectId = defaultProject.id;
    }

    const taskSummary =
      body?.taskSummary ||
      rows
        .map((r: any) => r['Task Summary'] || r['Summary'] || r['Task'] || '')
        .filter(Boolean)
        .slice(0, 3)
        .join('; ') ||
      `Daily Attendance & Activity for ${todayStr}`;

    const log = await this.prisma.projectDailyLog.create({
      data: {
        projectId,
        uploadedById: user.id,
        fileName,
        taskSummary: sanitizeHtml(taskSummary),
        recordsJson: JSON.stringify(rows),
        rawPayload: JSON.stringify({ uploadedBy: user.employeeCode, rows: rows.length, date: todayStr }),
      },
      include: {
        uploadedBy: { select: { id: true, name: true, employeeCode: true, role: true } },
      },
    });

    this.logger.log(
      `Daily attendance sheet uploaded for project ${projectId} by ${user.employeeCode} (${user.role}) - ${rows.length} rows for ${todayStr}`,
    );

    return {
      success: true,
      message: `Successfully recorded ${rows.length} activity row(s) for today (${todayStr}).`,
      log,
    };
  }

  // ─── Role Guards ──────────────────────────────────────────────────────────────

  private requireProjectAccessRole(user: ScopedUser) {
    const allowed = [
      'platform_super_admin',
      'platform_admin',
      'tenant_admin',
      'administrator',
      'admin',
      'sub_administrator',
      'sub_admin',
      'project_manager',
      'developer_lead',
      'store_inventory_manager',
      'store_manager',
      'finance_specialist',
      'finance',
      'accountant',
      'sales_representative',
      'employee',
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
