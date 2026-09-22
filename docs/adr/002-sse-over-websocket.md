# ADR-002: ใช้ Server-Sent Events แทน WebSocket

- **สถานะ:** ยอมรับแล้ว
- **วันที่:** 2026-09-18

## บริบท

ต้อง push การเปลี่ยนแปลงไปยัง client แบบ realtime: มีงานใหม่, reminder เด้ง, sync เสร็จ
ทุกกรณีเป็นการสื่อสารทางเดียวจาก server → client

## การตัดสินใจ

ใช้ SSE (`GET /events`)

WebSocket เหมาะกับการสื่อสารสองทางที่ถี่ เช่น แชทหรือ collaborative editing
ซึ่งไม่ใช่ use case ของเรา การใช้ WebSocket จะได้ความซับซ้อนมาโดยไม่ได้ประโยชน์ที่ตรงกับปัญหา

## ผลที่ตามมา

**ได้:**
- ทำงานบน HTTP ธรรมดา ผ่าน proxy / load balancer / CDN ได้โดยไม่ต้องตั้งค่า upgrade
- `EventSource` reconnect ให้อัตโนมัติ พร้อมส่ง `Last-Event-ID` กลับมาให้ resume ได้
- ใช้ auth ชุดเดียวกับ REST (Bearer token) ไม่ต้องทำ handshake แยก

**เสีย:**
- ส่งจาก client ไป server ผ่านช่องนี้ไม่ได้ — ต้องยิง REST แยก (ซึ่งเราทำอยู่แล้ว)
- HTTP/1.1 จำกัดจำนวน connection ต่อโดเมน (6) — บรรเทาด้วย HTTP/2 บน production
