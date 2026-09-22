# ADR-003: เก็บ field เฉพาะโมดูลเป็น JSONB ในตาราง entries

- **สถานะ:** ยอมรับแล้ว
- **วันที่:** 2026-09-18

## บริบท

โมดูล Task, Expense, Workout, Habit มี field เฉพาะตัวที่ไม่เหมือนกันเลย
แต่หน้า Today, Calendar และ Weekly Review ต้อง query ข้ามทุกโมดูลพร้อมกันในคำขอเดียว

## ทางเลือกที่พิจารณา

1. **ตารางแยกต่อโมดูล** — query รวมต้อง UNION ทุกตาราง และต้องแก้ทุกครั้งที่เพิ่มโมดูล
2. **Single-table inheritance** — คอลัมน์ NULL เยอะมาก และเพิ่มโมดูล = ALTER TABLE
3. **ตารางกลาง + payload JSONB**

## การตัดสินใจ

เลือกข้อ 3: `entries` เก็บ field ที่ทุกโมดูลใช้ร่วมกัน (วันที่ ชื่อ สถานะ ความสำคัญ)
ส่วน field เฉพาะโมดูลอยู่ใน `payload JSONB`

ข้อ 1 ขัดกับเป้าหมาย "เพิ่มโมดูลโดยแก้โค้ดเดิม 0 บรรทัด" โดยตรง เพราะทุก query รวมต้องถูกแก้

**ข้อแลกเปลี่ยนที่สำคัญ:** JSONB ไม่มี schema ที่ฐานข้อมูลบังคับให้
เราจึงบังคับที่ application layer ด้วย Zod schema ต่อโมดูล ซึ่งเป็น field ที่บังคับ
ใน interface `TrackableModule` — โมดูลที่ไม่มี `payloadSchema` จะ compile ไม่ผ่าน

## ผลที่ตามมา

**ได้:**
- `GET /entries?module=task,expense` เป็น query เดียว ไม่มี UNION
- เพิ่มโมดูลใหม่ไม่ต้อง migrate ฐานข้อมูล

**เสีย:**
- ไม่มี FK constraint ภายใน payload — แก้ด้วย validation ที่เข้มงวดและ integration test
- index บน JSONB path ต้องเขียน SQL เอง (ดู `prisma/sql/custom_indexes.sql`)
- payload ที่เขียนไว้ก่อนเปลี่ยน schema ยังเป็นรูปแบบเก่า → ต้องมี migration ระดับข้อมูลเมื่อ schema ของโมดูลเปลี่ยน
