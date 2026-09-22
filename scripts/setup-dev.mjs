#!/usr/bin/env node
/**
 * pnpm setup:dev — จาก git clone ถึงใช้งานได้ใน 1 คำสั่ง
 *   1) สร้าง .env จาก .env.example (ถ้ายังไม่มี)
 *   2) docker compose up -d --wait   (postgres, redis, mailpit, minio)
 *   3) prisma migrate deploy + seed
 */
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd) => {
  console.log(`\n[36m$ ${cmd}[0m`);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
};

if (!existsSync(join(root, '.env'))) {
  copyFileSync(join(root, '.env.example'), join(root, '.env'));
  console.log('✓ สร้าง .env จาก .env.example แล้ว');
} else {
  console.log('• มี .env อยู่แล้ว — ข้าม');
}

try {
  // minio อยู่ใน profile 'storage' จึงไม่ถูกยกขึ้นที่นี่ — Phase 0–1 ยังไม่ใช้ object storage
  run('docker compose up -d postgres redis mailpit --wait');
} catch {
  console.error(
    '\n✗ docker compose ไม่สำเร็จ — ตรวจว่า Docker Desktop เปิดอยู่ แล้วรัน pnpm setup:dev ใหม่',
  );
  process.exit(1);
}

run('pnpm db:generate');

// ครั้งแรกสุดยังไม่มีโฟลเดอร์ migrations — ต้องสร้าง migration แรกจาก schema ก่อน
// (migrate deploy รันได้เฉพาะ migration ที่มีอยู่แล้ว จึงใช้กับ repo ที่เพิ่ง clone ไม่ได้)
const migrationsDir = join(root, 'apps/api/prisma/migrations');
const hasMigrations =
  existsSync(migrationsDir) && readdirSync(migrationsDir).some((name) => !name.startsWith('.'));

if (!hasMigrations) {
  console.log('\n• ยังไม่มี migration — กำลังสร้าง migration แรกจาก schema');
  run('pnpm db:migrate --name init --skip-seed');
}

// GIN/partial index ที่ Prisma ประกาศใน schema เองไม่ได้ ถูกนำเข้าเป็น migration แยก
run('pnpm db:migrate:indexes');
run('pnpm db:migrate:deploy');
run('pnpm db:seed');

console.log('\n✓ พร้อมแล้ว — รัน `pnpm dev` แล้วเปิด http://localhost:3000');
