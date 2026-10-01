# 05 · Phase 1 — Plugin Architecture, Dependency Injection และ Decorator

> นี่คือส่วนที่ทำให้ NOSION ต่างจาก to-do list ทั่วไป
> เป้าหมาย: **เพิ่มโมดูลใหม่ (Workout) โดยแก้โค้ดเดิม 0 บรรทัด**

---

## 1. ปัญหาที่พยายามแก้

สมมติเขียนหน้า Today แบบตรงไปตรงมา:

```ts
const widgets = [];
if (enabled.includes('task')) widgets.push(summarizeTasks(entries));
if (enabled.includes('expense')) widgets.push(summarizeExpenses(entries));
if (enabled.includes('workout')) widgets.push(summarizeWorkouts(entries));
```

ทำงานได้ ไม่ผิดอะไร — จนกระทั่งคุณนับว่าการเพิ่มโมดูลที่ 5 ต้องแก้กี่ไฟล์:

```
today.service.ts · calendar.service.ts · weekly-review.service.ts
parser.service.ts · command-palette.tsx · entries.service.ts · ...
```

ทุกครั้งที่แก้ไฟล์เดิม คุณมีโอกาสทำของเก่าพัง และต้องทดสอบทุกอย่างใหม่หมด

### Open–Closed Principle (ตัว O ใน SOLID)

> ซอฟต์แวร์ควร **เปิด**ให้ขยายความสามารถ แต่ **ปิด**ต่อการแก้ไขของเดิม

แปลเป็นภาษาคน: เพิ่มของใหม่ควรเป็นการ _เพิ่มไฟล์_ ไม่ใช่ _แก้ไฟล์_

### SOLID ฉบับย่อ (รู้ไว้พอ)

| ตัวอักษร | ชื่อ                  | ใจความ                               | ในโปรเจกต์นี้                                                    |
| -------- | --------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| S        | Single Responsibility | หนึ่งคลาส หนึ่งเหตุผลที่จะเปลี่ยน    | `TokenService` จัดการ token อย่างเดียว ไม่ยุ่งกับ user           |
| O        | Open–Closed           | เพิ่มได้ ไม่ต้องแก้                  | `TrackableModule` + registry                                     |
| L        | Liskov Substitution   | ของลูกใช้แทนของแม่ได้โดยไม่พัง       | ทุกโมดูลใช้แทนกันได้ผ่าน interface เดียว                         |
| I        | Interface Segregation | อย่ายัดทุกอย่างไว้ใน interface เดียว | `onAfterWrite?` เป็น optional                                    |
| D        | Dependency Inversion  | พึ่ง abstraction ไม่ใช่ของจริง       | core รู้จักแค่ `TrackableModule` ไม่รู้จัก `TaskTrackableModule` |

---

## 2. Coupling และ Cohesion

- **Coupling (การผูกกัน)** — โค้ดสองส่วนต้องรู้จักกันมากแค่ไหน · ต่ำดีกว่า
- **Cohesion (ความเกาะกลุ่ม)** — สิ่งที่อยู่ในไฟล์เดียวกันเกี่ยวข้องกันแค่ไหน · สูงดีกว่า

`if (module === 'expense')` ใน core = coupling สูง เพราะ core ต้องรู้ชื่อโมดูลทุกตัว
การย้ายตรรกะนั้นไปอยู่ในไฟล์ของโมดูลเอง = cohesion สูงขึ้นด้วย เพราะทุกอย่างของ expense
อยู่ในโฟลเดอร์เดียว

---

## 3. Interface — สัญญาที่ทุกคนต้องทำตาม

📁 `packages/core/src/module.interface.ts`

