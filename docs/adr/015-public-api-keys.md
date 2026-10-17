# ADR-015: Public API = API key แบบ opt-in ต่อ controller (`@PublicApi`) · เก็บ sha256 · scope ตาม HTTP method · จำกัดต่อ key

- **สถานะ:** ยอมรับแล้ว
- **วันที่:** 2026-10-17

## บริบท

สเปก 7.3/7.5/9.3: "Public API + Swagger UI + API key management" · "API key มี scope (`read`, `write`) และตรวจทุกครั้ง" · "60 ครั้ง/นาที/key"
ข้อจำกัด: guard ระดับ global (`JwtAuthGuard`) ปลอดภัยโดยค่าเริ่มต้นอยู่แล้ว (ทุก endpoint ต้องล็อกอิน ยกเว้น `@Public()`) ·
ตาราง `api_keys` (`keyHash` unique · `keyPrefix` · `scopes[]`) มีตั้งแต่ Phase 0 แต่ยังไม่ได้ใช้ · validate ด้วย Zod (ไม่มี class DTO ให้ Swagger อ่าน)

## การตัดสินใจ

1. **ทางเข้าที่สองใน guard ตัวเดิม** — `Authorization: Bearer nos_…` หรือ `X-API-Key: nos_…` · คำนำหน้า `nos_` แยกจาก JWT ได้โดยไม่ต้อง verify
2. **opt-in ต่อ controller** — ใช้ key ได้เฉพาะที่ติด `@PublicApi()` (entries · tasks · expenses · budgets · habits · calendar · today · review · projects · tags)
   ที่เหลือ (โปรไฟล์ · จัดการ key · ออกจากระบบ · OAuth) = 403 → **key ที่หลุดไปสร้าง key ใหม่ให้ตัวเองไม่ได้**
3. **scope จาก HTTP method** — GET/HEAD/OPTIONS = `read` · อื่น ๆ = `write` (ไม่ต้องประกาศ scope ทีละ endpoint)
4. **เก็บ sha256** ของ key (32 ไบต์สุ่ม) + prefix 12 ตัวไว้แสดง · key เต็มคืนครั้งเดียวตอนสร้าง
5. **rate limit ต่อ key** 60/นาที แบบ window ตรงนาที + header `RateLimit-Limit/Remaining/Reset` (+ `Retry-After`)
6. Swagger ที่ `/api/v1/docs` **เปิดทุกสภาพแวดล้อม** · สร้างเอกสารครั้งแรกที่มีคนเปิด (ไม่จ่ายใน cold start)

## ทางเลือกที่ไม่เลือก

| ทางเลือก                                        | เหตุผลที่ไม่เลือก                                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| opt-out (ทุก endpoint ใช้ key ได้ ยกเว้นที่ติด) | endpoint ใหม่หลุดเป็น Public API เพราะลืม — ผิดทิศเดียวกับที่ `@Public()` ป้องกันไว้                |
| Argon2/bcrypt ของ key                           | key สุ่ม 256 บิตเดาไม่ได้อยู่แล้ว · hash ที่มี salt ค้นจาก unique index ไม่ได้ → ต้องไล่เทียบทุกแถว |
| OAuth client credentials / PAT แบบ JWT          | ต้องมี token endpoint + การหมุน + การเพิกถอนที่ซับซ้อนกว่า · ผู้ใช้เป้าหมายคือสคริปต์ส่วนตัว        |
| scope ละเอียดต่อ resource (`tasks:write`)       | ยังไม่มีผู้ใช้ที่ต้องการ · เพิ่มทีหลังได้โดยไม่เปลี่ยนรูปแบบ key                                    |
| rate limit ต่อ IP                               | สคริปต์หลายตัวจากบ้าน/ออฟฟิศเดียวกันแชร์ IP · key ที่หลุดจากหลาย IP ก็ยังถูกจำกัด                   |
| ปิด Swagger ใน production (แบบเดิม)             | "Public API" ที่ไม่มีเอกสารให้คนนอกอ่านไม่ใช่ public · สร้างแบบ lazy จึงไม่มีต้นทุนตอนไม่มีคนเปิด   |

## ผลที่ตามมา

**ได้:** สคริปต์ของผู้ใช้อ่าน/เขียนข้อมูลได้โดยไม่ต้องจัดการ refresh token · ปลอดภัยโดยค่าเริ่มต้น (มีเทสต์ยืนยัน key ใช้กับ `/me/api-keys` ไม่ได้) ·
บัญชีทดลองสร้าง key ได้ — ผู้เข้าชมลอง Public API จริงได้ และ key ตายพร้อมบัญชี

**เสีย:** Swagger ไม่มี schema ของ body (Zod ไม่ใช่ class DTO) — อธิบายด้วยข้อความ + `packages/contracts` ·
`lastUsedAt` ไม่แม่นกว่านาที (กันเขียน DB ทุกคำขอ) · Redis ล่ม = rate limit fail-open (เหมือน guard อื่น)
