# Staging บน Vercel + Supabase + Upstash (ฟรีทั้งหมด)

> Phase 2b ขั้น 9 · ทุกบริการใช้ free tier · ส่วนที่ต้องใช้บัญชี/OAuth เจ้าของ repo ทำเอง (ระบบอัตโนมัติทำแทนไม่ได้)

## ภาพรวม

```
ผู้ใช้ ──► nosion-staging-web.vercel.app (Next.js)
              │  /api/v1/*  ──rewrite──►  nosion-staging-api.vercel.app (NestJS · Vercel Function)
              │                                  ├─► Supabase Postgres (pooler :6543)
              │                                  └─► Upstash Redis (rediss://)
GitHub Actions: CI เขียวบน main → Deploy staging → migrate (Supabase :5432) → deploy api + web → smoke test
```

- **web กับ API คนละ project** แต่ผู้ใช้เห็นโดเมนเดียว — `/api/v1/*` ถูก proxy ผ่าน web (`API_PROXY_TARGET`)
  refresh cookie (`HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`) จึงเป็น first-party
- **API** รันผ่าน 📁 `apps/api/api/index.js` → 📁 `src/serverless.ts` (สร้างแอป Nest ครั้งเดียวต่อ instance) — ตั้งค่า HTTP ชุดเดียวกับ `main.ts` (`app.setup.ts`)
- **worker ไม่ได้ deploy** — Vercel Functions ไม่รัน process ค้าง (BullMQ) · Phase 2b ยังไม่มีงานที่ต้องใช้ worker (reminder มาใน Phase 4)
- อีเมลยังไม่ถูกส่งจริง (MailService บันทึก log อย่างเดียว) — สมัคร/รีเซ็ตรหัสใช้ได้แต่ไม่มีอีเมลจริง

## 1. Supabase (ฐานข้อมูล)

1. supabase.com → **New project** · region **Southeast Asia (Singapore)** · ตั้งรหัสผ่านฐานข้อมูล (เก็บไว้)
2. **Project Settings → Database → Connection string** คัดลอก 2 แบบ (แทน `[YOUR-PASSWORD]` ด้วยรหัสจริง):

   | ใช้ทำอะไร    | แบบ                    | port | เอาไปใส่                                                                               |
   | ------------ | ---------------------- | ---- | -------------------------------------------------------------------------------------- |
   | API ตอนทำงาน | **Transaction pooler** | 6543 | Vercel project API → `DATABASE_URL` · **ต่อท้าย** `?pgbouncer=true&connection_limit=1` |
   | migration    | **Session pooler**     | 5432 | GitHub secret `STAGING_DIRECT_URL`                                                     |
   - ทำไมต้องสองแบบ: serverless เปิด connection ใหม่บ่อย → ต้องผ่าน pooler · แต่ `prisma migrate` ใช้ advisory lock ที่ pooler โหมด transaction ไม่รองรับ
   - ทำไมไม่ใช้ "Direct connection": ของ free tier เป็น IPv6 อย่างเดียว แต่ GitHub runner เป็น IPv4 → ใช้ Session pooler แทน
   - `pgbouncer=true` ปิด prepared statement ของ Prisma (pgbouncer โหมด transaction ใช้ไม่ได้) · `connection_limit=1` ต่อ instance

## 2. Upstash (Redis)

upstash.com → **Create Database** → Redis · region **ap-southeast-1** · คัดลอก URL แบบ `rediss://default:…@….upstash.io:6379`
→ Vercel project API → `REDIS_URL` (ต้องเป็น `rediss://` มี s = TLS)

## 3. Vercel (2 project)

ติดตั้งและล็อกอิน CLI ในเครื่อง (ครั้งเดียว):

```bash
npx vercel@63.1.0 login
```

สร้าง project **โดยไม่ต่อ Git** (ให้ GitHub Actions เป็นคน deploy หลัง CI เขียว — ถ้าต่อ Git ด้วย Vercel จะ build ซ้ำทุก push ก่อนเทสต์ผ่าน):

```bash
npx vercel@63.1.0 project add nosion-staging-api
npx vercel@63.1.0 project add nosion-staging-web
```

แล้วใน dashboard ของแต่ละ project → **Settings → General**:

|                  | API        | Web        |
| ---------------- | ---------- | ---------- |
| Root Directory   | `apps/api` | `apps/web` |
| Framework Preset | Other      | Next.js    |
| Node.js Version  | 22.x       | 22.x       |