```ts
export interface TrackableModule<TPayload = unknown> {
  readonly key: ModuleKey;
  readonly meta: ModuleMeta;
  readonly payloadSchema: ZodType<TPayload>;
  readonly supportsRecurrence: boolean;
  readonly supportsReminder: boolean;

  toCalendarEvent(entry: Entry): CalendarEvent | null;
  summarizeToday(entries: Entry[], ctx: UserContext): TodayWidget | Promise<TodayWidget>; // Promise ได้ตั้งแต่ Phase 2b (บท 15 หัวข้อ 7)
  summarizeWeek(entries: Entry[], ctx: UserContext): WeeklySection;
  parseNaturalLanguage(input: string, ctx: UserContext): ParsedEntry | null;
  onAfterWrite?(event: EntryWriteEvent): Promise<void>;
}
```

อ่าน interface นี้แล้วจะเห็นว่ามันคือ **รายการคำถามที่ core จะถามทุกโมดูล**:

| core อยากรู้                    | ถามผ่าน                  |
| ------------------------------- | ------------------------ |
| "ข้อมูลของโมดูลนายหน้าตายังไง"  | `payloadSchema`          |
| "รายการนี้ขึ้นปฏิทินยังไง"      | `toCalendarEvent()`      |
| "วันนี้ของนายสรุปว่าอะไร"       | `summarizeToday()`       |
| "ข้อความนี้เป็นของนายหรือเปล่า" | `parseNaturalLanguage()` |

core ไม่เคยรู้ว่าคำตอบคำนวณมาอย่างไร — และนั่นคือประเด็นทั้งหมด

**หมายเหตุเรื่อง TypeScript:** `interface` หายไปตอนคอมไพล์ (ไม่มีอยู่ใน JS)
มันบังคับตอนเขียนโค้ดเท่านั้น ซึ่งเพียงพอ เพราะโมดูลทุกตัวเป็นโค้ดของเราเอง

**Generic `<TPayload>`** ทำให้ `TaskTrackableModule implements TrackableModule<TaskPayload>`
ได้ type ที่แม่นยำ ไม่ต้อง cast ไปมา

---

## 4. Dependency Injection — อธิบายตั้งแต่ศูนย์

### ปัญหาแบบไม่มี DI

```ts
class AuthService {
  private prisma = new PrismaClient(); // สร้างเอง
  private mail = new MailService(); // สร้างเอง
}
```

ปัญหา:

1. **ทดสอบไม่ได้** — จะเทสต์ `AuthService` ต้องมีฐานข้อมูลจริงเสมอ เปลี่ยนเป็นของปลอมไม่ได้
2. **สร้างซ้ำซ้อน** — ทุกคลาสที่ใช้ Prisma เปิด connection pool ของตัวเอง
3. **ผูกกับของจริง** — อยากเปลี่ยนจาก Resend เป็น SES ต้องไล่แก้ทุกที่

### DI คืออะไร

**อย่าสร้างของที่ต้องใช้เอง ให้คนอื่นส่งเข้ามา**

```ts
class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}
}
```

ตอนนี้ `AuthService` แค่ประกาศว่า "ฉันต้องการสองสิ่งนี้" ใครจะเป็นคนหามาให้ก็เรื่องของเขา
→ เวลาเทสต์ก็ส่งของปลอมเข้าไปได้

### IoC Container คืออะไร

ถ้าเราต้องประกอบเองทั้งหมด `main.ts` จะกลายเป็นแบบนี้:

```ts
const prisma = new PrismaService(config);
const redis = new RedisService(config);
const tokens = new TokenService(jwt, config);
const auth = new AuthService(prisma, tokens, passwords, mail, config);
// ...อีก 30 บรรทัด
```

**IoC (Inversion of Control) Container** คือโปรแกรมที่ทำขั้นตอนนี้ให้อัตโนมัติ:
มันอ่านว่าแต่ละคลาสต้องการอะไร แล้วสร้างตามลำดับที่ถูกต้อง และ **สร้างครั้งเดียวใช้ร่วมกัน**
(singleton) NestJS มี container นี้ในตัว — และนี่คือเหตุผลหลักที่เราเลือก NestJS
เพราะ Plugin Architecture ของเราต้องพึ่งมัน

### Provider และ Token

ใน NestJS ทุกอย่างที่ inject ได้เรียกว่า **provider** และถูกอ้างด้วย **token**

