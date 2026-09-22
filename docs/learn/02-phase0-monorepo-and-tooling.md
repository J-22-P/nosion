# 02 · Phase 0 — Monorepo และเครื่องมือพื้นฐาน

> **Phase 0 คืออะไร:** ช่วงที่ยังไม่มีฟีเจอร์ให้ผู้ใช้เลยสักอย่าง แต่วางโครงให้ทุกอย่างหลังจากนี้
> เดินได้เร็วและไม่พังเงียบ ๆ — เป้าหมายคือ `git clone` แล้วรันได้ใน 1 คำสั่ง และ CI เขียวตั้งแต่ commit แรก

สิ่งที่สร้างใน Phase 0: โครง monorepo · การแชร์ config · กฎสถาปัตยกรรมที่บังคับด้วย lint ·
docker-compose · schema ฐานข้อมูล · โครง NestJS/Next.js · CI

---

## 1. Monorepo คืออะไร และทำไมต้องใช้

**Monorepo** = เก็บหลายโปรเจกต์ไว้ใน git repository เดียว
**Polyrepo** = แยก repo ละโปรเจกต์

NOSION มี 3 แอป + 5 package ถ้าแยก repo จะเกิดปัญหานี้ทันที:

> เปลี่ยน schema ของ entry ที่ backend → ต้องไป publish package เวอร์ชันใหม่ →
> ไป bump เวอร์ชันที่ frontend → ระหว่างนั้น frontend ยังใช้ของเก่าอยู่และ **TypeScript ไม่ฟ้องอะไรเลย**
> เพราะมันเห็น type เก่าที่ยังถูกต้องตามตัวเอง

ใน monorepo `packages/contracts` ถูกอ้างแบบ "ไฟล์ในเครื่องเดียวกัน" พอแก้ schema
TypeScript จะ error ทุกจุดที่เกี่ยวข้อง **ทันทีในคอมมิตเดียวกัน** นี่คือประโยชน์ที่จับต้องได้
ไม่ใช่แค่ "จัดระเบียบสวย"

📁 ดู `packages/contracts/src/entry.ts` แล้วลองเปลี่ยน `title` เป็น required field อื่นดู
จะเห็น error โผล่ทั้งใน `apps/api` และ `apps/web`

**ข้อเสียที่ยอมรับ:** repo ใหญ่ขึ้น, CI ต้องฉลาดพอที่จะไม่ build ทุกอย่างใหม่ทุกครั้ง
(แก้ด้วย Turborepo ในหัวข้อ 3)

---

## 2. pnpm และ workspace

### npm ติดตั้ง package อย่างไร (และปัญหาของมัน)

`npm install` จะ **คัดลอก** ไฟล์ของทุก dependency ลง `node_modules` ของแต่ละโปรเจกต์
ถ้ามี 3 แอปที่ใช้ `zod` เหมือนกัน = มี zod 3 ชุดบนดิสก์

npm ยังทำ **hoisting**: ยก sub-dependency ขึ้นมาไว้ชั้นบนสุดเพื่อลดความซ้ำ
ผลข้างเคียงคือโค้ดเรา `import` package ที่เราไม่ได้ประกาศใน `package.json` ได้ (phantom dependency)
แล้ววันหนึ่งมันหายไปเพราะ dependency อื่นเลิกใช้ → พังตอน deploy

### pnpm แก้อย่างไร

pnpm เก็บทุก package ไว้ที่ **store กลางที่เดียวในเครื่อง** แล้วใช้
**hard link / symlink** ชี้เข้าไป แทนการคัดลอก

```
~/.pnpm-store/          ← เก็บจริงที่เดียว
apps/api/node_modules/
  zod -> symlink ไปยัง .pnpm/zod@3.25.76/node_modules/zod
```

ผลที่ได้:

- ประหยัดดิสก์มาก และติดตั้งเร็วขึ้นเพราะไม่ต้องคัดลอกไฟล์
- `node_modules` ชั้นบนมีเฉพาะสิ่งที่ประกาศไว้จริง → **phantom dependency หายไปโดยปริยาย**

📁 `pnpm-workspace.yaml` บอกว่า workspace มีใครบ้าง:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### `workspace:*` protocol

ใน `apps/api/package.json` เราเขียน:

```json
"@nosion/contracts": "workspace:*"
```

แปลว่า "ใช้ package ชื่อนี้จากในเครื่อง ไม่ต้องไปโหลดจาก npm registry"
pnpm จะสร้าง symlink ไปยัง `packages/contracts` ให้ — แก้โค้ดที่นั่น เห็นผลที่นี่ทันที

