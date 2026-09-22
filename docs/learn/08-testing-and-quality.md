# 08 · การทดสอบและคุณภาพ

> เป้าหมายของการเขียนเทสต์ไม่ใช่ "มีเทสต์" แต่คือ **กล้าแก้โค้ดโดยไม่ต้องเดาว่าอะไรจะพัง**
> เทสต์ที่ไม่เคยจับบั๊กได้เลย คือภาระ ไม่ใช่สินทรัพย์

---

## 1. Testing Pyramid

```
        ╱╲        E2E — น้อย ช้า แพง แต่ใกล้ความจริงที่สุด
       ╱──╲
      ╱ IT ╲      Integration — ปานกลาง ต่อของจริงหลายชิ้น
     ╱──────╲
    ╱  Unit  ╲    Unit — เยอะ เร็วมาก แยกเป็นชิ้นเล็ก
   ╱──────────╲
```

เหตุผลที่ต้องเป็นรูปสามเหลี่ยม ไม่ใช่สี่เหลี่ยม:
E2E หนึ่งเคสอาจใช้เวลา 10 วินาที ถ้ามี 300 เคส = 50 นาทีต่อการ push หนึ่งครั้ง
และเมื่อมันแดง คุณจะยังไม่รู้ว่าพังที่ชั้นไหน

**Anti-pattern ที่พบบ่อย: ice cream cone** (E2E เยอะ unit น้อย) → CI ช้า, เทสต์ไม่เสถียร,
สุดท้ายทีมเลิกสนใจผลของมัน

---

## 2. สามระดับในโปรเจกต์นี้

### Unit — ตรรกะบริสุทธิ์ ไม่แตะโลกภายนอก

```
packages/core/src/time.test.ts              timezone, DST, ขอบวัน
packages/contracts/src/entry.test.ts        schema, default, ขอบเขตค่า
apps/api/src/core/registry/*.spec.ts        ทะเบียนโมดูล
apps/api/src/modules/task/*.spec.ts         ตรรกะของโมดูล
apps/api/src/entries/entry.mapper.spec.ts   การแปลง sort และการเลื่อนวัน
apps/web/src/lib/format.test.ts             การแสดงวันที่แบบคนอ่าน
```

รวม 47 เคส รันจบใน **ไม่ถึง 2 วินาที** — เร็วพอที่จะรันทุกครั้งที่กด save

⚠️ ความเร็วนี้ไม่ได้มาฟรี มันมาจากกฎสถาปัตยกรรมข้อ 5
(domain logic ห้าม import `@nestjs/*`) ที่ทำให้ทดสอบได้โดยไม่ต้อง bootstrap อะไรเลย:

```ts
const module = new TaskTrackableModule(); // จบ ไม่ต้องมี DI container
expect(module.toCalendarEvent(entry)).toBeNull();
```

**ตัวอย่างเทสต์ที่มีค่าจริง** 📁 `packages/core/src/time.test.ts`

```ts
it('จัดการ DST ของ New York ได้ทั้งฤดูหนาวและฤดูร้อน', () => {
  expect(zonedTimeToUtc('2026-01-15T09:00:00', 'America/New_York').toISOString()).toBe(
    '2026-01-15T14:00:00.000Z',
  ); // EST = UTC-5
  expect(zonedTimeToUtc('2026-07-15T09:00:00', 'America/New_York').toISOString()).toBe(
    '2026-07-15T13:00:00.000Z',
  ); // EDT = UTC-4
});
```

เทสต์แบบนี้จับบั๊กที่ตาเปล่ามองไม่เห็น และจะคอยเฝ้าไว้ตอนเราเขียน Recurrence Engine ใน Phase 3

### Integration — ต่อของจริง

📁 `apps/api/test/auth.int-spec.ts`, `entries.int-spec.ts`

ยก NestJS ทั้งแอปขึ้นมาจริง + ต่อ PostgreSQL จริง แล้วยิง HTTP ผ่าน supertest

```ts
const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
const app = moduleRef.createNestApplication();
await request(app.getHttpServer()).post('/api/v1/auth/register').send({...}).expect(201);
```

**ทำไมไม่ mock ฐานข้อมูล:** บั๊กที่เจ็บที่สุดในระบบแบบนี้คือ unique constraint,
cascade delete, transaction และพฤติกรรมของ `updateMany` ที่คืน `count`
ของปลอมจะ "ผ่าน" ทุกกรณีเพราะมันทำตามที่เราคิดว่ามันทำ ไม่ใช่ตามที่ PostgreSQL ทำจริง

สิ่งที่เทสต์ชั้นนี้ครอบคลุม:

- สมัคร → ได้ httpOnly cookie และ access token ไม่โผล่ใน cookie
- อีเมลไม่มีจริง กับ รหัสผ่านผิด ตอบเหมือนกัน (กัน user enumeration)
- refresh rotation และ **reuse detection** เพิกถอนทั้ง family
- **IDOR ทุก resource**: bob อ่าน/แก้/ลบของ alice ไม่ได้ และไม่เห็นในลิสต์
- version conflict → 409
- `clientId` เดิมยิงซ้ำไม่สร้างรายการซ้ำ