```ts
@Module({
  providers: [
    AuthService,                                    // token = ตัวคลาสเอง
    { provide: APP_CONFIG, useFactory: loadConfig } // token = Symbol
  ],
  exports: [AuthService],   // ไม่ export = โมดูลอื่นเอาไปใช้ไม่ได้
})
```

`exports` สำคัญ: มันคือขอบเขตการมองเห็น ไม่ใช่แค่พิธีกรรม
📁 ดู `apps/api/src/auth/auth.module.ts`

`@Global()` ทำให้ provider ใช้ได้ทุกที่โดยไม่ต้อง import ซ้ำ — เราใช้กับ
config/prisma/redis/mail ซึ่งเป็นโครงสร้างพื้นฐานที่ทุกที่ต้องใช้
📁 `apps/api/src/infra/prisma/prisma.module.ts`

---

## 5. Decorator ทำงานอย่างไร

Decorator คือฟังก์ชันที่ถูกเรียกตอนประกาศคลาส เพื่อ "แปะข้อมูลเพิ่ม" ให้มัน

```ts
@Injectable()
export class AuthService {}
```

เทียบเท่ากับ (ในเชิงแนวคิด):

```ts
class AuthService {}
Injectable()(AuthService); // เรียกฟังก์ชัน ส่งคลาสเข้าไป
```

`@Injectable()` ไม่ได้เปลี่ยนพฤติกรรมของคลาส มันแค่ **แปะป้าย** ว่า
"คลาสนี้ให้ container จัดการได้"

### Metadata และ reflect-metadata

คำถามที่ดี: **NestJS รู้ได้อย่างไรว่า constructor ต้องการ `PrismaService`?**
เพราะ type ของ TypeScript หายไปตอนคอมไพล์แล้วไม่ใช่หรือ?

คำตอบ: ตัวเลือก `emitDecoratorMetadata: true` ใน tsconfig ทำให้ TypeScript
**ฝังข้อมูล type ของ constructor ไว้เป็น metadata จริง ๆ ในไฟล์ JS**

โค้ดที่คอมไพล์ออกมาจะมีประมาณนี้:

```js
Reflect.defineMetadata('design:paramtypes', [PrismaService, MailService], AuthService);
```

ตอนรัน NestJS เรียก `Reflect.getMetadata('design:paramtypes', AuthService)`
ได้รายการคลาสที่ต้องการ แล้วไปหยิบ instance มาให้

นี่คือเหตุผลที่:

- 📁 `apps/api/src/main.ts` บรรทัดแรกสุดคือ `import 'reflect-metadata'`
- ⚠️ และเป็นเหตุผลที่เราต้อง **ปิดกฎ `consistent-type-imports`** ในฝั่ง API
  เพราะถ้าเขียน `import type { PrismaService }` ตัวคลาสจะถูกลบทิ้งตอนคอมไพล์
  → metadata ชี้ไปที่ `undefined` → DI พังตอนรัน ทั้งที่ compile ผ่าน
  (บันทึกไว้ใน 📁 `docs/adr/006-architecture-boundaries-as-lint.md`)

### Custom decorator ของเรา

📁 `apps/api/src/core/registry/register-module.decorator.ts`

```ts
export const REGISTER_MODULE_KEY = 'nosion:trackable-module';

export const RegisterModule = () =>
  applyDecorators(Injectable(), SetMetadata(REGISTER_MODULE_KEY, true));
```

ทำสองอย่างในบรรทัดเดียว: ทำให้ container จัดการได้ + แปะป้ายว่า "ฉันคือโมดูลโดเมน"

decorator อื่นที่เราสร้างเอง 📁 `apps/api/src/common/decorators.ts`:
`@Public()`, `@DemoForbidden()`, `@RateLimit({...})`, `@CurrentUser()`
ทั้งหมดคือการแปะ metadata แล้วให้ guard มาอ่านทีหลังผ่าน `Reflector`

---

