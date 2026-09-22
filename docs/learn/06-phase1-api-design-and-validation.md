# 06 · Phase 1 — ออกแบบ API, ตรวจข้อมูล และการจัดการความขัดแย้ง

> ไฟล์นี้ว่าด้วย "สัญญา" ระหว่าง frontend กับ backend
> API ที่ออกแบบดี = frontend เขียนง่ายและเดาพฤติกรรมได้ · API ที่ออกแบบแย่ = ทุกฟีเจอร์ใหม่เจ็บปวด

---

## 1. คิดเป็น "ทรัพยากร" ไม่ใช่ "การกระทำ"

มือใหม่มักออกแบบ API ตามปุ่มบนหน้าจอ:

```
POST /createTask      POST /getTaskList     POST /markTaskDone
```

แบบ REST มองเป็นทรัพยากรที่มีที่อยู่ แล้วใช้ method เป็นกริยา:

```
POST   /entries              GET /entries              POST /entries/:id/complete
```

ข้อดีที่จับต้องได้:

- `GET` ถูกแคชได้โดยเบราว์เซอร์/CDN และ "ปลอดภัย" (ไม่เปลี่ยนสถานะ)
- ดู log แล้วรู้ทันทีว่าเกิดอะไรขึ้น โดยไม่ต้องอ่าน body
- คนใหม่เดาชื่อ endpoint ถูกโดยไม่ต้องเปิดเอกสาร

### แล้ว `/entries/:id/complete` ผิดหลัก REST ไหม

ไม่ผิด และตั้งใจเลือก เพราะ "ทำเสร็จ" ไม่ใช่แค่ตั้ง `status = 'done'`
แต่มีผลข้างเคียงหลายอย่าง (บันทึก `completedAt`, ปลดล็อกงานที่รออยู่, นับ streak,
สร้างรอบถัดไปของ recurrence) การใช้ `PATCH { status: 'done' }` จะซ่อนความหมายพวกนี้ไว้
การมี endpoint เฉพาะทำให้เจตนาชัดและเขียนเทสต์ตรงจุดได้

หลักคิด: **ใช้ REST เป็นค่าเริ่มต้น แล้วเพิ่ม action endpoint เมื่อการกระทำนั้นมีความหมายในตัวเอง**

---

## 2. Versioning

`/api/v1/entries` — ใส่เวอร์ชันไว้ใน URL ตั้งแต่วันแรก

ทำไมต้องมี: วันหนึ่งคุณจะต้องเปลี่ยนรูปแบบ response แบบที่ของเก่าใช้ไม่ได้
(breaking change) ถ้าไม่มีเวอร์ชัน คุณจะพังแอปมือถือของผู้ใช้ที่ยังไม่อัปเดต

ทำไมใส่ใน URL ไม่ใช่ header: เห็นชัดใน log, ทดสอบด้วย curl ง่าย, แชร์ลิงก์ได้

📁 `apps/api/src/main.ts`

```ts
app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz', 'metrics'] });
```

health check ถูกยกเว้นเพราะเป็นเรื่องของโครงสร้างพื้นฐาน ไม่ใช่ API ของผู้ใช้
— ไม่ควรต้องเปลี่ยน URL ตอนขึ้น v2

---

## 3. Status code ที่ต้องใช้ให้ถูก

| Code                  | ความหมาย                      | ใช้เมื่อ                           |
| --------------------- | ----------------------------- | ---------------------------------- |
| 200 OK                | สำเร็จ                        | GET, PATCH                         |
| 201 Created           | สร้างสำเร็จ                   | POST ที่สร้างของใหม่               |
| 202 Accepted          | รับเรื่องแล้ว แต่ยังไม่เสร็จ  | `/auth/forgot-password`            |
| 204 No Content        | สำเร็จ ไม่มีอะไรส่งกลับ       | DELETE, logout                     |
| 400 Bad Request       | คำขอผิดรูปแบบโดยรวม           | JSON พัง                           |
| 401 Unauthorized      | **ยังไม่รู้ว่าคุณเป็นใคร**    | ไม่มี token / token หมดอายุ        |
| 403 Forbidden         | รู้ว่าคุณเป็นใคร แต่ทำไม่ได้  | บัญชีทดลองพยายามเปลี่ยนอีเมล       |
| 404 Not Found         | ไม่มีทรัพยากรนี้              | รวมถึง "มีแต่ไม่ใช่ของคุณ"         |
| 409 Conflict          | ชนกับสถานะปัจจุบัน            | version conflict                   |
| 422 Unprocessable     | รูปแบบถูก แต่เนื้อหาไม่ผ่านกฎ | รหัสผ่านสั้นไป, payload ผิด schema |
| 429 Too Many Requests | ยิงถี่เกิน                    | rate limit                         |
| 500 Internal Error    | เราพลาดเอง                    | bug                                |

