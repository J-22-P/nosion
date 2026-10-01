#!/usr/bin/env node
/**
 * pnpm test:int:local — รัน integration test บนเครื่องตัวเองโดยไม่ล้างข้อมูล dev
 *
 * ทำไมต้องมี: test/helpers.ts เรียก truncateAll() ก่อนทุกไฟล์เทสต์
 * ถ้ารัน `pnpm test:int` ด้วย DATABASE_URL ของ .env (nosion_dev) ข้อมูลที่ใช้งานอยู่จะหายหมด
 *
 * สคริปต์นี้: อ่าน .env → เปลี่ยนเฉพาะ DATABASE_URL ไปที่ฐาน nosion_test (เหมือน CI)
 *            → สร้างฐานถ้ายังไม่มี → migrate deploy → pnpm test:int
 * ต้องเปิด Docker Desktop และรัน `docker compose up -d postgres redis --wait` ไว้ก่อน
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DB = 'nosion_test';

function loadDotenv(path) {
  if (!existsSync(path)) {
    console.error('✗ ไม่พบ .env — รัน `pnpm setup:dev` ก่อน');
    process.exit(1);
  }
  const vars = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return vars;
}

const fileEnv = loadDotenv(join(root, '.env'));
const devUrl = new URL(
  fileEnv.DATABASE_URL ?? 'postgresql://nosion:nosion@localhost:5432/nosion_dev',
);
const testUrl = new URL(devUrl);
testUrl.pathname = `/${TEST_DB}`;

const env = { ...process.env, ...fileEnv, DATABASE_URL: testUrl.toString(), NODE_ENV: 'test' };
const run = (cmd, opts = {}) => {
  console.log(`\n\x1b[36m$ ${cmd}\x1b[0m`);
  execSync(cmd, { cwd: root, stdio: 'inherit', env, ...opts });
};

console.log(`• ใช้ฐานข้อมูลเทสต์: ${testUrl.host}${testUrl.pathname} (ฐาน dev ไม่ถูกแตะ)`);

// สร้างฐานเทสต์ถ้ายังไม่มี — createdb ล้มถ้ามีอยู่แล้ว ซึ่งไม่ใช่ปัญหา
try {
  execSync(`docker compose exec -T postgres createdb -U ${devUrl.username} ${TEST_DB}`, {
    cwd: root,
    stdio: 'pipe',
  });
  console.log(`✓ สร้างฐาน ${TEST_DB} แล้ว`);
} catch (err) {
  const msg = String(err.stderr ?? err.message);
  if (msg.includes('already exists')) {
    console.log(`• มีฐาน ${TEST_DB} อยู่แล้ว`);
  } else {
    console.error(
      `✗ สร้างฐานไม่สำเร็จ — Docker เปิดอยู่ไหม? รัน \`docker compose up -d postgres redis --wait\`\n${msg}`,
    );
    process.exit(1);
  }
}

run('pnpm db:migrate:deploy');
run(`pnpm test:int ${process.argv.slice(2).join(' ')}`.trim());
