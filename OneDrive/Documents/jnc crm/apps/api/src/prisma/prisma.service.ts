/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, OnModuleInit, OnModuleDestroy, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export function resolveDatabaseUrl(): string {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl || !rawUrl.trim()) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  return rawUrl;
}

const PRE_MIGRATION_USER_COLUMNS: Record<string, boolean> = {
  id: true,
  tenantId: true,
  employeeCode: true,
  name: true,
  email: true,
  passwordHash: true,
  role: true,
  teamId: true,
  team: true,
  warehouseId: true,
  phone: true,
  isActive: true,
  mustResetPassword: true,
  lastLoginAt: true,
  failedLoginAttempts: true,
  lockoutUntil: true,
  tokenVersion: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
};

const PRE_MIGRATION_MAIL_ACCOUNT_COLUMNS: Record<string, boolean> = {
  id: true,
  tenantId: true,
  name: true,
  email: true,
  senderName: true,
  smtpHost: true,
  smtpPort: true,
  smtpUser: true,
  smtpPass: true,
  isSecure: true,
  purpose: true,
  isActive: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
};

const PRE_MIGRATION_TENANT_COLUMNS: Record<string, boolean> = {
  id: true,
  code: true,
  name: true,
  slug: true,
  status: true,
  planTier: true,
  maxUsers: true,
  logoUrl: true,
  phone: true,
  email: true,
  address: true,
  city: true,
  state: true,
  pincode: true,
  website: true,
  gstin: true,
  pan: true,
  currency: true,
  lutBondNo: true,
  lutValidity: true,
  invoicePrefix: true,
  invoiceTerms: true,
  bankName: true,
  bankAccountNumber: true,
  bankIfsc: true,
  bankBranch: true,
  bankUpi: true,
  signatoryName: true,
  signatoryDesignation: true,
  signatureUrl: true,
  stampUrl: true,
  isOnboarded: true,
  isInternal: true,
  webhookKeyHash: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  scheduledDeletionDate: true,
  deletionConfirmToken: true,
};

const PRE_MIGRATION_REFRESH_SESSION_COLUMNS: Record<string, boolean> = {
  id: true,
  userId: true,
  tokenHash: true,
  familyId: true,
  isRevoked: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
};