### lockfile คืออะไร

`pnpm-lock.yaml` บันทึกว่า **เวอร์ชันเป๊ะ ๆ ตัวไหนถูกติดตั้ง** รวมถึง dependency ของ dependency
ต้อง commit ขึ้น git เสมอ เพื่อให้เครื่องคุณ เครื่องเพื่อน และ CI ได้ของชุดเดียวกัน
CI ใช้ `--frozen-lockfile` = ถ้า lockfile ไม่ตรงกับ package.json ให้ fail ทันที
ไม่ใช่แอบอัปเกรดเงียบ ๆ

⚠️ **pnpm 10 บล็อก postinstall script โดยค่าเริ่มต้น** (เพราะเป็นช่องทางโจมตี supply chain
ที่ใช้จริงหลายครั้ง) เราจึงต้องระบุว่าอนุญาตตัวไหนบ้างใน `package.json` → `pnpm.onlyBuiltDependencies`
📁 ดูที่ `package.json` ของ root

---

## 3. Turborepo — ทำไมต้องมีตัวรันงานอีกชั้น

ถ้ามี 8 package แล้วอยากรัน `lint` ทุกตัว คุณอาจเขียน
`pnpm -r lint` ก็ได้ แต่จะเจอ 2 ปัญหา:

1. **ลำดับ** — `apps/api` ใช้ type จาก `packages/contracts` ดังนั้น contracts ต้อง build ก่อน
2. **ทำงานซ้ำ** — แก้แค่ไฟล์ใน web แต่ต้อง build/test ทุก package ใหม่หมด

Turborepo แก้ทั้งสองด้วยการสร้าง **task graph** จาก 📁 `turbo.json`:

```json
"build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] }
```

- `^build` = "build ของ dependency ต้องเสร็จก่อน" (`^` หมายถึงขึ้นไปหาแพ็กเกจแม่)
- `outputs` = ผลลัพธ์ที่ควรถูกเก็บเข้า cache

**หลักการ caching:** Turborepo คำนวณ hash จาก (ไฟล์ต้นทาง + dependency + env + คำสั่ง)
ถ้า hash เดิมเคยรันสำเร็จแล้ว มันจะ**ไม่รันซ้ำ** แต่คืนผลลัพธ์จาก cache ทันที
นี่คือเหตุผลที่คุณเห็นข้อความ `Cached: 2 cached, 7 total` เวลารัน `pnpm test:unit` รอบสอง

🎤 **คำถามสัมภาษณ์:** "CI ช้าทำไงดี" — คำตอบระดับกลางคือ cache dependency,
คำตอบระดับดีคือ cache **ผลลัพธ์ของ task** ตาม content hash + รัน job ขนานกัน

---

## 4. TypeScript — คอมไพเลอร์ ไม่ใช่แค่ "JS ที่มี type"

TypeScript ทำงาน 2 อย่างที่แยกจากกันชัดเจน:

1. **ตรวจ type** — เกิดตอน compile เท่านั้น
2. **แปลงเป็น JavaScript** — ลบ type ทิ้งทั้งหมด

⚠️ ข้อเท็จจริงที่สำคัญ: **type ไม่มีอยู่จริงตอนรัน** โค้ดที่รันคือ JS ล้วน
เพราะฉะนั้น type จึงกันข้อมูลผิดรูปแบบที่มาจาก "ภายนอก" (HTTP body, ฐานข้อมูล, env) ไม่ได้เลย
→ นี่คือเหตุผลที่ต้องมี **Zod** ตรวจซ้ำตอน runtime (อธิบายใน [06](./06-phase1-api-design-and-validation.md))

### ตัวเลือกใน tsconfig ที่เราเปิดและเหตุผล

📁 `packages/tsconfig/base.json`

| ตัวเลือก                   | ทำอะไร                                      | ทำไมเปิด                                                                     |
| -------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| `strict: true`             | เปิดชุดกฎเข้มทั้งหมด รวม `strictNullChecks` | บังคับให้จัดการกรณี `null`/`undefined` ตั้งแต่เขียน ไม่ใช่ตอน production พัง |
| `noUncheckedIndexedAccess` | `arr[0]` มีชนิดเป็น `T \| undefined`        | เพราะ array อาจว่าง — TypeScript ปกติโกหกเราเรื่องนี้                        |
| `noImplicitOverride`       | ต้องเขียน `override` ให้ชัด                 | กันการเขียนทับ method แม่โดยไม่ตั้งใจ                                        |
| `isolatedModules`          | ทุกไฟล์ต้องคอมไพล์เดี่ยว ๆ ได้              | จำเป็นเมื่อใช้ transpiler เร็ว ๆ อย่าง SWC/esbuild                           |
| `declaration`              | สร้างไฟล์ `.d.ts`                           | เพื่อให้ package อื่นใน monorepo เห็น type                                   |

