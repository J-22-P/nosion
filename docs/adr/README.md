# Architecture Decision Records

บันทึกว่า "ทำไมถึงตัดสินใจแบบนี้" ไม่ใช่ "ทำอะไรไปบ้าง"
เอกสารแต่ละฉบับต้องอ่านจบใน 3 นาที และต้องมีข้อเสียที่ยอมรับไว้เสมอ

| #                                               | หัวข้อ                                   | สถานะ      |
| ----------------------------------------------- | ---------------------------------------- | ---------- |
| [001](./001-separate-nestjs-from-nextjs.md)     | แยก NestJS ออกจาก Next.js API Routes     | ยอมรับแล้ว |
| [002](./002-sse-over-websocket.md)              | ใช้ SSE แทน WebSocket                    | ยอมรับแล้ว |
| [003](./003-jsonb-payload.md)                   | เก็บ payload ของโมดูลเป็น JSONB          | ยอมรับแล้ว |
| [004](./004-argon2id.md)                        | ใช้ Argon2id แทน bcrypt                  | ยอมรับแล้ว |
| [005](./005-refresh-token-rotation.md)          | Refresh token rotation + reuse detection | ยอมรับแล้ว |
| [006](./006-architecture-boundaries-as-lint.md) | บังคับกฎสถาปัตยกรรมด้วย lint             | ยอมรับแล้ว |