## 6. Registry Pattern — ประกอบร่างทั้งหมด

### ขั้นที่ 1: ทะเบียนที่เป็นตรรกะบริสุทธิ์

📁 `apps/api/src/core/registry/module-registry.service.ts`

```ts
@Injectable()
export class ModuleRegistryService {
  private readonly modules = new Map<ModuleKey, TrackableModule<unknown>>();

  register(module) {
    if (this.modules.has(module.key)) throw new Error('ลงทะเบียนซ้ำ');
    this.modules.set(module.key, module);
  }

  get(key) {
    const found = this.modules.get(key);
    if (!found) throw new UnknownModuleError(key); // ไม่คืน undefined ให้คนเรียกลืมเช็ค
    return found;
  }
}
```

สังเกต: ไม่มี `import` อะไรจาก NestJS นอกจาก `@Injectable` → ทดสอบได้โดยไม่ต้องยก framework
📁 เทสต์อยู่ที่ `module-registry.service.spec.ts` รันจบใน ~6 มิลลิวินาที

### ขั้นที่ 2: ค้นหาโมดูลอัตโนมัติตอน bootstrap

📁 `apps/api/src/core/registry/registry.module.ts`

```ts
onApplicationBootstrap(): void {
  const found = this.discovery.getProviders()
    .filter((w) => w.instance && w.metatype)
    .filter((w) => Reflect.getMetadata(REGISTER_MODULE_KEY, w.metatype) === true)
    .map((w) => w.instance as TrackableModule<unknown>);

  this.registry.registerAll(found);
}
```

`DiscoveryService` เดินดู provider **ทุกตัว** ที่ container สร้างไว้ แล้วคัดเฉพาะตัวที่มีป้าย
→ ไฟล์นี้คือ **ไฟล์เดียวในระบบที่รู้จักทั้ง DI container และ TrackableModule**
ที่เหลือคุยกับ `ModuleRegistryService` ซึ่งเป็นตรรกะล้วน

`onApplicationBootstrap` คือ lifecycle hook ที่ทำงานหลังจาก provider ทุกตัวถูกสร้างครบแล้ว
(ถ้าใช้ `onModuleInit` อาจยังมีโมดูลที่ยังไม่ถูกสร้าง)

### ขั้นที่ 3: ผู้ใช้งานทะเบียน

📁 `apps/api/src/entries/entries.service.ts`

```ts
const module = this.registry.get(dto.module);
const result = module.payloadSchema.safeParse(payload); // ใช้ schema ของโมดูลนั้น
```

ไม่มี `if` ไม่มี `switch` ไม่มีชื่อโมดูลปรากฏในไฟล์นี้เลย

---

## 7. ลองทำจริง: เพิ่มโมดูลใหม่ต้องทำอะไรบ้าง

สมมติจะเพิ่ม `WorkoutModule` (ซึ่งคือ Phase 6 จริง ๆ):

```
1. packages/contracts/src/payloads.ts   → มี workoutPayloadSchema อยู่แล้ว ✅
2. สร้าง apps/api/src/modules/workout/workout.trackable.ts
     @RegisterModule()
     export class WorkoutTrackableModule implements TrackableModule<WorkoutPayload> { ... }
3. สร้าง apps/api/src/modules/workout/workout.module.ts (4 บรรทัด)
4. เพิ่ม WorkoutModule ใน imports ของ AppModule        ← 1 บรรทัด
```

**ไฟล์ที่ต้องแก้ใน core: ศูนย์**
หน้า Today, Calendar, Weekly Review, Parser และ entry CRUD รู้จักโมดูลใหม่ทันที

ทดสอบความจริงข้อนี้ได้ง่าย ๆ: ลบ `@RegisterModule()` ออกจาก `TaskTrackableModule`
แล้วรัน API — log ตอน bootstrap จะเปลี่ยนเป็น `ลงทะเบียนโมดูลแล้ว 0 ตัว`
และการสร้าง task จะได้ 422 `ไม่รู้จักโมดูล task`

---

