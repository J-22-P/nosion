# 00 · แผนที่การเรียนรู้ และวิธีอ่านเอกสารชุดนี้

เอกสารชุดนี้อธิบาย **ทุกอย่างที่อยู่เบื้องหลังโค้ดของ NOSION** ตั้งแต่ศูนย์
เขียนสำหรับคนที่เขียนโค้ดเป็นแล้ว แต่ยังไม่เคยประกอบระบบขนาดนี้ด้วยตัวเอง

เป้าหมายไม่ใช่ "สอนใช้ library" แต่คือ **ทำให้คุณอธิบายโปรเจกต์ตัวเองได้ทุกบรรทัด**
เวลาถูกถามในห้องสัมภาษณ์ว่า "ทำไมถึงเลือกแบบนี้"

---

## กฎการอ่าน 3 ข้อ

1. **เปิดโค้ดจริงควบคู่ไปด้วยเสมอ** — ทุกหัวข้อจะอ้างไฟล์จริงในโปรเจกต์ เช่น
   `apps/api/src/auth/token.service.ts` ถ้าอ่านแล้วไม่เปิดดูของจริง จะจำได้แค่ชื่อศัพท์
2. **อย่าอ่านรวดเดียวจบ** — อ่านหนึ่งไฟล์ แล้วลองแก้โค้ดให้พังดู (เช่น ลบ `@RegisterModule()`
   ออกแล้วดูว่าเกิดอะไรขึ้น) ความเข้าใจเกิดตอนของพัง ไม่ใช่ตอนของทำงาน
3. **ตรงไหนที่เขียนว่า "ข้อเสียที่ยอมรับ" ให้อ่านช้าเป็นพิเศษ** — วิศวกรรมคือการเลือกข้อเสีย
   ที่เจ็บน้อยที่สุด ไม่ใช่การหาคำตอบที่ไม่มีข้อเสีย

---

## ลำดับที่ควรอ่าน

| ไฟล์                                                              | หัวข้อ                                                                                                                        | อ่านเมื่อ    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------ |
| [01](./01-foundations-web-architecture.md)                        | พื้นฐานสถาปัตยกรรมเว็บ: client/server, HTTP, process, ทำไมต้องแยก 3 แอป                                                       | อ่านก่อนเสมอ |
| [02](./02-phase0-monorepo-and-tooling.md)                         | **Phase 0** · monorepo, pnpm, Turborepo, TypeScript, ESLint, Docker, CI                                                       | หลังอ่าน 01  |
| [03](./03-phase0-database-and-prisma.md)                          | **Phase 0** · ฐานข้อมูลเชิงสัมพันธ์, index, JSONB, migration, Prisma                                                          | หลังอ่าน 02  |
| [04](./04-phase1-auth-deep-dive.md)                               | **Phase 1** · รหัสผ่าน, JWT, cookie, refresh rotation, IDOR, rate limit                                                       | หลังอ่าน 03  |
| [05](./05-phase1-plugin-architecture-and-di.md)                   | **Phase 1** · SOLID, DI container, decorator, metadata, registry pattern                                                      | หลังอ่าน 04  |
| [06](./06-phase1-api-design-and-validation.md)                    | **Phase 1** · REST, RFC 9457, pagination, Zod, optimistic concurrency                                                         | หลังอ่าน 05  |
| [07](./07-phase1-frontend-data-layer.md)                          | **Phase 1** · React, Next.js App Router, TanStack Query, Zustand, Tailwind                                                    | หลังอ่าน 06  |
| [10](./10-phase2a-design-system-and-theming.md)                   | **Phase 2a** · CSS cascade/layer, custom property, design token, Tailwind v4, dark mode, contrast, ฟอนต์                      | หลังอ่าน 07  |
| [11](./11-phase2a-accessible-components-and-app-shell.md)         | **Phase 2a** · accessibility tree, ARIA, focus, keyboard pattern, responsive, hydration                                       | หลังอ่าน 10  |
| [12](./12-phase2a-tasks-page-frontend.md)                         | **Phase 2a** · URL state, pure function, debounce, regex + Unicode, query key, นาฬิกาฝั่ง client                              | หลังอ่าน 11  |
| [13](./13-phase2a-task-api-sidebar-and-focus-timer.md)            | **Phase 2a** · timezone/DST, COUNT/GROUP BY, isolation, race condition, partial unique index, idempotency                     | หลังอ่าน 12  |
| [14](./14-phase2a-pwa-icons-visual-and-a11y-testing.md)           | **Phase 2a** · web app manifest, maskable icon, visual regression, API ปลอม, axe, contrast เป็นเทสต์                          | หลังอ่าน 13  |
| [15](./15-phase2b-money-months-and-second-module.md)              | **Phase 2b** · เงินเป็น integer, ขอบเดือนตามโซนเวลา, โมดูลที่สอง, parser "กาแฟ 65"                                            | หลังอ่าน 14  |
| [16](./16-phase3-recurrence-floating-time-and-materialization.md) | **Phase 3** · RRULE, floating time, DST, clamp วันสิ้นเดือน, lazy materialization, idempotency, cron                          | หลังอ่าน 15  |
| [17](./17-phase4-reminders-push-email-and-worker.md)              | **Phase 4** · outbox + sweeper, at-least-once, quiet hours, Web Push/VAPID, action token, อีเมล, digest ตามโซน, metrics/alert | หลังอ่าน 16  |
| [08](./08-testing-and-quality.md)                                 | การทดสอบและคุณภาพ: pyramid, unit/integration/e2e, coverage, CI gate                                                           | ท้ายสุด      |
| [09](./09-glossary.md)                                            | อภิธานศัพท์ — เปิดหาเวลาเจอคำที่ไม่รู้จัก                                                                                     | ใช้อ้างอิง   |

---

## ความรู้ที่ควรมีก่อน (ถ้าไม่มีก็ยังอ่านได้ แต่จะช้าหน่อย)

- เขียน JavaScript ได้ รู้จัก `async/await`, `Promise`, `array.map/filter`
- เคยใช้ terminal พื้นฐาน (`cd`, `ls`, `git`)
- เคยเห็น HTML/CSS มาบ้าง

สิ่งที่ **ไม่จำเป็นต้องรู้มาก่อน** เพราะเอกสารนี้อธิบายให้: TypeScript, SQL, Docker,
Dependency Injection, JWT, React Server Components

---

## ภาพรวม 30 วินาที: NOSION คืออะไรในเชิงเทคนิค

ระบบนี้คือ **3 โปรแกรมที่รันแยกกัน** + **2 ที่เก็บข้อมูล**

```
[เบราว์เซอร์]  ←→  [web : Next.js]        ← คนเห็นหน้านี้
                         │ HTTP
                   [api : NestJS]          ← ตัดสินใจทุกอย่าง, เป็นเจ้าของกฎธุรกิจ
                    ／        ＼
        [PostgreSQL]          [Redis]      ← เก็บถาวร / เก็บชั่วคราวแต่เร็วมาก
                                  ↑
                          [worker : BullMQ] ← ทำงานเบื้องหลังตามเวลา
```

ทำไมต้องแยกขนาดนี้? คำตอบอยู่ในไฟล์ 01 หัวข้อ "ทำไมไม่รวมเป็นโปรแกรมเดียว"

---

## สัญลักษณ์ในเอกสาร

- 📁 = อ้างถึงไฟล์จริงในโปรเจกต์
- ⚠️ = จุดที่คนมักพลาด
- 🎤 = คำถามสัมภาษณ์ที่หัวข้อนี้เตรียมคำตอบให้