⚠️ ความสับสนคลาสสิก **401 vs 403**: 401 = "ยังไม่ระบุตัวตน (หรือหมดอายุ)" ·
403 = "ระบุตัวตนแล้วแต่ไม่มีสิทธิ์"

⚠️ **400 vs 422**: 400 คือ "ข้อความนี้อ่านไม่ออก" · 422 คือ "อ่านออกแต่ข้อมูลไม่ผ่านกฎธุรกิจ"

---

## 4. RFC 9457 — Problem Details

ปัญหาของ error ที่ไม่มีมาตรฐาน: แต่ละ endpoint ตอบไม่เหมือนกัน
frontend ต้องเขียนโค้ดแกะ error หลายแบบ

```jsonc
{ "error": "not found" }          // endpoint A
{ "message": "ไม่พบ", "code": 4 }  // endpoint B
"Not Found"                        // endpoint C
```

RFC 9457 กำหนดรูปแบบกลางไว้ให้:

```json
{
  "type": "https://nosion.dev/errors/validation-failed",
  "title": "Validation failed",
  "status": 422,
  "detail": "รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร",
  "instance": "/api/v1/auth/register",
  "traceId": "01J8XK2P9A",
  "errors": [{ "path": "password", "code": "too_small", "message": "..." }]
}
```

- `type` — URI ที่ระบุ **ชนิด**ของปัญหา (frontend ใช้ตัวนี้ตัดสินใจ ไม่ใช่ข้อความ)
- `detail` — ข้อความสำหรับมนุษย์ เปลี่ยนได้โดยไม่พังโค้ด
- `errors` — ส่วนขยายของเรา ใช้ผูก error กลับเข้าช่องในฟอร์ม
- `traceId` — ผู้ใช้ส่งค่านี้มาให้ dev ตามหา log ได้ตรงคำขอนั้นเป๊ะ

การทำให้เป็นจริงอยู่ที่ **exception filter ตัวเดียว** ที่ดักทุก error ในระบบ
📁 `apps/api/src/common/problem.filter.ts`

```ts
@Catch()                         // ไม่ระบุชนิด = ดักทุกอย่าง
export class ProblemDetailsFilter implements ExceptionFilter { ... }
```

มันแปลง `ZodError`, `VersionConflictError`, `HttpException` และ error ที่ไม่รู้จัก
ให้ออกมาเป็นรูปแบบเดียวกันหมด

⚠️ จุดสำคัญด้านความปลอดภัย: error ที่ไม่รู้จักจะถูกตอบเป็นข้อความกลาง ๆ
**ไม่ส่ง stack trace ออกไป** (stack trace บอกโครงสร้างภายในและเวอร์ชันไลบรารีให้ผู้โจมตี)
แต่เราเขียนลง log พร้อม traceId เพื่อให้ตามได้

---

## 5. Pagination — ทำไมต้องเป็น cursor

### แบบ offset (ที่คนส่วนใหญ่เขียน)

```sql
SELECT * FROM entries ORDER BY created_at LIMIT 50 OFFSET 100;
```

ปัญหา 2 ข้อ:

1. **ข้อมูลซ้ำ/หาย** — ระหว่างที่ผู้ใช้อ่านหน้า 3 อยู่ มีคนเพิ่มรายการใหม่ 1 อัน
   → ทุกอย่างเลื่อนลง 1 → พอกดหน้า 4 จะเห็นรายการสุดท้ายของหน้า 3 ซ้ำอีกรอบ
2. **ยิ่งลึกยิ่งช้า** — `OFFSET 100000` ฐานข้อมูลต้องอ่านแล้วทิ้ง 100,000 แถวก่อน

