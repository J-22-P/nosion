#!/usr/bin/env node
/**
 * pnpm setup:dev — จาก git clone ถึงใช้งานได้ใน 1 คำสั่ง
 *   1) สร้าง .env จาก .env.example (ถ้ายังไม่มี)
 *   2) docker compose up -d --wait   (postgres, redis, mailpit, minio)
 *   3) prisma migrate deploy + seed
 */
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
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
  run('docker compose up -d postgres redis mailpit minio --wait');
} catch {
  console.error(
    '\n✗ docker compose ไม่สำเร็จ — ตรวจว่า Docker Desktop เปิดอยู่ แล้วรัน pnpm setup:dev ใหม่',
  );
  process.exit(1);
}

run('pnpm db:generate');
run('pnpm db:migrate:deploy');
run('pnpm db:migrate:indexes');
run('pnpm db:migrate:deploy');
run('pnpm db:seed');

console.log('\n✓ พร้อมแล้ว — รัน `pnpm dev` แล้วเปิด http://localhost:3000');
