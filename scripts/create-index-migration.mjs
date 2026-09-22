#!/usr/bin/env node
/**
 * สร้าง migration จาก prisma/sql/custom_indexes.sql
 *
 * ทำไมต้องมีสคริปต์นี้: Prisma ประกาศ GIN index บน JSONB path และ partial index ใน schema ไม่ได้
 * จึงต้องเขียน SQL เอง แต่ยังอยากให้มันอยู่ในสายธาร migration ปกติ (migrate deploy เดียวจบ)
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'apps/api/prisma/migrations');
const source = join(root, 'apps/api/prisma/sql/custom_indexes.sql');

if (!existsSync(migrationsDir)) {
  console.error('✗ ยังไม่มีโฟลเดอร์ migrations — รัน `pnpm db:migrate` เพื่อสร้าง migration แรกก่อน');
  process.exit(1);
}

const already = readdirSync(migrationsDir).find((name) => name.endsWith('_custom_indexes'));
if (already) {
  console.log(`• มี migration อยู่แล้ว: ${already} — ไม่ต้องทำอะไร`);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const target = join(migrationsDir, `${stamp}_custom_indexes`);
mkdirSync(target, { recursive: true });
copyFileSync(source, join(target, 'migration.sql'));

console.log(`✓ สร้าง ${stamp}_custom_indexes แล้ว — รัน \`pnpm db:migrate:deploy\` เพื่อ apply`);
