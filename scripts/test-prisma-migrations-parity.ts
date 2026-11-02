/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as fs from 'fs';
import * as path from 'path';

function loadDevEnv() {
  const envPath = path.resolve(__dirname, '../.env.development');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.substring(0, idx).trim();
        let val = trimmed.substring(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadDevEnv();

import { Prisma, PrismaClient } from '@prisma/client';

async function runParityCheck() {
  console.log('========================================================================');
  console.log('PRISMA SCHEMA VS DATABASE MIGRATION PARITY TEST');
  console.log('========================================================================');

  const models = Prisma.dmmf.datamodel.models;
  console.log(`Loaded ${models.length} models from Prisma Schema.`);

  // Connect to the migrated test/dev database
  const prisma = new PrismaClient();
  let dbColumns: Array<{ table_name: string; column_name: string }> = [];

  try {
    await prisma.$connect();
    const rows = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
    `;
    dbColumns = rows;
  } catch (err: any) {
    console.error('Failed to query information_schema.columns from database:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  // Build a lookup map of existing table -> set of columns (case-insensitive for safety)
  const dbTableMap = new Map<string, Set<string>>();
  for (const row of dbColumns) {
    if (!dbTableMap.has(row.table_name)) {
      dbTableMap.set(row.table_name, new Set());
    }
    dbTableMap.get(row.table_name)!.add(row.column_name);
  }

  const missingTables: string[] = [];
  const missingColumns: Array<{ model: string; table: string; field: string; column: string }> = [];

  for (const model of models) {
    // Determine database table name (default is model.name or model.dbName)
    const tableName = model.dbName || model.name;

    // Look for exact table name in database
    let existingCols = dbTableMap.get(tableName);
    if (!existingCols) {
      // Try lowercase matching if not found
      for (const [t, cols] of dbTableMap.entries()) {
        if (t.toLowerCase() === tableName.toLowerCase()) {
          existingCols = cols;
          break;
        }
      }
    }

    if (!existingCols) {
      missingTables.push(`${model.name} (table: ${tableName})`);
      continue;
    }

    for (const field of model.fields) {
      // Relations (kind === 'object') are not stored as standalone columns; only scalar/enum fields are.
      if (field.kind !== 'scalar' && field.kind !== 'enum') {
        continue;
      }

      const colName = field.dbName || field.name;
      if (!existingCols.has(colName)) {
        // Try case-insensitive lookup
        let foundCi = false;
        for (const existingCol of existingCols) {
          if (existingCol.toLowerCase() === colName.toLowerCase()) {
            foundCi = true;
            break;
          }
        }
        if (!foundCi) {
          missingColumns.push({
            model: model.name,
            table: tableName,
            field: field.name,
            column: colName,
          });
        }
      }
    }
  }

  console.log('------------------------------------------------------------------------');
  if (missingTables.length > 0 || missingColumns.length > 0) {
    console.error(`[PARITY FAILURE] Prisma schema has fields or tables not created by migrations:`);
    if (missingTables.length > 0) {
      console.error(`Missing Tables (${missingTables.length}):`);
      missingTables.forEach((t) => console.error(`  - ${t}`));
    }
    if (missingColumns.length > 0) {
      console.error(`Missing Columns (${missingColumns.length}):`);
      missingColumns.forEach((c) =>
        console.error(`  - Model ${c.model}.${c.field} -> Table "${c.table}"."${c.column}"`)
      );
    }
    process.exit(1);
  }

  console.log('[PARITY SUCCESS] All Prisma schema models and scalar columns exist in the database!');
  console.log(`Verified ${models.length} models and their columns across all applied migrations.`);
  process.exit(0);
}

runParityCheck().catch((e) => {
  console.error('[UNHANDLED ERROR]', e);
  process.exit(1);
});
