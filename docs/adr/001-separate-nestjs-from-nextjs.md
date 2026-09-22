# ADR-001: แยก NestJS ออกจาก Next.js API Routes

- **สถานะ:** ยอมรับแล้ว
- **วันที่:** 2026-09-18

## บริบท

โปรเจกต์นี้มี Reminder Engine เป็นหัวใจ ต้องยิงแจ้งเตือนตรงเวลา ไม่ซ้ำ ไม่หาย
และทนต่อการรีสตาร์ตเซิร์ฟเวอร์ ซึ่งแปลว่าต้องมี worker ที่รันค้างไว้ตลอด
และมี scheduler ที่ตื่นมาทำงานเองได้

Next.js API Routes ทำงานบน serverless function ที่ถูกปลุกเมื่อมี request เท่านั้น

## ทางเลือกที่พิจารณา

1. **ใช้ Next.js API Routes อย่างเดียว** แล้วพึ่ง cron ภายนอก (เช่น Vercel Cron) ยิง HTTP เข้ามา
2. **แยก NestJS เป็น service ต่างหาก** พร้อม worker แยก container
3. ใช้ Next.js + external queue service (เช่น Inngest, QStash)

## การตัดสินใจ

เลือกข้อ 2

ข้อ 1 ทำให้ความแม่นยำของการยิงเตือนขึ้นกับ cron ที่ละเอียดสุดระดับนาทีและไม่มี
retry/DLQ ที่ควบคุมเองได้ ส่วนข้อ 3 ย้ายโจทย์ที่ตั้งใจจะแก้ (queue, idempotency, retry)
ไปให้บริการภายนอกทำแทน ซึ่งขัดกับเป้าหมายของโปรเจกต์

NestJS มี DI container จริง ซึ่งเป็น**เงื่อนไขจำเป็น**ของ Plugin Architecture ที่เราออกแบบไว้:
`ModuleRegistry` ค้นหา provider ที่ติด `@RegisterModule()` ผ่าน DiscoveryService ตอน bootstrap

## ผลที่ตามมา

**ได้:**

- worker รันค้างได้จริง → BullMQ scheduler, repeatable job, graceful shutdown ทำงานตามที่ออกแบบ
- ได้ออกแบบ API contract ระหว่าง service, CORS, และ deploy สอง service ที่ต่างกัน
- business logic ทดสอบได้โดยไม่ต้องยก Next.js

**เสีย:**

- ต้องดูแล deployment สองชุด (Vercel + Fly.io) และตั้ง CORS/คุกกี้ให้ถูก
- ต้อง share type ข้าม service เอง — แก้ด้วย `packages/contracts` ใน monorepo