### แบบ cursor (ที่เราใช้)

จำ "จุดที่อ่านค้างไว้" แทนการนับจำนวน

```ts
findMany({ take: limit + 1, cursor: { id: cursor }, skip: 1, orderBy });
```

📁 `apps/api/src/entries/entries.service.ts` → `list()`

เคล็ดลับ `take: limit + 1`: ดึงเกินมา 1 แถวเพื่อรู้ว่า "ยังมีต่อไหม"
โดยไม่ต้อง `COUNT(*)` ซึ่งแพง

```ts
const hasMore = rows.length > query.limit;
const page = hasMore ? rows.slice(0, query.limit) : rows;
```

⚠️ **cursor ต้องมีลำดับที่แน่นอน (deterministic)** ถ้าเรียงตามวันที่อย่างเดียวแล้ว
มีสองแถววันเดียวกัน ลำดับอาจสลับได้ → เราจึงเติม `id` ต่อท้ายเสมอ
📁 `apps/api/src/entries/entry.mapper.ts` → `parseSort()` จบด้วย `{ id: 'asc' }`

### Allowlist ของ field ที่ sort ได้

```ts
const SORTABLE = new Set([
  'occurredAt',
  'priority',
  'createdAt',
  'updatedAt',
  'title',
  'sortOrder',
]);
```

ถ้ารับชื่อคอลัมน์จากผู้ใช้ตรง ๆ จะเปิดให้เรียงตาม `passwordHash` ได้
ซึ่งใช้เดาข้อมูลทีละบิตได้จริง (เป็น information disclosure) — เทสต์ของเราครอบเคสนี้ไว้

---

## 6. Validation — "Parse, don't validate"

### ทำไม TypeScript ไม่พอ

```ts
const body = req.body as CreateEntryInput; // โกหกตัวเอง
```

type หายไปตอนรัน ([ไฟล์ 02](./02-phase0-monorepo-and-tooling.md))
`as` ไม่ได้ตรวจอะไรเลย มันแค่บอกคอมไพเลอร์ว่า "เชื่อฉัน"

ข้อมูลที่มาจาก **นอกโปรแกรม** ต้องถูกตรวจตอนรันเสมอ: HTTP body, query string,
env, คำตอบจาก API ภายนอก, ข้อมูลใน JSONB

### Zod ทำอะไร

Zod ให้เราประกาศ schema หนึ่งครั้ง แล้วได้ทั้ง **ตัวตรวจตอนรัน** และ **type ของ TypeScript**

```ts
export const createEntrySchema = z.object({
  module: moduleKeySchema,
  title: z.string().trim().min(1).max(200),
  isAllDay: z.boolean().default(true),
});

type CreateEntryInput = z.input<typeof createEntrySchema>; // ก่อนเติม default
type CreateEntryOutput = z.infer<typeof createEntrySchema>; // หลังเติม default
```

⚠️ **input vs output ต่างกันจริง** ถ้า schema มี `.default()` หรือ `.transform()`
เราเจอเรื่องนี้ตอนต่อ react-hook-form กับ zodResolver — ฟอร์มถือค่า "ก่อน" แต่ submit ได้ค่า "หลัง"
จึงต้องเขียน `useForm<RegisterFormValues, unknown, RegisterInput>` 📁 `apps/web/src/features/auth/auth-form.tsx`

### "Parse, don't validate" หมายความว่าอะไร

- **Validate** = ตรวจแล้วบอกว่าผ่าน/ไม่ผ่าน แต่ข้อมูลยังเป็นชนิดเดิม (ยังเชื่อไม่ได้เต็มที่)
- **Parse** = ตรวจแล้ว **คืนข้อมูลชนิดใหม่ที่การันตีว่าถูกต้อง**

```ts
const dto = createEntrySchema.parse(input); // หลังบรรทัดนี้ dto ถูกต้องแน่นอน
```

`.parse()` โยน `ZodError` เมื่อไม่ผ่าน ซึ่งถูกดักโดย filter แล้วกลายเป็น 422 พร้อม path
ของ field ที่ผิด — frontend เอาไปแสดงใต้ช่องกรอกได้ทันทีโดยไม่ต้องแปลอะไร

### ตรวจที่ boundary เท่านั้น

