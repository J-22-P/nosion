# ADR-005: Refresh token rotation พร้อม reuse detection

- **สถานะ:** ยอมรับแล้ว
- **วันที่:** 2026-09-18

## บริบท

access token อายุ 15 นาที เก็บใน memory เท่านั้น ส่วน refresh token อายุ 30 วัน
เก็บใน httpOnly cookie คำถามคือจะรู้ได้อย่างไรว่า refresh token ถูกขโมยไป

## การตัดสินใจ

ทำ rotation ทุกครั้งที่ refresh และเก็บ token ที่หมุนไปแล้วไว้ในสถานะ "revoked"
ไม่ลบทิ้ง ทุกใบที่สืบทอดกันมาใช้ `familyId` เดียวกัน

ถ้ามีคำขอ refresh ด้วย token ที่ถูก revoke ไปแล้ว แปลว่ามีสำเนาของ token อยู่ในมือคนอื่น
→ เพิกถอนทุก session ใน family นั้นทันที + ส่งอีเมลแจ้งผู้ใช้

นี่คือคำแนะนำของ OAuth 2.0 Security Best Current Practice

## ผลที่ตามมา

**ได้:**
- token ที่ถูกขโมยใช้ได้อย่างมากหนึ่งครั้ง และการใช้นั้นเองเป็นตัวจุดสัญญาณเตือน
- ผู้ใช้ได้รับแจ้งว่ามีบางอย่างผิดปกติ แทนที่จะโดนแอบเข้าถึงเงียบ ๆ

**เสีย:**
- ตาราง `sessions` โตขึ้นเรื่อย ๆ — worker ล้าง session ที่หมดอายุทุกคืน
- client ที่ยิง refresh พร้อมกันหลายแท็บอาจถูกตีความว่าเป็น reuse
  → ฝั่ง frontend ทำ single-flight ให้การ refresh เกิดครั้งเดียวต่อรอบ (ดู `lib/api-client.ts`)