**Settings → Environment Variables** (Production):

**nosion-staging-api**

| ตัวแปร                                 | ค่า                                                               |
| -------------------------------------- | ----------------------------------------------------------------- |
| `NODE_ENV`                             | `production`                                                      |
| `DATABASE_URL`                         | Transaction pooler + `?pgbouncer=true&connection_limit=1`         |
| `REDIS_URL`                            | `rediss://…` จาก Upstash                                          |
| `JWT_SECRET`                           | ผลของ `openssl rand -base64 48`                                   |
| `ENCRYPTION_KEY`                       | ผลของ `openssl rand -hex 32` (64 ตัว)                             |
| `APP_URL` · `API_URL` · `CORS_ORIGINS` | `https://nosion-staging-web.vercel.app` (โดเมนของ web ทั้งสามตัว) |
| `ENABLE_DEMO_ACCOUNT`                  | `true`                                                            |
| `LOG_LEVEL`                            | `info`                                                            |

**nosion-staging-web**

| ตัวแปร                | ค่า                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | `https://nosion-staging-web.vercel.app` (โดเมนของ **web** เอง — คำขอวิ่งผ่าน rewrite) |
| `API_PROXY_TARGET`    | `https://nosion-staging-api.vercel.app`                                               |

## 4. GitHub (secrets ของ workflow)

repo → **Settings → Environments → New environment** ชื่อ `staging` แล้วใส่:

| ชนิด     | ชื่อ                                              | หาจากไหน                                                                                          |
| -------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| secret   | `VERCEL_TOKEN`                                    | vercel.com/account/tokens → Create (scope: บัญชีของคุณ)                                           |
| secret   | `VERCEL_ORG_ID`                                   | `.vercel/project.json` หลัง `npx vercel@63.1.0 link` (ค่า `orgId`) หรือ Settings → General ของทีม |
| secret   | `VERCEL_PROJECT_ID_API` · `VERCEL_PROJECT_ID_WEB` | Settings → General ของแต่ละ project (Project ID)                                                  |
| secret   | `STAGING_DIRECT_URL`                              | Session pooler :5432 จากข้อ 1                                                                     |
| variable | `STAGING_WEB_URL`                                 | `https://nosion-staging-web.vercel.app` (ใช้กับ smoke test)                                       |

> ไม่ต้องส่งค่าเหล่านี้ในแชท — ใส่ตรงใน GitHub/Vercel เท่านั้น · `.vercel/` อยู่ใน `.gitignore` แล้ว

## 5. deploy ครั้งแรก

GitHub → **Actions → Deploy staging → Run workflow** (หรือ push ขึ้น main แล้วรอ CI เขียว)

ลำดับ: `check` (มี secrets ครบไหม — ไม่ครบจะข้ามเงียบ ๆ ไม่ทำให้แดง) → `migrate` → `deploy` (api, web) → `smoke`
(`/today` ตอบ และ `POST /api/v1/auth/demo` ผ่าน proxy ได้ 200)

เปิด `https://nosion-staging-web.vercel.app` → **ลองใช้ทันที** → ได้ข้อมูลชุด mockup

## ปัญหาที่น่าจะเจอ

| อาการ                                       | สาเหตุ / แก้                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `prepared statement "s0" already exists`    | `DATABASE_URL` ของ API ขาด `?pgbouncer=true`                                               |
| migrate ค้าง / `P1001`                      | `STAGING_DIRECT_URL` เป็น Direct connection (IPv6) — ใช้ Session pooler                    |
| `Query engine library … rhel-openssl-3.0.x` | `binaryTargets` ใน `schema.prisma` ต้องมี `rhel-openssl-3.0.x` (มีแล้ว)                    |
| login ได้แต่รีเฟรชหน้าแล้วหลุด              | `NEXT_PUBLIC_API_URL` ชี้ไปโดเมน API ตรง ๆ — ต้องเป็นโดเมนของ web (cookie SameSite=Strict) |
| `ENOENT … apps/api/apps/api`                | รัน `vercel` ในโฟลเดอร์ app — ต้องรันจากรากของ repo เมื่อตั้ง Root Directory แล้ว          |
| คำขอแรกช้า 2–4 วินาที                       | cold start ของ Function (Nest + Prisma) — ปกติของ free tier                                |
