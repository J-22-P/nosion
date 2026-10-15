#!/usr/bin/env node
/**
 * pnpm setup:dev — จาก git clone ถึงใช้งานได้ใน 1 คำสั่ง
 *   1) ติดตั้ง dependency ให้ตรงกับ lockfile
 *   2) สร้าง .env จาก .env.example (ถ้ายังไม่มี)
 *   3) docker compose up -d --wait   (postgres, redis, mailpit)
 *   4) สร้าง/รัน migration แล้ว seed ข้อมูลตัวอย่าง
 */
import { createECDH, randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd) => {
  console.log(`\n[36m$ ${cmd}[0m`);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
};

// ทำก่อนทุกอย่าง: ถ้า node_modules ไม่ตรงกับ lockfile คำสั่งถัดไปจะหา binary ไม่เจอ
// (เช่น prisma ที่เป็น devDependency ของ root)
run('pnpm install');

if (!existsSync(join(root, '.env'))) {
  copyFileSync(join(root, '.env.example'), join(root, '.env'));

  // ความลับของ dev ต้องไม่ถูก commit และไม่ควรเหมือนกันทุกเครื่อง
  // (ค่าที่ใช้ร่วมกันทั้งทีมคือค่าที่หลุดแล้วโดยปริยาย)
  const envPath = join(root, '.env');
  const vapid = generateVapidKeys();
  const filled = readFileSync(envPath, 'utf8')
    .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${randomBytes(48).toString('base64')}`)
    .replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`)
    .replace(/^VAPID_PUBLIC_KEY=.*$/m, `VAPID_PUBLIC_KEY=${vapid.publicKey}`)
    .replace(/^VAPID_PRIVATE_KEY=.*$/m, `VAPID_PRIVATE_KEY=${vapid.privateKey}`)
    .replace(
      /^NOTIFICATION_ACTION_SECRET=.*$/m,
      `NOTIFICATION_ACTION_SECRET=${randomBytes(32).toString('hex')}`,
    );
  writeFileSync(envPath, filled);

  console.log('✓ สร้าง .env จาก .env.example พร้อมสุ่ม secret และคู่กุญแจ VAPID ใหม่');
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

/**
 * คู่กุญแจ VAPID (Web Push) = ECDSA P-256 ในรูป base64url — แบบเดียวกับ `npx web-push generate-vapid-keys`
 * public = จุดบนเส้นโค้งแบบ uncompressed 65 ไบต์ · private = 32 ไบต์ (เติม 0 ข้างหน้าถ้าสั้นกว่า)
 */
function generateVapidKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const priv = ecdh.getPrivateKey();
  const padded = Buffer.concat([Buffer.alloc(32 - priv.length), priv]);
  return {
    publicKey: ecdh.getPublicKey().toString('base64url'),
    privateKey: padded.toString('base64url'),
  };
}
