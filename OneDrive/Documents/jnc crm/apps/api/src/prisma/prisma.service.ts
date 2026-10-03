/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, OnModuleInit, OnModuleDestroy, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL || 'file:C:/Users/JNC R&D/OneDrive/Documents/jnc crm/apps/api/prisma/dev.db',
        },
      },
    });
  }

  async onModuleInit() {
    this.$use(async (params, next) => {
      if (params.model === 'AuditLog') {
        if (['update', 'updateMany', 'delete', 'deleteMany', 'upsert'].includes(params.action)) {
          throw new ForbiddenException('AuditLog records are strictly append-only and cannot be updated or deleted.');
        }
      }
      return next(params);
    });
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
