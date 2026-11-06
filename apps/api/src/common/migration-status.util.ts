/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as fs from 'fs';
import * as path from 'path';

export interface MigrationStatusResult {
  total: number;
  applied: number;
  pending: string[];
  isReady: boolean;
  error?: string;
}

export function getMigrationFolders(): string[] {
  const candidates = [
    path.resolve(process.cwd(), 'apps/api/prisma/migrations'),
    path.resolve(process.cwd(), 'prisma/migrations'),
    path.resolve(__dirname, '../prisma/migrations'),
    path.resolve(__dirname, '../../prisma/migrations'),
    path.resolve(__dirname, '../../../prisma/migrations'),
  ];
  const migrationsDir = candidates.find((d) => fs.existsSync(d) && fs.statSync(d).isDirectory());
  if (!migrationsDir) return [];

  return fs.readdirSync(migrationsDir).filter((file) => {
    const fullPath = path.join(migrationsDir, file);
    return fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, 'migration.sql'));
  });
}

export async function getMigrationStatus(prisma: any): Promise<MigrationStatusResult> {
  const builtMigrations = getMigrationFolders();

  try {
    const appliedRows: any[] = await prisma.$queryRawUnsafe(
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'
    );
    const appliedSet = new Set((appliedRows || []).map((r: any) => r.migration_name));
    const pending = builtMigrations.filter((m) => !appliedSet.has(m));

    return {
      total: builtMigrations.length,
      applied: appliedSet.size,
      pending,
      isReady: pending.length === 0,
    };
  } catch (err: any) {
    return {
      total: builtMigrations.length,
      applied: 0,
      pending: builtMigrations,
      isReady: false,
      error: err.message,
    };
  }
}
