# แผนภาพสถาปัตยกรรม (C4)

> แบบ [C4 model](https://c4model.com) สองระดับแรก — **Context** (ระบบกับโลกภายนอก) และ **Container** (สิ่งที่ deploy แยกกัน)
> เขียนเป็น Mermaid ใน Markdown → GitHub วาดให้เอง แก้พร้อมโค้ดใน PR เดียวกันได้ (รูปภาพ export แยกจะล้าสมัยเงียบ ๆ)

## ระดับ 1 · System Context

ใครใช้ NOSION และ NOSION คุยกับระบบภายนอกอะไรบ้าง

```mermaid
flowchart TB
  user["ผู้ใช้<br/><small>จัดการงาน เงิน นิสัย<br/>บนเว็บ / มือถือ (PWA)</small>"]
  dev["สคริปต์ของผู้ใช้<br/><small>เรียก Public API<br/>ด้วย API key</small>"]

  nosion[["NOSION<br/><small>Personal productivity OS<br/>งาน · การเงิน · นิสัย · ปฏิทิน · การเตือน</small>"]]

  google["Google<br/><small>OAuth / OpenID Connect</small>"]
  github["GitHub<br/><small>OAuth · REST API · Webhooks</small>"]
  mail["SMTP (Gmail)<br/><small>อีเมล (ยืนยัน · สรุปรายวัน · เตือน)</small>"]
  push["Web Push service<br/><small>FCM · Mozilla · Apple</small>"]
  cal["แอปปฏิทิน<br/><small>Google / Apple Calendar</small>"]
  cron["cron-job.org<br/><small>ปลุกงานตามเวลา</small>"]

  user -- "HTTPS" --> nosion
  dev -- "REST + API key" --> nosion
  nosion -- "เข้าสู่ระบบ" --> google
  nosion -- "OAuth · ดึง issue" --> github
  github -- "webhook: issue เปลี่ยน · PR merged" --> nosion
  nosion -- "ส่งอีเมล" --> mail
  nosion -- "ส่ง notification" --> push
  push -. "แสดงบนเครื่องผู้ใช้" .-> user
  cal -- "subscribe iCal feed" --> nosion
  cron -- "การเตือน · digest · ดึง GitHub" --> nosion

  classDef system fill:#1f2937,stroke:#111827,color:#fff
  classDef ext fill:#f3f4f6,stroke:#9ca3af,color:#111827
  classDef person fill:#e0e7ff,stroke:#6366f1,color:#111827
  class nosion system
  class google,github,mail,push,cal,cron ext
  class user,dev person
```

## ระดับ 2 · Container

ภายใน NOSION มีอะไรที่ deploy แยกกัน และคุยกันอย่างไร (staging/production ใช้โครงเดียวกัน)

```mermaid
flowchart TB
  subgraph browser["เบราว์เซอร์ / มือถือของผู้ใช้"]
    ui["หน้าแอป<br/><small>React · TanStack Query</small>"]
    sw["Service Worker + IndexedDB<br/><small>แคชหน้า · outbox ออฟไลน์</small>"]
  end

  subgraph vercel["Vercel"]
    web["Web<br/><small>Next.js 15 · PWA<br/>static สองภาษา + middleware</small>"]
    api["API<br/><small>NestJS 11 · Vercel Function<br/>REST /api/v1 · Swagger</small>"]
  end

  subgraph fly["Fly.io (ไม่บังคับ)"]
    worker["Worker<br/><small>BullMQ · การเตือน · digest</small>"]
  end

  cron["cron-job.org<br/><small>เรียก /internal/cron/* ตามรอบ</small>"]
  db[("PostgreSQL 17<br/><small>Supabase</small>")]
  redis[("Redis<br/><small>Upstash · rate limit · คิวของ worker</small>")]
  out["Web Push / อีเมล (SMTP)"]

  ui -- "HTTPS" --> web
  sw -. "sync เมื่อกลับมาออนไลน์" .-> web
  web -- "proxy /api/v1 + IP จริง" --> api
  api -- Prisma --> db
  api -- ioredis --> redis
  worker -- Prisma --> db
  worker -- BullMQ --> redis
  cron -- "การเตือน · digest · GitHub" --> api
  api -- "cron endpoint" --> out
  worker --> out

  classDef box fill:#1f2937,stroke:#111827,color:#fff
  classDef store fill:#fef3c7,stroke:#d97706,color:#111827
  class web,api,worker box
  class db,redis store
```

### เส้นทางที่ควรรู้

| เส้นทาง                        | ทำไมเป็นแบบนี้                                                                                               | อ่านต่อ                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| เว็บ proxy `/api/v1/*` ไป API  | refresh cookie (`SameSite=Strict`) เป็น first-party · ไม่ต้องเปิด CORS ข้ามโดเมน · แนบ IP จริงให้ rate limit | `apps/web/src/middleware.ts` · Phase 8 ขั้น 2 |
| ภาษา = คุกกี้ → rewrite ภายใน  | URL ไม่มี `/en` แต่ทุกหน้ายัง static ทั้งสองภาษา                                                             | Phase 8 ขั้น 6                                |
| การเตือนทำได้สองทาง            | Vercel ไม่มี process ค้าง → cron-job.org เรียก endpoint ของ API · ย้ายไป worker เมื่อมี Fly                  | ADR-011 · `docs/deploy/`                      |
| ออฟไลน์ = outbox ในเบราว์เซอร์ | สร้าง/แก้ตอนไม่มีเน็ต ส่งซ้ำได้โดยไม่ซ้ำ (`opId`) แก้ชนระดับ field                                           | ADR-014                                       |
| GitHub → งาน                   | ดึงด้วย OAuth token (เข้ารหัส AES-256-GCM) + webhook ตรวจ HMAC จาก body ดิบ                                  | Phase 8 ขั้น 5                                |

## ระดับ 3 · Component (ภายใน API)

ระดับนี้อยู่ในโค้ดแล้ว — กฎขอบเขตถูกบังคับด้วย lint (ADR-006):

```
apps/api/src/
  core/         registry · parser            ← ห้ามรู้จัก modules/
  modules/      task · expense · habit       ← ห้าม import ข้ามกัน · ลงทะเบียนด้วย @RegisterModule()
  entries/      CRUD กลาง · Today · Review   ← วนลูปบน registry ไม่มี if (module === …)
  auth/         session · OAuth · API key
  integrations/ GitHub
  infra/        Prisma · Redis · mail · crypto
```
