# NOSION — Personal Productivity OS

ระบบจัดการชีวิตที่ต่อโมดูลเพิ่มได้ — งาน การเงิน ออกกำลังกาย และนิสัย
อยู่บนโครงสร้างข้อมูลเดียวกัน จึงดูรวมกันได้ในหน้าเดียวโดยไม่ต้องสลับแอป

> **สถานะปัจจุบัน:** Phase 0 (Foundation) และ Phase 1 (Auth + Core Entry + Task Module) เสร็จแล้ว
> Phase 2–8 (Expense, Recurrence Engine, Reminder Engine, Calendar, ⌘K, Offline sync) อยู่ในแผน
> — ดู [แผนงานเต็ม](#ทำอะไรต่อ) ท้ายเอกสาร

---

## นี่คืออะไร

To-do list เป็นโปรเจกต์ที่ถูกทำซ้ำมากที่สุดใน GitHub โปรเจกต์นี้จึงไม่ได้ตั้งใจทำ CRUD ให้สวย
แต่ตั้งใจเลือกโจทย์ที่**มีความยากทางเทคนิคที่จับต้องได้** แล้วแก้ให้ถูกต้องจริง

สิ่งที่ใช้งานได้แล้วตอนนี้:

- สมัคร / เข้าสู่ระบบ / ออกจากระบบ พร้อม refresh token rotation และ reuse detection
- บัญชีทดลอง — กดปุ่มเดียวจากหน้าแรก เข้าใช้ได้ทันทีพร้อมข้อมูลตัวอย่าง
- จัดการงาน: สร้าง ค้นหา กรอง เรียง ทำเสร็จ เลื่อน ลบ กู้คืน พร้อม optimistic update
- โปรเจกต์และแท็ก, การตั้งค่าผู้ใช้ (โซนเวลา ภาษา สกุลเงิน โมดูลที่เปิด)
- API มี Swagger, health check แยก liveness/readiness, error ตามมาตรฐาน RFC 9457

---

## ทำไมถึงน่าสนใจทางเทคนิค

### 1. Plugin Architecture — เพิ่มโมดูลโดยแก้โค้ดเดิม 0 บรรทัด

ทุกโมดูล implement interface เดียวกัน (`TrackableModule` ใน `packages/core`)
แล้วติด decorator `@RegisterModule()` จากนั้น `ModuleRegistry` จะค้นเจอเองตอน bootstrap
ผ่าน DiscoveryService ของ NestJS

ผลลัพธ์คือ **ไม่มี `if (module === 'expense')` อยู่ใน core แม้แต่ที่เดียว** —
หน้า Today, Calendar, Weekly Review และ NL Parser วนลูปบนทะเบียนโมดูลทั้งหมด

การเพิ่มโมดูลใหม่ = สร้างไฟล์ใหม่หนึ่งชุดใน `apps/api/src/modules/<ชื่อ>/` แล้วเพิ่ม
หนึ่งบรรทัดใน `AppModule` เท่านั้น

### 2. กฎสถาปัตยกรรมที่ CI บังคับให้ ไม่ใช่แค่เขียนไว้ใน README

ขอบเขตทั้ง 5 ข้อถูกแปลงเป็น lint rule จริง (ดู [ADR-006](./docs/adr/006-architecture-boundaries-as-lint.md)):
`core/` ห้ามรู้จัก `modules/`, โมดูลห้าม import ข้ามกัน, controller ห้ามแตะ Prisma,
และ domain logic ห้ามผูกกับ NestJS

ข้อสุดท้ายทำให้ business logic ทดสอบได้โดยไม่ต้อง bootstrap framework —
unit test ทั้งชุดจบใน ~1 วินาที

### 3. Auth ระดับ production ไม่ใช่แค่เรียก library

- access token อายุ 15 นาที เก็บใน memory เท่านั้น — ไม่แตะ localStorage
- refresh token เป็น opaque random 32 bytes เก็บเฉพาะ SHA-256 hash ลงฐานข้อมูล
- ทุกครั้งที่ refresh จะหมุน token ใหม่ ถ้าใบเก่าถูกใช้ซ้ำ = มีคนถือสำเนาอยู่
  → เพิกถอนทั้ง family ทันที + แจ้งอีเมล ([ADR-005](./docs/adr/005-refresh-token-rotation.md))
- Argon2id ตามพารามิเตอร์ที่ OWASP แนะนำ + เผาเวลาให้เท่ากันเมื่อไม่พบผู้ใช้ กัน user enumeration
- Prisma client extension เติม `where: { userId }` อัตโนมัติเป็นเกราะชั้นที่สองกัน IDOR

### 4. JSONB ที่มี schema จริง

โมดูลแต่ละตัวมี field ไม่เหมือนกันเลย แต่ต้อง query รวมกันได้ในคำขอเดียว
จึงใช้ตารางกลาง + `payload JSONB` และบังคับรูปแบบด้วย Zod schema ต่อโมดูลที่ระดับ
application layer — schema ตัวเดียวกันถูกใช้ทั้ง validate ที่ backend, validate ฟอร์มที่
frontend และ generate TypeScript type ทั้งสองฝั่ง ([ADR-003](./docs/adr/003-jsonb-payload.md))

### 5. Optimistic concurrency ที่ไม่เขียนทับงานคนอื่น

ทุก `PATCH /entries/:id` ต้องส่ง `version` ที่ client เห็นล่าสุดมาด้วย
ถ้าไม่ตรงกับในฐานข้อมูล API ตอบ 409 พร้อมเวอร์ชันปัจจุบัน แทนที่จะเขียนทับเงียบ ๆ
— เป็นรากฐานของ offline sync ใน Phase 7

---

## สถาปัตยกรรม

```
Browser (Next.js PWA)
        │ HTTPS / SSE
        ▼
NestJS REST API ──┬── Core Engines (Registry · Recurrence · Reminder · Calendar · Parser)
                  ├── Domain Modules (Task · Expense · Workout · Habit)
                  └── Infra (Prisma · Redis · Mail · Storage)
                             │ enqueue
                        Redis + BullMQ
                             │ consume
                     Worker (แยก container) ──► PostgreSQL
```

โครงสร้าง monorepo:

```
apps/
  api/      NestJS — REST API, auth, entries, โมดูลโดเมน
  web/      Next.js 15 (App Router)
  worker/   BullMQ consumer — แยก container เพราะต้องรันค้าง
packages/
  contracts/  Zod schema + type ที่ FE/BE ใช้ร่วมกัน
  core/       TrackableModule interface, domain type, ฟังก์ชันเวลาแบบบริสุทธิ์
  ui/         design token + helper ของ UI
```

---

## Tech Stack และเหตุผล

| ชั้น         | เทคโนโลยี                         | เหตุผลสั้น ๆ                                                 |
| ------------ | --------------------------------- | ------------------------------------------------------------ |
| Frontend     | Next.js 15 + React 19             | App Router, RSC, ระบบนิเวศใหญ่                               |
| Styling      | Tailwind CSS 4 + design token     | คุมดีไซน์เองได้ ไม่ใช่เทมเพลตสำเร็จรูป                       |
| Client state | TanStack Query + Zustand          | แยก server state ออกจาก UI state ให้ชัด                      |
| Backend      | NestJS 11 (Node 22)               | มี DI container จริง = เงื่อนไขจำเป็นของ Plugin Architecture |
| ORM          | Prisma 6                          | type-safe, migration ดี                                      |
| Database     | PostgreSQL 17                     | JSONB + partial index + window function                      |
| Cache/Queue  | Redis 7 + BullMQ                  | scheduling, rate limit, session revocation                   |
| Auth         | JWT + refresh rotation + Argon2id | ควบคุมรายละเอียดด้านความปลอดภัยเอง                           |
| Monorepo     | pnpm workspaces + Turborepo       | แชร์ type, cache build                                       |

เหตุผลเต็มของการตัดสินใจสำคัญอยู่ใน [docs/adr](./docs/adr)

---

## เอกสารเรียนรู้เบื้องหลังโปรเจกต์

[`docs/learn/`](./docs/learn) อธิบายทุกอย่างที่อยู่เบื้องหลังโค้ดตั้งแต่ศูนย์ — ใช้เทคโนโลยีอะไร
เพราะอะไร หลักการทำงานเป็นอย่างไร และข้อเสียที่ยอมรับแลกมาคืออะไร
เปิด [`docs/learn/index.html`](./docs/learn/index.html) ในเบราว์เซอร์เพื่อดูสารบัญ

| ไฟล์                                                       | เนื้อหา                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [01](./docs/learn/01-foundations-web-architecture.md)      | พื้นฐานสถาปัตยกรรมเว็บ: process, HTTP, REST, ทำไมต้องแยก 3 แอป                 |
| [02](./docs/learn/02-phase0-monorepo-and-tooling.md)       | Phase 0 · monorepo, pnpm, Turborepo, TypeScript, ESLint boundaries, Docker, CI |
| [03](./docs/learn/03-phase0-database-and-prisma.md)        | Phase 0 · ฐานข้อมูล, index, JSONB, transaction, migration, Prisma              |
| [04](./docs/learn/04-phase1-auth-deep-dive.md)             | Phase 1 · รหัสผ่าน, JWT, cookie, refresh rotation, IDOR, rate limit            |
| [05](./docs/learn/05-phase1-plugin-architecture-and-di.md) | Phase 1 · SOLID, DI container, decorator, metadata, registry pattern           |
| [06](./docs/learn/06-phase1-api-design-and-validation.md)  | Phase 1 · REST, RFC 9457, cursor pagination, Zod, optimistic concurrency       |
| [07](./docs/learn/07-phase1-frontend-data-layer.md)        | Phase 1 · React, RSC, TanStack Query, Zustand, Tailwind token, a11y            |
| [08](./docs/learn/08-testing-and-quality.md)               | การทดสอบ: pyramid, test double, coverage, flaky test, CI gate                  |
| [09](./docs/learn/09-glossary.md)                          | อภิธานศัพท์ทั้งหมดที่ใช้ในโปรเจกต์                                             |

---

## เริ่มใช้งาน

ต้องมี **Node 22+**, **pnpm 10+** และ **Docker**

```bash
pnpm install
pnpm setup:dev     # คัดลอก .env, ยก postgres/redis/mailpit, สร้าง migration + seed
pnpm dev           # web :3000 · api :3001 · worker
```

เปิด http://localhost:3000 แล้วกด "ลองใช้ทันที" หรือเข้าสู่ระบบด้วยบัญชีที่ seed ไว้:

```
demo@nosion.dev / nosion-demo-2026
```

`pnpm setup:dev` จัดการ migration ให้ครบตั้งแต่ครั้งแรก (สร้าง migration จาก schema →
เพิ่ม GIN/partial index → seed) ถ้าอยากทำทีละขั้นเองก็ได้:

```bash
pnpm db:migrate --name init    # สร้าง migration แรกจาก schema
pnpm db:migrate:indexes        # เพิ่ม GIN/partial index ที่ Prisma ประกาศเองไม่ได้
pnpm db:migrate:deploy
pnpm db:seed
```

บริการอื่นระหว่าง dev: Mailpit http://localhost:8025 · Swagger http://localhost:3001/docs

> **หมายเหตุเรื่อง MinIO:** เราใช้ MinIO จำลอง S3/R2 สำหรับไฟล์แนบ ซึ่งเริ่มใช้จริงใน Phase 2
> MinIO ถอด image ออกจาก Docker Hub แล้ว compose จึงดึงจาก `quay.io/minio/minio` และ
> ตั้ง profile ไว้ไม่ให้ขึ้นอัตโนมัติ — เปิดเมื่อต้องใช้ด้วย
> `docker compose --profile storage up -d minio` (คอนโซลที่ http://localhost:9001)

### คำสั่งที่ใช้บ่อย

```bash
pnpm dev            # รันทั้งสามแอปพร้อมกัน
pnpm verify         # lint + format + typecheck + unit + build — รันก่อน push
pnpm test:unit      # unit test ทุก package
pnpm test:int       # integration test (ต้องมี postgres + redis)
pnpm test:e2e       # Playwright
pnpm db:studio      # Prisma Studio
pnpm db:reset       # ล้างฐานข้อมูลแล้ว migrate + seed ใหม่
```

---

## การทดสอบ

| ระดับ       | เครื่องมือ                         | ครอบคลุมอะไร                                                                                                                      |
| ----------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Vitest                             | ตรรกะบริสุทธิ์: การคำนวณเวลา/timezone/DST, ทะเบียนโมดูล, การ parse sort และ defer, schema ของ contract                            |
| Integration | Vitest + supertest + Postgres จริง | auth flow เต็ม, refresh rotation + reuse detection, entry CRUD, **IDOR ทุก resource**, version conflict, idempotency ของ clientId |
| E2E         | Playwright                         | จากหน้าแรก กด "ลองใช้ทันที" แล้วสร้างงานได้จริง                                                                                   |

integration test ไม่ mock ฐานข้อมูล เพราะบั๊กที่เจ็บที่สุดในระบบแบบนี้คือ constraint,
cascade และ transaction ซึ่ง mock จับไม่ได้

**สิ่งที่จงใจไม่ทดสอบ:** getter/setter, การ render ของ component ที่ไม่มีตรรกะ,
และโค้ดของ framework เอง

---

## สิ่งที่เรียนรู้

- **DI container ไม่ใช่ของฟุ่มเฟือย** — Plugin Architecture ที่ค้นหา provider เองตอน bootstrap
  ทำได้เพราะ NestJS มี DiscoveryService ถ้าเลือก framework ที่ไม่มี DI จริง
  จะต้องมาเขียน registry ด้วยมือและ import ทุกโมดูลเอง ซึ่งพังเป้าหมายตั้งแต่ต้น
- **กฎที่ไม่มีเครื่องมือบังคับ คือกฎที่จะถูกละเมิด** — ตอนเขียน registry เกือบจะ import
  `@nestjs/core` เข้า domain logic ด้วยความเคยชิน lint rule จับได้ก่อน commit
- **`import type` กับ `emitDecoratorMetadata` ชนกัน** — กฎ lint ที่ดีในโปรเจกต์ทั่วไป
  ทำให้ DI ของ NestJS พังตอน runtime ทั้งที่ compile ผ่าน จึงต้องปิดเฉพาะฝั่ง API พร้อมบันทึกเหตุผลไว้
- **timezone ต้องคิดตั้งแต่ schema** — การเก็บ UTC เสมอแล้วแปลงที่ application layer
  ทำให้ทดสอบ DST ได้ด้วยฟังก์ชันบริสุทธิ์ โดยไม่ต้องมีฐานข้อมูล

---

## ทำอะไรต่อ

- [x] **Phase 0** — monorepo, lint boundaries, docker-compose, Prisma schema, CI
- [x] **Phase 1** — auth เต็มรูปแบบ, ModuleRegistry, entry CRUD, TaskModule, หน้า Tasks
- [ ] **Phase 2** — ExpenseModule, budget, หน้า Today ที่ประกอบจาก widget ของทุกโมดูล
- [ ] **Phase 3** — Recurrence Engine (RRULE + timezone + DST + edge case สิ้นเดือน)
- [ ] **Phase 4** — Reminder Engine (idempotency, retry, DLQ, quiet hours)
- [ ] **Phase 5** — Calendar รวมทุกโมดูล, NL Parser, Command Palette (⌘K)
- [ ] **Phase 6** — WorkoutModule + HabitModule (บททดสอบจริงของ "แก้โค้ดเดิม 0 บรรทัด")
- [ ] **Phase 7** — Offline-first sync พร้อมการแก้ conflict
- [ ] **Phase 8** — Polish, Lighthouse ≥ 90, deploy production

รายละเอียดทั้งหมดอยู่ใน [NOSION-SPEC.md](../NOSION-SPEC.md)
