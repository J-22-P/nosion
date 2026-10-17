# ADR-019: Production จาก tag — job เดียวหลังอนุมัติ · backup เข้ารหัส · migration additive เท่านั้น · rollback ที่โค้ดไม่ใช่ที่ schema

- **สถานะ:** ยอมรับแล้ว (workflow พร้อม · ยังไม่มีโปรเจกต์ production)
- **วันที่:** 2026-10-17

## บริบท

สเปก 13.3 (deploy-production จาก tag พร้อม backup · smoke · rollback) และ 13.4 (migration แบบ zero-downtime: backward-compatible · expand → contract) —
สเปกเขียนไว้สำหรับ Fly (`fly pg backup` · `--strategy rolling`) แต่โครงจริงคือ **Vercel (api + web) + Supabase + Upstash (+ Fly สำหรับ worker)** ·
GitHub ขออนุมัติ**ทุก job** ที่อ้าง environment ที่มี required reviewers · artifact ของ run โหลดได้ทุกคนที่อ่าน repo ได้

## การตัดสินใจ

1. **tag `v*.*.*` เท่านั้น** — job `check` (ไม่อ้าง environment) ตรวจว่า tag อยู่บน `main` และ CI ของ commit นั้นเขียว **ก่อน**ขออนุมัติ
2. **deploy ทั้งหมดใน job เดียว** หลังอนุมัติครั้งเดียว: จำ deployment ปัจจุบัน → backup → migrate → api → web → worker → smoke ·
   rollback เป็น step `if: failure()` ใน job เดียวกัน (เห็น outcome ของทุก step → ย้อนเฉพาะสิ่งที่ deploy ไปแล้ว)
3. **backup = `pg_dump` เข้ารหัสด้วย age public key** เป็น artifact 30 วัน · กุญแจถอดอยู่กับเจ้าของเท่านั้น · ไม่มี recipient = ไม่ deploy
4. **migration additive เสมอ** (expand → migrate → contract ข้าม release) → **rollback ย้อนเฉพาะโค้ด** (`vercel rollback` · Fly image เดิม) ไม่ย้อน schema ·
   การกู้ข้อมูลจาก backup เป็นการตัดสินใจของคน (ลงฐานชั่วคราวก่อน ไม่ restore ทับ production)
5. **api ก่อน web** — api รุ่นใหม่ต้องเข้ากับ web รุ่นเก่า (ช่วงระหว่างสอง deploy)
6. **smoke ที่บอกว่าผู้ใช้ใช้ได้จริง** — หน้าแรก · หน้าภาษาอังกฤษ (rewrite ด้วยคุกกี้) · OpenAPI ผ่าน proxy · `/readyz` (DB + Redis) · demo login · refresh ไม่มีคุกกี้ = 401
7. ผ่าน = GitHub Release (release notes อัตโนมัติ) · ล้ม = เปิด issue พร้อมลิงก์ run, deployment ที่ย้อนไป และ backup

## ทางเลือกที่ไม่เลือก

| ทางเลือก                                        | เหตุผลที่ไม่เลือก                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| แยก job migrate / deploy / smoke (แบบ staging)  | ต้องกดอนุมัติ 4–5 รอบ · rollback ต้องอ่านผลข้าม job ซึ่งเห็นได้น้อยกว่า                          |
| deploy ทุก push บน main (continuous deployment) | ไม่มีจังหวะให้คนตัดสินใจก่อนแตะข้อมูลจริง · staging ทำหน้าที่นั้นอยู่แล้ว                        |
| backup เป็น artifact ไม่เข้ารหัส                | ข้อมูลผู้ใช้ทั้งหมดรั่วให้ทุกคนที่อ่าน repo ได้                                                  |
| พึ่ง daily backup ของ Supabase อย่างเดียว       | อาจเก่าเกือบ 24 ชม. ตอน migration พัง · แผนฟรีเก็บแค่ 7 วัน (ยังเป็นอีกชั้นที่ดี)                |
| ย้อน migration ตอน rollback (down migration)    | down ที่ทำลายข้อมูลอันตรายกว่าปัญหาที่แก้ · Prisma ไม่สร้าง down ให้ · additive ทำให้ไม่ต้องย้อน |
| blue/green ด้วยสองฐานข้อมูล                     | เกินขนาดโปรเจกต์ · Vercel ทำ immutable deployment + instant rollback ให้อยู่แล้ว                 |

## ผลที่ตามมา

**ได้:** ปล่อยเวอร์ชันด้วย `git tag` + กดอนุมัติครั้งเดียว · ไม่มีทาง deploy ของที่ CI ไม่เขียว · มี backup ก่อนทุก migration ·
ล้มแล้วกลับไปตัวเดิมเองภายในไม่กี่นาที พร้อม issue ให้ตามต่อ · ย้อนด้วยมือได้ (workflow แยก ต้องอนุมัติเหมือนกัน)

**เสีย:** ยังไม่เคยรันจริง (ไม่มี production) · "deployment ปัจจุบัน" อ่านจากตัว READY ล่าสุด — ถ้าเคย rollback ด้วยมือไว้ อาจไม่ใช่ตัวที่ใช้งานจริง ·
Vercel Hobby ย้อนได้แค่ตัวก่อนหน้า · `pg_dump` ต้องเปลี่ยนเวอร์ชันตาม major ของ Supabase · migration แบบ contract ต้องมีวินัยข้าม release (lint จับไม่ได้)