function sanitizeRelation(k: string, v: any): any {
  if (k === 'tenant') {
    if (v === true) return { select: { ...PRE_MIGRATION_TENANT_COLUMNS } };
    if (v && typeof v === 'object') {
      const select = v.select ? { ...v.select } : { ...PRE_MIGRATION_TENANT_COLUMNS };
      delete select.requireTwoFactor;
      return { ...v, select };
    }
  }
  if (['user', 'users', 'createdBy', 'assignedTo', 'assignee', 'author'].includes(k)) {
    if (v === true) return { select: { ...PRE_MIGRATION_USER_COLUMNS } };
    if (v && typeof v === 'object') {
      const select = v.select ? { ...v.select } : { ...PRE_MIGRATION_USER_COLUMNS };
      delete select.lastPasswordChangeAt;
      delete select.photoUrl;
      delete select.firstLoginAfter2FaReleaseAt;
      delete select.twoFactor;
      return { ...v, select };
    }
  }
  if (k === 'mailAccount' || k === 'mailAccounts') {
    if (v === true) return { select: { ...PRE_MIGRATION_MAIL_ACCOUNT_COLUMNS } };
    if (v && typeof v === 'object') {
      const select = v.select ? { ...v.select } : { ...PRE_MIGRATION_MAIL_ACCOUNT_COLUMNS };
      delete select.encryption;
      return { ...v, select };
    }
  }
  if (k === 'refreshSession' || k === 'refreshSessions') {
    if (v === true) return { select: { ...PRE_MIGRATION_REFRESH_SESSION_COLUMNS } };
    if (v && typeof v === 'object') {
      const select = v.select ? { ...v.select } : { ...PRE_MIGRATION_REFRESH_SESSION_COLUMNS };
      delete select.deviceLabel;
      delete select.userAgent;
      delete select.ipAddress;
      delete select.lastUsedAt;
      return { ...v, select };
    }
  }
  return v;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  // In-memory backing store for models whose tables have not yet been migrated to the database
  private memStore = {
    otpChallenges: [] as any[],
    resetTickets: [] as any[],
    emailOutboxes: [] as any[],
    userTwoFactors: [] as any[],
    trustedDevices: [] as any[],
    loginTickets: [] as any[],
  };

  constructor() {
    super({
      datasources: {
        db: {
          url: resolveDatabaseUrl(),
        },
      },
    });
  }

  async onModuleInit() {
    // 1. AuditLog immutability
    this.$use(async (params, next) => {
      if (params.model === 'AuditLog') {
        if (['update', 'updateMany', 'delete', 'deleteMany', 'upsert'].includes(params.action)) {
          throw new ForbiddenException('AuditLog records are strictly append-only and cannot be updated or deleted.');
        }
      }
      return next(params);
    });

    // 2. Pre-Migration Backward Compatibility Middleware:
    // Intercepts queries when database is running on pre-migration schema so localhost runs cleanly without 500 errors.
    this.$use(async (params, next) => {
      const model = params.model;
      const action = params.action;

      // Sanitize include and select relations globally for all models
      if (params.args?.include) {
        for (const [k, v] of Object.entries(params.args.include)) {
          if (k === 'twoFactor') continue;
          if (v) params.args.include[k] = sanitizeRelation(k, v);
        }
      }
      if (params.args?.select) {
        for (const [k, v] of Object.entries(params.args.select)) {
          if (v && typeof v === 'object') {
            params.args.select[k] = sanitizeRelation(k, v);
          }
        }
      }

      // Handle User queries
      if (model === 'User') {
        if (!params.args) params.args = {};
        const hadInclude = params.args.include;
        const hadSelect = params.args.select;

        if (['findMany', 'findFirst', 'findUnique', 'create', 'update', 'upsert'].includes(action)) {
          if (!hadSelect) {
            const select: Record<string, any> = { ...PRE_MIGRATION_USER_COLUMNS };
            if (hadInclude) {
              for (const [k, v] of Object.entries(hadInclude)) {
                if (k !== 'twoFactor' && v) select[k] = sanitizeRelation(k, v);
              }
              delete params.args.include;
            }
            params.args.select = select;
          } else {
            delete params.args.select.lastPasswordChangeAt;
            delete params.args.select.photoUrl;
            delete params.args.select.firstLoginAfter2FaReleaseAt;
            delete params.args.select.twoFactor;
          }
        }

        if (params.args.data) {
          delete params.args.data.lastPasswordChangeAt;
          delete params.args.data.photoUrl;
          delete params.args.data.firstLoginAfter2FaReleaseAt;
        }
        if (params.args.create) {
          delete params.args.create.lastPasswordChangeAt;
          delete params.args.create.photoUrl;
          delete params.args.create.firstLoginAfter2FaReleaseAt;
        }
        if (params.args.update) {
          delete params.args.update.lastPasswordChangeAt;
          delete params.args.update.photoUrl;
          delete params.args.update.firstLoginAfter2FaReleaseAt;
        }

        let result = await next(params);

        const attachUserDefaults = (u: any) => {
          if (!u || typeof u !== 'object') return u;
          if (u.photoUrl === undefined) u.photoUrl = null;
          if (u.lastPasswordChangeAt === undefined) u.lastPasswordChangeAt = null;
          if (u.firstLoginAfter2FaReleaseAt === undefined) u.firstLoginAfter2FaReleaseAt = null;
          if (u.tenant && typeof u.tenant === 'object' && u.tenant.requireTwoFactor === undefined) {
            u.tenant.requireTwoFactor = false;
          }
          if (hadInclude?.twoFactor || hadSelect?.twoFactor) {
            u.twoFactor = this.memStore.userTwoFactors.find((t) => t.userId === u.id) || null;
          }
          return u;
        };

        return Array.isArray(result) ? result.map(attachUserDefaults) : attachUserDefaults(result);
      }

      // Handle Tenant queries
      if (model === 'Tenant') {
        if (!params.args) params.args = {};
        const hadInclude = params.args.include;

        if (['findMany', 'findFirst', 'findUnique', 'create', 'update', 'upsert'].includes(action)) {
          if (!params.args.select) {
            const select: Record<string, any> = { ...PRE_MIGRATION_TENANT_COLUMNS };
            if (hadInclude) {
              for (const [k, v] of Object.entries(hadInclude)) {
                if (v) select[k] = sanitizeRelation(k, v);
              }
              delete params.args.include;
            }
            params.args.select = select;
          } else {
            delete params.args.select.requireTwoFactor;
          }
        }

        if (params.args.data) delete params.args.data.requireTwoFactor;
        if (params.args.create) delete params.args.create.requireTwoFactor;
        if (params.args.update) delete params.args.update.requireTwoFactor;

        let result = await next(params);

        const addTenantDefaults = (t: any) => {
          if (!t || typeof t !== 'object') return t;
          if (t.requireTwoFactor === undefined) {
            t.requireTwoFactor = false;
          }
          return t;
        };

        return Array.isArray(result) ? result.map(addTenantDefaults) : addTenantDefaults(result);
      }

      // Handle RefreshSession queries
      if (model === 'RefreshSession') {
        if (!params.args) params.args = {};
        const hadInclude = params.args.include;

        if (['findMany', 'findFirst', 'findUnique', 'create', 'update', 'upsert'].includes(action)) {
          if (!params.args.select) {
            const select: Record<string, any> = { ...PRE_MIGRATION_REFRESH_SESSION_COLUMNS };
            if (hadInclude) {
              for (const [k, v] of Object.entries(hadInclude)) {
                if (v) select[k] = sanitizeRelation(k, v);
              }
              delete params.args.include;
            }
            params.args.select = select;
          } else {
            delete params.args.select.deviceLabel;
            delete params.args.select.userAgent;
            delete params.args.select.ipAddress;
            delete params.args.select.lastUsedAt;
          }
        }

        if (params.args.data) {
          delete params.args.data.deviceLabel;
          delete params.args.data.userAgent;
          delete params.args.data.ipAddress;
          delete params.args.data.lastUsedAt;
        }
        if (params.args.create) {
          delete params.args.create.deviceLabel;
          delete params.args.create.userAgent;
          delete params.args.create.ipAddress;
          delete params.args.create.lastUsedAt;
        }
        if (params.args.update) {
          delete params.args.update.deviceLabel;
          delete params.args.update.userAgent;
          delete params.args.update.ipAddress;
          delete params.args.update.lastUsedAt;
        }
        if (params.args.where) {
          delete params.args.where.deviceLabel;
          delete params.args.where.userAgent;
          delete params.args.where.ipAddress;
          delete params.args.where.lastUsedAt;
        }

        let result = await next(params);

        const addSessionDefaults = (s: any) => {
          if (!s || typeof s !== 'object') return s;
          if (s.deviceLabel === undefined) s.deviceLabel = null;
          if (s.userAgent === undefined) s.userAgent = null;
          if (s.ipAddress === undefined) s.ipAddress = null;
          if (s.lastUsedAt === undefined) s.lastUsedAt = s.updatedAt || s.createdAt || new Date();
          return s;
        };

        return Array.isArray(result) ? result.map(addSessionDefaults) : addSessionDefaults(result);
      }

      // Handle MailAccount queries
      if (model === 'MailAccount') {
        if (!params.args) params.args = {};
        const hadInclude = params.args.include;

        if (['findMany', 'findFirst', 'findUnique', 'create', 'update', 'upsert'].includes(action)) {
          if (!params.args.select) {
            const select: Record<string, any> = { ...PRE_MIGRATION_MAIL_ACCOUNT_COLUMNS };
            if (hadInclude) {
              for (const [k, v] of Object.entries(hadInclude)) {
                if (v) select[k] = sanitizeRelation(k, v);
              }
              delete params.args.include;
            }
            params.args.select = select;
          } else {
            delete params.args.select.encryption;
          }
        }

        if (params.args.data) delete params.args.data.encryption;
        if (params.args.create) delete params.args.create.encryption;
        if (params.args.update) delete params.args.update.encryption;

        let result = await next(params);

        const addMailDefaults = (m: any) => {
          if (!m || typeof m !== 'object') return m;
          if (m.encryption === undefined) {
            m.encryption = m.isSecure || m.smtpPort === 465 ? 'ssl' : 'starttls';
          }
          return m;
        };

        return Array.isArray(result) ? result.map(addMailDefaults) : addMailDefaults(result);
      }

      // In-Memory Fallback for Unmigrated Tables:
      // OtpChallenge, LoginTicket, ResetTicket, UserTwoFactor, TrustedDevice, EmailOutbox
      const isUnmigratedTable = [
        'OtpChallenge',
        'LoginTicket',
        'ResetTicket',
        'UserTwoFactor',
        'TrustedDevice',
        'EmailOutbox',
      ].includes(model || '');

      if (isUnmigratedTable) {
        return this.handleInMemoryFallback(params);
      }

      return next(params);
    });
  }

  private async handleInMemoryFallback(params: any): Promise<any> {
    const { model, action, args } = params;

    if (model === 'OtpChallenge') {
      if (action === 'create') {
        const item = {
          id: `otp_${Date.now()}_${Math.random()}`,
          attempts: 0,
          maxAttempts: 5,
          isDecoy: false,
          createdAt: new Date(),
          ...args?.data,
        };
        this.memStore.otpChallenges.push(item);
        return item;
      }
      if (action === 'findFirst' || action === 'findUnique') {
        const where = args?.where || {};
        return (
          this.memStore.otpChallenges
            .slice()
            .reverse()
            .find((c) => {
              if (where.id && c.id !== where.id) return false;
              if (where.emailNormalized && c.emailNormalized !== where.emailNormalized) return false;
              if (where.purpose && c.purpose !== where.purpose) return false;
              if (where.resendAfter?.gt && !(c.resendAfter > where.resendAfter.gt)) return false;
              if (where.usedAt === null && c.usedAt !== null) return false;
              return true;
            }) || null
        );
      }
      if (action === 'update' || action === 'updateMany') {
        const where = args?.where || {};
        let count = 0;
        let lastUpdated = null;
        for (const c of this.memStore.otpChallenges) {
          if (where.id && c.id !== where.id) continue;
          if (where.emailNormalized && c.emailNormalized !== where.emailNormalized) continue;
          if (where.purpose && c.purpose !== where.purpose) continue;
          if (where.usedAt === null && c.usedAt !== null) continue;
          if (where.attempts?.lt !== undefined && c.attempts >= where.attempts.lt) continue;
          if (where.attempts?.gte !== undefined && c.attempts < where.attempts.gte) continue;
          if (where.expiresAt?.gt !== undefined && c.expiresAt <= where.expiresAt.gt) continue;

          const toApply = { ...args.data };
          if (toApply.attempts && typeof toApply.attempts === 'object' && 'increment' in toApply.attempts) {
            toApply.attempts = (c.attempts || 0) + (toApply.attempts.increment || 1);
          }
          Object.assign(c, toApply);
          count++;
          lastUpdated = c;
        }
        return action === 'update' ? lastUpdated : { count };
      }
      if (action === 'deleteMany') {
        const initial = this.memStore.otpChallenges.length;
        if (args?.where?.expiresAt?.lt) {
          const threshold = args.where.expiresAt.lt;
          this.memStore.otpChallenges = this.memStore.otpChallenges.filter((c) => c.expiresAt >= threshold);
        }
        return { count: initial - this.memStore.otpChallenges.length };
      }
      if (action === 'count') {
        const where = args?.where || {};
        return this.memStore.otpChallenges.filter((c) => {
          if (where.emailNormalized && c.emailNormalized !== where.emailNormalized) return false;
          if (where.purpose && c.purpose !== where.purpose) return false;
          if (where.createdAt?.gte && c.createdAt < where.createdAt.gte) return false;
          return true;
        }).length;
      }
    }

    if (model === 'LoginTicket') {
      if (action === 'create') {
        const item = {
          id: `lt_${Date.now()}_${Math.random()}`,
          attempts: 0,
          usedAt: null,
          createdAt: new Date(),
          ...args?.data,
        };
        this.memStore.loginTickets.push(item);
        return item;
      }
      if (action === 'findUnique' || action === 'findFirst') {
        const jti = args?.where?.jti;
        const item = this.memStore.loginTickets.find((t) => t.jti === jti) || null;
        if (item && args?.include?.user) {
          const user = await this.user.findUnique({
            where: { id: item.userId },
            include: { tenant: true },
          });
          return {
            ...item,
            user: {
              ...user,
              twoFactor: this.memStore.userTwoFactors.find((tf) => tf.userId === item.userId) || null,
            },
          };
        }
        return item;
      }
      if (action === 'update' || action === 'updateMany') {
        const jti = args?.where?.jti;
        const item = this.memStore.loginTickets.find((t) => t.jti === jti);
        if (item) {
          const toApply = { ...args?.data };
          if (toApply.attempts && typeof toApply.attempts === 'object' && 'increment' in toApply.attempts) {
            toApply.attempts = (item.attempts || 0) + (toApply.attempts.increment || 1);
          }
          Object.assign(item, toApply);
        }
        return action === 'updateMany' ? { count: item ? 1 : 0 } : (item || null);
      }
      if (action === 'deleteMany') {
        return { count: 0 };
      }
    }

    if (model === 'ResetTicket') {
      if (action === 'create') {
        const item = {
          id: `rt_${Date.now()}_${Math.random()}`,
          usedAt: null,
          createdAt: new Date(),
          ...args?.data,
        };
        this.memStore.resetTickets.push(item);
        return item;
      }
      if (action === 'findUnique' || action === 'findFirst') {
        const jti = args?.where?.jti;
        return this.memStore.resetTickets.find((t) => t.jti === jti) || null;
      }
      if (action === 'update' || action === 'updateMany') {
        const where = args?.where || {};
        const jti = where.jti;
        const item = this.memStore.resetTickets.find((t) => {
          if (jti && t.jti !== jti) return false;
          if (where.usedAt === null && t.usedAt !== null) return false;
          if (where.expiresAt?.gt && t.expiresAt <= where.expiresAt.gt) return false;
          return true;
        });
        if (item) Object.assign(item, args?.data);
        return action === 'updateMany' ? { count: item ? 1 : 0 } : (item || null);
      }
    }

    if (model === 'UserTwoFactor') {
      if (action === 'findUnique' || action === 'findFirst') {
        const userId = args?.where?.userId;
        return this.memStore.userTwoFactors.find((t) => t.userId === userId) || null;
      }
      if (action === 'create' || action === 'upsert') {
        const userId = args?.where?.userId || args?.create?.userId || args?.data?.userId;
        const existingIdx = this.memStore.userTwoFactors.findIndex((t) => t.userId === userId);
        const data = action === 'upsert' ? (existingIdx !== -1 ? args.update : args.create) : args.data;
        const item = { id: `u2f_${Date.now()}`, userId, ...data };
        if (existingIdx !== -1) {
          Object.assign(this.memStore.userTwoFactors[existingIdx], data);
          return this.memStore.userTwoFactors[existingIdx];
        } else {
          this.memStore.userTwoFactors.push(item);
          return item;
        }
      }
      if (action === 'update') {
        const userId = args?.where?.userId;
        const item = this.memStore.userTwoFactors.find((t) => t.userId === userId);
        if (item) Object.assign(item, args?.data);
        return item || null;
      }
      if (action === 'delete' || action === 'deleteMany') {
        const userId = args?.where?.userId;
        this.memStore.userTwoFactors = this.memStore.userTwoFactors.filter((t) => t.userId !== userId);
        return { count: 1 };
      }
    }

    if (model === 'TrustedDevice') {
      if (action === 'create') {
        const item = { id: `td_${Date.now()}`, createdAt: new Date(), ...args?.data };
        this.memStore.trustedDevices.push(item);
        return item;
      }
      if (action === 'findFirst' || action === 'findUnique') {
        const where = args?.where || {};
        return (
          this.memStore.trustedDevices.find((d) => {
            if (where.userId && d.userId !== where.userId) return false;
            if (where.tokenHash && d.tokenHash !== where.tokenHash) return false;
            return true;
          }) || null
        );
      }
      if (action === 'findMany') {
        const where = args?.where || {};
        return this.memStore.trustedDevices.filter((d) => !where.userId || d.userId === where.userId);
      }
      if (action === 'delete' || action === 'deleteMany') {
        const where = args?.where || {};
        this.memStore.trustedDevices = this.memStore.trustedDevices.filter(
          (d) => (!where.userId || d.userId !== where.userId) && (!where.id || d.id !== where.id),
        );
        return { count: 1 };
      }
    }

    if (model === 'EmailOutbox') {
      if (action === 'create') {
        const item = { id: `out_${Date.now()}`, attempts: 0, status: 'pending', createdAt: new Date(), ...args?.data };
        this.memStore.emailOutboxes.push(item);
        return item;
      }
      if (action === 'findUnique' || action === 'findFirst') {
        const id = args?.where?.id;
        return this.memStore.emailOutboxes.find((o) => o.id === id) || null;
      }
      if (action === 'findMany') {
        return this.memStore.emailOutboxes.slice();
      }
      if (action === 'update' || action === 'updateMany') {
        const id = args?.where?.id;
        const item = this.memStore.emailOutboxes.find((o) => o.id === id);
        if (item) Object.assign(item, args?.data);
        return item || null;
      }
      if (action === 'deleteMany') {
        const before = this.memStore.emailOutboxes.length;
        if (args?.where?.OR) {
          // Process OR filters like createdAt < fifteenMinutesAgo
          const fifteenMin = args.where.OR.find((c: any) => c.createdAt?.lt)?.createdAt?.lt;
          if (fifteenMin) {
            const cutoff = new Date(fifteenMin).getTime();
            this.memStore.emailOutboxes = this.memStore.emailOutboxes.filter(
              (o) => new Date(o.createdAt).getTime() >= cutoff
            );
          }
        } else if (args?.where?.createdAt?.lt) {
          const cutoff = new Date(args.where.createdAt.lt).getTime();
          this.memStore.emailOutboxes = this.memStore.emailOutboxes.filter(
            (o) => new Date(o.createdAt).getTime() >= cutoff
          );
        } else {
          this.memStore.emailOutboxes = [];
        }
        return { count: before - this.memStore.emailOutboxes.length };
      }
    }

    return null;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