### E2E — จำลองผู้ใช้จริงในเบราว์เซอร์

📁 `apps/web/e2e/smoke.spec.ts` (Playwright)

```ts
await page.getByRole('button', { name: /ลองใช้ทันที/ }).click();
await page.waitForURL('**/tasks');
await page.getByLabel('ชื่องานใหม่').fill(title);
```

สังเกตว่าเราเลือก element ด้วย **role และ label** ไม่ใช่ CSS class
เพราะ: (1) class เปลี่ยนบ่อย เทสต์จะพังโดยที่ฟีเจอร์ไม่ได้พัง
(2) ถ้าหา element ด้วย role ไม่เจอ แปลว่า screen reader ก็หาไม่เจอเหมือนกัน
→ **เทสต์ E2E ที่เขียนดีจะบังคับให้ UI เข้าถึงได้ไปในตัว**

---

## 3. Test double — ของปลอม 4 แบบ

| ชื่อ     | คืออะไร                              | ตัวอย่าง                                      |
| -------- | ------------------------------------ | --------------------------------------------- |
| **Stub** | คืนค่าที่กำหนดไว้ตายตัว              | ฟังก์ชันที่คืน `false` เสมอ                   |
| **Mock** | ของปลอมที่ตรวจด้วยว่าถูกเรียกอย่างไร | `expect(mail.send).toHaveBeenCalledWith(...)` |
| **Fake** | ของจริงเวอร์ชันย่อ                   | in-memory repository                          |
| **Spy**  | ของจริง แต่แอบบันทึกการเรียก         | `vi.spyOn(logger, 'warn')`                    |

หลักการเลือก: **ปลอมเฉพาะสิ่งที่ควบคุมไม่ได้หรือแพง** (อีเมลจริง, API ภายนอก, เวลาปัจจุบัน)
อย่าปลอมสิ่งที่เป็นแก่นของสิ่งที่กำลังทดสอบ

**เคล็ดลับเรื่องเวลา:** แทนที่จะ mock `Date.now()` เราออกแบบให้ฟังก์ชันรับเวลาเข้ามา:

```ts
export function isOverdue(occurredAt: Date | null, now: Date, isDone: boolean): boolean;
```

ทดสอบง่ายกว่ามาก และโค้ดก็บริสุทธิ์ขึ้นด้วย (ดู `UserContext.now` ที่ส่งเข้าทุก engine)

---

## 4. โครงของเทสต์ที่ดี

### AAA: Arrange · Act · Assert

```ts
it('งานที่ทำเสร็จแล้วไม่นับว่าเลยกำหนด', () => {
  const now = new Date('2026-09-18T10:00:00Z'); // Arrange
  const result = isOverdue(new Date('2026-09-17T10:00:00Z'), now, true); // Act
  expect(result).toBe(false); // Assert
});
```

### ชื่อเทสต์ควรบอก "พฤติกรรม" ไม่ใช่ "ชื่อฟังก์ชัน"

❌ `it('test isOverdue')`
✅ `it('งานที่ทำเสร็จแล้วไม่นับว่าเลยกำหนด แม้วันที่จะผ่านไปแล้ว')`

เวลาเทสต์แดงใน CI ชื่อคือสิ่งแรกที่คุณเห็น — มันควรบอกได้เลยว่าพฤติกรรมอะไรเสียไป
(เขียนเป็นภาษาไทยได้ และในโปรเจกต์นี้เราเขียนไทยทั้งหมดเพื่อให้อ่านเร็ว)

### หนึ่งเทสต์ = หนึ่งเหตุผลที่จะแดง

ถ้าเทสต์หนึ่งตัว assert 10 อย่างที่ไม่เกี่ยวกัน เวลามันแดงคุณจะไม่รู้ว่าเรื่องไหน

---

## 5. Coverage — ตัวเลขที่ต้องอ่านให้เป็น

**Coverage** = สัดส่วนบรรทัด/สาขาของโค้ดที่ถูกรันระหว่างเทสต์

⚠️ Coverage สูงไม่ได้แปลว่าเทสต์ดี:

```ts
it('ไม่พัง', () => {
  doEverything();
}); // coverage 100% แต่ไม่ assert อะไรเลย
```

มันบอกได้แค่ว่า **ตรงไหนยังไม่เคยถูกรันเลย** ซึ่งก็มีประโยชน์ในตัว
เป้าหมายของสเปก: รวม ≥ 70% และ engine ≥ 90% เพราะ engine คือส่วนที่พังแล้วเจ็บที่สุด

เราตั้งค่าไม่ให้นับไฟล์ที่ไม่มีตรรกะ (`*.module.ts`, `main.ts`, `index.ts`)
📁 `apps/api/vitest.config.ts` — ไม่งั้นตัวเลขจะถูกเจือจางจนไม่มีความหมาย

---

## 6. เครื่องมือและกับดักที่เจอจริง

### Vitest

เร็วเพราะใช้ pipeline ของ Vite และรันไฟล์ขนานกัน

