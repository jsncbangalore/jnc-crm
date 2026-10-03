/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InventoryService } from '../inventory/inventory.service';
import { ScopedUser } from '../auth/scoping.service';
import { requireTenantId } from '../common/tenant.util';

export const ALLOWED_STEP_TYPES = [
  'send_email',
  'send_sms',
  'create_in_app_task',
  'update_lead_field',
  'reassign_record',
  'wait_then_continue',
] as const;

export type StepType = typeof ALLOWED_STEP_TYPES[number];

@Injectable()
export class AutomationService implements OnModuleInit {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private inventoryService: InventoryService,
  ) {}

  async onModuleInit() {
    await this.migrateLegacyRulesToSteps();
  }

  /**
   * Migrate existing rules that don't have AutomationSteps yet
   */
  async migrateLegacyRulesToSteps() {
    try {
      const rulesWithoutSteps = await this.prisma.automationRule.findMany({
        where: {
          steps: {
            none: {},
          },
        },
      });

      if (rulesWithoutSteps.length > 0) {
        this.logger.log(`Migrating ${rulesWithoutSteps.length} legacy automation rules to multi-step pipeline...`);
        for (const rule of rulesWithoutSteps) {
          let stepType: StepType = 'send_email';
          if (rule.actionType === 'sms') stepType = 'send_sms';
          else if (rule.actionType === 'in_app_task') stepType = 'create_in_app_task';

          await this.prisma.automationStep.create({
            data: {
              ruleId: rule.id,
              stepOrder: 1,
              stepType,
              config: rule.actionPayloadJson || '{}',
            },
          });
        }
        this.logger.log(`Successfully migrated ${rulesWithoutSteps.length} rules to multi-step architecture.`);
      }
    } catch (err: any) {
      this.logger.warn(`Migration check failed: ${err.message}`);
    }
  }

  /**
   * Validate a step's configuration
   */
  validateStep(step: { stepType: string; config: any; stepOrder?: number }) {
    const stepType = (step.stepType || '').toLowerCase().trim();

    if (stepType === 'whatsapp') {
      throw new BadRequestException('Step type "whatsapp" is strictly prohibited by system security policy.');
    }

    if (!ALLOWED_STEP_TYPES.includes(stepType as StepType)) {
      throw new BadRequestException(
        `Invalid step type "${stepType}". Allowed types: ${ALLOWED_STEP_TYPES.join(', ')}`,
      );
    }

    let parsedConfig: Record<string, any> = {};
    if (typeof step.config === 'string') {
      try {
        parsedConfig = JSON.parse(step.config);
      } catch {
        throw new BadRequestException(`Config for step "${stepType}" must be valid JSON.`);
      }
    } else if (typeof step.config === 'object' && step.config !== null) {
      parsedConfig = step.config;
    }

    // Specific step validations
    if (stepType === 'wait_then_continue') {
      const hours = Number(parsedConfig.duration_hours || parsedConfig.durationHours || parsedConfig.duration_seconds || parsedConfig.durationSeconds);
      if (isNaN(hours) || hours <= 0) {
        throw new BadRequestException('wait_then_continue step requires a positive duration (duration_hours > 0).');
      }
    }

    if (stepType === 'reassign_record') {
      const mode = parsedConfig.mode || 'round_robin';
      if (mode === 'specific_user' && !parsedConfig.user_id && !parsedConfig.userId) {
        throw new BadRequestException('reassign_record with mode "specific_user" requires a valid "user_id".');
      }
    }

    if (stepType === 'update_lead_field') {
      const allowedFields = ['status', 'urgency', 'notes'];
      if (!parsedConfig.field || !allowedFields.includes(parsedConfig.field)) {
        throw new BadRequestException(
          `update_lead_field requires field to be one of: ${allowedFields.join(', ')}`,
        );
      }
    }

    return {
      stepType: stepType as StepType,
      config: JSON.stringify(parsedConfig),
    };
  }

  /**
   * List all automation rules with their ordered steps
   */
  async getAllRules(user: ScopedUser, filter?: { search?: string; triggerEvent?: string; isActive?: boolean }) {
    const tenantId = requireTenantId(user);
    const where: any = { tenantId };

    if (filter?.search) {
      where.OR = [
        { name: { contains: filter.search } },
        { triggerEvent: { contains: filter.search } },
      ];
    }

    if (filter?.triggerEvent) {
      where.triggerEvent = filter.triggerEvent;
    }

    if (filter?.isActive !== undefined) {
      where.isActive = filter.isActive;
    }

    const rules = await this.prisma.automationRule.findMany({
      where,
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return rules;
  }

  /**
   * Get single rule by ID with its ordered steps
   */
  async getRuleById(user: ScopedUser, id: string) {
    const tenantId = requireTenantId(user);
    const rule = await this.prisma.automationRule.findFirst({
      where: { id, tenantId },
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
        },
      },
    });
    if (!rule) {
      throw new NotFoundException(`Automation rule with ID "${id}" not found`);
    }
    return rule;
  }

  /**
   * Create a new automation rule with an ordered sequence of steps
   */
  async createRule(
    user: ScopedUser,
    data: {
      name: string;
      triggerEvent: string;
      conditionJson?: string;
      actionType?: string;
      actionPayloadJson?: string;
      steps?: Array<{ stepType: string; config: any; stepOrder?: number }>;
      isActive?: boolean;
    },
  ) {
    const tenantId = requireTenantId(user);
    if (!data.name || !data.name.trim()) {
      throw new BadRequestException('Rule name is required');
    }
    if (!data.triggerEvent || !data.triggerEvent.trim()) {
      throw new BadRequestException('Trigger event is required');
    }

    // Validate conditions JSON
    let conditionJson = '{}';
    if (data.conditionJson) {
      try {
        JSON.parse(data.conditionJson);
        conditionJson = data.conditionJson;
      } catch {
        throw new BadRequestException('conditionJson must be valid JSON');
      }
    }

    // Process steps
    let stepsToCreate: Array<{ stepOrder: number; stepType: string; config: string }> = [];

    if (data.steps && Array.isArray(data.steps) && data.steps.length > 0) {
      stepsToCreate = data.steps.map((step, idx) => {
        const validated = this.validateStep(step);
        return {
          stepOrder: step.stepOrder !== undefined ? step.stepOrder : idx + 1,
          stepType: validated.stepType,
          config: validated.config,
        };
      });
    } else if (data.actionType) {
      // Legacy single action fallback
      const validated = this.validateStep({
        stepType: data.actionType === 'email' ? 'send_email' : data.actionType === 'sms' ? 'send_sms' : data.actionType,
        config: data.actionPayloadJson || '{}',
      });
      stepsToCreate = [
        {
          stepOrder: 1,
          stepType: validated.stepType,
          config: validated.config,
        },
      ];
    } else {
      throw new BadRequestException('Rule must contain at least one step in the pipeline.');
    }

    const firstStep = stepsToCreate[0];
    const rule = await this.prisma.automationRule.create({
      data: {
        tenantId,
        name: data.name.trim(),
        triggerEvent: data.triggerEvent.trim(),
        conditionJson,
        actionType: firstStep.stepType,
        actionPayloadJson: firstStep.config,
        isActive: data.isActive !== undefined ? data.isActive : true,
        steps: {
          create: stepsToCreate,
        },
      },
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
        },
      },
    });

    this.logger.log(`Created multi-step automation rule: "${rule.name}" with ${rule.steps.length} steps [ID: ${rule.id}]`);
    return rule;
  }

  /**
   * Update existing automation rule and its steps sequence
   */
  async updateRule(
    user: ScopedUser,
    id: string,
    data: {
      name?: string;
      triggerEvent?: string;
      conditionJson?: string;
      steps?: Array<{ stepType: string; config: any; stepOrder?: number }>;
      actionType?: string;
      actionPayloadJson?: string;
      isActive?: boolean;
    },
  ) {
    await this.getRuleById(user, id);

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.triggerEvent !== undefined) updateData.triggerEvent = data.triggerEvent.trim();
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    if (data.conditionJson !== undefined) {
      try {
        JSON.parse(data.conditionJson);
        updateData.conditionJson = data.conditionJson;
      } catch {
        throw new BadRequestException('conditionJson must be valid JSON');
      }
    }

    // If updating steps sequence
    if (data.steps && Array.isArray(data.steps)) {
      if (data.steps.length === 0) {
        throw new BadRequestException('Rule must contain at least one step in the pipeline.');
      }

      const stepsToCreate = data.steps.map((step, idx) => {
        const validated = this.validateStep(step);
        return {
          stepOrder: step.stepOrder !== undefined ? step.stepOrder : idx + 1,
          stepType: validated.stepType,
          config: validated.config,
        };
      });

      // Replace steps transactionally
      await this.prisma.automationStep.deleteMany({ where: { ruleId: id } });
      for (const s of stepsToCreate) {
        await this.prisma.automationStep.create({
          data: {
            ruleId: id,
            stepOrder: s.stepOrder,
            stepType: s.stepType,
            config: s.config,
          },
        });
      }

      updateData.actionType = stepsToCreate[0].stepType;
      updateData.actionPayloadJson = stepsToCreate[0].config;
    }

    const tenantId = requireTenantId(user);
    await this.prisma.automationRule.updateMany({
      where: { id, tenantId },
      data: updateData,
    });
    const updated = await this.getRuleById(user, id);

    this.logger.log(`Updated automation rule: "${updated.name}" [ID: ${id}]`);
    return updated;
  }

  /**
   * Toggle rule active/inactive state
   */
  async toggleRuleActive(user: ScopedUser, id: string, targetActive?: boolean) {
    const tenantId = requireTenantId(user);
    const existing = await this.getRuleById(user, id);
    const newActiveState = targetActive !== undefined ? targetActive : !existing.isActive;

    await this.prisma.automationRule.updateMany({
      where: { id, tenantId },
      data: { isActive: newActiveState },
    });
    const updated = await this.getRuleById(user, id);

    this.logger.log(`Toggled rule "${updated.name}" active state -> ${newActiveState}`);
    return updated;
  }

  /**
   * Delete rule and all its steps (cascade)
   */
  async deleteRule(user: ScopedUser, id: string) {
    const tenantId = requireTenantId(user);
    const existing = await this.getRuleById(user, id);
    await this.prisma.automationRule.deleteMany({ where: { id, tenantId } });
    this.logger.log(`Deleted automation rule: "${existing.name}" [ID: ${id}]`);
    return { success: true, message: `Rule "${existing.name}" deleted successfully` };
  }

  /**
   * Automation dashboard metrics
   */
  async getMetrics(user: ScopedUser) {
    const tenantId = requireTenantId(user);
    const rules = await this.prisma.automationRule.findMany({
      where: { tenantId },
      include: { steps: true },
    });
    const totalRules = rules.length;
    const activeRules = rules.filter((r) => r.isActive).length;
    const pausedRules = totalRules - activeRules;

    const byActionType: Record<string, number> = {
      send_email: 0,
      send_sms: 0,
      create_in_app_task: 0,
      update_lead_field: 0,
      reassign_record: 0,
      wait_then_continue: 0,
    };

    rules.forEach((r) => {
      r.steps.forEach((s) => {
        byActionType[s.stepType] = (byActionType[s.stepType] || 0) + 1;
      });
    });

    const byTrigger = rules.reduce((acc, r) => {
      acc[r.triggerEvent] = (acc[r.triggerEvent] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalRules,
      activeRules,
      pausedRules,
      byActionType,
      byTrigger,
    };
  }

  /**
   * Evaluate and fire all active automation rules for a given trigger event
   * Includes infinite loop prevention and call-depth limiter
   */
  async evaluateRules(triggerEvent: string, context: Record<string, any>) {
    // Infinite-loop prevention: call-depth limit
    const currentDepth = context._depth || 0;
    const MAX_AUTOMATION_DEPTH = 3;

    if (currentDepth >= MAX_AUTOMATION_DEPTH) {
      this.logger.warn(
        `AUTOMATION CASCADE GUARD: Aborted rule evaluation for "${triggerEvent}" at depth ${currentDepth} on entity "${context.leadId || context.entityId}" to prevent recursive infinite loops.`,
      );
      return;
    }

    const tenantId = context.tenantId;
    if (!tenantId) {
      this.logger.warn(`AUTOMATION GUARD: Trigger event "${triggerEvent}" aborted: missing tenantId in context`);
      return;
    }

    const where: any = { triggerEvent, isActive: true, tenantId };

    const rules = await this.prisma.automationRule.findMany({
      where,
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
        },
      },
    });

    for (const rule of rules) {
      try {
        // Self-trigger cycle guard: do not re-trigger the same rule within the same cycle
        if (context._visitedRuleIds && context._visitedRuleIds.includes(rule.id)) {
          this.logger.warn(`AUTOMATION CYCLE GUARD: Skipping rule "${rule.name}" [ID: ${rule.id}] to prevent self-trigger loop.`);
          continue;
        }

        let condition: Record<string, any> = {};
        try { condition = JSON.parse(rule.conditionJson); } catch {}

        const matches = this.evaluateCondition(condition, context);
        if (!matches) continue;

        const executionContext = {
          ...context,
          _depth: currentDepth + 1,
          _visitedRuleIds: [...(context._visitedRuleIds || []), rule.id],
        };

        this.logger.log(`Rule "${rule.name}" triggered by event "${triggerEvent}" (depth: ${currentDepth}) -> executing ${rule.steps.length} steps`);
        await this.executeStepSequence(rule, rule.steps, 0, executionContext);
      } catch (err: any) {
        this.logger.error(`Rule "${rule.name}" execution failed: ${err.message}`);
      }
    }
  }

  /**
   * Execute an ordered sequence of steps starting from a specific index
   */
  async executeStepSequence(
    rule: any,
    steps: any[],
    startIndex: number,
    context: Record<string, any>,
  ) {
    for (let i = startIndex; i < steps.length; i++) {
      const step = steps[i];
      let config: Record<string, any> = {};
      try {
        config = JSON.parse(step.config);
      } catch {}

      this.logger.log(`Executing Step #${step.stepOrder} (${step.stepType}) for rule "${rule.name}"`);

      if (step.stepType === 'wait_then_continue') {
        const hours = Number(config.duration_hours || config.durationHours || 0);
        const seconds = Number(config.duration_seconds || config.durationSeconds || 0);
        const msDelay = hours > 0 ? hours * 3600 * 1000 : (seconds > 0 ? seconds * 1000 : 3600 * 1000);
        const executeAt = new Date(Date.now() + msDelay);

        const delayedJob = await this.prisma.delayedAutomationJob.create({
          data: {
            ruleId: rule.id,
            stepIndex: i + 1,
            entityType: context.entityType || 'Lead',
            entityId: context.leadId || context.entityId || 'general',
            contextJson: JSON.stringify(context),
            executeAt,
            status: 'pending',
          },
        });

        this.logger.log(
          `Step #${step.stepOrder} wait_then_continue -> scheduled DelayedJob [ID: ${delayedJob.id}] to execute at ${executeAt.toISOString()}`,
        );
        // Break immediate execution loop: remaining steps deferred until delayed job runs
        return {
          deferred: true,
          delayedJobId: delayedJob.id,
          executeAt,
        };
      }

      await this.executeSingleStep(step.stepType as StepType, config, context, rule);
    }

    return { completed: true };
  }

  /**
   * Execute an individual step with full AuditLog & LeadActivity persistence
   */
  private async executeSingleStep(
    stepType: StepType,
    config: Record<string, any>,
    context: Record<string, any>,
    rule?: any,
  ) {
    const tenantId = context.tenantId || rule?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required for automated workflow step execution');
    }

    switch (stepType) {
      case 'send_email': {
        let recipientEmail = config.to;
        if (!recipientEmail) {
          if (config.recipient === 'admin') {
            const admin = await this.prisma.user.findFirst({
              where: {
                role: { in: ['tenant_admin', 'admin'] },
                isActive: true,
                tenantId,
              },
            });
            recipientEmail = admin?.email || 'admin@jsnc.co.in';
          } else if (config.recipient === 'assigned_employee') {
            if (context.assignedToId) {
              const rep = await this.prisma.user.findFirst({
                where: { id: context.assignedToId, tenantId },
              });
              recipientEmail = rep?.email;
            }
          } else {
            recipientEmail = context.customerEmail || context.email;
          }
        }

        if (recipientEmail) {
          await this.notificationsService.sendEmail({
            to: recipientEmail,
            subject: this.interpolate(config.subject || 'Notification from JNC CRM', context),
            html: this.interpolate(config.html || config.body || 'No message body', context),
            relatedEntityType: context.entityType,
            relatedEntityId: context.entityId || context.leadId,
          });
        }
        break;
      }

      case 'send_sms': {
        let phone = config.phone || context.customerPhone || context.phone;
        if (config.recipient === 'assigned_employee' && context.assignedToId) {
          const rep = await this.prisma.user.findFirst({
            where: { id: context.assignedToId, tenantId },
          });
          phone = rep?.phone || phone;
        }

        const messageText = this.interpolate(config.message || config.body || '', context);
        if (phone && messageText) {
          await this.notificationsService.sendSms(phone, messageText);
        }
        break;
      }

      case 'create_in_app_task': {
        const leadId = context.leadId || context.entityId;
        if (leadId) {
          let assigneeId = config.assigneeId || config.user_id || config.userId;
          if (!assigneeId) {
            if (config.recipient === 'admin') {
              const admin = await this.prisma.user.findFirst({
                where: {
                  role: { in: ['tenant_admin', 'admin'] },
                  isActive: true,
                  tenantId,
                },
              });
              assigneeId = admin?.id;
            } else {
              assigneeId = context.assignedToId;
            }
          }

          await this.notificationsService.createInAppTask({
            leadId,
            userId: assigneeId,
            title: this.interpolate(config.title || 'Automation Follow-up Task', context),
            description: this.interpolate(config.description || '', context),
          });
        }
        break;
      }

      case 'update_lead_field': {
        const leadId = context.leadId || context.entityId;
        if (leadId && config.field) {
          const field = config.field;
          const value = this.interpolate(String(config.value ?? ''), context);

          if (field === 'status' || field === 'urgency' || field === 'notes') {
            const currentLead = await this.prisma.lead.findFirst({
              where: { id: leadId, tenantId },
            });
            const previousValue = (currentLead as any)?.[field] ?? '';

            await this.prisma.lead.updateMany({
              where: { id: leadId, tenantId },
              data: { [field]: value },
            });

            context[field] = value; // update in-memory context for downstream steps

            // 1. Write AuditLog entry
            await this.prisma.auditLog.create({
              data: {
                action: 'AUTOMATION_UPDATE',
                entityName: 'Lead',
                entityId: leadId,
                actorName: 'Automation Engine',
                beforeState: JSON.stringify({ [field]: previousValue }),
                afterState: JSON.stringify({ [field]: value }),
              },
            });

            // 2. Write LeadActivity entry
            await this.prisma.leadActivity.create({
              data: {
                leadId,
                type: 'system',
                title: `Automated Lead Update [${rule?.name || 'Workflow Rule'}]: ${field} set to "${value}"`,
                description: `Field "${field}" changed from "${previousValue}" to "${value}" via automated workflow step.`,
                isCompleted: true,
              },
            });

            this.logger.log(`Updated Lead [ID: ${leadId}] field "${field}" -> "${value}" (AuditLog & LeadActivity persisted)`);
          }
        }
        break;
      }

      case 'reassign_record': {
        const leadId = context.leadId || context.entityId;
        if (leadId) {
          const mode = config.mode || 'round_robin';
          let targetUserId: string | null = null;

          const currentLead = await this.prisma.lead.findFirst({
            where: { id: leadId, tenantId },
          });
          const prevAssignedId = currentLead?.assignedToId;

          if (mode === 'specific_user') {
            targetUserId = config.user_id || config.userId;
          } else if (mode === 'round_robin') {
            // Pick next active sales rep
            const employees = await this.prisma.user.findMany({
              where: {
                role: 'employee',
                isActive: true,
                deletedAt: null,
                tenantId,
              },
              orderBy: { createdAt: 'asc' },
            });
            if (employees.length > 0) {
              const currIdx = employees.findIndex((e) => e.id === context.assignedToId || e.id === prevAssignedId);
              const nextIdx = (currIdx + 1) % employees.length;
              targetUserId = employees[nextIdx].id;
            }
          }

          if (targetUserId) {
            const targetUser = await this.prisma.user.findFirst({
              where: { id: targetUserId, tenantId },
            });

            await this.prisma.lead.updateMany({
              where: { id: leadId, tenantId },
              data: { assignedToId: targetUserId },
            });
            context.assignedToId = targetUserId;

            // 1. Write AuditLog
            await this.prisma.auditLog.create({
              data: {
                action: 'AUTOMATION_REASSIGN',
                entityName: 'Lead',
                entityId: leadId,
                actorName: 'Automation Engine',
                beforeState: JSON.stringify({ assignedToId: prevAssignedId }),
                afterState: JSON.stringify({ assignedToId: targetUserId, targetUserName: targetUser?.name }),
              },
            });

            // 2. Write LeadActivity
            await this.prisma.leadActivity.create({
              data: {
                leadId,
                type: 'system',
                title: `Automated Lead Reassignment [${rule?.name || 'Workflow Rule'}]: Reassigned to ${targetUser?.name || targetUserId}`,
                description: `Lead reassigned via "${mode}" strategy.`,
                isCompleted: true,
              },
            });

            this.logger.log(`Reassigned Lead [ID: ${leadId}] to User [ID: ${targetUserId}] via mode "${mode}" (AuditLog persisted)`);
          }
        }
        break;
      }
    }
  }

  /**
   * Process due delayed automation jobs
   */
  async processDelayedJobs() {
    const now = new Date();
    const dueJobs = await this.prisma.delayedAutomationJob.findMany({
      where: {
        status: 'pending',
        executeAt: { lte: now },
      },
    });

    const results = [];
    for (const job of dueJobs) {
      try {
        const rule = await this.prisma.automationRule.findUnique({
          where: { id: job.ruleId },
          include: { steps: { orderBy: { stepOrder: 'asc' } } },
        });

        if (!rule || !rule.isActive) {
          await this.prisma.delayedAutomationJob.update({
            where: { id: job.id },
            data: { status: 'cancelled' },
          });
          continue;
        }

        let context: Record<string, any> = {};
        try {
          context = JSON.parse(job.contextJson);
        } catch {}

        this.logger.log(`Resuming DelayedJob [ID: ${job.id}] for rule "${rule.name}" from step #${job.stepIndex}`);
        await this.executeStepSequence(rule, rule.steps, job.stepIndex, context);

        await this.prisma.delayedAutomationJob.update({
          where: { id: job.id },
          data: { status: 'completed', completedAt: new Date() },
        });

        results.push({ id: job.id, status: 'completed' });
      } catch (err: any) {
        this.logger.error(`Failed to process delayed job ${job.id}: ${err.message}`);
        await this.prisma.delayedAutomationJob.update({
          where: { id: job.id },
          data: { status: 'failed' },
        });
      }
    }

    return { processedCount: results.length, jobs: results };
  }

  /**
   * Condition evaluation helper
   */
  private evaluateCondition(condition: any, context: Record<string, any>): boolean {
    if (!condition || Object.keys(condition).length === 0) {
      return true;
    }

    if (Array.isArray(condition)) {
      return condition.every((cond) => this.evaluateSingleCondition(cond.field, cond.operator, cond.value, context));
    }

    for (const [key, value] of Object.entries(condition)) {
      if (typeof value === 'object' && value !== null && 'operator' in value) {
        const valObj = value as { operator: string; value: any };
        if (!this.evaluateSingleCondition(key, valObj.operator, valObj.value, context)) return false;
      } else if (typeof value === 'object' && value !== null && '$gt' in value) {
        if (Number(context[key]) <= Number((value as any).$gt)) return false;
      } else if (typeof value === 'object' && value !== null && '$gte' in value) {
        if (Number(context[key]) < Number((value as any).$gte)) return false;
      } else if (typeof value === 'object' && value !== null && '$lt' in value) {
        if (Number(context[key]) >= Number((value as any).$lt)) return false;
      } else if (typeof value === 'object' && value !== null && '$lte' in value) {
        if (Number(context[key]) > Number((value as any).$lte)) return false;
      } else if (context[key] !== value && String(context[key]) !== String(value)) {
        return false;
      }
    }
    return true;
  }

  private evaluateSingleCondition(field: string, operator: string, value: any, context: Record<string, any>): boolean {
    const actual = context[field];
    const op = (operator || 'equals').toLowerCase();

    switch (op) {
      case 'equals':
      case 'eq':
      case '==':
        return String(actual ?? '').toLowerCase() === String(value ?? '').toLowerCase();
      case 'not_equals':
      case 'ne':
      case '!=':
        return String(actual ?? '').toLowerCase() !== String(value ?? '').toLowerCase();
      case 'greater_than':
      case 'gt':
      case '>':
        return Number(actual) > Number(value);
      case 'greater_than_or_equal':
      case 'gte':
      case '>=':
        return Number(actual) >= Number(value);
      case 'less_than':
      case 'lt':
      case '<':
        return Number(actual) < Number(value);
      case 'less_than_or_equal':
      case 'lte':
      case '<=':
        return Number(actual) <= Number(value);
      case 'contains':
        return String(actual ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
      case 'not_contains':
        return !String(actual ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
      case 'in':
        if (Array.isArray(value)) {
          return value.map(String).includes(String(actual));
        }
        return String(value).split(',').map((s) => s.trim()).includes(String(actual));
      default:
        return String(actual) === String(value);
    }
  }

  private interpolate(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(context[key] || ''));
  }

  /**
   * Nightly reorder check
   */
  async runNightlyReorderCheck() {
    this.logger.log('Running nightly reorder check...');
    const alerts = await this.inventoryService.getReorderAlerts();

    if (alerts.length === 0) {
      this.logger.log('All SKUs are above reorder threshold. No alerts to send.');
      return { alertsCount: 0 };
    }

    const admins = await this.prisma.user.findMany({
      where: { role: { in: ['tenant_admin', 'admin'] }, isActive: true },
      select: { email: true, name: true },
    });

    const alertTableRows = alerts
      .map(
        (a) => `
        <tr>
          <td style="padding:8px; border:1px solid #eee;">${a.sku.skuCode}</td>
          <td style="padding:8px; border:1px solid #eee;">${a.sku.name}</td>
          <td style="padding:8px; border:1px solid #eee;">${a.totalOnHand}</td>
          <td style="padding:8px; border:1px solid #eee;">${a.sku.reorderPoint}</td>
          <td style="padding:8px; border:1px solid #eee;">${a.sku.reorderQty}</td>
          <td style="padding:8px; border:1px solid #eee;">${(a.sku as any).preferredSupplier?.name || 'No preferred supplier'}</td>
          <td style="padding:8px; border:1px solid #eee;">${(a.sku as any).preferredSupplier?.phone || '-'}</td>
        </tr>
      `,
      )
      .join('');

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <div style="background: #FF5A5F; color: white; padding: 20px;">
          <h2>JNC-CRM: Low Stock Alert — ${new Date().toLocaleDateString('en-IN')}</h2>
        </div>
        <div style="padding: 20px;">
          <p><strong>${alerts.length} SKU(s)</strong> are below their reorder point and require attention.</p>
          <table style="width:100%; border-collapse:collapse; margin-top:16px;">
            <thead>
              <tr style="background:#f0f0f0;">
                <th style="padding:8px; border:1px solid #eee; text-align:left;">SKU Code</th>
                <th style="padding:8px; border:1px solid #eee; text-align:left;">Name</th>
                <th style="padding:8px; border:1px solid #eee; text-align:left;">On Hand</th>
                <th style="padding:8px; border:1px solid #eee; text-align:left;">Reorder Point</th>
                <th style="padding:8px; border:1px solid #eee; text-align:left;">Reorder Qty</th>
                <th style="padding:8px; border:1px solid #eee; text-align:left;">Preferred Supplier</th>
                <th style="padding:8px; border:1px solid #eee; text-align:left;">Supplier Phone</th>
              </tr>
            </thead>
            <tbody>${alertTableRows}</tbody>
          </table>
          <p style="margin-top:20px;">Please contact suppliers directly via phone or email to place orders.</p>
          <p><strong>JNC Network CRM — Automated Inventory Alert</strong></p>
        </div>
      </div>
    `;

    for (const admin of admins) {
      await this.notificationsService.sendEmail({
        to: admin.email,
        subject: `[JNC-CRM] Low Stock Alert — ${alerts.length} SKUs require reorder`,
        html: emailHtml,
        relatedEntityType: 'inventory',
        relatedEntityId: 'reorder_check',
      });
    }

    return { alertsCount: alerts.length, emailedAdmins: admins.length };
  }
}
