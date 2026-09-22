# ADR-006: บังคับกฎสถาปัตยกรรมด้วย lint ไม่ใช่เอกสาร

- **สถานะ:** ยอมรับแล้ว
- **วันที่:** 2026-09-18

## บริบท

Plugin Architecture จะมีค่าก็ต่อเมื่อขอบเขตถูกรักษาไว้จริง
ถ้าวันหนึ่งมีใครเขียน `if (module === 'expense')` ลงใน core คุณสมบัติ
"เพิ่มโมดูลโดยแก้โค้ดเดิม 0 บรรทัด" จะหายไปทันทีโดยไม่มีใครรู้ตัว
เอกสารและ code review เป็นเครื่องมือที่พึ่งความจำของคน

## การตัดสินใจ

แปลงกฎทั้ง 5 ข้อเป็น lint rule ใน `packages/eslint-config/nest.mjs`:

| กฎ | เครื่องมือ |
|---|---|
| 1. `core/` ห้าม import จาก `modules/` | `boundaries/element-types` |
| 2. `modules/*` ห้าม import ข้ามโมดูล | `boundaries` + capture `family` |
| 3. โมดูลสื่อสารผ่าน event bus เท่านั้น | ผลลัพธ์ของกฎข้อ 2 |
| 4. Controller ห้ามเรียก Prisma ตรง | `no-restricted-imports` ในไฟล์ `*.controller.ts` |
| 5. Domain logic ห้าม import `@nestjs/*` | `no-restricted-imports` ใน `core/**` (ยกเว้น `@nestjs/common` สำหรับ decorator DI และไฟล์ `*.module.ts` ที่เป็นชั้น wiring) |

## ผลที่ตามมา

**ได้:**
- การละเมิดขอบเขตกลายเป็น CI สีแดง ไม่ใช่หนี้ทางเทคนิคที่ค่อย ๆ สะสม
- กฎข้อ 5 ทำให้ business logic ทดสอบได้โดยไม่ต้อง bootstrap NestJS → unit test ทั้งชุดจบใน ~1 วินาที

**เสีย:**
- ต้องปิด `@typescript-eslint/consistent-type-imports` ในฝั่ง API
  เพราะ `emitDecoratorMetadata` ต้องการ reference ตอน runtime ที่ `import type` จะลบทิ้ง
- การ refactor ที่ย้ายไฟล์ข้ามชั้นต้องแก้ config ด้วย ซึ่งเป็นราคาที่ยอมจ่าย