⚠️ **กับดัก:** esbuild (ตัวแปลงเริ่มต้นของ Vite) **ไม่รองรับ `emitDecoratorMetadata`**
→ NestJS DI พังในเทสต์ทั้งที่โค้ดถูก
แก้ด้วยการใช้ SWC แทน 📁 `apps/api/vitest.config.ts`

```ts
plugins: [swc.vite({ module: { type: 'es6' } })];
```

### แยก project ใน config เดียว

```ts
projects: [
  { test: { name: 'unit', include: ['src/**/*.spec.ts'] } },
  { test: { name: 'integration', include: ['test/**/*.int-spec.ts'], fileParallelism: false } },
];
```

`fileParallelism: false` สำหรับ integration เพราะทุกไฟล์ใช้ฐานข้อมูลเดียวกัน
ถ้ารันขนานกันจะล้างข้อมูลทับกันเอง → เทสต์ flaky

### Flaky test — ศัตรูตัวจริง

เทสต์ที่ผ่านบ้างไม่ผ่านบ้างโดยโค้ดไม่เปลี่ยน อันตรายกว่าเทสต์ที่ไม่มี
เพราะทีมจะเริ่มชิน แล้วกด re-run จนกว่าจะเขียว ซึ่งวันหนึ่งจะกลบบั๊กจริง

สาเหตุที่พบบ่อยและวิธีกันในโปรเจกต์นี้:

- ใช้เวลาปัจจุบัน → รับ `now` เป็นพารามิเตอร์
- ข้อมูลชนกัน → `uniqueEmail()` สร้างอีเมลไม่ซ้ำทุกครั้ง 📁 `apps/api/test/helpers.ts`
- ลำดับการรัน → `truncateAll()` ก่อนเริ่มทุกไฟล์
- รอเวลาแบบสุ่มเดา (`sleep(500)`) → Playwright ใช้ auto-wait ตามเงื่อนไขแทน

---

## 7. สิ่งที่ **ไม่** ทดสอบ (จงใจ)

- getter/setter ที่ไม่มีตรรกะ
- การ render ของ component ที่แสดงผลอย่างเดียว
- โค้ดของ framework เอง (Prisma, NestJS ทดสอบตัวเองมาแล้ว)
- การจัดวาง CSS (ใช้สายตาและ Playwright screenshot แทน)

การเขียนเทสต์พวกนี้ทำให้ coverage สวยขึ้นแต่ไม่ได้เพิ่มความมั่นใจ
และกลายเป็นภาระตอน refactor

---

## 8. คุณภาพที่ไม่ได้มาจากเทสต์

เทสต์ไม่ใช่ด่านเดียว — ใน CI เรามีหลายด่านที่จับคนละเรื่อง:

| ด่าน                       | จับอะไร                                     |
| -------------------------- | ------------------------------------------- |
| `tsc --noEmit` (typecheck) | type ไม่ตรง — จับได้เยอะกว่าเทสต์ในหลายกรณี |
| `eslint`                   | โค้ดน่าสงสัย + **การละเมิดสถาปัตยกรรม**     |
| `prettier --check`         | รูปแบบไม่สม่ำเสมอ                           |
| `pnpm audit`               | dependency ที่มีช่องโหว่ที่รู้กันแล้ว       |
| `gitleaks`                 | secret ที่เผลอ commit ขึ้นไป                |
| `trivy`                    | ช่องโหว่ใน OS/แพ็กเกจของ image              |

⚠️ `gitleaks` scan ทั้ง **git history** ไม่ใช่แค่ไฟล์ปัจจุบัน
เพราะ secret ที่เคย commit แล้วลบทีหลัง **ยังอยู่ใน history และยังต้องถือว่ารั่วแล้ว**
(วิธีแก้ที่ถูกคือ revoke secret นั้นทิ้ง ไม่ใช่แค่ลบไฟล์)

---

## 9. คำสั่งที่ใช้จริง

```bash
pnpm test:unit    # เร็ว รันบ่อย ๆ ระหว่างเขียนโค้ด
pnpm test:int     # ต้องมี postgres + redis (pnpm setup:dev ยกให้แล้ว)
pnpm test:e2e     # ต้องมีทั้งระบบทำงานอยู่
pnpm verify       # lint + format + typecheck + unit + build — รันก่อน push ทุกครั้ง
```

---

## แบบฝึกหัดท้ายบท

1. ทำให้เทสต์แดงโดยตั้งใจ: แก้ `PRIORITY_ORDER` ให้ `urgent` น้อยกว่า `low` แล้วรัน `pnpm test:unit`
2. ลบ `await queryClient.cancelQueries(...)` ออกจาก `onMutate` แล้วคิดว่าเทสต์ไหนควรจับได้
   (คำใบ้: ตอนนี้ยังไม่มี — ลองเขียนเพิ่ม)
3. เขียน unit test ใหม่หนึ่งเคสสำหรับ `formatDueDate` กรณี "อีก 3 วัน"
4. อ่าน 📁 `apps/api/test/entries.int-spec.ts` แล้วตอบว่า ถ้าลบ Prisma extension
   `forUser()` ทิ้ง เทสต์เคสไหนจะแดง
