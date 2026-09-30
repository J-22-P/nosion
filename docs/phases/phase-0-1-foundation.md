# Phase 0–1 · Foundation + Auth + Task (สรุปย้อนหลัง)

> บันทึกย้อนหลังจาก git history — Phase นี้ทำก่อนมีกติกา `docs/phases/`
> รายละเอียดเชิงความรู้อยู่ใน `docs/learn/02`–`07` และเหตุผลอยู่ใน ADR-001 ถึง 006

**DoD:** สมัคร → login → สร้าง/แก้/ลบงานได้ ✅ (บน local)

## ขั้นตอนตาม commit

| #   | Commit              | ขั้น              | ผลลัพธ์                                                            |
| --- | ------------------- | ----------------- | ------------------------------------------------------------------ |
| 1   | `a30f971`           | ตั้งโครง monorepo | pnpm + Turborepo + กฎสถาปัตยกรรมใน lint (ADR-006)                  |
| 2   | `beed946`           | contracts + core  | Zod schema ที่ web/api ใช้ร่วมกัน · interface `TrackableModule`    |
| 3   | `ec2d67d`           | โครง NestJS       | RFC 9457 problem details, structured logging, health check         |
| 4   | `a046067`           | Auth              | Argon2id, refresh rotation + reuse detection (ADR-004, 005)        |
| 5   | `317feff`           | Entry แบบ generic | ModuleRegistry, CRUD ตัวเดียวทุกโมดูล, TaskModule ตัวแรก (ADR-003) |
| 6   | `38ef541`           | Web               | Next.js 15, หน้า auth, หน้างานที่ใช้ได้จริง                        |
| 7   | `aa10a89`           | Worker + CI       | BullMQ, Docker multi-stage, CI เขียวตั้งแต่วันแรก                  |
| 8   | `4070f59` `49a8582` | เอกสาร            | README, ADR 6 ฉบับ, คู่มือเรียนรู้ 10 บท                           |
| 9   | `33b9b20` `76357dc` | DX                | `pnpm setup:dev` รันผ่านบนเครื่องเปล่า                             |
| 10  | `689d34e`           | DB                | migration แรก + migration ของ custom index                         |
| 11  | `24dd24b`           | Security          | ไม่ฝังความลับ dev ลง git                                           |
| 12  | `6fa6a5f`…`cd03a34` | แก้ CI            | typecheck ของ Prisma, rate limit ในเทสต์, gitleaks, Trivy          |

## สิ่งที่ยกไป Phase 2

- Deploy staging (`deploy-staging.yml`) — ยังไม่มี workflow