### CommonJS vs ESM — กับดักที่เราเจอจริงในโปรเจกต์นี้

JavaScript มีระบบ module 2 แบบ:

```js
// CommonJS (เก่า, ของ Node)        // ES Modules (มาตรฐานใหม่)
const x = require('./x');
import x from './x.js';
module.exports = y;
export default y;
```

**ปัญหา:** โค้ด CommonJS `require()` แพ็กเกจที่เป็น ESM ล้วนไม่ได้
NestJS ใช้ CommonJS (เพราะ decorator metadata ทำงานกับ CJS ได้เสถียรกว่า)
แต่ Next.js ฝั่ง bundler ชอบ ESM

**ทางออกที่เลือก:** ให้ `packages/contracts` และ `packages/core` คอมไพล์ออกมาเป็น **CommonJS**
เพราะ Next.js bundler อ่าน CJS ได้สบาย แต่ NestJS อ่าน ESM ไม่ได้
📁 `packages/tsconfig/library.json` → `"module": "CommonJS"`

🎤 นี่เป็นคำตอบที่ดีเวลาถูกถามว่า "เจอปัญหาอะไรตอนทำ monorepo"

---

## 5. ESLint — และการบังคับสถาปัตยกรรมด้วยเครื่องมือ

**Linter** คือโปรแกรมที่อ่านโค้ดของเราแล้วหาสิ่งที่ "ถูกไวยากรณ์แต่ผิดเจตนา"
เช่น ประกาศตัวแปรแล้วไม่ใช้ หรือ `==` ที่ควรเป็น `===`

ESLint 9 ใช้ **flat config** (ไฟล์ `eslint.config.mjs` ที่ export เป็น array)
แต่ละสมาชิกใน array คือชุดกฎที่ใช้กับไฟล์บางกลุ่ม — ตัวหลังทับตัวหน้า

### ส่วนที่น่าสนใจจริง ๆ: แปลงกฎสถาปัตยกรรมเป็นกฎ lint

สเปกของเราบอกว่า core ห้ามรู้จัก modules, โมดูลห้าม import ข้ามกัน ฯลฯ
ปัญหาคือ **กฎที่อยู่แค่ในเอกสาร จะถูกละเมิดวันที่เรารีบ**

📁 `packages/eslint-config/nest.mjs` ประกาศว่าโฟลเดอร์ไหนคือ "ชั้น" อะไร:

```js
'boundaries/elements': [
  { type: 'common', pattern: 'src/common/**' },
  { type: 'infra',  pattern: 'src/infra/**' },
  { type: 'core',   pattern: 'src/core/**' },
  { type: 'module', pattern: 'src/modules/*', capture: ['family'], mode: 'folder' },
]
```

แล้วประกาศว่าใครเรียกใครได้:

```js
{ from: ['core'], allow: ['common', 'infra', 'core'] },   // core ไม่มี 'module' ในลิสต์
{ from: ['module'], allow: ['common','infra','core', ['module', { family: '${from.family}' }]] },
```

บรรทัดสุดท้ายอ่านว่า "โมดูลเรียกโมดูลได้เฉพาะ family เดียวกับตัวเอง" = ห้าม import ข้ามโมดูล

**ทดลองเอง (แนะนำให้ทำจริง):** สร้างไฟล์ `apps/api/src/modules/expense/probe.ts`
ที่ `import` อะไรก็ได้จาก `../task/` แล้วรัน `pnpm --filter @nosion/api lint`
จะได้ error ว่า:

```
No rule allowing this dependency was found.
File is of type 'module' with family 'expense'.
Dependency is of type 'module' with family 'task'
```

⚠️ **กับดักที่เจอจริง:** กฎ `@typescript-eslint/consistent-type-imports` (บังคับให้ใช้
`import type` เมื่อ import มาใช้เป็นชนิดอย่างเดียว) **ทำให้ NestJS พังตอนรัน**
เพราะ DI ของ NestJS อาศัย metadata ที่ TypeScript ฝังไว้จาก `constructor(private x: FooService)`
ซึ่งต้องมี reference จริงของ `FooService` ตอน runtime — `import type` ลบทิ้ง
จึงต้องปิดกฎนี้เฉพาะฝั่ง API พร้อมเขียนเหตุผลกำกับ (📁 `docs/adr/006-...`)