## 8. Event Bus — ให้โมดูลคุยกันโดยไม่รู้จักกัน

กฎข้อ 2 ห้ามโมดูล import ข้ามกัน แต่บางทีต้องมีปฏิกิริยาข้ามโมดูลจริง ๆ
(เช่น "จ่ายบิลแล้ว → หักงบประมาณ")

ทางออกคือ **publish/subscribe**: ฝ่ายหนึ่งประกาศว่าเกิดอะไรขึ้น อีกฝ่ายฟังเอา
ทั้งสองฝ่ายไม่รู้จักกัน รู้จักแค่ "ชื่อ event" และ "รูปร่างข้อมูล"

📁 `apps/api/src/entries/entries.service.ts` → `emitWrite()`

```ts
this.events.emit(ENTRY_WRITE_EVENT, event); // ประกาศให้ทุกคนที่สนใจ
await this.registry.get(row.module).onAfterWrite?.(event); // แจ้งเจ้าของรายการโดยตรง
```

สังเกตว่า hook ถูกห่อด้วย try/catch:

```ts
catch (err) {
  this.logger.error(`onAfterWrite ของโมดูล ${row.module} ล้มเหลว: ...`);
}
```

**หลักการ:** side effect ที่ล้มเหลว ต้องไม่ทำให้การกระทำหลักล้มเหลวไปด้วย
ผู้ใช้กด "สร้างงาน" แล้วงานถูกสร้างสำเร็จ — การที่สถิติอัปเดตไม่ทันเป็นเรื่องรอง

⚠️ ข้อเสียที่ยอมรับ: event ใน memory หายถ้าเซิร์ฟเวอร์ดับกลางคัน
งานที่ห้ามหายจริง ๆ ต้องใช้ **transactional outbox** (เขียน event ลงตาราง `OutboxEvent`
ใน transaction เดียวกับข้อมูล แล้วให้ worker มาอ่านส่งทีหลัง) — เตรียม model ไว้แล้วใน schema

---

## 9. ทำไมกฎ "domain logic ห้าม import @nestjs/*" ถึงคุ้ม

📁 `packages/eslint-config/nest.mjs`

```js
{ group: ['@nestjs/*', '!@nestjs/common'],
  message: 'Domain logic ห้ามผูกกับ NestJS — อนุญาตเฉพาะ @nestjs/common สำหรับ decorator DI' }
```

ประโยชน์ที่วัดได้:

|                     | ต้อง bootstrap NestJS    | ไม่ต้อง                     |
| ------------------- | ------------------------ | --------------------------- |
| เวลารันเทสต์        | หลายวินาที/ไฟล์          | ~1 วินาทีทั้งชุด            |
| ต้องมี DB/Redis ไหม | มักต้อง                  | ไม่ต้อง                     |
| เขียนเทสต์ยากแค่ไหน | ต้องประกอบ TestingModule | `new TaskTrackableModule()` |

ดูตัวอย่างจริง 📁 `apps/api/src/modules/task/task.trackable.spec.ts` —
สร้าง object ตรง ๆ แล้วเรียก method ได้เลย เทสต์ 10 เคสรันจบใน 7 มิลลิวินาที

---

## แบบฝึกหัดท้ายบท

1. ลบ `@RegisterModule()` ออกจาก `TaskTrackableModule` แล้วรัน API ดู log ตอน bootstrap
2. เขียนโมดูลปลอมชื่อ `NoteModule` ที่ `key = 'task'` แล้วดูว่าเกิดอะไรขึ้นตอน bootstrap
   (คำใบ้: เราตั้งใจให้พังทันที ไม่ใช่พังตอนมีผู้ใช้)
3. เปิด 📁 `apps/api/src/entries/entries.service.ts` แล้วหาว่ามีคำว่า `'task'` อยู่กี่ที่
4. ลองเขียน `import type { PrismaService }` แทน `import { PrismaService }`
   ในไฟล์ service สักตัว แล้วรัน API — สังเกตว่า compile ผ่านแต่รันพัง
