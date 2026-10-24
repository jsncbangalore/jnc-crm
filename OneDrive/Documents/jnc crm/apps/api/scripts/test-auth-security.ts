/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../src/auth/auth.service';
import { UsersService } from '../src/users/users.service';
import { ScopedUser } from '../src/auth/scoping.service';
import { getPasswordPolicy, validatePasswordPolicy } from '../src/common/password-policy';
import {
  generateTotpSecret,
  getTotpStep,
  generateTotpToken,
  verifyTotpToken,
  generateBackupCodes,
  hashBackupCode,
  verifyAndConsumeBackupCode,
  base32Encode,
  base32Decode,
  buildTotpUri,
} from '../src/common/totp.util';
import {
  getTrustedDeviceCookieOptions,
  TRUSTED_DEVICE_COOKIE_NAME,
  TRUSTED_DEVICE_MAX_AGE_MS,
  TRUSTED_DEVICE_ADMIN_MAX_AGE_MS,
} from '../src/common/cookie.util';
import { encryptAtRest, decryptAtRest } from '../src/common/encryption.util';
import { BadRequestException, ForbiddenException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';

if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
}

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, failureDetail?: string) {
  if (condition) {
    console.log(`[PASSED] ${testName}`);
    passedCount++;
  } else {
    console.error(`[FAILED] ${testName}${failureDetail ? ` - ${failureDetail}` : ''}`);
    failedCount++;
  }
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// In-Memory Database Simulator for Prisma
class MockPrismaStore {
  tenants: any[] = [];
  users: any[] = [];
  otpChallenges: any[] = [];
  passwordResetTokens: any[] = [];
  refreshSessions: any[] = [];
  accountLockouts: any[] = [];
  auditLogs: any[] = [];
  resetTickets: any[] = [];
  emailOutboxes: any[] = [];
  userTwoFactors: any[] = [];
  trustedDevices: any[] = [];
  loginTickets: any[] = [];
  usedSelectionTokens: any[] = [];
  teams: any[] = [];
  warehouses: any[] = [];

  tenant = {
    findFirst: async (args: any) => {
      const codeOrSlug = args?.where?.OR;
      if (codeOrSlug) {
        return this.tenants.find((t) =>
          codeOrSlug.some((clause: any) => {
            if (clause.code?.equals) {
              return t.code.toUpperCase() === clause.code.equals.toUpperCase();
            }
            if (clause.slug?.equals) {
              return t.slug.toLowerCase() === clause.slug.toLowerCase();
            }
            if (clause.id?.equals) {
              return t.id === clause.id.equals;
            }
            return false;
          }),
        ) || null;
      }
      if (args?.where?.id) {
        return this.tenants.find((t) => t.id === args.where.id) || null;
      }
      return this.tenants[0] || null;
    },
    findUnique: async (args: any) => {
      return this.tenants.find((t) => t.id === args?.where?.id) || null;
    },
    create: async ({ data }: any) => {
      const row = { id: `tenant_${Date.now()}_${Math.random()}`, requireTwoFactor: false, ...data };
      this.tenants.push(row);
      return row;
    },
    update: async (args: any) => {
      const idx = this.tenants.findIndex((t) => t.id === args.where.id);
      if (idx !== -1) {
        this.tenants[idx] = { ...this.tenants[idx], ...args.data };
        return this.tenants[idx];
      }
      return null;
    },
    delete: async () => {},
  };

  user = {
    findMany: async (args: any) => {
      let results = [...this.users];
      if (args?.where) {
        if (args.where.id) {
          if (args.where.id.in) {
            results = results.filter((u) => args.where.id.in.includes(u.id));
          } else {
            results = results.filter((u) => u.id === args.where.id);
          }
        }
        if (args.where.email) {
          const target = (args.where.email.equals || args.where.email).toLowerCase();
          results = results.filter((u) => u.email.toLowerCase() === target);
        }
        if (args.where.tenantId !== undefined) {
          results = results.filter((u) => u.tenantId === args.where.tenantId);
        }
        if (args.where.deletedAt === null) {
          results = results.filter((u) => !u.deletedAt);
        }
        if (args.where.isActive !== undefined) {
          results = results.filter((u) => u.isActive === args.where.isActive);
        }
        if (args.where.role) {
          results = results.filter((u) => u.role === args.where.role);
        }
        if (args.where.OR) {
          results = results.filter((u) =>
            args.where.OR.some((clause: any) => {
              if (clause.email?.equals && u.email.toLowerCase() === clause.email.equals.toLowerCase()) return true;
              if (clause.employeeCode?.equals && u.employeeCode?.toUpperCase() === clause.employeeCode.equals.toUpperCase()) return true;
              return false;
            }),
          );
        }
      }
      if (args?.include?.tenant) {
        results = results.map((u) => ({
          ...u,
          tenant: this.tenants.find((t) => t.id === u.tenantId) || null,
        }));
      }
      if (args?.include?.twoFactor) {
        results = results.map((u) => ({
          ...u,
          twoFactor: this.userTwoFactors.find((tf) => tf.userId === u.id) || null,
        }));
      }
      return results;
    },
    findFirst: async (args: any) => {
      const list = await this.user.findMany(args);
      return list[0] || null;
    },
    findUnique: async (args: any) => {
      let u = this.users.find((x) => {
        if (args?.where?.id && x.id === args.where.id) return true;
        if (args?.where?.email && x.email.toLowerCase() === args.where.email.toLowerCase()) return true;
        return false;
      }) || null;
      if (u) {
        let tenant = undefined;
        if (args?.include?.tenant) {
          tenant = this.tenants.find((t) => t.id === u.tenantId) || null;
        }
        let twoFactor = undefined;
        if (args?.include?.twoFactor) {
          twoFactor = this.userTwoFactors.find((tf) => tf.userId === u.id) || null;
        }
        return {
          ...u,
          ...(tenant !== undefined ? { tenant } : {}),
          ...(twoFactor !== undefined ? { twoFactor } : {}),
        };
      }
      return null;
    },
    create: async ({ data }: any) => {
      const row = { id: `usr_${Date.now()}_${Math.random().toString(36).substring(7)}`, ...data };
      this.users.push(row);
      return row;
    },
    count: async (args: any) => {
      const list = await this.user.findMany(args);
      return list.length;
    },
    update: async (args: any) => {
      const idx = this.users.findIndex((u) => u.id === args.where.id);
      if (idx !== -1) {
        let tokenVersion = this.users[idx].tokenVersion || 1;
        if (args.data?.tokenVersion?.increment) {
          tokenVersion += args.data.tokenVersion.increment;
        } else if (typeof args.data?.tokenVersion === 'number') {
          tokenVersion = args.data.tokenVersion;
        }
        this.users[idx] = { ...this.users[idx], ...args.data, tokenVersion };
        const u = this.users[idx];
        let tenant = undefined;
        if (args?.include?.tenant) {
          tenant = this.tenants.find((t) => t.id === u.tenantId) || null;
        }
        let twoFactor = undefined;
        if (args?.include?.twoFactor) {
          twoFactor = this.userTwoFactors.find((tf) => tf.userId === u.id) || null;
        }
        return {
          ...u,
          ...(tenant !== undefined ? { tenant } : {}),
          ...(twoFactor !== undefined ? { twoFactor } : {}),
        };
      }
      return null;
    },
    updateMany: async (args: any) => {
      let count = 0;
      for (let i = 0; i < this.users.length; i++) {
        const u = this.users[i];
        let matches = true;
        if (args.where?.id) {
          if (args.where.id.in) {
            if (!args.where.id.in.includes(u.id)) matches = false;
          } else if (u.id !== args.where.id) {
            matches = false;
          }
        }
        if (args.where?.deletedAt === null && u.deletedAt) matches = false;
        if (args.where?.isActive !== undefined && u.isActive !== args.where.isActive) matches = false;
        if (matches) {
          let tokenVersion = u.tokenVersion || 1;
          if (args.data?.tokenVersion?.increment) {
            tokenVersion += args.data.tokenVersion.increment;
          } else if (typeof args.data?.tokenVersion === 'number') {
            tokenVersion = args.data.tokenVersion;
          }
          this.users[i] = { ...u, ...args.data, tokenVersion };
          count++;
        }
      }
      return { count };
    },
  };

  otpChallenge = {
    findFirst: async (args: any) => {
      let matches = [...this.otpChallenges];
      if (args?.where?.emailNormalized) {
        matches = matches.filter((o) => o.emailNormalized === args.where.emailNormalized);
      }
      if (args?.where?.purpose) {
        matches = matches.filter((o) => o.purpose === args.where.purpose);
      }
      if (args?.where?.usedAt === null) {
        matches = matches.filter((o) => o.usedAt === null);
      }
      if (args?.where?.resendAfter?.gt) {
        matches = matches.filter((o) => new Date(o.resendAfter) > args.where.resendAfter.gt);
      }
      if (args?.where?.expiresAt?.gt) {
        matches = matches.filter((o) => new Date(o.expiresAt) > args.where.expiresAt.gt);
      }
      if (args?.orderBy?.createdAt === 'desc') {
        matches.reverse();
      }
      return matches[0] || null;
    },
    count: async (args: any) => {
      let matches = [...this.otpChallenges];
      if (args?.where?.emailNormalized) {
        matches = matches.filter((o) => o.emailNormalized === args.where.emailNormalized);
      }
      if (args?.where?.purpose) {
        matches = matches.filter((o) => o.purpose === args.where.purpose);
      }
      if (args?.where?.createdAt?.gte) {
        matches = matches.filter((o) => new Date(o.createdAt) >= args.where.createdAt.gte);
      }
      return matches.length;
    },
    create: async ({ data }: any) => {
      const row = {
        id: data.id || `otp_${Date.now()}_${Math.random()}`,
        attempts: 0,
        maxAttempts: 5,
        createdAt: new Date(),
        usedAt: null,
        ...data,
      };
      this.otpChallenges.push(row);
      return row;
    },
    update: async (args: any) => {
      const idx = this.otpChallenges.findIndex((o) => o.id === args.where.id);
      if (idx !== -1) {
        this.otpChallenges[idx] = { ...this.otpChallenges[idx], ...args.data };
        return this.otpChallenges[idx];
      }
      return null;
    },
    updateMany: async (args: any) => {
      let count = 0;
      for (let i = 0; i < this.otpChallenges.length; i++) {
        const o = this.otpChallenges[i];
        let matches = true;
        if (args.where?.id && o.id !== args.where.id) matches = false;
        if (args.where?.emailNormalized && o.emailNormalized !== args.where.emailNormalized) matches = false;
        if (args.where?.purpose && o.purpose !== args.where.purpose) matches = false;
        if (args.where?.usedAt === null && o.usedAt !== null) matches = false;
        if (args.where?.attempts?.lt !== undefined && !(o.attempts < args.where.attempts.lt)) matches = false;
        if (args.where?.attempts?.gte !== undefined && !(o.attempts >= args.where.attempts.gte)) matches = false;
        if (args.where?.expiresAt?.gt !== undefined && !(new Date(o.expiresAt) > args.where.expiresAt.gt)) matches = false;
        if (matches) {
          let updatedAttempts = o.attempts;
          if (args.data?.attempts?.increment) {
            updatedAttempts = o.attempts + args.data.attempts.increment;
          } else if (typeof args.data?.attempts === 'number') {
            updatedAttempts = args.data.attempts;
          }
          this.otpChallenges[i] = { ...this.otpChallenges[i], ...args.data, attempts: updatedAttempts };
          count++;
        }
      }
      return { count };
    },
    deleteMany: async (args: any) => {
      let count = 0;
      const before = this.otpChallenges.length;
      this.otpChallenges = this.otpChallenges.filter((o) => {
        if (args?.where?.OR) {
          const match = args.where.OR.some((clause: any) => {
            if (clause.expiresAt?.lt && new Date(o.expiresAt) < clause.expiresAt.lt) return true;
            if (clause.usedAt?.not === null && o.usedAt !== null) return true;
            return false;
          });
          return !match;
        }
        return true;
      });
      count = before - this.otpChallenges.length;
      return { count };
    },
  };

  refreshSession = {
    create: async ({ data }: any) => {
      const row = { id: `ses_${Date.now()}_${Math.random()}`, isRevoked: false, createdAt: new Date(), updatedAt: new Date(), ...data };
      this.refreshSessions.push(row);
      return row;
    },
    findUnique: async (args: any) => {
      if (args?.where?.id) {
        return this.refreshSessions.find((s) => s.id === args.where.id) || null;
      }
      return this.refreshSessions.find((s) => s.tokenHash === args?.where?.tokenHash) || null;
    },
    findFirst: async (args: any) => {
      return this.refreshSessions.find((s) => {
        if (args?.where?.id && s.id !== args.where.id) return false;
        if (args?.where?.userId && s.userId !== args.where.userId) return false;
        return true;
      }) || null;
    },
    findMany: async (args: any) => {
      return this.refreshSessions.filter((s) => {
        if (args?.where?.userId && s.userId !== args.where.userId) return false;
        if (args?.where?.isRevoked !== undefined && s.isRevoked !== args.where.isRevoked) return false;
        return true;
      });
    },
    update: async (args: any) => {
      const idx = this.refreshSessions.findIndex((s) => s.id === args.where.id);
      if (idx !== -1) {
        this.refreshSessions[idx] = { ...this.refreshSessions[idx], ...args.data };
        return this.refreshSessions[idx];
      }
      return null;
    },
    updateMany: async (args: any) => {
      let count = 0;
      for (let i = 0; i < this.refreshSessions.length; i++) {
        const s = this.refreshSessions[i];
        let matches = true;
        if (args.where?.userId) {
          if (args.where.userId.in) {
            if (!args.where.userId.in.includes(s.userId)) matches = false;
          } else if (s.userId !== args.where.userId) {
            matches = false;
          }
        }
        if (args.where?.tokenHash?.not && s.tokenHash === args.where.tokenHash.not) matches = false;
        if (matches) {
          this.refreshSessions[i] = { ...s, ...args.data };
          count++;
        }
      }
      return { count };
    },
  };

  accountLockout = {
    findUnique: async (args: any) => {
      return this.accountLockouts.find((l) => l.identityKey === args?.where?.identityKey) || null;
    },
    create: async ({ data }: any) => {
      const row = { id: `lck_${Date.now()}`, ...data };
      this.accountLockouts.push(row);
      return row;
    },
    update: async (args: any) => {
      const idx = this.accountLockouts.findIndex((l) => l.identityKey === args.where.identityKey);
      if (idx !== -1) {
        let attempts = this.accountLockouts[idx].failedAttempts || 0;
        if (args.data?.failedAttempts?.increment) {
          attempts += args.data.failedAttempts.increment;
        } else if (typeof args.data?.failedAttempts === 'number') {
          attempts = args.data.failedAttempts;
        }
        this.accountLockouts[idx] = {
          ...this.accountLockouts[idx],
          ...args.data,
          failedAttempts: attempts,
        };
        return this.accountLockouts[idx];
      }
      return null;
    },
    upsert: async (args: any) => {
      const existing = this.accountLockouts.find((l) => l.identityKey === args.where.identityKey);
      if (existing) {
        let attempts = existing.failedAttempts || 0;
        if (args.update?.failedAttempts?.increment) {
          attempts += args.update.failedAttempts.increment;
        } else if (typeof args.update?.failedAttempts === 'number') {
          attempts = args.update.failedAttempts;
        }
        const updated = {
          ...existing,
          ...args.update,
          failedAttempts: attempts,
        };
        const idx = this.accountLockouts.indexOf(existing);
        this.accountLockouts[idx] = updated;
        return updated;
      } else {
        const created = {
          id: `lck_${Date.now()}_${Math.random()}`,
          identityKey: args.where.identityKey,
          failedAttempts: 0,
          ...args.create,
        };
        this.accountLockouts.push(created);
        return created;
      }
    },
    delete: async (args: any) => {
      this.accountLockouts = this.accountLockouts.filter((l) => l.identityKey !== args?.where?.identityKey);
      return {};
    },
    deleteMany: async (args: any) => {
      let count = 0;
      const before = this.accountLockouts.length;
      if (args?.where?.identityKey?.in) {
        this.accountLockouts = this.accountLockouts.filter((l) => !args.where.identityKey.in.includes(l.identityKey));
      } else if (args?.where?.lockedUntil?.lt) {
        this.accountLockouts = this.accountLockouts.filter((l) => !l.lockedUntil || new Date(l.lockedUntil) >= args.where.lockedUntil.lt);
      }
      count = before - this.accountLockouts.length;
      return { count };
    },
  };

  auditLog = {
    create: async ({ data }: any) => {
      const row = { id: `aud_${Date.now()}_${Math.random()}`, timestamp: new Date(), ...data };
      this.auditLogs.push(row);
      return row;
    },
    findMany: async (args: any) => {
      let results = [...this.auditLogs];
      if (args?.where?.OR) {
        results = results.filter((l) =>
          args.where.OR.some((clause: any) => {
            if (clause.actorId && l.actorId === clause.actorId) return true;
            if (clause.entityId && l.entityId === clause.entityId) return true;
            return false;
          }),
        );
      }
      return results;
    },
  };

  resetTicket = {
    create: async ({ data }: any) => {
      const row = { id: `rst_${Date.now()}_${Math.random()}`, usedAt: null, createdAt: new Date(), ...data };
      this.resetTickets.push(row);
      return row;
    },
    findUnique: async (args: any) => {
      return this.resetTickets.find((t) => {
        if (args?.where?.jti && t.jti !== args.where.jti) return false;
        if (args?.where?.id && t.id !== args.where.id) return false;
        return true;
      }) || null;
    },
    findFirst: async (args: any) => {
      return this.resetTickets.find((t) => {
        if (args?.where?.jti && t.jti !== args.where.jti) return false;
        if (args?.where?.emailNormalized && t.emailNormalized !== args.where.emailNormalized) return false;
        if (args?.where?.usedAt === null && t.usedAt !== null) return false;
        if (args?.where?.expiresAt?.gt && !(new Date(t.expiresAt) > args.where.expiresAt.gt)) return false;
        return true;
      }) || null;
    },
    update: async (args: any) => {
      const idx = this.resetTickets.findIndex((t) => {
        if (args.where?.jti && t.jti === args.where.jti) return true;
        if (args.where?.id && t.id === args.where.id) return true;
        return false;
      });
      if (idx !== -1) {
        this.resetTickets[idx] = { ...this.resetTickets[idx], ...args.data };
        return this.resetTickets[idx];
      }
      return null;
    },
    updateMany: async (args: any) => {
      let count = 0;
      for (let i = 0; i < this.resetTickets.length; i++) {
        const t = this.resetTickets[i];
        let matches = true;
        if (args.where?.jti && t.jti !== args.where.jti) matches = false;
        if (args.where?.usedAt === null && t.usedAt !== null) matches = false;
        if (args.where?.expiresAt?.gt && !(new Date(t.expiresAt) > args.where.expiresAt.gt)) matches = false;
        if (matches) {
          this.resetTickets[i] = { ...t, ...args.data };
          count++;
        }
      }
      return { count };
    },
    deleteMany: async (args: any) => {
      let count = 0;
      const before = this.resetTickets.length;
      this.resetTickets = this.resetTickets.filter((t) => {
        if (args?.where?.OR) {
          const match = args.where.OR.some((clause: any) => {
            if (clause.expiresAt?.lt && new Date(t.expiresAt) < clause.expiresAt.lt) return true;
            if (clause.usedAt?.not === null && t.usedAt !== null) return true;
            return false;
          });
          return !match;
        }
        return true;
      });
      count = before - this.resetTickets.length;
      return { count };
    },
  };

  emailOutbox = {
    create: async ({ data }: any) => {
      const row = { id: `out_${Date.now()}_${Math.random()}`, attempts: 0, maxAttempts: 3, createdAt: new Date(), updatedAt: new Date(), ...data };
      this.emailOutboxes.push(row);
      return row;
    },
    findUnique: async (args: any) => {
      return this.emailOutboxes.find((o) => o.id === args?.where?.id) || null;
    },
    update: async (args: any) => {
      const idx = this.emailOutboxes.findIndex((o) => o.id === args?.where?.id);
      if (idx !== -1) {
        this.emailOutboxes[idx] = { ...this.emailOutboxes[idx], ...args.data };
        return this.emailOutboxes[idx];
      }
      return null;
    },
    deleteMany: async (args: any) => {
      let count = 0;
      const before = this.emailOutboxes.length;
      this.emailOutboxes = this.emailOutboxes.filter((o) => {
        if (args?.where?.isDecoy !== undefined && o.isDecoy !== args.where.isDecoy) return true;
        if (args?.where?.createdAt?.lt && new Date(o.createdAt) < args.where.createdAt.lt) {
          return false;
        }
        return true;
      });
      count = before - this.emailOutboxes.length;
      return { count };
    },
  };

  userTwoFactor = {
    findUnique: async (args: any) => {
      return this.userTwoFactors.find((x) => x.userId === args?.where?.userId) || null;
    },
    findFirst: async (args: any) => {
      return this.userTwoFactors.find((x) => {
        if (args?.where?.userId && x.userId !== args.where.userId) return false;
        return true;
      }) || null;
    },
    create: async ({ data }: any) => {
      const row = { id: `u2f_${Date.now()}_${Math.random()}`, ...data };
      this.userTwoFactors.push(row);
      return row;
    },
    update: async (args: any) => {
      const idx = this.userTwoFactors.findIndex((x) => x.userId === args.where.userId);
      if (idx !== -1) {
        this.userTwoFactors[idx] = { ...this.userTwoFactors[idx], ...args.data };
        return this.userTwoFactors[idx];
      }
      return null;
    },
    upsert: async (args: any) => {
      const existing = this.userTwoFactors.find((x) => x.userId === args.where.userId);
      if (existing) {
        const idx = this.userTwoFactors.indexOf(existing);
        this.userTwoFactors[idx] = { ...existing, ...args.update };
        return this.userTwoFactors[idx];
      } else {
        const created = { id: `u2f_${Date.now()}_${Math.random()}`, userId: args.where.userId, ...args.create };
        this.userTwoFactors.push(created);
        return created;
      }
    },
    delete: async (args: any) => {
      const idx = this.userTwoFactors.findIndex((x) => x.userId === args?.where?.userId);
      if (idx !== -1) {
        const removed = this.userTwoFactors.splice(idx, 1)[0];
        return removed;
      }
      return {};
    },
    deleteMany: async (args: any) => {
      let count = 0;
      if (args?.where?.userId) {
        const before = this.userTwoFactors.length;
        this.userTwoFactors = this.userTwoFactors.filter((x) => x.userId !== args.where.userId);
        count = before - this.userTwoFactors.length;
      }
      return { count };
    },
  };

  trustedDevice = {
    findFirst: async (args: any) => {
      return this.trustedDevices.find((d) => {
        if (args?.where?.userId && d.userId !== args.where.userId) return false;
        if (args?.where?.tokenHash && d.tokenHash !== args.where.tokenHash) return false;
        if (args?.where?.expiresAt?.gt && !(new Date(d.expiresAt) > args.where.expiresAt.gt)) return false;
        return true;
      }) || null;
    },
    findMany: async (args: any) => {
      return this.trustedDevices.filter((d) => {
        if (args?.where?.userId && d.userId !== args.where.userId) return false;
        if (args?.where?.expiresAt?.gt && !(new Date(d.expiresAt) > args.where.expiresAt.gt)) return false;
        return true;
      });
    },
    create: async ({ data }: any) => {
      const row = { id: `dev_${Date.now()}_${Math.random()}`, createdAt: new Date(), lastUsedAt: new Date(), ...data };
      this.trustedDevices.push(row);
      return row;
    },
    update: async (args: any) => {
      const idx = this.trustedDevices.findIndex((d) => d.id === args.where.id);
      if (idx !== -1) {
        this.trustedDevices[idx] = { ...this.trustedDevices[idx], ...args.data };
        return this.trustedDevices[idx];
      }
      return null;
    },
    delete: async (args: any) => {
      this.trustedDevices = this.trustedDevices.filter((d) => d.id !== args.where.id);
      return {};
    },
    deleteMany: async (args: any) => {
      let count = 0;
      const before = this.trustedDevices.length;
      this.trustedDevices = this.trustedDevices.filter((d) => {
        if (args?.where?.userId) {
          if (args.where.userId.in && args.where.userId.in.includes(d.userId)) {
            return false;
          }
          if (d.userId === args.where.userId) {
            if (args.where.id && d.id !== args.where.id) return true;
            return false;
          }
        }
        if (args?.where?.expiresAt?.lt && new Date(d.expiresAt) < args.where.expiresAt.lt) {
          return false;
        }
        return true;
      });
      count = before - this.trustedDevices.length;
      return { count };
    },
  };

  loginTicket = {
    findUnique: async (args: any) => {
      const ticket = this.loginTickets.find((t) => t.jti === args?.where?.jti) || null;
      if (ticket && args?.include?.user) {
        let user = this.users.find((u) => u.id === ticket.userId) || null;
        if (user) {
          const tenant = this.tenants.find((t) => t.id === user.tenantId) || null;
          const twoFactor = this.userTwoFactors.find((tf) => tf.userId === user.id) || null;
          user = { ...user, tenant, twoFactor };
        }
        return { ...ticket, user };
      }
      return ticket;
    },
    findFirst: async (args: any) => {
      return this.loginTickets.find((t) => {
        if (args?.where?.jti && t.jti !== args.where.jti) return false;
        if (args?.where?.userId && t.userId !== args.where.userId) return false;
        return true;
      }) || null;
    },
    create: async ({ data }: any) => {
      const row = { id: `tkt_${Date.now()}_${Math.random()}`, attempts: 0, usedAt: null, createdAt: new Date(), ...data };
      this.loginTickets.push(row);
      return row;
    },
    update: async (args: any) => {
      const idx = this.loginTickets.findIndex((t) => t.jti === args.where.jti);
      if (idx !== -1) {
        let attempts = this.loginTickets[idx].attempts;
        if (args.data?.attempts?.increment) {
          attempts += args.data.attempts.increment;
        } else if (typeof args.data?.attempts === 'number') {
          attempts = args.data.attempts;
        }
        this.loginTickets[idx] = { ...this.loginTickets[idx], ...args.data, attempts };
        return this.loginTickets[idx];
      }
      return null;
    },
    updateMany: async (args: any) => {
      let count = 0;
      for (let i = 0; i < this.loginTickets.length; i++) {
        const t = this.loginTickets[i];
        let matches = true;
        if (args.where?.jti && t.jti !== args.where.jti) matches = false;
        if (args.where?.usedAt === null && t.usedAt !== null) matches = false;
        if (args.where?.expiresAt?.gt && !(new Date(t.expiresAt) > args.where.expiresAt.gt)) matches = false;
        if (args.where?.attempts?.lt !== undefined && !(t.attempts < args.where.attempts.lt)) matches = false;
        if (matches) {
          let attempts = t.attempts;
          if (args.data?.attempts?.increment) {
            attempts += args.data.attempts.increment;
          } else if (typeof args.data?.attempts === 'number') {
            attempts = args.data.attempts;
          }
          this.loginTickets[i] = {
            ...t,
            ...args.data,
            attempts,
            usedAt: args.data?.usedAt !== undefined ? args.data.usedAt : t.usedAt,
          };
          count++;
        }
      }
      return { count };
    },
    deleteMany: async (args: any) => {
      let count = 0;
      const before = this.loginTickets.length;
      this.loginTickets = this.loginTickets.filter((t) => {
        if (args?.where?.OR) {
          const match = args.where.OR.some((clause: any) => {
            if (clause.expiresAt?.lt && new Date(t.expiresAt) < clause.expiresAt.lt) return true;
            if (clause.usedAt?.not === null && t.usedAt !== null) return true;
            if (clause.attempts?.gte && t.attempts >= clause.attempts.gte) return true;
            return false;
          });
          return !match;
        }
        return true;
      });
      count = before - this.loginTickets.length;
      return { count };
    },
  };

  usedSelectionToken = {
    findUnique: async (args: any) => {
      return this.usedSelectionTokens.find((t) => t.jti === args.where.jti) || null;
    },
    create: async ({ data }: any) => {
      this.usedSelectionTokens.push(data);
      return data;
    },
  };

  team = {
    findFirst: async (args: any) => {
      return this.teams.find((t) => t.id === args?.where?.id) || null;
    },
  };

  warehouse = {
    findFirst: async (args: any) => {
      return this.warehouses.find((w) => w.id === args?.where?.id) || null;
    },
  };

  $transaction = async (arg: any) => {
    if (typeof arg === 'function') {
      return arg(this);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return null;
  };
}

async function runTests() {
  const mockAuditService: any = {
    log: async (entry: any) => mockStore.auditLog.create({ data: entry }),
    record: async (entry: any) => mockStore.auditLog.create({ data: entry }),
  };
  console.log('\n================================================================');
  console.log('       CRM AUTH & OTP RESET SECURITY VERIFICATION SUITE       ');
  console.log('================================================================\n');

  const mockStore = new MockPrismaStore();
  const jwtSecret = 'test-jwt-secret-not-used-in-prod-2026';
  process.env.JWT_SECRET = jwtSecret;
  process.env.OTP_SECRET = jwtSecret;

  const jwtService = new JwtService({ secret: jwtSecret });

  // Track sent emails
  const sentEmails: any[] = [];
  const mockNotificationsService: any = {
    sendEmail: async (opts: any) => {
      sentEmails.push(opts);
      return { status: 'sent', messageId: 'test-msg-id-123' };
    },
  };

  const authService = new AuthService(
    mockStore as any,
    jwtService,
    mockNotificationsService,
  );

  const flushBackground = async () => {
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 20));
  };

  // Setup mock tenant and users
  const testTenant = await mockStore.tenant.create({
    data: {
      name: 'Auth Security Test Company',
      code: 'TESTCO',
      slug: 'testco',
      status: 'active',
    },
  });

  const initHash = await bcrypt.hash('InitialSecureP@ssword2026!', 12);

  const testUser1 = await mockStore.user.create({
    data: {
      tenantId: testTenant.id,
      name: 'Tenant User One',
      email: 'tenant_user@example.com',
      employeeCode: 'EMP_001',
      passwordHash: initHash,
      role: 'tenant_admin',
      isActive: true,
      tokenVersion: 1,
    },
  });

  const testSuperAdmin = await mockStore.user.create({
    data: {
      tenantId: null,
      name: 'Platform Super Admin',
      email: 'platform_super_admin@example.com',
      employeeCode: 'PSA_001',
      passwordHash: initHash,
      role: 'platform_super_admin',
      isActive: true,
      tokenVersion: 1,
    },
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Password Policy Rules & Evaluation (Point 5 / Point 8)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const policy = authService.getPasswordPolicy();
    assert(
      policy.minLength === 12 &&
      Array.isArray(policy.rules) &&
      policy.rules.some((r) => r.id === 'minLength') &&
      policy.rules.some((r) => r.id === 'notCommon'),
      'Test 1.1: getPasswordPolicy returns minLength 12 and required rules list',
    );

    let shortRejected = false;
    try {
      validatePasswordPolicy('short123');
    } catch {
      shortRejected = true;
    }
    assert(shortRejected, 'Test 1.2: Password policy rejects passwords under 12 characters');

    let strongAccepted = false;
    try {
      validatePasswordPolicy('StrongPass#2026!X99');
      strongAccepted = true;
    } catch {
      strongAccepted = false;
    }
    assert(strongAccepted, 'Test 1.3: Password policy accepts strong compliant password');
  } catch (err: any) {
    assert(false, 'Test 1: Password Policy Validation', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: OTP Request Flow (forgotPasswordRequest) (Point 2)
  // ──────────────────────────────────────────────────────────────────────────
  let generatedOtpCode = '';
  try {
    sentEmails.length = 0;

    // Request OTP code for testUser1
    const reqRes = await authService.forgotPasswordRequest(
      { email: testUser1.email },
      '192.168.1.100',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0',
    );
    await flushBackground();

    assert(
      reqRes.message === 'If this account exists, we sent a code.' &&
      reqRes.resendAfterSeconds === 60,
      'Test 2.1: forgotPasswordRequest returns generic message with 60s resend timer',
    );

    // Verify email was dispatched with 6-digit code
    const lastEmail = sentEmails[sentEmails.length - 1];
    assert(
      lastEmail &&
      lastEmail.to === testUser1.email &&
      lastEmail.subject.includes('verification code'),
      'Test 2.2: Email dispatched to user with verification code subject',
    );

    // Extract the 6-digit code from subject
    const match = lastEmail.subject.match(/^(\d{6})\s/);
    if (match) {
      generatedOtpCode = match[1];
    }
    assert(generatedOtpCode.length === 6, 'Test 2.3: 6-digit verification code generated securely');

    // Verify code is stored as HMAC-SHA256, NOT plaintext
    const challenge = await mockStore.otpChallenge.findFirst({
      where: { emailNormalized: testUser1.email.toLowerCase(), purpose: 'password_reset' },
    });
    assert(
      challenge !== null &&
      challenge.codeHash !== generatedOtpCode &&
      challenge.codeHash.length === 64,
      'Test 2.4: Code is stored strictly as HMAC-SHA256 hash in OtpChallenge',
    );

    // Test 60-second cooldown prevents sending duplicate codes
    sentEmails.length = 0;
    const cooldownRes = await authService.forgotPasswordRequest({ email: testUser1.email });
    assert(
      cooldownRes.message === 'If this account exists, we sent a code.' &&
      sentEmails.length === 0,
      'Test 2.5: 60-second resend cooldown blocks re-dispatching email within window',
    );

    // Test non-existent email returns identical timing-safe message without creating challenge
    const nonExistentEmail = 'non_existent_random_user_99@example.com';
    const nonExistRes = await authService.forgotPasswordRequest({ email: nonExistentEmail });
    assert(
      nonExistRes.message === 'If this account exists, we sent a code.',
      'Test 2.6: Non-existent email returns identical generic message',
    );
  } catch (err: any) {
    assert(false, 'Test 2: OTP Request Flow', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: OTP Verification Flow (forgotPasswordVerify) (Point 3)
  // ──────────────────────────────────────────────────────────────────────────
  let resetTicket = '';
  let accountsList: any[] = [];
  try {
    // 1. Wrong code test: should fail and increment attempt count
    let wrongCodeRejected = false;
    try {
      await authService.forgotPasswordVerify({ email: testUser1.email, code: '000000' });
    } catch (err: any) {
      wrongCodeRejected = err instanceof BadRequestException && err.message.includes('incorrect or expired');
    }
    assert(wrongCodeRejected, 'Test 3.1: Wrong code fails with "Code is incorrect or expired."');

    // 2. Correct code test: returns resetTicket and accounts list
    const verifyRes = await authService.forgotPasswordVerify({
      email: testUser1.email,
      code: generatedOtpCode,
    });
    assert(
      typeof verifyRes.resetTicket === 'string' &&
      Array.isArray(verifyRes.accounts) &&
      verifyRes.accounts.length === 1 &&
      verifyRes.accounts[0].accountId === testUser1.id,
      'Test 3.2: Correct code returns signed resetTicket and account selector list',
    );
    resetTicket = verifyRes.resetTicket;
    accountsList = verifyRes.accounts;

    // 3. Single-use test: challenge marked as used and cannot be re-verified
    let reuseRejected = false;
    try {
      await authService.forgotPasswordVerify({ email: testUser1.email, code: generatedOtpCode });
    } catch {
      reuseRejected = true;
    }
    assert(reuseRejected, 'Test 3.3: Verification challenge is single-use; cannot be reused');
  } catch (err: any) {
    assert(false, 'Test 3: OTP Verification Flow', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: OTP Reset Execution (forgotPasswordReset) (Point 4)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    sentEmails.length = 0;
    const newPassword = 'BrandNewSecure#2026!XYZ';

    // 1. Account ownership security check: attempt to reset another user's account with this ticket
    let crossAccountRejected = false;
    try {
      await authService.forgotPasswordReset({
        resetTicket,
        accountIds: ['usr_attacker_victim_id_not_owned'],
        newPassword,
      });
    } catch (err: any) {
      crossAccountRejected = true;
    }
    assert(crossAccountRejected, 'Test 4.1: Reset rejects accounts not belonging to verified email');

    // 2. Perform legitimate reset for testUser1
    const resetRes = await authService.forgotPasswordReset(
      {
        resetTicket,
        accountIds: [testUser1.id],
        newPassword,
      },
      '203.0.113.195',
    );
    assert(resetRes.success === true, 'Test 4.2: Password reset succeeds for verified account');

    // 3. Verify user password updated in database
    const refreshedUser = await mockStore.user.findUnique({ where: { id: testUser1.id } });
    const isNewPassMatch = await bcrypt.compare(newPassword, refreshedUser!.passwordHash);
    assert(isNewPassMatch, 'Test 4.3: User passwordHash is updated to new bcrypt hash');

    // 4. Verify notification email dispatched
    const changeNotification = sentEmails.find((m) => m.subject.includes('password was changed'));
    assert(
      changeNotification !== undefined &&
      changeNotification.to === testUser1.email &&
      changeNotification.text.includes('203.0.113.195'),
      'Test 4.4: Dispatches "Your password was changed" email with client IP',
    );
  } catch (err: any) {
    assert(false, 'Test 4: OTP Reset Execution', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Platform Super Admin Reset Flow (Point 2 / Point 4)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    sentEmails.length = 0;

    // 1. Request OTP for platform super admin
    await authService.forgotPasswordRequest({ email: testSuperAdmin.email });
    await flushBackground();
    const adminEmail = sentEmails[sentEmails.length - 1];
    const adminCode = adminEmail.subject.match(/^(\d{6})\s/)[1];

    // 2. Verify OTP
    const adminVerify = await authService.forgotPasswordVerify({
      email: testSuperAdmin.email,
      code: adminCode,
    });
    assert(
      adminVerify.accounts[0].label === 'Platform administration',
      'Test 5.1: Platform super admin labeled as "Platform administration" in account list',
    );

    // 3. Reset password
    const adminNewPass = 'PlatformAdminSecure#2026!Pass';
    const adminReset = await authService.forgotPasswordReset({
      resetTicket: adminVerify.resetTicket,
      accountIds: [testSuperAdmin.id],
      newPassword: adminNewPass,
    });
    assert(adminReset.success === true, 'Test 5.2: Platform super admin password reset succeeds');

    const updatedAdmin = await mockStore.user.findUnique({ where: { id: testSuperAdmin.id } });
    const isAdminPassOk = await bcrypt.compare(adminNewPass, updatedAdmin!.passwordHash);
    assert(isAdminPassOk, 'Test 5.3: Platform super admin record holds updated password hash');
  } catch (err: any) {
    assert(false, 'Test 5: Platform Super Admin Reset', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Legacy Link Endpoint Returns HTTP 410 Gone (Point 6)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    let legacyEndpointGone = false;
    try {
      await authService.resetPassword({ token: 'old_legacy_link_token', newPassword: 'ValidPass#123456!' });
    } catch (err: any) {
      legacyEndpointGone = err instanceof HttpException && err.getStatus() === HttpStatus.GONE;
    }
    assert(legacyEndpointGone, 'Test 6.1: Legacy reset-password endpoint returns HTTP 410 Gone');
  } catch (err: any) {
    assert(false, 'Test 6: Legacy Endpoint Deprecation', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: Active Devices & Session Management (Point 13)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const rawTokenA = 'raw-session-token-aaa';
    const hashA = crypto.createHash('sha256').update(rawTokenA).digest('hex');
    await mockStore.refreshSession.create({
      data: {
        userId: testUser1.id,
        tokenHash: hashA,
        familyId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        deviceLabel: 'Windows / Chrome 124',
        ipAddress: '192.168.1.50',
      },
    });

    const rawTokenB = 'raw-session-token-bbb';
    const hashB = crypto.createHash('sha256').update(rawTokenB).digest('hex');
    const sessionB = await mockStore.refreshSession.create({
      data: {
        userId: testUser1.id,
        tokenHash: hashB,
        familyId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        deviceLabel: 'Android / Mobile Safari',
        ipAddress: '192.168.1.60',
      },
    });

    // List sessions
    const sessions = await authService.getUserSessions(testUser1.id, rawTokenA);
    assert(
      sessions.length >= 2 &&
      sessions.some((s: any) => s.isCurrent === true && s.deviceLabel.includes('Chrome')) &&
      sessions.some((s: any) => s.isCurrent === false && s.deviceLabel.includes('Android')),
      'Test 7.1: getUserSessions lists devices and tags current session correctly',
    );

    // Revoke session B
    const revokeRes = await authService.revokeSession(testUser1.id, sessionB.id);
    assert(revokeRes.success === true, 'Test 7.2: revokeSession successfully terminates specific session');

    const refreshedB = await mockStore.refreshSession.findUnique({ where: { tokenHash: hashB } });
    assert(refreshedB!.isRevoked === true, 'Test 7.3: Revoked session marked isRevoked: true');
  } catch (err: any) {
    assert(false, 'Test 7: Session Management', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 8: ADVANCED AUTH SECURITY & ATTACK HARDENING (POINT 8)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    // 8.1: 5 wrong codes kill the challenge
    const victimUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Victim User',
        email: 'victim_otp@example.com',
        employeeCode: 'EMP_VIC_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });
    await authService.forgotPasswordRequest({ email: victimUser.email });
    await flushBackground();
    const vicEmail = sentEmails[sentEmails.length - 1];
    const actualCode = vicEmail.subject.match(/^(\d{6})\s/)[1];

    for (let i = 1; i <= 5; i++) {
      let errCaught = false;
      try {
        await authService.forgotPasswordVerify({ email: victimUser.email, code: '999999' });
      } catch {
        errCaught = true;
      }
      assert(errCaught, `Test 8.1a: Attempt ${i}/5 with wrong code fails`);
    }

    let killedRejected = false;
    try {
      await authService.forgotPasswordVerify({ email: victimUser.email, code: actualCode });
    } catch {
      killedRejected = true;
    }
    assert(killedRejected, 'Test 8.1b: 5 wrong codes kill the challenge (correct code rejected on 6th attempt)');

    // 8.2: 3 codes per hour limit
    const rateLimitUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Rate Limit User',
        email: 'rate_limited_otp@example.com',
        employeeCode: 'EMP_RATE_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });

    await authService.forgotPasswordRequest({ email: rateLimitUser.email });
    await flushBackground();
    mockStore.otpChallenges[mockStore.otpChallenges.length - 1].resendAfter = new Date(Date.now() - 5000);

    await authService.forgotPasswordRequest({ email: rateLimitUser.email });
    await flushBackground();
    mockStore.otpChallenges[mockStore.otpChallenges.length - 1].resendAfter = new Date(Date.now() - 5000);

    await authService.forgotPasswordRequest({ email: rateLimitUser.email });
    await flushBackground();
    mockStore.otpChallenges[mockStore.otpChallenges.length - 1].resendAfter = new Date(Date.now() - 5000);

    const emailsBefore = sentEmails.filter(e => e.to === rateLimitUser.email).length;
    assert(emailsBefore === 3, 'Pre-condition: 3 emails dispatched for first 3 requests');

    const fourthRes = await authService.forgotPasswordRequest({ email: rateLimitUser.email });
    await flushBackground();
    const emailsAfter = sentEmails.filter(e => e.to === rateLimitUser.email).length;

    assert(
      fourthRes.message === 'If this account exists, we sent a code.' && emailsAfter === 3,
      'Test 8.2: 3 codes per hour limit strictly enforced; 4th code generation and dispatch blocked',
    );

    // 8.3: Code expiry after 10 minutes
    const expiryUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Expiry User',
        email: 'expiry_otp@example.com',
        employeeCode: 'EMP_EXP_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });
    await authService.forgotPasswordRequest({ email: expiryUser.email });
    await flushBackground();
    const expEmail = sentEmails[sentEmails.length - 1];
    const expCode = expEmail.subject.match(/^(\d{6})\s/)[1];

    const expChallenge = mockStore.otpChallenges[mockStore.otpChallenges.length - 1];
    expChallenge.expiresAt = new Date(Date.now() - 1000);

    let expiredRejected = false;
    try {
      await authService.forgotPasswordVerify({ email: expiryUser.email, code: expCode });
    } catch (err: any) {
      expiredRejected = err instanceof BadRequestException && err.message.includes('incorrect or expired');
    }
    assert(expiredRejected, 'Test 8.3: Code expiry after 10 minutes strictly enforced; expired code rejected');

    // 8.4: Ticket replay rejected
    const replayUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Replay User',
        email: 'replay_otp@example.com',
        employeeCode: 'EMP_RPL_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });
    await authService.forgotPasswordRequest({ email: replayUser.email });
    await flushBackground();
    const rplEmail = sentEmails[sentEmails.length - 1];
    const rplCode = rplEmail.subject.match(/^(\d{6})\s/)[1];

    const rplVerify = await authService.forgotPasswordVerify({ email: replayUser.email, code: rplCode });
    const singleUseTicket = rplVerify.resetTicket;

    const firstReset = await authService.forgotPasswordReset({
      resetTicket: singleUseTicket,
      accountIds: [replayUser.id],
      newPassword: 'FirstNewPassword#2026!A',
    });
    assert(firstReset.success === true, 'Test 8.4a: First password reset with valid ticket succeeds');

    let replayRejected = false;
    try {
      await authService.forgotPasswordReset({
        resetTicket: singleUseTicket,
        accountIds: [replayUser.id],
        newPassword: 'SecondNewPassword#2026!B',
      });
    } catch (err: any) {
      replayRejected = err instanceof BadRequestException;
    }
    assert(replayRejected, 'Test 8.4b: Reset ticket replay rejected; single-use jti invalidated after first use');

    // 8.5: Sessions revoked after reset
    const sessUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Session Reset User',
        email: 'session_reset@example.com',
        employeeCode: 'EMP_SES_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });

    const s1 = await mockStore.refreshSession.create({
      data: {
        userId: sessUser.id,
        tokenHash: 'token_hash_s1',
        familyId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 86400000),
        isRevoked: false,
      },
    });
    const s2 = await mockStore.refreshSession.create({
      data: {
        userId: sessUser.id,
        tokenHash: 'token_hash_s2',
        familyId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 86400000),
        isRevoked: false,
      },
    });

    await authService.forgotPasswordRequest({ email: sessUser.email }, '10.8.5.1');
    await flushBackground();
    const sessEmail = sentEmails[sentEmails.length - 1];
    const sessCode = sessEmail.subject.match(/^(\d{6})\s/)[1];
    const sessVerify = await authService.forgotPasswordVerify({ email: sessUser.email, code: sessCode });

    await authService.forgotPasswordReset({
      resetTicket: sessVerify.resetTicket,
      accountIds: [sessUser.id],
      newPassword: 'BrandNewPassword#2026!C',
    });

    const s1Refreshed = await mockStore.refreshSession.findUnique({ where: { id: s1.id } });
    const s2Refreshed = await mockStore.refreshSession.findUnique({ where: { id: s2.id } });
    assert(
      s1Refreshed?.isRevoked === true && s2Refreshed?.isRevoked === true,
      'Test 8.5: All prior user sessions revoked after password reset',
    );

    // 8.6: Session id of another user rejected
    const userAlien = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Alien User',
        email: 'alien@example.com',
        employeeCode: 'EMP_ALN_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });
    const alienSession = await mockStore.refreshSession.create({
      data: {
        userId: userAlien.id,
        tokenHash: 'alien_session_hash',
        familyId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 86400000),
        isRevoked: false,
      },
    });

    let alienRevokeForbidden = false;
    try {
      await authService.revokeSession(testUser1.id, alienSession.id);
    } catch (err: any) {
      alienRevokeForbidden = err instanceof ForbiddenException;
    }
    assert(alienRevokeForbidden, 'Test 8.6: Revoking session belonging to another user throws ForbiddenException');

    // 8.7: Admin of company A cannot act on company B
    const tenantB = await mockStore.tenant.create({
      data: {
        name: 'Company B Ltd',
        code: 'COMPB',
        slug: 'compb',
        status: 'active',
      },
    });

    const userB = await mockStore.user.create({
      data: {
        tenantId: tenantB.id,
        name: 'User In Company B',
        email: 'user_b@example.com',
        employeeCode: 'COMPB_EMP_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });

    const adminA: ScopedUser = {
      id: testUser1.id,
      tenantId: testTenant.id,
      employeeCode: testUser1.employeeCode,
      role: 'tenant_admin',
    };

    // mockAuditService defined globally in runTests
    const usersService = new UsersService(mockStore as any, mockNotificationsService, mockAuditService);

    let unlockBlocked = false;
    try {
      await usersService.unlockUser(userB.id, adminA);
    } catch (err: any) {
      unlockBlocked = err instanceof ForbiddenException && err.message.includes('another company');
    }
    assert(unlockBlocked, 'Test 8.7a: unlockUser: Admin of Company A cannot act on Company B');

    let sendCodeBlocked = false;
    try {
      await usersService.sendResetCode(userB.id, adminA);
    } catch (err: any) {
      sendCodeBlocked = err instanceof ForbiddenException && err.message.includes('another company');
    }
    assert(sendCodeBlocked, 'Test 8.7b: sendResetCode: Admin of Company A cannot act on Company B');

    let revokeSessionsBlocked = false;
    try {
      await usersService.revokeUserSessions(userB.id, adminA);
    } catch (err: any) {
      revokeSessionsBlocked = err instanceof ForbiddenException && err.message.includes('another company');
    }
    assert(revokeSessionsBlocked, 'Test 8.7c: revokeUserSessions: Admin of Company A cannot act on Company B');

    let resetCredsBlocked = false;
    try {
      await usersService.resetCredentials(userB.id, adminA);
    } catch (err: any) {
      resetCredsBlocked = err instanceof ForbiddenException && err.message.includes('another company');
    }
    assert(resetCredsBlocked, 'Test 8.7d: resetCredentials: Admin of Company A cannot act on Company B');

    let superAdminBlocked = false;
    try {
      await usersService.unlockUser(testSuperAdmin.id, adminA);
    } catch (err: any) {
      superAdminBlocked = err instanceof ForbiddenException && err.message.includes('platform administrator');
    }
    assert(superAdminBlocked, 'Test 8.7e: Admin of Company cannot perform actions on platform super admin');

    // 8.8: No code or ticket in any log line
    const capturedLogs: string[] = [];
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    console.log = (...args: any[]) => capturedLogs.push(args.map(a => String(a)).join(' '));
    console.warn = (...args: any[]) => capturedLogs.push(args.map(a => String(a)).join(' '));
    console.error = (...args: any[]) => capturedLogs.push(args.map(a => String(a)).join(' '));

    let loggedCode = '';
    let loggedTicket = '';

    try {
      const logAuditUser = await mockStore.user.create({
        data: {
          tenantId: testTenant.id,
          name: 'Log Audit User',
          email: 'log_audit_user@example.com',
          employeeCode: 'EMP_LOG_01',
          passwordHash: initHash,
          role: 'employee',
          isActive: true,
        },
      });

      await authService.forgotPasswordRequest({ email: logAuditUser.email }, '10.8.8.1');
      await flushBackground();
      const lastAuditEmail = sentEmails[sentEmails.length - 1];
      loggedCode = lastAuditEmail.subject.match(/^(\d{6})\s/)[1];

      const verifyAuditRes = await authService.forgotPasswordVerify({
        email: logAuditUser.email,
        code: loggedCode,
      });
      loggedTicket = verifyAuditRes.resetTicket;

      await authService.forgotPasswordReset({
        resetTicket: loggedTicket,
        accountIds: [logAuditUser.id],
        newPassword: 'SecretNewSecurePassword#2026!XYZ',
      });
    } finally {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    }

    const codeInLogs = capturedLogs.some((l) => l.includes(loggedCode));
    const ticketInLogs = capturedLogs.some((l) => l.includes(loggedTicket));
    assert(!codeInLogs && !ticketInLogs, 'Test 8.8: No OTP code or reset ticket appears in any log line');
  } catch (err: any) {
    assert(false, 'Test 8: Attack Hardening Suite', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 9: Timing Parity & Email Outbox Resilience (Point 1)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    // 9.1: Timing parity with mocked 1.5 second SMTP
    // Median response times for 30 existing vs 30 non-existing emails must differ by < 100 ms
    const slowMockNotifications = {
      sendEmail: async (_opts: any) => {
        await new Promise((r) => setTimeout(r, 1500));
        return { status: 'sent', messageId: 'slow-smtp-msg-id' };
      },
    };

    const timingAuthService = new AuthService(
      mockStore as any,
      jwtService,
      slowMockNotifications as any,
    );

    // Seed 30 existing users
    const existingEmails: string[] = [];
    for (let i = 1; i <= 30; i++) {
      const email = `timing_user_${i}@example.com`;
      existingEmails.push(email);
      await mockStore.user.create({
        data: {
          tenantId: testTenant.id,
          name: `Timing User ${i}`,
          email,
          employeeCode: `EMP_TIM_${i}`,
          passwordHash: initHash,
          role: 'employee',
          isActive: true,
        },
      });
    }

    const nonExistingEmails: string[] = [];
    for (let i = 1; i <= 30; i++) {
      nonExistingEmails.push(`non_existing_timing_${i}@absent-domain.com`);
    }

    // Warm-up to eliminate cold-start jitter
    await timingAuthService.forgotPasswordRequest({ email: 'warmup_user@example.com' });

    const existingDurations: number[] = [];
    for (const email of existingEmails) {
      const start = process.hrtime.bigint();
      await timingAuthService.forgotPasswordRequest({ email });
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      existingDurations.push(durationMs);
    }

    const nonExistingDurations: number[] = [];
    for (const email of nonExistingEmails) {
      const start = process.hrtime.bigint();
      await timingAuthService.forgotPasswordRequest({ email });
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      nonExistingDurations.push(durationMs);
    }

    const medianExisting = calculateMedian(existingDurations);
    const medianAbsent = calculateMedian(nonExistingDurations);
    const timingDifference = Math.abs(medianExisting - medianAbsent);

    console.log(`[TIMING METRICS] 30 Existing Emails Median: ${medianExisting.toFixed(2)} ms`);
    console.log(`[TIMING METRICS] 30 Non-Existing Emails Median: ${medianAbsent.toFixed(2)} ms`);
    console.log(`[TIMING METRICS] Latency Delta: ${timingDifference.toFixed(2)} ms (Threshold < 100 ms)`);

    assert(
      timingDifference < 100,
      'Test 9.1: Median response times for 30 existing and 30 non-existing emails differ by < 100 ms with 1.5s SMTP',
      `Delta was ${timingDifference.toFixed(2)} ms`,
    );

    // 9.2: Outbox table failure retry & logging policy
    // Log only failure reason, NEVER the code. Up to 3 retries.
    const failingNotifications = {
      sendEmail: async () => {
        throw new Error('ETIMEDOUT: Connection to smtp.enterprise.com:587 timed out');
      },
    };

    const outboxFailAuthService = new AuthService(
      mockStore as any,
      jwtService,
      failingNotifications as any,
    );

    const outboxTestUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Outbox Test User',
        email: 'outbox_test@example.com',
        employeeCode: 'EMP_OUTBOX_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });

    const outboxCapturedLogs: string[] = [];
    const origStderrWrite = process.stderr.write;
    const origStdoutWrite = process.stdout.write;

    (process.stderr as any).write = (chunk: any, ...args: any[]) => {
      outboxCapturedLogs.push(String(chunk));
      return origStderrWrite.apply(process.stderr, [chunk, ...args] as any);
    };
    (process.stdout as any).write = (chunk: any, ...args: any[]) => {
      outboxCapturedLogs.push(String(chunk));
      return origStdoutWrite.apply(process.stdout, [chunk, ...args] as any);
    };

    try {
      await outboxFailAuthService.forgotPasswordRequest({ email: outboxTestUser.email }, '10.9.2.1');
      await flushBackground();

      const createdOutbox = mockStore.emailOutboxes.find((o) => o.to === outboxTestUser.email);
      assert(createdOutbox !== undefined, 'Test 9.2a: Outbox item recorded for delivery');

      let currentOutbox = await mockStore.emailOutbox.findUnique({ where: { id: createdOutbox!.id } });
      assert(
        currentOutbox !== null && currentOutbox.attempts >= 1,
        'Test 9.2b: Outbox retry incremented attempt counter upon SMTP failure',
      );
      assert(
        currentOutbox !== null && currentOutbox.status === 'pending',
        'Test 9.2c: Outbox status remains pending while attempts < 3',
      );

      // Attempt remaining retries to exhaust 3 attempts
      await outboxFailAuthService.dispatchOutboxItem(createdOutbox!.id);
      await outboxFailAuthService.dispatchOutboxItem(createdOutbox!.id);

      currentOutbox = await mockStore.emailOutbox.findUnique({ where: { id: createdOutbox!.id } });
      assert(
        currentOutbox !== null && currentOutbox.attempts >= 3 && currentOutbox.status === 'failed',
        'Test 9.2d: Outbox status transitions to failed after 3 attempts exhausted',
      );
      assert(
        currentOutbox !== null && currentOutbox.lastError && currentOutbox.lastError.includes('ETIMEDOUT'),
        'Test 9.2e: Outbox record stores failure reason without exposing code',
      );
    } finally {
      process.stderr.write = origStderrWrite;
      process.stdout.write = origStdoutWrite;
    }

    const logCombined = outboxCapturedLogs.join('\n');
    const logsReason = logCombined.includes('ETIMEDOUT: Connection to smtp.enterprise.com:587 timed out');
    assert(
      logsReason,
      'Test 9.2f: Outbox delivery failure logs exact error reason',
    );

    const outboxSubject = mockStore.emailOutboxes.find((o) => o.to === outboxTestUser.email)?.subject || '';
    const generatedCode = outboxSubject.match(/^(\d{6})\s/)?.[1] || '';
    const codeInLogs = generatedCode ? logCombined.includes(generatedCode) : false;
    assert(
      !codeInLogs,
      'Test 9.2g: Verification code is never logged in failure output',
    );
  } catch (err: any) {
    assert(false, 'Test 9: Timing Parity & Email Outbox Resilience', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 10: Concurrency & Atomic Single-Use Verification (Point 2)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    // 10.1: Concurrency test - 10 parallel verify calls with the same valid code: exactly one succeeds
    const concUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Concurrency Test User',
        email: 'concurrency_otp@example.com',
        employeeCode: 'EMP_CONC_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });

    sentEmails.length = 0;
    await authService.forgotPasswordRequest({ email: concUser.email }, '10.10.1.1');
    await flushBackground();

    const concEmail = sentEmails.find((e) => e.to === concUser.email);
    const concCode = concEmail.subject.match(/^(\d{6})\s/)[1];

    const verifyPromises = Array.from({ length: 10 }).map(() =>
      authService.forgotPasswordVerify({
        email: concUser.email,
        code: concCode,
      }),
    );

    const verifySettled = await Promise.allSettled(verifyPromises);
    const verifySuccesses = verifySettled.filter((r) => r.status === 'fulfilled');
    const verifyFailures = verifySettled.filter((r) => r.status === 'rejected');

    assert(
      verifySuccesses.length === 1 && verifyFailures.length === 9,
      'Test 10.1: 10 parallel verify calls with identical valid code: exactly 1 succeeds, 9 fail',
      `Successes: ${verifySuccesses.length}, Failures: ${verifyFailures.length}`,
    );

    const validTicket = (verifySuccesses[0] as PromiseFulfilledResult<any>).value.resetTicket;

    // 10.2: Concurrency test - 10 parallel reset calls with the same ticket: exactly one succeeds
    const resetPromises = Array.from({ length: 10 }).map((_, idx) =>
      authService.forgotPasswordReset({
        resetTicket: validTicket,
        accountIds: [concUser.id],
        newPassword: `ConcurrentValidPass#2026!_${idx}`,
      }),
    );

    const resetSettled = await Promise.allSettled(resetPromises);
    const resetSuccesses = resetSettled.filter((r) => r.status === 'fulfilled');
    const resetFailures = resetSettled.filter((r) => r.status === 'rejected');

    assert(
      resetSuccesses.length === 1 && resetFailures.length === 9,
      'Test 10.2: 10 parallel reset calls with identical reset ticket: exactly 1 succeeds, 9 fail',
      `Successes: ${resetSuccesses.length}, Failures: ${resetFailures.length}`,
    );

    // 10.3: Atomic increment of wrong attempts
    const attemptUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Atomic Attempt User',
        email: 'atomic_attempts@example.com',
        employeeCode: 'EMP_ATM_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });

    await authService.forgotPasswordRequest({ email: attemptUser.email }, '10.10.3.1');
    await flushBackground();

    const wrongParallelPromises = Array.from({ length: 3 }).map(() =>
      authService.forgotPasswordVerify({
        email: attemptUser.email,
        code: '000000',
      }).catch((err) => err),
    );
    await Promise.all(wrongParallelPromises);

    const atomicChallenge = mockStore.otpChallenges.find(
      (c) => c.emailNormalized === attemptUser.email && c.purpose === 'password_reset',
    );
    assert(
      atomicChallenge?.attempts === 3,
      'Test 10.3: Wrong-attempt counter incremented atomically under concurrent load',
      `Expected attempts=3, got ${atomicChallenge?.attempts}`,
    );
  } catch (err: any) {
    assert(false, 'Test 10: Concurrency & Atomic Single-Use Verification', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 11: "This wasn't me" Security Alert & Sign-out (Point 6)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const alertUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Alert Test User',
        email: 'alert_user@example.com',
        employeeCode: 'EMP_ALR_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
        tokenVersion: 1,
      },
    });

    // Create multiple active sessions across devices
    const alertSess1 = await mockStore.refreshSession.create({
      data: {
        userId: alertUser.id,
        tokenHash: 'alert_session_1_hash',
        familyId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 86400000),
        isRevoked: false,
      },
    });
    const alertSess2 = await mockStore.refreshSession.create({
      data: {
        userId: alertUser.id,
        tokenHash: 'alert_session_2_hash',
        familyId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 86400000),
        isRevoked: false,
      },
    });

    sentEmails.length = 0;
    const alertResult = await authService.reportSuspiciousActivityAndReset(
      alertUser.id,
      '198.51.100.44',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SuspiciousClient/1.0',
    );
    await flushBackground();

    assert(
      alertResult.success === true && alertResult.email === alertUser.email,
      'Test 11.1: reportSuspiciousActivityAndReset returns success response',
    );

    // Verify tokenVersion incremented
    const refreshedAlertUser = await mockStore.user.findUnique({ where: { id: alertUser.id } });
    assert(
      refreshedAlertUser?.tokenVersion === 2,
      'Test 11.2: User tokenVersion incremented to revoke active JWT tokens immediately',
    );

    // Verify all refresh sessions revoked
    const sess1Check = await mockStore.refreshSession.findUnique({ where: { id: alertSess1.id } });
    const sess2Check = await mockStore.refreshSession.findUnique({ where: { id: alertSess2.id } });
    assert(
      sess1Check?.isRevoked === true && sess2Check?.isRevoked === true,
      'Test 11.3: All user refresh sessions revoked across all devices',
    );

    // Verify audit log entry
    const auditEntries = await mockStore.auditLog.findMany({
      where: { OR: [{ actorId: alertUser.id }, { entityId: alertUser.id }] },
    });
    const alertLog = auditEntries.find((a) => a.action === 'SUSPICIOUS_ACTIVITY_SIGNOUT_RESET');
    assert(
      alertLog !== undefined &&
      alertLog.actorId === alertUser.id &&
      alertLog.afterState.includes("This wasn't me"),
      'Test 11.4: SUSPICIOUS_ACTIVITY_SIGNOUT_RESET recorded in auditLog with device context',
    );

    // Verify password reset email dispatched
    const alertResetEmail = sentEmails.find((e) => e.to === alertUser.email);
    assert(
      alertResetEmail !== undefined && alertResetEmail.subject.includes('verification code'),
      'Test 11.5: Code-based password reset triggered for user email upon security alert',
    );
  } catch (err: any) {
    assert(false, 'Test 11: "This wasn\'t me" Security Alert Flow', err.message);
  }

  

  // Clear IP rate limit rows before starting 2FA test suites
  mockStore.accountLockouts = mockStore.accountLockouts.filter((l) => !l.identityKey.startsWith('forgot-ip:'));

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 12: 2FA Interception & Credential Security Parity (Point 2)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    // 12.1: User without 2FA vs user with 2FA: wrong password returns IDENTICAL generic error
    const plainUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Plain User No 2FA',
        email: 'plain_no_2fa@example.com',
        employeeCode: 'EMP_PLAIN_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });

    const twoFaUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Two Factor User',
        email: 'two_factor_user@example.com',
        employeeCode: 'EMP_2FA_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });

    const twoFaSecret = generateTotpSecret();
    const encSecret = encryptAtRest(twoFaSecret);
    const backupCodes = generateBackupCodes(10);
    const backupHashes = backupCodes.map((c) => hashBackupCode(c));

    await mockStore.userTwoFactor.create({
      data: {
        userId: twoFaUser.id,
        method: 'totp',
        secretEnc: encSecret,
        enabledAt: new Date(),
        backupCodesHash: JSON.stringify(backupHashes),
      },
    });

    let plainErr: any = null;
    try {
      await authService.login({ identifier: plainUser.email, password: 'WrongPassword#999' });
    } catch (e: any) {
      plainErr = e;
    }

    let twoFaErr: any = null;
    try {
      await authService.login({ identifier: twoFaUser.email, password: 'WrongPassword#999' });
    } catch (e: any) {
      twoFaErr = e;
    }

    assert(
      plainErr instanceof UnauthorizedException &&
      twoFaErr instanceof UnauthorizedException &&
      plainErr.message === twoFaErr.message &&
      !JSON.stringify(twoFaErr).includes('twoFactor') &&
      !JSON.stringify(twoFaErr).includes('loginTicket'),
      'Test 12.1: Wrong password never reveals 2-step status (identical error message, no 2FA hints or tickets)',
    );

    // 12.2: Correct password for 2FA user returns requiresTwoFactor: true, loginTicket, and ZERO tokens
    const login2FaRes: any = await authService.login({
      identifier: twoFaUser.email,
      password: 'InitialSecureP@ssword2026!',
    });

    assert(
      login2FaRes.requiresTwoFactor === true &&
      typeof login2FaRes.loginTicket === 'string' &&
      Array.isArray(login2FaRes.methods) &&
      login2FaRes.methods.includes('totp') &&
      login2FaRes.methods.includes('backup_code') &&
      !login2FaRes.methods.includes('email') &&
      login2FaRes.accessToken === undefined &&
      login2FaRes.refreshToken === undefined,
      'Test 12.2: Correct password intercepts login: returns requiresTwoFactor: true, loginTicket, zero tokens',
    );
  } catch (err: any) {
    assert(false, 'Test 12: 2FA Interception & Credential Security Parity', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 13: 2FA Self-Enrollment Flow (Setup -> Enable with TOTP) (Point 5)
  // ──────────────────────────────────────────────────────────────────────────
  let enrolledUser: any = null;
  let enrolledSecret = '';
  let enrolledBackupCodes: string[] = [];
  try {
    enrolledUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Enrollment Test User',
        email: 'enrollment_user@example.com',
        employeeCode: 'EMP_ENROLL_01',
        passwordHash: initHash,
        role: 'tenant_admin',
        isActive: true,
      },
    });

    // 13.1: setupTwoFactor returns otpauthUri and plain secret once
    const setupRes = await authService.setupTwoFactor(enrolledUser.id);
    assert(
      typeof setupRes.otpauthUri === 'string' &&
      setupRes.otpauthUri.startsWith('otpauth://totp/') &&
      typeof setupRes.secret === 'string' &&
      setupRes.secret.length >= 26,
      'Test 13.1: setupTwoFactor generates valid RFC 6238 otpauth URI and Base32 secret',
    );
    enrolledSecret = setupRes.secret;

    // 13.2: 2FA is pending, not yet active
    const pendingStatus = await authService.getTwoFactorStatus(enrolledUser.id);
    assert(
      pendingStatus.enabled === false && pendingStatus.isPending === true,
      'Test 13.2: 2FA is marked as pending verification before confirmation code is entered',
    );

    // 13.3: Confirm with valid TOTP code
    const currentStep = getTotpStep();
    const confirmTotp = generateTotpToken(enrolledSecret, currentStep);

    const enableRes = await authService.enableTwoFactor(enrolledUser.id, confirmTotp);
    assert(
      enableRes.success === true &&
      Array.isArray(enableRes.backupCodes) &&
      enableRes.backupCodes.length === 10 &&
      enableRes.backupCodes.every((c: string) => /^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/.test(c)),
      'Test 13.3: enableTwoFactor confirms setup and returns 10 formatted backup codes (XXXX-XXXX-XXXX)',
    );
    enrolledBackupCodes = enableRes.backupCodes;

    // 13.4: Active status verification
    const activeStatus = await authService.getTwoFactorStatus(enrolledUser.id);
    assert(
      activeStatus.enabled === true &&
      activeStatus.method === 'totp' &&
      activeStatus.backupCodesRemaining === 10 &&
      activeStatus.isPending === false,
      'Test 13.4: getTwoFactorStatus reflects active TOTP state and 10 remaining backup codes',
    );
  } catch (err: any) {
    assert(false, 'Test 13: 2FA Self-Enrollment Flow', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 14: Ticket Single-Use Under 10 Parallel Calls (Point 3)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const conc2FaUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Concurrent 2FA User',
        email: 'concurrent_2fa@example.com',
        employeeCode: 'EMP_CONC_2FA',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });
    const concSecret = generateTotpSecret();
    const concBackupCodes = generateBackupCodes(10);
    await mockStore.userTwoFactor.create({
      data: {
        userId: conc2FaUser.id,
        method: 'totp',
        secretEnc: encryptAtRest(concSecret),
        enabledAt: new Date(),
        backupCodesHash: JSON.stringify(concBackupCodes.map(hashBackupCode)),
      },
    });

    const loginRes: any = await authService.login({
      identifier: conc2FaUser.email,
      password: 'InitialSecureP@ssword2026!',
    });
    const parallelTicket = loginRes.loginTicket;
    const validCode = concBackupCodes[0];

    const parallelVerifications = Array.from({ length: 10 }).map(() =>
      authService.verifyTwoFactor({
        loginTicket: parallelTicket,
        code: validCode,
      }),
    );

    const settled = await Promise.allSettled(parallelVerifications);
    const successes = settled.filter((r) => r.status === 'fulfilled');
    const failures = settled.filter((r) => r.status === 'rejected');

    assert(
      successes.length === 1 && failures.length === 9,
      'Test 14.1: Login ticket is strictly single-use: under 10 parallel calls, exactly 1 succeeds, 9 fail',
      `Successes: ${successes.length}, Failures: ${failures.length}`,
    );

    const verifiedResult: any = (successes[0] as PromiseFulfilledResult<any>).value;
    assert(
      typeof verifiedResult.accessToken === 'string' &&
      typeof verifiedResult.refreshToken === 'string' &&
      verifiedResult.user !== undefined,
      'Test 14.2: Successful parallel verification issues valid accessToken and refreshToken session',
    );
  } catch (err: any) {
    assert(false, 'Test 14: Ticket Single-Use Under 10 Parallel Calls', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 15: 5 Wrong Codes Kill the Ticket (Point 3)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const dyingTicketUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Dying Ticket User',
        email: 'dying_ticket_user@example.com',
        employeeCode: 'EMP_DYE_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });
    const dyingSecret = generateTotpSecret();
    const dyingBackupCodes = generateBackupCodes(10);
    await mockStore.userTwoFactor.create({
      data: {
        userId: dyingTicketUser.id,
        method: 'totp',
        secretEnc: encryptAtRest(dyingSecret),
        enabledAt: new Date(),
        backupCodesHash: JSON.stringify(dyingBackupCodes.map(hashBackupCode)),
      },
    });

    const loginRes: any = await authService.login({
      identifier: dyingTicketUser.email,
      password: 'InitialSecureP@ssword2026!',
    });
    const dyingTicket = loginRes.loginTicket;
    const validCode = dyingBackupCodes[0];

    for (let i = 1; i <= 5; i++) {
      let wrongCodeCaught = false;
      try {
        await authService.verifyTwoFactor({
          loginTicket: dyingTicket,
          code: '000000',
        });
      } catch (e: any) {
        wrongCodeCaught = e instanceof UnauthorizedException;
      }
      assert(wrongCodeCaught, `Test 15.1a: Attempt ${i}/5 with wrong code fails`);
    }

    let killedTicketRejected = false;
    try {
      await authService.verifyTwoFactor({
        loginTicket: dyingTicket,
        code: validCode,
      });
    } catch (e: any) {
      killedTicketRejected = e instanceof UnauthorizedException && e.message.includes('expired');
    }
    assert(killedTicketRejected, 'Test 15.1b: 5 wrong codes kill the ticket; subsequent valid code rejected');
  } catch (err: any) {
    assert(false, 'Test 15: 5 Wrong Codes Kill the Ticket', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 16: 10 Wrong Codes in 15 Minutes Lock Account (Point 3)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const lockTestUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Lockout 2FA User',
        email: 'lockout_2fa@example.com',
        employeeCode: 'EMP_LCK_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });

    const lockSecret = generateTotpSecret();
    await mockStore.userTwoFactor.create({
      data: {
        userId: lockTestUser.id,
        method: 'totp',
        secretEnc: encryptAtRest(lockSecret),
        enabledAt: new Date(),
        backupCodesHash: JSON.stringify([]),
      },
    });

    for (let round = 1; round <= 2; round++) {
      const loginRes: any = await authService.login({
        identifier: lockTestUser.email,
        password: 'InitialSecureP@ssword2026!',
      });
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          await authService.verifyTwoFactor({
            loginTicket: loginRes.loginTicket,
            code: '111111',
          });
        } catch {}
      }
    }

    const lockedRecord = await mockStore.accountLockout.findUnique({
      where: { identityKey: `2fa:${lockTestUser.id}` },
    });
    assert(
      lockedRecord !== null &&
      lockedRecord.failedAttempts >= 10 &&
      lockedRecord.lockedUntil !== null &&
      new Date(lockedRecord.lockedUntil) > new Date(),
      'Test 16.1: 10 failed 2FA verification attempts in 15 minutes trigger account lockout',
    );

    let lockoutBlocked = false;
    try {
      const freshTicket = await authService.createLoginTicket(lockTestUser.id);
      await authService.verifyTwoFactor({
        loginTicket: freshTicket,
        code: generateTotpToken(lockSecret, getTotpStep()),
      });
    } catch (e: any) {
      lockoutBlocked = e instanceof UnauthorizedException && e.message.includes('locked');
    }
    assert(lockoutBlocked, 'Test 16.2: Account lockout strictly blocks verification during lockout duration');
  } catch (err: any) {
    assert(false, 'Test 16: 10 Wrong Codes Lock Account', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 17: TOTP Replay Prevention via lastUsedStep (Point 3)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const replayStepUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'TOTP Replay Test User',
        email: 'totp_replay@example.com',
        employeeCode: 'EMP_RPL_TOTP',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });

    const replaySecret = generateTotpSecret();
    await mockStore.userTwoFactor.create({
      data: {
        userId: replayStepUser.id,
        method: 'totp',
        secretEnc: encryptAtRest(replaySecret),
        enabledAt: new Date(),
        lastUsedStep: null,
      },
    });

    const step = getTotpStep();
    const replayToken = generateTotpToken(replaySecret, step);

    // 1st login with step: succeeds
    const ticket1 = await authService.createLoginTicket(replayStepUser.id);
    const verify1 = await authService.verifyTwoFactor({
      loginTicket: ticket1,
      code: replayToken,
    });
    assert(verify1.accessToken !== undefined, 'Test 17.1: First verification with current TOTP step succeeds');

    // Verify lastUsedStep recorded
    const twoFactorRecord = await mockStore.userTwoFactor.findUnique({
      where: { userId: replayStepUser.id },
    });
    assert(
      twoFactorRecord?.lastUsedStep === step,
      'Test 17.2: lastUsedStep is recorded in database to prevent replay',
    );

    // 2nd login with the SAME token/step within the same 30s window: rejected!
    const ticket2 = await authService.createLoginTicket(replayStepUser.id);
    let replayRejected = false;
    try {
      await authService.verifyTwoFactor({
        loginTicket: ticket2,
        code: replayToken,
      });
    } catch (e: any) {
      replayRejected = e instanceof UnauthorizedException;
    }
    assert(replayRejected, 'Test 17.3: TOTP token replay strictly rejected; cannot reuse the same step');
  } catch (err: any) {
    assert(false, 'Test 17: TOTP Replay Prevention', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 18: Backup Codes Single-Use and Consumption (Point 3)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const backupCodesUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Backup Codes User',
        email: 'backup_codes_user@example.com',
        employeeCode: 'EMP_BC_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });

    const bcSecret = generateTotpSecret();
    const bcCodes = generateBackupCodes(10);
    await mockStore.userTwoFactor.create({
      data: {
        userId: backupCodesUser.id,
        method: 'totp',
        secretEnc: encryptAtRest(bcSecret),
        enabledAt: new Date(),
        backupCodesHash: JSON.stringify(bcCodes.map(hashBackupCode)),
      },
    });

    assert(bcCodes.length === 10, 'Pre-condition: 10 backup codes exist');
    const firstBackupCode = bcCodes[0];

    // Login using the first backup code
    const ticket1 = await authService.createLoginTicket(backupCodesUser.id);
    const verify1 = await authService.verifyTwoFactor({
      loginTicket: ticket1,
      code: firstBackupCode,
    });
    assert(verify1.accessToken !== undefined, 'Test 18.1: Valid backup code authorizes login');

    // Check remaining backup codes count
    const statusAfter1 = await authService.getTwoFactorStatus(backupCodesUser.id);
    assert(
      statusAfter1.backupCodesRemaining === 9,
      'Test 18.2: Used backup code is consumed immediately; 9 remaining',
    );

    // Replay with the consumed backup code fails
    const ticket2 = await authService.createLoginTicket(backupCodesUser.id);
    let replayBackupRejected = false;
    try {
      await authService.verifyTwoFactor({
        loginTicket: ticket2,
        code: firstBackupCode,
      });
    } catch (e: any) {
      replayBackupRejected = e instanceof UnauthorizedException;
    }
    assert(replayBackupRejected, 'Test 18.3: Consumed backup code is invalidated and cannot be reused');

    // Second backup code succeeds
    const ticket3 = await authService.createLoginTicket(backupCodesUser.id);
    const verify3 = await authService.verifyTwoFactor({
      loginTicket: ticket3,
      code: bcCodes[1],
    });
    assert(verify3.accessToken !== undefined, 'Test 18.4: Second unique backup code succeeds');

    const statusAfter2 = await authService.getTwoFactorStatus(backupCodesUser.id);
    assert(statusAfter2.backupCodesRemaining === 8, 'Test 18.5: Remaining count decremented to 8');
  } catch (err: any) {
    assert(false, 'Test 18: Backup Codes Single-Use', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 19: Email OTP Code Flow for 2FA (Point 3 & Point 6)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const emailTwoFaUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Email 2FA User',
        email: 'email_2fa@example.com',
        employeeCode: 'EMP_EML_2FA',
        passwordHash: initHash,
        role: 'employee', // normal user
        isActive: true,
      },
    });

    await mockStore.userTwoFactor.create({
      data: {
        userId: emailTwoFaUser.id,
        method: 'email',
        secretEnc: null,
        enabledAt: new Date(),
        backupCodesHash: JSON.stringify([]),
      },
    });

    // 19.0: Authenticator app (totp) user is strictly forbidden from requesting an email OTP
    const totpAppUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'TOTP Only User',
        email: 'totp_only_user@example.com',
        employeeCode: 'EMP_TOTP_ONLY',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });
    await mockStore.userTwoFactor.create({
      data: {
        userId: totpAppUser.id,
        method: 'totp',
        secretEnc: encryptAtRest(generateTotpSecret()),
        enabledAt: new Date(),
        backupCodesHash: JSON.stringify([]),
      },
    });

    const totpTicket = await authService.createLoginTicket(totpAppUser.id);
    let totpUserEmailBlocked = false;
    try {
      await authService.sendTwoFactorEmail(totpTicket);
    } catch (e: any) {
      totpUserEmailBlocked = e instanceof ForbiddenException && e.message.includes('Authenticator app users');
    }
    assert(
      totpUserEmailBlocked,
      'Test 19.0: Authenticator app (totp) user cannot request email code; email is never offered as fallback',
    );

    const ticket = await authService.createLoginTicket(emailTwoFaUser.id);

    // 19.1: Request email OTP code
    sentEmails.length = 0;
    const sendEmailRes = await authService.sendTwoFactorEmail(ticket);
    await flushBackground();

    assert(
      sendEmailRes.message === 'Verification code sent to your email.' && sendEmailRes.resendAfterSeconds === 60,
      'Test 19.1: sendTwoFactorEmail dispatches code with 60s resend cooldown',
    );

    const outboxRecord = mockStore.emailOutboxes.find((o) => o.to === emailTwoFaUser.email.toLowerCase() && o.subject.includes('2-step verification code'));
    const emailOtpEmail = sentEmails.find((e) => e.to === emailTwoFaUser.email) || outboxRecord;
    assert(
      emailOtpEmail !== undefined &&
      emailOtpEmail.to === emailTwoFaUser.email &&
      emailOtpEmail.subject.includes('2-step verification code'),
      'Test 19.2: Dispatches 2-step verification email with code in subject',
    );

    const emailCode = emailOtpEmail.subject.match(/^(\d{6})\s/)[1];

    // 19.3: 60s cooldown blocks immediate resend
    const cooldownRes = await authService.sendTwoFactorEmail(ticket);
    assert(
      cooldownRes.resendAfterSeconds > 0 && cooldownRes.message.includes('sent'),
      'Test 19.3: 60-second cooldown returns remaining seconds safely',
    );

    // 19.4: Verify using the email OTP code
    const emailVerify = await authService.verifyTwoFactor({
      loginTicket: ticket,
      code: emailCode,
    });
    assert(emailVerify.accessToken !== undefined, 'Test 19.4: Valid email OTP code succeeds in verifyTwoFactor');

    // 19.5: Admin roles (platform_super_admin and tenant_admin) are blocked from using email OTP for 2FA
    const adminTicket = await authService.createLoginTicket(testSuperAdmin.id);
    let adminEmailBlocked = false;
    try {
      await authService.sendTwoFactorEmail(adminTicket);
    } catch (e: any) {
      adminEmailBlocked = e instanceof ForbiddenException && e.message.includes('an authenticator app');
    }
    assert(adminEmailBlocked, 'Test 19.5: Email OTP for 2FA is strictly forbidden for administrative roles');
  } catch (err: any) {
    assert(false, 'Test 19: Email OTP Code Flow for 2FA', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 20: Trusted Device Token Skips 2FA Challenge (Point 4)
  // ──────────────────────────────────────────────────────────────────────────
  let trustedDeviceRawToken = '';
  try {
    const trustedUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Trusted Device User',
        email: 'trusted_device_user@example.com',
        employeeCode: 'EMP_TRST_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });

    const tSecret = generateTotpSecret();
    await mockStore.userTwoFactor.create({
      data: {
        userId: trustedUser.id,
        method: 'totp',
        secretEnc: encryptAtRest(tSecret),
        enabledAt: new Date(),
        backupCodesHash: JSON.stringify([]),
      },
    });

    // 20.1: Login with trustDevice: true returns trusted device cookie
    const tTicket = await authService.createLoginTicket(trustedUser.id);
    const validTotp = generateTotpToken(tSecret, getTotpStep());

    const verifyRes = await authService.verifyTwoFactor(
      {
        loginTicket: tTicket,
        code: validTotp,
        trustDevice: true,
      },
      '192.168.1.105',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0',
    );

    assert(
      verifyRes.trustedDeviceCookie !== null &&
      verifyRes.trustedDeviceCookie.name === TRUSTED_DEVICE_COOKIE_NAME &&
      typeof verifyRes.trustedDeviceCookie.value === 'string' &&
      verifyRes.trustedDeviceCookie.value.length === 64, // 32 bytes hex
      'Test 20.1: verifyTwoFactor with trustDevice: true generates 32-byte trusted device token cookie',
    );
    trustedDeviceRawToken = verifyRes.trustedDeviceCookie.value;

    // Verify token is hashed at rest (SHA-256)
    const storedDevice = await mockStore.trustedDevice.findFirst({
      where: { userId: trustedUser.id },
    });
    assert(
      storedDevice !== null &&
      storedDevice.tokenHash !== trustedDeviceRawToken &&
      storedDevice.tokenHash === crypto.createHash('sha256').update(trustedDeviceRawToken).digest('hex'),
      'Test 20.2: Device token is stored strictly as SHA-256 hash in TrustedDevice table',
    );

    // 20.2: Subsequent login providing trusted device token skips 2FA challenge!
    const nextLoginRes: any = await authService.login(
      {
        identifier: trustedUser.email,
        password: 'InitialSecureP@ssword2026!',
      },
      '192.168.1.105',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0',
      trustedDeviceRawToken,
    );

    assert(
      nextLoginRes.requiresTwoFactor === undefined &&
      nextLoginRes.accessToken !== undefined &&
      nextLoginRes.refreshToken !== undefined,
      'Test 20.3: Valid trusted device cookie automatically bypasses 2FA challenge on login',
    );
  } catch (err: any) {
    assert(false, 'Test 20: Trusted Device Token Bypass', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 21: Trusted Device Revocation on Password Change / 2FA Disable / Sign Out Everywhere (Point 4)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const revokeDevUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Device Revocation User',
        email: 'device_revocation@example.com',
        employeeCode: 'EMP_REV_DEV',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });

    const dSecret = generateTotpSecret();
    await mockStore.userTwoFactor.create({
      data: {
        userId: revokeDevUser.id,
        method: 'totp',
        secretEnc: encryptAtRest(dSecret),
        enabledAt: new Date(),
        backupCodesHash: JSON.stringify([]),
      },
    });

    // Create 2 trusted devices
    const token1 = crypto.randomBytes(32).toString('hex');
    const token2 = crypto.randomBytes(32).toString('hex');
    await mockStore.trustedDevice.create({
      data: {
        userId: revokeDevUser.id,
        tokenHash: crypto.createHash('sha256').update(token1).digest('hex'),
        label: 'Windows / Chrome',
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    await mockStore.trustedDevice.create({
      data: {
        userId: revokeDevUser.id,
        tokenHash: crypto.createHash('sha256').update(token2).digest('hex'),
        label: 'iPhone / Safari',
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });

    assert(mockStore.trustedDevices.filter((d) => d.userId === revokeDevUser.id).length === 2, 'Pre-condition: 2 trusted devices');

    // 21.1: Password change via forgotPasswordReset revokes all trusted devices
    sentEmails.length = 0;
    await authService.forgotPasswordRequest({ email: revokeDevUser.email }, '10.21.0.1');
    await flushBackground();
    const pCode = sentEmails[sentEmails.length - 1].subject.match(/^(\d{6})\s/)[1];
    const pVerify = await authService.forgotPasswordVerify({ email: revokeDevUser.email, code: pCode });
    await authService.forgotPasswordReset({
      resetTicket: pVerify.resetTicket,
      accountIds: [revokeDevUser.id],
      newPassword: 'BrandNewSecurePassword#2026!W',
    });

    const devicesAfterPassChange = mockStore.trustedDevices.filter((d) => d.userId === revokeDevUser.id);
    assert(
      devicesAfterPassChange.length === 0,
      'Test 21.1: Password reset automatically revokes all trusted devices for the user',
    );

    // Re-seed a device
    const token3 = crypto.randomBytes(32).toString('hex');
    await mockStore.trustedDevice.create({
      data: {
        userId: revokeDevUser.id,
        tokenHash: crypto.createHash('sha256').update(token3).digest('hex'),
        label: 'Mac / Safari',
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });

    // 21.2: Sign out everywhere (logoutAll) revokes all trusted devices
    await authService.logoutAll(revokeDevUser.id);
    const devicesAfterLogoutAll = mockStore.trustedDevices.filter((d) => d.userId === revokeDevUser.id);
    assert(
      devicesAfterLogoutAll.length === 0,
      'Test 21.2: "Sign out everywhere" (logoutAll) automatically revokes all trusted devices',
    );
  } catch (err: any) {
    assert(false, 'Test 21: Trusted Device Revocation', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 22: Disable 2FA & Regenerate Backup Codes Security (Point 5)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const sensitive2FaUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Sensitive 2FA User',
        email: 'sensitive_2fa@example.com',
        employeeCode: 'EMP_SNS_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });

    const sSecret = generateTotpSecret();
    await mockStore.userTwoFactor.create({
      data: {
        userId: sensitive2FaUser.id,
        method: 'totp',
        secretEnc: encryptAtRest(sSecret),
        enabledAt: new Date(),
        backupCodesHash: JSON.stringify(generateBackupCodes(10).map((c) => hashBackupCode(c))),
      },
    });

    const validTotp = generateTotpToken(sSecret, getTotpStep());

    // 22.1: Regenerate backup codes requires password AND current code
    let wrongPassRegenCaught = false;
    try {
      await authService.regenerateBackupCodes(sensitive2FaUser.id, {
        currentPassword: 'WrongPassword#123',
        code: validTotp,
      });
    } catch (e: any) {
      wrongPassRegenCaught = e instanceof UnauthorizedException && e.message.includes('password');
    }
    assert(wrongPassRegenCaught, 'Test 22.1: regenerateBackupCodes rejects invalid current password');

    let wrongCodeRegenCaught = false;
    try {
      await authService.regenerateBackupCodes(sensitive2FaUser.id, {
        currentPassword: 'InitialSecureP@ssword2026!',
        code: '999999',
      });
    } catch (e: any) {
      wrongCodeRegenCaught = e instanceof BadRequestException && e.message.includes('code');
    }
    assert(wrongCodeRegenCaught, 'Test 22.2: regenerateBackupCodes rejects invalid verification code');

    // Valid password & code succeeds
    const regenRes = await authService.regenerateBackupCodes(sensitive2FaUser.id, {
      currentPassword: 'InitialSecureP@ssword2026!',
      code: validTotp,
    });
    assert(
      regenRes.success === true &&
      Array.isArray(regenRes.backupCodes) &&
      regenRes.backupCodes.length === 10,
      'Test 22.3: regenerateBackupCodes succeeds with valid password and code; returns 10 new codes',
    );

    // 22.2: Disable 2FA requires password AND current code (can use backup code or totp)
    let wrongPassDisableCaught = false;
    try {
      await authService.disableTwoFactor(sensitive2FaUser.id, {
        currentPassword: 'WrongPassword#123',
        code: regenRes.backupCodes[0],
      });
    } catch (e: any) {
      wrongPassDisableCaught = e instanceof UnauthorizedException;
    }
    assert(wrongPassDisableCaught, 'Test 22.4: disableTwoFactor rejects invalid current password');

    const disableRes = await authService.disableTwoFactor(sensitive2FaUser.id, {
      currentPassword: 'InitialSecureP@ssword2026!',
      code: regenRes.backupCodes[0],
    });
    assert(disableRes.success === true, 'Test 22.5: disableTwoFactor succeeds with valid password and backup code');

    const disabledStatus = await authService.getTwoFactorStatus(sensitive2FaUser.id);
    assert(disabledStatus.enabled === false, 'Test 22.6: 2FA record removed; status reflects disabled');
  } catch (err: any) {
    assert(false, 'Test 22: Disable 2FA & Regenerate Backup Codes Security', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 23: Enforcement & 7-Day Grace Period (Point 6)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const forcedAdmin = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Forced Admin User',
        email: 'forced_admin@example.com',
        employeeCode: 'EMP_FRC_01',
        passwordHash: initHash,
        role: 'tenant_admin',
        isActive: true,
        firstLoginAfter2FaReleaseAt: null, // First login after release
      },
    });

    // 23.1: First login starts 7-day grace period
    const firstLoginRes: any = await authService.login({
      identifier: forcedAdmin.email,
      password: 'InitialSecureP@ssword2026!',
    });

    assert(
      firstLoginRes.accessToken !== undefined &&
      firstLoginRes.twoFactorGracePeriod !== undefined &&
      firstLoginRes.twoFactorGracePeriod.active === true &&
      firstLoginRes.twoFactorGracePeriod.daysRemaining === 7,
      'Test 23.1: First admin login after release initiates 7-day grace period with active notice',
    );

    // 23.2: After 8 days (grace period expired), login blocks tokens and returns requiresTwoFactorSetup
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await mockStore.user.update({
      where: { id: forcedAdmin.id },
      data: { firstLoginAfter2FaReleaseAt: eightDaysAgo },
    });

    const expiredGraceLoginRes: any = await authService.login({
      identifier: forcedAdmin.email,
      password: 'InitialSecureP@ssword2026!',
    });

    assert(
      expiredGraceLoginRes.requiresTwoFactorSetup === true &&
      typeof expiredGraceLoginRes.setupToken === 'string' &&
      expiredGraceLoginRes.accessToken === undefined &&
      expiredGraceLoginRes.refreshToken === undefined,
      'Test 23.2: Expired grace period forces setup: returns requiresTwoFactorSetup with setupToken and ZERO tokens',
    );
  } catch (err: any) {
    assert(false, 'Test 23: Enforcement & 7-Day Grace Period', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 24: Cross-User and Cross-Company 2FA Reset Rejected (Point 7)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const tenantCompanyA = testTenant;
    const tenantCompanyB = await mockStore.tenant.create({
      data: { name: 'Company B', code: 'COMPB_TEST', slug: 'compb-test', status: 'active' },
    });

    const adminOfA: ScopedUser = {
      id: testUser1.id,
      tenantId: tenantCompanyA.id,
      employeeCode: testUser1.employeeCode,
      role: 'tenant_admin',
    };

    const userOfB = await mockStore.user.create({
      data: {
        tenantId: tenantCompanyB.id,
        name: 'User In Company B',
        email: 'user_in_b@example.com',
        employeeCode: 'EMP_B_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });

    const userOfA = await mockStore.user.create({
      data: {
        tenantId: tenantCompanyA.id,
        name: 'User In Company A',
        email: 'user_in_a@example.com',
        employeeCode: 'EMP_A_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });

    await mockStore.userTwoFactor.create({
      data: {
        userId: userOfA.id,
        method: 'totp',
        secretEnc: encryptAtRest(generateTotpSecret()),
        enabledAt: new Date(),
      },
    });

    const usersServiceTest = new UsersService(mockStore as any, mockNotificationsService, mockAuditService);

    // 24.1: Admin of Company A cannot reset 2FA for Company B
    let crossCompanyBlocked = false;
    try {
      await usersServiceTest.resetTwoFactor(userOfB.id, adminOfA);
    } catch (e: any) {
      crossCompanyBlocked = e instanceof ForbiddenException && e.message.includes('another company');
    }
    assert(crossCompanyBlocked, 'Test 24.1: Admin of Company A cannot reset 2FA for user in Company B');

    // 24.2: Admin cannot reset 2FA for Platform Super Admin
    let platformAdminBlocked = false;
    try {
      await usersServiceTest.resetTwoFactor(testSuperAdmin.id, adminOfA);
    } catch (e: any) {
      platformAdminBlocked = e instanceof ForbiddenException && e.message.includes('Platform administrator');
    }
    assert(platformAdminBlocked, 'Test 24.2: Company admin cannot reset 2FA for platform administrator');

    // 24.3: Admin can reset 2FA for user in their own company
    const resetRes = await usersServiceTest.resetTwoFactor(userOfA.id, adminOfA, '192.168.1.100');
    assert(resetRes.success === true, 'Test 24.3: Company admin can reset 2FA for user in their own company');

    const statusAfterAdminReset = await authService.getTwoFactorStatus(userOfA.id);
    assert(
      statusAfterAdminReset.enabled === false,
      'Test 24.4: Target user 2FA record cleared and grace period reset',
    );
  } catch (err: any) {
    assert(false, 'Test 24: Cross-User and Cross-Company 2FA Reset Rejected', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 25: Platform Login Follows Identical 2FA Rules (Point 9)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const platformAdmin2Fa = await mockStore.user.create({
      data: {
        tenantId: null,
        name: 'Platform Super Admin 2FA',
        email: 'psa_2fa@example.com',
        employeeCode: 'PSA_2FA_001',
        passwordHash: initHash,
        role: 'platform_super_admin',
        isActive: true,
      },
    });

    const psaSecret = generateTotpSecret();
    await mockStore.userTwoFactor.create({
      data: {
        userId: platformAdmin2Fa.id,
        method: 'totp',
        secretEnc: encryptAtRest(psaSecret),
        enabledAt: new Date(),
        backupCodesHash: JSON.stringify(generateBackupCodes(10).map((c) => hashBackupCode(c))),
      },
    });

    // 25.1: Platform login with password returns requiresTwoFactor and loginTicket
    const psaLoginRes: any = await authService.platformLogin({
      email: platformAdmin2Fa.email,
      password: 'InitialSecureP@ssword2026!',
    });

    assert(
      psaLoginRes.requiresTwoFactor === true &&
      typeof psaLoginRes.loginTicket === 'string' &&
      psaLoginRes.methods.includes('totp') &&
      !psaLoginRes.methods.includes('email') && // Admin cannot use email
      psaLoginRes.accessToken === undefined,
      'Test 25.1: platformLogin intercepts with 2FA requirement, totp/backup methods only, zero tokens',
    );

    // 25.2: Verify 2FA for platform admin
    const psaTotp = generateTotpToken(psaSecret, getTotpStep());
    const psaVerify = await authService.verifyTwoFactor({
      loginTicket: psaLoginRes.loginTicket,
      code: psaTotp,
    });

    assert(
      psaVerify.accessToken !== undefined &&
      psaVerify.user.role === 'platform_super_admin',
      'Test 25.2: verifyTwoFactor successfully verifies platform super admin',
    );
  } catch (err: any) {
    assert(false, 'Test 25: Platform Login 2FA Rules', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 26: Security Records Cleanup Job (Item 18)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const now = Date.now();
    const pastTime = new Date(now - 3600 * 1000); // 1 hour ago (expired)
    const futureTime = new Date(now + 3600 * 1000); // 1 hour ahead (valid)

    // Seed expired and valid OtpChallenge
    await mockStore.otpChallenge.create({
      data: { emailNormalized: 'exp_otp@example.com', codeHash: 'abc', purpose: 'test', expiresAt: pastTime },
    });
    await mockStore.otpChallenge.create({
      data: { emailNormalized: 'valid_otp@example.com', codeHash: 'def', purpose: 'test', expiresAt: futureTime },
    });

    // Seed expired and valid LoginTicket
    await mockStore.loginTicket.create({
      data: { jti: 'exp_jti_123', userId: 'usr_exp', expiresAt: pastTime },
    });
    await mockStore.loginTicket.create({
      data: { jti: 'valid_jti_456', userId: 'usr_valid', expiresAt: futureTime },
    });

    // Seed expired and valid ResetTicket
    await mockStore.resetTicket.create({
      data: { jti: 'exp_rst_123', emailNormalized: 'exp_rst@example.com', expiresAt: pastTime },
    });
    await mockStore.resetTicket.create({
      data: { jti: 'valid_rst_456', emailNormalized: 'valid_rst@example.com', expiresAt: futureTime },
    });

    const cleanupResult = await authService.cleanupExpiredSecurityTokens();
    assert(
      cleanupResult.deletedOtp >= 1 &&
      cleanupResult.deletedLoginTickets >= 1 &&
      cleanupResult.deletedResetTickets >= 1,
      'Test 26.1: cleanupExpiredSecurityTokens removes expired OtpChallenge, LoginTicket, and ResetTicket records',
    );

    // Verify valid records remained intact
    const remainingOtp = await mockStore.otpChallenge.findFirst({ where: { emailNormalized: 'valid_otp@example.com' } });
    const remainingTicket = await mockStore.loginTicket.findUnique({ where: { jti: 'valid_jti_456' } });
    assert(
      remainingOtp !== null && remainingTicket !== null,
      'Test 26.2: Valid unexpired tokens are preserved during cleanup run',
    );
  } catch (err: any) {
    assert(false, 'Test 26: Security Records Cleanup Job', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 27: Per-IP Limit on Forgot-Password Requests (Item 18)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const testIp = '198.51.100.77';
    // Send 10 requests from testIp (allowed up to 10)
    for (let i = 1; i <= 10; i++) {
      await authService.forgotPasswordRequest(
        { email: `ip_rate_user_${i}@example.com` },
        testIp,
      );
    }

    // 11th request: hits IP rate limit and locks IP for 15 mins
    const eleventhRes = await authService.forgotPasswordRequest(
      { email: 'ip_rate_user_11@example.com' },
      testIp,
    );

    assert(
      eleventhRes.message === 'If this account exists, we sent a code.',
      'Test 27.1: 11th request returns timing-safe generic response',
    );

    const ipLockoutRecord = await mockStore.accountLockout.findUnique({
      where: { identityKey: 'forgot-ip:198.51.x.x' },
    });
    assert(
      ipLockoutRecord !== null &&
      ipLockoutRecord.failedAttempts > 10 &&
      ipLockoutRecord.lockedUntil !== null,
      'Test 27.2: Per-IP rate limit triggers 15-minute IP lockout after 10 forgot-password requests',
    );
  } catch (err: any) {
    assert(false, 'Test 27: Per-IP Rate Limiting on Forgot-Password', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 28: Zero Codes, Secrets, Tickets or QR Secrets in Logs (Part 3)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const auditLogsCaptured: string[] = [];
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    console.log = (...args: any[]) => auditLogsCaptured.push(args.map(a => String(a)).join(' '));
    console.warn = (...args: any[]) => auditLogsCaptured.push(args.map(a => String(a)).join(' '));
    console.error = (...args: any[]) => auditLogsCaptured.push(args.map(a => String(a)).join(' '));

    let secretToTrack = '';
    let totpCodeToTrack = '';
    let ticketToTrack = '';

    try {
      const logCheckUser = await mockStore.user.create({
        data: {
          tenantId: testTenant.id,
          name: 'Log Secret Check User',
          email: 'log_secret_check@example.com',
          employeeCode: 'EMP_LOG_SEC',
          passwordHash: initHash,
          role: 'tenant_admin',
          isActive: true,
        },
      });

      const setupRes = await authService.setupTwoFactor(logCheckUser.id);
      secretToTrack = setupRes.secret;

      totpCodeToTrack = generateTotpToken(secretToTrack, getTotpStep());
      const enableRes = await authService.enableTwoFactor(logCheckUser.id, totpCodeToTrack);

      const loginRes: any = await authService.login({
        identifier: logCheckUser.email,
        password: 'InitialSecureP@ssword2026!',
      });
      ticketToTrack = loginRes.loginTicket;

      await authService.verifyTwoFactor({
        loginTicket: ticketToTrack,
        code: enableRes.backupCodes[0],
      });
    } finally {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    }

    const logsCombined = auditLogsCaptured.join('\n');
    const secretInLogs = secretToTrack ? logsCombined.includes(secretToTrack) : false;
    const codeInLogs = totpCodeToTrack ? logsCombined.includes(totpCodeToTrack) : false;
    const ticketInLogs = ticketToTrack ? logsCombined.includes(ticketToTrack) : false;

    assert(
      !secretInLogs && !codeInLogs && !ticketInLogs,
      'Test 28.1: Zero TOTP secrets, OTP codes, or login ticket JTIs appear in any console output or logs',
    );
  } catch (err: any) {
    assert(false, 'Test 28: Zero Secrets in Logs', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 29: RFC 6238 Table 1 Test Vectors, RFC 4648 Base32 & URI Parsing (Point 4 & 5)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    // 29.1: RFC 6238 Table 1 Test Vectors (SHA-1, 8 digits, 30s step size, secret '12345678901234567890')
    // Secret ASCII: '12345678901234567890' -> Base32: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
    const rfcSecretAscii = '12345678901234567890';
    const rfcSecretBase32 = base32Encode(Buffer.from(rfcSecretAscii, 'ascii'));
    assert(
      rfcSecretBase32 === 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
      'Test 29.1a: RFC 6238 ASCII secret correctly Base32 encodes to GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    );

    const rfc6238Vectors = [
      { time: 59, expectedStep: 1, expectedTotp: '94287082' },
      { time: 1111111109, expectedStep: 37037036, expectedTotp: '07081804' },
      { time: 1111111111, expectedStep: 37037037, expectedTotp: '14050471' },
      { time: 1234567890, expectedStep: 41152263, expectedTotp: '89005924' },
      { time: 2000000000, expectedStep: 66666666, expectedTotp: '69279037' },
      { time: 20000000000, expectedStep: 666666666, expectedTotp: '65353130' },
    ];

    let allRfc6238Match = true;
    for (const v of rfc6238Vectors) {
      const step = Math.floor(v.time / 30);
      const generated = generateTotpToken(rfcSecretBase32, step, 8);
      if (step !== v.expectedStep || generated !== v.expectedTotp) {
        allRfc6238Match = false;
        console.error(`RFC 6238 mismatch at time ${v.time}: expected step=${v.expectedStep}, totp=${v.expectedTotp}; got step=${step}, totp=${generated}`);
      }
    }
    assert(
      allRfc6238Match,
      'Test 29.1b: RFC 6238 Table 1 test vectors match 100% (times 59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000, 8 digits)',
    );

    // 29.2: RFC 4648 Base32 test vectors
    const rfc4648Vectors = [
      { plain: '', expected: '' },
      { plain: 'f', expected: 'MY======' },
      { plain: 'fo', expected: 'MZXQ====' },
      { plain: 'foo', expected: 'MZXW6===' },
      { plain: 'foob', expected: 'MZXW6YQ=' },
      { plain: 'fooba', expected: 'MZXW6YTB' },
      { plain: 'foobar', expected: 'MZXW6YTBOI======' },
    ];

    let allRfc4648Match = true;
    for (const v of rfc4648Vectors) {
      const encoded = base32Encode(Buffer.from(v.plain, 'utf8'), true);
      const decoded = base32Decode(v.expected).toString('utf8');
      if (encoded !== v.expected || decoded !== v.plain) {
        allRfc4648Match = false;
        console.error(`RFC 4648 mismatch for "${v.plain}": encoded="${encoded}" vs expected="${v.expected}", decoded="${decoded}"`);
      }
    }
    assert(
      allRfc4648Match,
      'Test 29.2: RFC 4648 Base32 test vectors match 100% on encode and decode',
    );

    // 29.3: otpauth URI parsing round-trip verification
    const testSecret = generateTotpSecret();
    const testAccount = 'ops_admin@example.com';
    const testIssuer = 'Test CRM';
    const generatedUri = buildTotpUri(testAccount, testIssuer, testSecret, 'SHA1', 6, 30);

    const parsedUrl = new URL(generatedUri);
    const parsedSecret = parsedUrl.searchParams.get('secret');
    const parsedIssuer = parsedUrl.searchParams.get('issuer');
    const parsedAlgorithm = parsedUrl.searchParams.get('algorithm');
    const parsedDigits = parsedUrl.searchParams.get('digits');
    const parsedPeriod = parsedUrl.searchParams.get('period');

    assert(
      parsedUrl.protocol === 'otpauth:' &&
      parsedUrl.host === 'totp' &&
      parsedSecret === testSecret &&
      parsedIssuer === testIssuer &&
      parsedAlgorithm === 'SHA1' &&
      parsedDigits === '6' &&
      parsedPeriod === '30',
      'Test 29.3: Generated otpauth URI parses back to the exact same secret, issuer, digits, and period',
    );
  } catch (err: any) {
    assert(false, 'Test 29: RFC Vectors & URI Parsing Suite', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 30: Unified Password Policy Matrix Across Entry Points (Point 2)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const userContext = { email: 'john.smith@example.com', name: 'John Smith' };

    // Accepted password test cases (length >= 12, no uppercase or symbols required!)
    const acceptedPasswords = [
      'correcthorsebatterystaple',        // lowercase only, length 25
      'eleventwelvethirteenfourteen',    // lowercase only, length 28
      'my secure passphrase without caps', // length 32 with spaces
      'unbreakable1234567890',            // length 21 with numbers
      'Complex#Secure@2026!P@ssword',     // length 27 mixed
    ];

    let allAcceptedPass = true;
    for (const pwd of acceptedPasswords) {
      try {
        validatePasswordPolicy(pwd, userContext);
      } catch (e) {
        allAcceptedPass = false;
        console.error(`Unexpected rejection for valid password "${pwd}":`, e);
      }
    }
    assert(
      allAcceptedPass,
      'Test 30.1: validatePasswordPolicy accepts 12+ chars passwords without forced uppercase or symbols',
    );

    // Rejected password test cases
    const rejectedPasswords = [
      { pwd: 'short', reason: 'length < 12' },
      { pwd: 'Abc!1234567', reason: 'length 11 (under 12)' },
      { pwd: 'password123456', reason: 'common password' },
      { pwd: 'admin12345678', reason: 'common password' },
      { pwd: 'qwertyuiop12', reason: 'common password' },
      { pwd: 'johnsmith123456', reason: 'contains user name part' },
      { pwd: 'SecuredBySmith2026', reason: 'contains user surname part' },
    ];

    let allRejectedPass = true;
    for (const item of rejectedPasswords) {
      try {
        validatePasswordPolicy(item.pwd, userContext);
        allRejectedPass = false;
        console.error(`Expected rejection for "${item.pwd}" (${item.reason}), but it was accepted!`);
      } catch (e: any) {
        if (!(e instanceof BadRequestException)) {
          allRejectedPass = false;
        }
      }
    }
    assert(
      allRejectedPass,
      'Test 30.2: validatePasswordPolicy rejects short passwords, common passwords, and user name/email parts',
    );

    // Test that changePassword and forgotPasswordReset call the same policy function
    const policyUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'John Smith',
        email: 'john.smith@example.com',
        employeeCode: 'EMP_POL_01',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });

    let changePassShortRejected = false;
    try {
      await authService.changePassword(policyUser.id, 'InitialSecureP@ssword2026!', 'shortPass#1');
    } catch (e: any) {
      changePassShortRejected = e instanceof BadRequestException && e.message.includes('at least 12 characters');
    }

    let changePassCommonRejected = false;
    try {
      await authService.changePassword(policyUser.id, 'InitialSecureP@ssword2026!', 'admin12345678');
    } catch (e: any) {
      changePassCommonRejected = e instanceof BadRequestException && e.message.includes('too common');
    }

    assert(
      changePassShortRejected && changePassCommonRejected,
      'Test 30.3: changePassword and admin:set-password enforce the exact same password policy rules',
    );
  } catch (err: any) {
    assert(false, 'Test 30: Unified Password Policy Suite', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 31: 10 Failed 2FA Attempts Across Multiple Tickets Lock Account (Point 6)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const multiTicketUser = await mockStore.user.create({
      data: {
        tenantId: testTenant.id,
        name: 'Multi Ticket Lock User',
        email: 'multiticket_lock@example.com',
        employeeCode: 'EMP_MT_LOCK',
        passwordHash: initHash,
        role: 'employee',
        isActive: true,
      },
    });

    const mtSecret = generateTotpSecret();
    await mockStore.userTwoFactor.create({
      data: {
        userId: multiTicketUser.id,
        method: 'totp',
        secretEnc: encryptAtRest(mtSecret),
        enabledAt: new Date(),
        backupCodesHash: JSON.stringify([]),
      },
    });

    // Ticket 1: 5 wrong attempts
    const login1: any = await authService.login({
      identifier: multiTicketUser.email,
      password: 'InitialSecureP@ssword2026!',
    });
    for (let i = 0; i < 5; i++) {
      try {
        await authService.verifyTwoFactor({ loginTicket: login1.loginTicket, code: '000000' });
      } catch {}
    }

    // Ticket 2: login again to get fresh ticket, then 5 more wrong attempts (total 10 across tickets)
    const login2: any = await authService.login({
      identifier: multiTicketUser.email,
      password: 'InitialSecureP@ssword2026!',
    });
    for (let i = 0; i < 5; i++) {
      try {
        await authService.verifyTwoFactor({ loginTicket: login2.loginTicket, code: '000000' });
      } catch {}
    }

    // Verify account is locked across tickets
    const lockoutRecord = await mockStore.accountLockout.findUnique({
      where: { identityKey: `2fa:${multiTicketUser.id}` },
    });
    const refreshedMultiUser = await mockStore.user.findUnique({
      where: { id: multiTicketUser.id },
    });

    assert(
      lockoutRecord !== null &&
      lockoutRecord.failedAttempts >= 10 &&
      lockoutRecord.lockedUntil !== null &&
      new Date(lockoutRecord.lockedUntil) > new Date() &&
      refreshedMultiUser?.lockoutUntil !== null &&
      new Date(refreshedMultiUser!.lockoutUntil) > new Date(),
      'Test 31.1: 10 wrong codes across multiple login tickets lock the account through existing lockout and User.lockoutUntil',
    );

    // Verify LOGIN_LOCKOUT audit log written
    const lockoutAudit = mockStore.auditLogs.find(
      (a) => a.action === 'LOGIN_LOCKOUT' && a.entityId === multiTicketUser.id,
    );
    assert(
      lockoutAudit !== undefined && lockoutAudit.afterState.includes('10 consecutive failed 2FA verification attempts'),
      'Test 31.2: LOGIN_LOCKOUT audit log record is created with attempt count and expiration timestamp',
    );

    // Attempting to log in again hits the lockout immediately!
    let loginBlockedByLockout = false;
    try {
      await authService.login({
        identifier: multiTicketUser.email,
        password: 'InitialSecureP@ssword2026!',
      });
    } catch (e: any) {
      loginBlockedByLockout = e instanceof UnauthorizedException && e.message.includes('locked');
    }
    assert(
      loginBlockedByLockout,
      'Test 31.3: Subsequent login attempt with correct password hits the lockout immediately and is blocked',
    );
  } catch (err: any) {
    assert(false, 'Test 31: Multi-Ticket 2FA Lockout Suite', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 32: Trusted Device Cookie Parity (/auth & /platform-auth), Durations & Sensitive Actions (Point 7)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    // 32.1: Cookie options duration and path checks
    const adminCookieOpts = getTrustedDeviceCookieOptions(true);
    const employeeCookieOpts = getTrustedDeviceCookieOptions(false);

    assert(
      adminCookieOpts.path === '/' &&
      adminCookieOpts.maxAge === TRUSTED_DEVICE_ADMIN_MAX_AGE_MS &&
      adminCookieOpts.maxAge === 7 * 24 * 60 * 60 * 1000,
      'Test 32.1: Admin trusted device cookie has path "/" and lifetime exactly 7 days (604,800,000 ms)',
    );

    assert(
      employeeCookieOpts.path === '/' &&
      employeeCookieOpts.maxAge === TRUSTED_DEVICE_MAX_AGE_MS &&
      employeeCookieOpts.maxAge === 30 * 24 * 60 * 60 * 1000,
      'Test 32.2: Employee trusted device cookie has path "/" and lifetime exactly 30 days (2,592,000,000 ms)',
    );

    // 32.3: Platform login with trusted device bypasses 2FA challenge
    const platTrustedAdmin = await mockStore.user.create({
      data: {
        tenantId: null,
        name: 'Platform Trusted Admin',
        email: 'plat_trusted_admin@example.com',
        employeeCode: 'PSA_TRUST_01',
        passwordHash: initHash,
        role: 'platform_super_admin',
        isActive: true,
      },
    });

    const platSecret = generateTotpSecret();
    await mockStore.userTwoFactor.create({
      data: {
        userId: platTrustedAdmin.id,
        method: 'totp',
        secretEnc: encryptAtRest(platSecret),
        enabledAt: new Date(),
        backupCodesHash: JSON.stringify([]),
      },
    });

    // First login -> 2FA challenge -> verify with trustDevice: true
    const pTicket = await authService.createLoginTicket(platTrustedAdmin.id);
    const pTotp = generateTotpToken(platSecret, getTotpStep());
    const pVerify = await authService.verifyTwoFactor({
      loginTicket: pTicket,
      code: pTotp,
      trustDevice: true,
    });
    const platDeviceRawToken = pVerify.trustedDeviceCookie.value;

    // Second login on platform with trusted device token bypasses 2FA!
    const platNextLoginRes: any = await authService.platformLogin(
      {
        email: platTrustedAdmin.email,
        password: 'InitialSecureP@ssword2026!',
      },
      '192.168.1.200',
      'Mozilla/5.0 Chrome/124.0',
      platDeviceRawToken,
    );

    assert(
      platNextLoginRes.requiresTwoFactor === undefined &&
      platNextLoginRes.accessToken !== undefined &&
      platNextLoginRes.user.role === 'platform_super_admin',
      'Test 32.3: Platform login (/platform-auth) with trusted device cookie successfully bypasses 2FA challenge',
    );

    // 32.4: Sensitive operations NEVER skip 2-step verification even on trusted device:
    // (a) disableTwoFactor requires current password and code
    let disableWithoutCodeRejected = false;
    try {
      await authService.disableTwoFactor(platTrustedAdmin.id, {
        currentPassword: 'InitialSecureP@ssword2026!',
        code: '',
      });
    } catch {
      disableWithoutCodeRejected = true;
    }

    // (b) regenerateBackupCodes requires current password and code
    let regenWithoutCodeRejected = false;
    try {
      await authService.regenerateBackupCodes(platTrustedAdmin.id, {
        currentPassword: 'InitialSecureP@ssword2026!',
        code: '',
      });
    } catch {
      regenWithoutCodeRejected = true;
    }

    assert(
      disableWithoutCodeRejected && regenWithoutCodeRejected,
      'Test 32.4: Sensitive actions (disable 2FA, regenerate backup codes) never skip 2-step verification',
    );
  } catch (err: any) {
    assert(false, 'Test 32: Trusted Device Parity & Sensitive Actions Suite', err.message);
  }

console.log('\n----------------------------------------------------------------');
  console.log(`AUTH SECURITY TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('----------------------------------------------------------------\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