---

## 6. Prettier — แยกเรื่อง "รูปแบบ" ออกจาก "ตรรกะ"

Prettier จัดรูปแบบโค้ดใหม่ทั้งไฟล์ตามกฎตายตัว (ความกว้างบรรทัด, quote, comma)
ประโยชน์ที่แท้จริงไม่ใช่ความสวย แต่คือ **code review จะไม่มีการเถียงเรื่องรูปแบบอีก**
และ diff ใน git จะแสดงเฉพาะการเปลี่ยนตรรกะจริง ๆ

CI รัน `pnpm format:check` ซึ่ง fail ถ้าไฟล์ไหนยังไม่ถูกจัดรูป

---

## 7. Docker และ docker-compose

### Container คืออะไร

**Container** = โปรแกรมที่ถูกห่อมาพร้อมทุกอย่างที่มันต้องใช้ (ไลบรารี, ระบบไฟล์ของตัวเอง)
รันบน kernel ของเครื่องแม่ ต่างจาก **Virtual Machine** ตรงที่ไม่ต้องยก OS ทั้งตัว
จึงเบากว่ามากและเริ่มทำงานในไม่กี่วินาที

ประโยชน์ที่ตรงกับเรา: อยากได้ PostgreSQL 17 กับ Redis 7 โดย **ไม่ต้องลงลงเครื่องจริง**
และได้เวอร์ชันเดียวกับ production เป๊ะ ๆ

### docker-compose

📁 `docker-compose.yml` ประกาศหลาย container พร้อมกันในไฟล์เดียว

```yaml
postgres:
  image: postgres:17-alpine
  ports: ['5432:5432'] # พอร์ตเครื่องเรา : พอร์ตใน container
  healthcheck:
    test: ['CMD-SHELL', 'pg_isready -U nosion']
```

- `alpine` = Linux ฐานที่เล็กมาก (~5 MB) ทำให้ image เล็กลง
- `volumes: ['pgdata:/var/lib/postgresql/data']` = ให้ข้อมูลอยู่รอดแม้ลบ container
  (ถ้าไม่ใส่ ข้อมูลหายทุกครั้งที่ `docker compose down`)
- `healthcheck` + `depends_on: condition: service_healthy` = ให้ API รอจน DB **พร้อมรับคำสั่งจริง**
  ไม่ใช่แค่ "container เริ่มแล้ว" ⚠️ นี่คือสาเหตุอันดับหนึ่งของอาการ "รันครั้งแรกแล้วพัง"

เราใส่ **mailpit** (ดักอีเมลใน dev ไม่ให้หลุดออกไปจริง — เปิดดูที่ localhost:8025)
และ **minio** (จำลอง S3/R2 สำหรับไฟล์แนบ) ไว้ด้วย เพื่อให้ dev ทำงานได้โดยไม่ต้องมีบัญชีบริการจริง

### Multi-stage Dockerfile

📁 `docker/api.Dockerfile` แบ่งเป็น 4 stage:

```
deps      → ติดตั้ง dependency ทั้งหมด (รวม devDependencies)
builder   → คอมไพล์ TypeScript เป็น JavaScript
prod-deps → ติดตั้งเฉพาะ dependency ที่ production ใช้
runner    → คัดลอกเฉพาะผลลัพธ์ + prod-deps → image สุดท้ายเล็กที่สุด
```

เหตุผล: image ที่ไปอยู่บน production **ไม่ควรมี** คอมไพเลอร์, เทสต์, source map หรือ
โค้ด TypeScript ต้นฉบับ ทั้งเรื่องขนาดและเรื่องพื้นที่การโจมตี

รายละเอียดที่มักถูกมองข้ามและเราใส่ไว้:

- `USER nestjs` — ไม่รันด้วย root ถ้ามีช่องโหว่ ผู้โจมตีจะไม่ได้สิทธิ์สูงสุดทันที
- `dumb-init` — ทำให้สัญญาณ `SIGTERM` ส่งถึง node จริง → graceful shutdown ทำงาน
  (โดยปกติ process แรกใน container คือ PID 1 ซึ่ง Node จัดการสัญญาณได้ไม่ครบ)