"Boundary" = จุดที่ข้อมูลเข้าสู่ระบบ เมื่อผ่านด่านนี้แล้ว โค้ดชั้นในเชื่อ type ได้เต็มที่
ไม่ต้องเช็ค `if (!title)` ซ้ำทุกชั้น

📁 `apps/api/src/common/zod-validation.pipe.ts` ทำให้เขียนแบบนี้ได้:

```ts
@Post()
create(@Body(zodBody(createEntrySchema)) dto: CreateEntryInput) { ... }
```

### schema ชุดเดียว ใช้ 3 ที่

นี่คือประโยชน์ของ monorepo ที่จับต้องได้ที่สุด:

```
packages/contracts/src/entry.ts
        ├── apps/api  → validate request ที่ boundary
        ├── apps/web  → validate ฟอร์มด้วย zodResolver
        └── ทั้งคู่   → ใช้ type ที่ infer มาจาก schema เดียวกัน
```

เปลี่ยนกฎที่เดียว TypeScript ฟ้องทุกจุดที่ตกหล่นทันที

---

## 7. Optimistic Concurrency — กันเขียนทับงานคนอื่น

### ปัญหา (lost update)

```
เวลา  แท็บ A                   แท็บ B
10:00 อ่านงาน (title = "ซื้อนม")
10:01                          อ่านงาน (title = "ซื้อนม")
10:02 แก้เป็น "ซื้อนมสด" บันทึก
10:03                          แก้เป็น "ซื้อนมถั่วเหลือง" บันทึก
                               → การแก้ของ A หายไปโดยไม่มีใครรู้
```

### สองวิธีแก้

**Pessimistic locking** — ล็อกแถวไว้ก่อนแก้ คนอื่นต้องรอ
เหมาะกับระบบธนาคาร แต่ไม่เหมาะกับเว็บ เพราะผู้ใช้อาจเปิดหน้าค้างไว้แล้วไปกินข้าว

**Optimistic locking** (ที่เราใช้) — ไม่ล็อก แต่ตรวจตอนบันทึกว่ามีใครแก้ไปก่อนไหม

```ts
const updated = await this.prisma.entry.updateMany({
  where: { id, userId, version: dto.version, deletedAt: null },
  data: { ...data, version: { increment: 1 } },
});

if (updated.count === 0) {
  const current = await this.requireEntry(userId, id);
  throw new VersionConflictError(dto.version, current.version); // → 409
}
```

📁 `apps/api/src/entries/entries.service.ts` → `update()`

กลไก: `where` มี `version` อยู่ด้วย → ถ้ามีคนแก้ไปแล้ว version จะไม่ตรง
อัปเดตได้ 0 แถว → เรารู้ทันทีว่าแพ้การแข่ง

**สำคัญ:** นี่เป็น atomic operation ระดับฐานข้อมูล ไม่ใช่การ "อ่านก่อนแล้วค่อยเช็ค"
ซึ่งจะมีช่องว่างให้แทรกได้ (race condition)

frontend ได้ 409 แล้วควรทำอย่างไร: ดึงของใหม่มาแสดง แล้วให้ผู้ใช้ตัดสินใจ
ไม่ใช่เขียนทับเงียบ ๆ — และนี่คือรากฐานของการแก้ conflict ใน offline sync (Phase 7)

---

## 8. Idempotency

**Idempotent** = ทำซ้ำกี่ครั้งผลลัพธ์เหมือนเดิม

`POST /entries` โดยธรรมชาติไม่ idempotent — ยิงสองครั้งได้สองรายการ
แต่เน็ตหลุดตอนรอคำตอบเกิดขึ้นบ่อยมาก และ client ก็ retry

ทางแก้: ให้ client สร้าง id ของตัวเองแนบมาด้วย

```ts
if (dto.clientId) {
  const existing = await prisma.entry.findFirst({ where: { clientId: dto.clientId } });
  if (existing) return toDto(existing); // เคยสร้างแล้ว คืนของเดิม
}
```

และฐานข้อมูลก็การันตีอีกชั้นด้วย `@@unique([userId, clientId])`

สำหรับ reminder เราใช้แนวคิดเดียวกันที่ `idempotencyKey` ซึ่งเป็น unique
→ **ฐานข้อมูลเองเป็นคนกันการยิงซ้ำ** ไม่ใช่โค้ด (เชื่อถือได้กว่า เพราะกันได้แม้มีหลาย process)

