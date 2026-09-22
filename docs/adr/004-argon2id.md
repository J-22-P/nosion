# ADR-004: ใช้ Argon2id แทน bcrypt

- **สถานะ:** ยอมรับแล้ว
- **วันที่:** 2026-09-18

## บริบท

ต้องเก็บรหัสผ่านให้ปลอดภัยแม้ฐานข้อมูลรั่ว

## การตัดสินใจ

ใช้ Argon2id พารามิเตอร์ `memoryCost: 19456 KiB, timeCost: 2, parallelism: 1`
ตามคำแนะนำปัจจุบันของ OWASP Password Storage Cheat Sheet

เหตุผลเทียบกับ bcrypt:
- bcrypt ตัด input ที่ 72 bytes เงียบ ๆ — รหัสผ่านภาษาไทยที่ยาวพอสมควรชนเพดานนี้ได้ง่ายเพราะ UTF-8 ใช้ 3 bytes ต่ออักขระ
- Argon2id เป็น memory-hard จึงต้านการเร่งด้วย GPU/ASIC ได้ดีกว่า
- Argon2 เป็นผู้ชนะ Password Hashing Competition และเป็นคำแนะนำปัจจุบัน

## ผลที่ตามมา

**ได้:** ความต้านทานต่อการ crack แบบขนานสูงกว่าอย่างมีนัยสำคัญ

**เสีย:**
- ใช้ RAM ~19 MB ต่อการ hash หนึ่งครั้ง → ต้องคุมจำนวน request ที่ hash พร้อมกัน
  (มี rate limit ที่ `/auth/login` และ `/auth/register` อยู่แล้ว)
- เป็น native module — ต้องมี prebuilt binary ให้ตรงกับ platform ของ container

**หมายเหตุการ implement:** เมื่อไม่พบผู้ใช้ เราเรียก `burnTime()` เพื่อ verify กับ hash สมมติ
ให้เวลาตอบกลับเท่ากับกรณีรหัสผ่านผิด — ป้องกันการเดารายชื่อสมาชิกจากเวลาตอบสนอง