- `HEALTHCHECK` — ให้ orchestrator รู้ว่าควรรีสตาร์ตเมื่อไร

---

## 8. CI/CD

**CI (Continuous Integration)** = ทุกครั้งที่ push โค้ด ให้เครื่องกลางรันตรวจให้อัตโนมัติ
**CD (Continuous Deployment)** = ถ้าตรวจผ่าน ให้ deploy ต่อเองเลย

📁 `.github/workflows/ci.yml` แบ่งเป็น job ที่รันขนานกัน:

```
lint ─┐
unit ─┴→ build (web, api, worker ขนานกัน 3 ตัว)
integration (ยก postgres + redis จริงขึ้นมา)
security (gitleaks, pnpm audit, trivy)
```

จุดที่ควรเข้าใจ:

- `concurrency: cancel-in-progress: true` — push ใหม่บน PR เดิมจะยกเลิก run เก่า ประหยัดเวลาเครื่อง
- `services:` ของ GitHub Actions ยก container ขึ้นมาให้ job ใช้ → integration test
  ได้คุยกับ PostgreSQL จริง ไม่ใช่ของปลอม
- **composite action** 📁 `.github/actions/setup/action.yml` รวมขั้นตอนซ้ำ ๆ
  (ติดตั้ง node, pnpm, cache, `prisma generate`) ไว้ที่เดียว ทุก job เรียกใช้บรรทัดเดียว

**ทำไม CI สำคัญกับโปรเจกต์ portfolio:** recruiter ที่เป็น dev จะกดดูแท็บ Actions
การเห็นเครื่องหมายถูกสีเขียวและไฟล์ workflow ที่เขียนเป็น บอกอะไรได้มากกว่าโค้ดฟีเจอร์

---

## 9. การจัดการ environment variable

หลักการ: **โค้ดเดียวกัน ต้องรันได้ทุกสภาพแวดล้อม โดยเปลี่ยนแค่ค่า config**

- 📁 `.env.example` — ขึ้น git ได้ เป็นรายการว่าต้องมีตัวแปรอะไรบ้าง (ค่าเป็นของปลอม)
- `.env` — **ห้ามขึ้น git** (อยู่ใน `.gitignore`) เพราะมีความลับจริง
- 📁 `apps/api/src/infra/config/env.ts` — ตรวจ env ด้วย Zod **ตอนแอปเริ่มทำงาน**

```ts
JWT_SECRET: z.string().min(32, 'JWT_SECRET ต้องยาวอย่างน้อย 32 ตัว');
```

⚠️ ทำไมต้องตรวจตอน boot: ถ้าไม่ตรวจ แอปจะขึ้นได้ตามปกติ แล้วไปพังตอนมีผู้ใช้คนแรกล็อกอิน
การ **fail fast** ตอน deploy ดีกว่าการพังทีหลังเสมอ

---

## 10. สิ่งที่ Phase 0 ให้ผลตอบแทนจริง

| ลงทุน                      | ผลตอบแทน                                                    |
| -------------------------- | ----------------------------------------------------------- |
| ตั้ง boundaries lint       | สถาปัตยกรรมไม่เน่าเมื่อเวลาผ่านไป และมีเรื่องเล่าในสัมภาษณ์ |
| docker-compose + setup:dev | คนใหม่ (หรือตัวเราในอีก 3 เดือน) เริ่มงานได้ใน 5 นาที       |
| CI ตั้งแต่วันแรก           | ไม่มีวันที่ต้อง "ตามแก้ test ที่ค้างมา 2 เดือน"             |
| tsconfig เข้มตั้งแต่ต้น    | ไม่ต้องมาไล่เปิด strict ทีหลัง ซึ่งจะเจอ error หลักร้อย     |

---

## แบบฝึกหัดท้ายบท

1. รัน `pnpm lint` แล้วดูว่ากี่ package ถูกตรวจ จากนั้นรันซ้ำอีกครั้ง — สังเกตคำว่า `cached`
2. สร้างไฟล์ที่ละเมิดกฎ boundaries แล้วดู error (วิธีอยู่ในหัวข้อ 5)
3. เปิด 📁 `docker-compose.yml` แล้วตอบให้ได้ว่า ถ้าลบ `healthcheck` ของ postgres ออก
   จะเกิดอะไรขึ้นตอน `pnpm setup:dev` ครั้งแรก
4. ลองลบ `JWT_SECRET` ออกจาก `.env` แล้วรัน API — อ่านข้อความ error ที่ได้
