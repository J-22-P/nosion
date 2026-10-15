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
- **worker รันบน Fly.io** (Phase 4) — Vercel Functions ไม่รัน process ค้าง แต่ sweeper ของการเตือนต้องรันทุกนาที → ดูหัวข้อ 6
- อีเมล: `MAIL_DRIVER=log` (ค่าเริ่มต้น) บันทึก log อย่างเดียว · ตั้ง `resend` + `RESEND_API_KEY` เมื่อยืนยันโดเมนแล้ว (Phase 4)

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

## 6. Worker + Redis บน Fly.io (Phase 4)

```
Vercel API ──► Supabase ◄── Fly: nosion-staging-worker ──► Fly: nosion-staging-redis (ภายในเท่านั้น)
                              │ sweeper ทุกนาที · digest ทุก 15 นาที · /metrics /readyz :9464
                              └──► Web Push (FCM / APNs) · Resend
```

ตั้งค่าครั้งแรกด้วย wizard (เปิดหน้าเว็บที่ต้องไป บอกว่ากดอะไร เก็บค่าที่สร้างไว้ใน `.env.staging.fly` ซึ่ง gitignore แล้ว · รันซ้ำได้):

```bash
bash scripts/fly-staging-setup.sh
```

wizard ทำ 10 ขั้น: ติดตั้ง/ล็อกอิน flyctl → สร้างแอป + volume → Redis (รหัสผ่าน + deploy) → สร้างกุญแจ VAPID + `NOTIFICATION_ACTION_SECRET`
→ `DATABASE_URL` (Supabase **Session pooler 5432** ค่าเดียวกับ `STAGING_DIRECT_URL`) → อีเมล (`log` หรือ `resend`) → secrets + deploy worker
→ env ของ project API บน Vercel → `FLY_API_TOKEN` ลง GitHub environment `staging` → ตรวจ + สั่ง Deploy staging

หลังจากนั้น workflow "Deploy staging" deploy worker ให้เองทุกครั้งที่ CI เขียว (job `worker` — ไม่มี `FLY_API_TOKEN` = ข้ามเงียบ)

| ค่า                                              | อยู่ที่                 | หมายเหตุ                                                                                         |
| ------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------ |
| `VAPID_PUBLIC_KEY`                               | Fly worker + Vercel API | API ส่งให้เบราว์เซอร์ subscribe · เปลี่ยนภายหลัง = ทุกเครื่องต้องเปิดการแจ้งเตือนใหม่            |
| `VAPID_PRIVATE_KEY`                              | Fly worker              |                                                                                                  |
| `NOTIFICATION_ACTION_SECRET`                     | Fly worker + Vercel API | **ต้องเป็นค่าเดียวกัน** — worker เซ็นปุ่มใน notification / ลิงก์เลิกรับ · API ตรวจ               |
| `MAIL_DRIVER` (+ `RESEND_API_KEY`, `EMAIL_FROM`) | Fly worker + Vercel API | `log` ไม่ส่งจริง · `resend` ต้องยืนยันโดเมนแล้ว                                                  |
| `REDIS_URL`                                      | Fly worker              | `redis://default:…@nosion-staging-redis.internal:6379` — Redis ของ worker แยกจาก Upstash ของ API |
| `APP_URL`, `API_URL`                             | Fly worker              | ทั้งคู่ = โดเมนของ web (API อยู่หลัง proxy)                                                      |

ตรวจสุขภาพ: `flyctl checks list -a nosion-staging-worker` (ready = DB + Redis ต่อติด) · `flyctl logs -a nosion-staging-worker`
· metrics ดูใน Grafana ของ Fly (fly-metrics.net) · กฎ alert อยู่ที่ `ops/prometheus/alerts.yml`

## ปัญหาที่น่าจะเจอ

| อาการ                                                       | สาเหตุ / แก้                                                                                              |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `prepared statement "s0" already exists`                    | `DATABASE_URL` ของ API ขาด `?pgbouncer=true`                                                              |
| migrate ค้าง / `P1001`                                      | `STAGING_DIRECT_URL` เป็น Direct connection (IPv6) — ใช้ Session pooler                                   |
| `Query engine library … rhel-openssl-3.0.x`                 | `binaryTargets` ใน `schema.prisma` ต้องมี `rhel-openssl-3.0.x` (มีแล้ว)                                   |
| login ได้แต่รีเฟรชหน้าแล้วหลุด                              | `NEXT_PUBLIC_API_URL` ชี้ไปโดเมน API ตรง ๆ — ต้องเป็นโดเมนของ web (cookie SameSite=Strict)                |
| `ENOENT … apps/api/apps/api`                                | รัน `vercel` ในโฟลเดอร์ app — ต้องรันจากรากของ repo เมื่อตั้ง Root Directory แล้ว                         |
| คำขอแรกช้า 2–4 วินาที                                       | cold start ของ Function (Nest + Prisma) — ปกติของ free tier                                               |
| worker: `/readyz` ไม่ผ่าน · log มี `ECONNREFUSED …:6379`    | Redis ยังไม่ deploy หรือ `REDIS_URL` ผิด — ต้องเป็น `*.internal` (IPv6) · worker ตั้ง `family: 0` ไว้แล้ว |
| worker: log บอก "ไม่ได้ตั้ง VAPID"                          | ตั้ง secrets แบบ `--stage` แล้วยังไม่ deploy — `flyctl deploy` ใหม่                                       |
| กด "จ่ายแล้ว" จาก notification แล้วขึ้น "ทำรายการไม่สำเร็จ" | `NOTIFICATION_ACTION_SECRET` บน Vercel API ไม่ตรงกับของ worker หรือยังไม่ redeploy API                    |