---

## 9. สังเกตการณ์ (Observability) เบื้องต้น

เมื่อระบบอยู่บน production คุณจะไม่ได้นั่งดู console อีกต่อไป

### Structured logging

log เป็น JSON ไม่ใช่ข้อความเปล่า เพื่อให้ค้นหาและกรองได้

```json
{ "level": "error", "traceId": "01J8XK2P9A", "userId": "clx...", "msg": "..." }
```

📁 `apps/api/src/common/logger.ts` (ใช้ pino ซึ่งเร็วมากเพราะ serialize แบบ streaming)

**Redaction** สำคัญไม่แพ้กัน — เราประกาศรายการ field ที่ห้ามหลุดลง log:

```ts
const REDACT_PATHS = ['password', 'passwordHash', 'accessToken', 'req.headers.authorization', ...];
```

⚠️ การเผลอ log ทั้ง request object คือวิธียอดนิยมที่ token หลุดเข้าระบบ log
ซึ่งมักมีคนเข้าถึงได้กว้างกว่าฐานข้อมูลเสียอีก

### Trace ID

📁 `apps/api/src/common/trace.middleware.ts` สร้าง id ต่อคำขอ แล้วเก็บไว้ใน
`AsyncLocalStorage` ซึ่งเป็นกลไกของ Node ที่ทำให้ "ค่าประจำคำขอ" ติดตามไปทุกฟังก์ชัน
ที่ถูกเรียกในสายนั้นโดยไม่ต้องส่งเป็นพารามิเตอร์

ค่านี้ไปโผล่ 3 ที่: response header `x-request-id`, ทุกบรรทัด log, และใน error ที่ผู้ใช้เห็น
→ ผู้ใช้แจ้งปัญหาพร้อมรหัสนี้ เราหา log ของคำขอนั้นได้ในวินาทีเดียว

### Health check ที่แยก 2 แบบ

📁 `apps/api/src/health/health.controller.ts`

| Endpoint   | ถามว่า                           | ถ้าไม่ผ่าน orchestrator ควร                  |
| ---------- | -------------------------------- | -------------------------------------------- |
| `/healthz` | process ยังอยู่ไหม               | **รีสตาร์ต**                                 |
| `/readyz`  | พร้อมรับ traffic ไหม (DB ต่อติด) | **ถอดออกจาก load balancer** (ไม่ใช่รีสตาร์ต) |

⚠️ ถ้ารวมสองอย่างเป็นอันเดียว: DB กระตุก 10 วินาที → ทุก pod ถูกฆ่าพร้อมกัน →
พอขึ้นมาใหม่ก็รุมต่อ DB พร้อมกัน → ล่มหนักกว่าเดิม
สังเกตว่า `/readyz` ของเราถือว่า Redis ล่ม **ยังพร้อมให้บริการ** เพราะระบบหลักยังทำงานได้

---

## 10. เอกสาร API

📁 `main.ts` ผูก Swagger ไว้ที่ `/docs` และ OpenAPI spec ที่ `/openapi.json`
(เปิดเฉพาะเมื่อไม่ใช่ production)

ประโยชน์: frontend ลองยิง API ได้โดยไม่ต้องเขียนโค้ด และ spec นี้ยัง generate
client library ให้ภาษาอื่นได้ด้วย

---

## แบบฝึกหัดท้ายบท

1. เปิด http://localhost:3001/docs แล้วลองยิง `POST /auth/demo` จากหน้านั้น
2. ยิง `PATCH /entries/:id` ด้วย `version` ที่ล้าสมัย แล้วอ่าน response ที่ได้
   ยืนยันว่าเป็น 409 และมี `type` เป็น `.../version-conflict`
3. ยิง `GET /entries?sort=passwordHash:desc` แล้วสังเกตว่าเกิดอะไรขึ้น (ควรถูกเมิน ไม่ใช่ error)
4. อ่าน 📁 `problem.filter.ts` แล้วตอบว่า ถ้าโค้ดโยน `Error('boom')` ธรรมดา
   ผู้ใช้จะเห็นข้อความอะไร และ dev จะหาสาเหตุจากที่ไหน
