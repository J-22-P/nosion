# 21 · Phase 8 — เปิดประตูให้ระบบอื่น · สองภาษา · ปล่อยเวอร์ชันจริง

> Phase สุดท้ายดูเหมือนรายการงานจิปาถะ (API key · ล็อกอิน Google/GitHub · webhook · แปลภาษา · workflow production · onboarding)
> แต่ทุกข้อคือคำถามเดียวกันในมุมต่างกัน: **ระบบที่ปลอดภัยโดยค่าเริ่มต้น เปิดทางเข้าใหม่โดยไม่ทำให้ค่าเริ่มต้นนั้นพังได้อย่างไร**
> **(1) key ที่หลุดทำอะไรได้บ้าง (2) ทำไม OAuth ต้องมี state และ PKCE ทั้งที่มี client secret แล้ว (3) ผูกบัญชีด้วยอีเมลเมื่อไหร่ถึงปลอดภัย
> (4) สองระบบแก้ข้อมูลชิ้นเดียวกัน ใครเป็นเจ้าของ (5) แปลทั้งแอปโดยไม่เสีย static rendering (6) deploy ที่ล้มแล้วกลับเองได้ (7) "ใช้เองได้โดยไม่ต้องอธิบาย" วัดอย่างไร**

อ่านคู่กับ: 📁 `docs/phases/phase-8-polish-portfolio.md` ·
[ADR-015](../adr/015-public-api-keys.md) · [016](../adr/016-oauth-sign-in.md) · [017](../adr/017-github-issues-to-tasks.md) ·
[018](../adr/018-i18n-cookie-rewrite.md) · [019](../adr/019-production-release-and-rollback.md) ·
บท [04](./04-phase1-auth-deep-dive.md) (refresh rotation · `@Public`) · บท [20](./20-phase7-offline-sync.md) (`clientId` unique · idempotency)

---

## 0. ก่อนเริ่ม: วัดก่อนตั้งเกณฑ์ (ขั้น 1–2)

สองขั้นแรกสั้น แต่สอนนิสัยที่ใช้ทั้ง phase:

- **visual regression** — สเปกบอก 0.2% · ก่อนตั้ง วัด noise จริงจาก runner สองรอบด้วย comparator ตัวเดียวกับ Playwright → 0 พิกเซลต่างเกิน 0.02
  จึงตั้ง `threshold: 0.05` ได้อย่างมั่นใจ · ⚠️ เกณฑ์แบบสัดส่วนไม่จับ chip เล็ก ๆ (~0.02% ของจอ) — นั่นเป็นงานของ test ที่หาด้วยชื่อ
- **Lighthouse** — ตัวเลขแรกหลอก: หน้าแอป 6 หน้า **ไม่เคยถูกวัด** เพราะหลุดไป `/login` ทุกหน้า · script ตรวจ "หน้าที่ไปถึงจริง" ก่อนเชื่อคะแนน
  และระหว่างตามหาก็เจอบั๊กจริง: refresh token ที่คำตอบไปไม่ถึงถูกมองว่าขโมย (แก้ด้วย grace 20 วิ) · pooler ผิดโหมดบน staging

บทเรียน: **ตัวเลขที่ไม่รู้ว่ามาจากอะไร แย่กว่าไม่มีตัวเลข** — ใช้ซ้ำในหัวข้อ 7 (onboarding วัดจากฐานข้อมูลจริง ไม่ใช่ localStorage)

---

## 1. API key: ทางเข้าที่สอง ไม่ใช่ระบบ auth ที่สอง

```
Authorization: Bearer eyJ…   ──► JwtAuthGuard ──► verify JWT ──► ทุก endpoint (ที่ไม่ใช่ @Public)
Authorization: Bearer nos_…  ──►      │       ──► sha256 → api_keys ──► เฉพาะ controller ที่ติด @PublicApi
X-API-Key: nos_…             ──►      ┘                               + scope ตาม method + 60/นาที/key
```

📁 `apps/api/src/auth/api-keys/api-key.ts` — pure ทั้งไฟล์:

```ts
export function requiredScope(method: string): ApiKeyScope {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) ? 'read' : 'write';
}
```

สามการตัดสินใจที่ต้องตอบได้:

1. **ทำไม `nos_`** — guard แยก key ออกจาก JWT ได้จากสตริงอย่างเดียว (ไม่ต้องลอง verify แล้วจับ error) · และเครื่องมือสแกน secret รู้จักรูปแบบได้เมื่อหลุดเข้า git
2. **ทำไม sha256 ไม่ใช่ Argon2** — Argon2 ช้าเพื่อกันเดา _รหัสผ่านที่คนตั้ง_ (entropy ต่ำ) · key สุ่ม 256 บิตเดาไม่ได้อยู่แล้ว
   และทุกคำขอต้อง **หาแถวจาก hash** (unique index) — hash ที่มี salt ทำแบบนั้นไม่ได้
3. **ทำไม opt-in** — ถ้า key ใช้ได้ทุกที่ยกเว้นที่ห้าม endpoint ใหม่ที่ลืมติดป้ายจะกลายเป็น Public API เงียบ ๆ ·
   แบบ opt-in ลืม = 403 (ผิดทางปลอดภัย) · ผลที่ได้ฟรี: **key ที่หลุดไปสร้าง key ใหม่ให้ตัวเองไม่ได้** (`/me/api-keys` ไม่มี `@PublicApi`)

⚠️ rate limit ต่อ key ไม่ใช่ต่อ IP — สคริปต์หลายตัวจากออฟฟิศเดียวแชร์ IP · key ที่หลุดไปใช้จากร้อย IP ก็ยังติดเพดานเดียว

⚠️ Swagger ไม่มี schema ของ body เพราะ validate ด้วย Zod (ไม่มี class DTO ให้ decorator อ่าน) — ยอมรับ แลกกับ contract ชุดเดียว FE/BE

🎤 _"API key ของคุณหลุดขึ้น GitHub public ผู้ร้ายทำอะไรได้บ้าง และคุณรู้ได้อย่างไร"_ — อ่าน/เขียนข้อมูลของ endpoint ที่เปิด ตาม scope ·
ไม่ได้: เปลี่ยนรหัสผ่าน · สร้าง key · ดู session · `lastUsedAt` บอกว่าถูกใช้ล่าสุดเมื่อไหร่ · เพิกถอนแล้วตายทันที (ตรวจทุกคำขอ ไม่มีแคช)

---

## 2. OAuth: ทำไม state, PKCE และคุกกี้ที่เข้ารหัส

```
เบราว์เซอร์                      API                                Google / GitHub
  │ GET /auth/oauth/google/start  │                                       │
  │──────────────────────────────►│ state, verifier สุ่ม                  │
  │  302 + Set-Cookie nosion_oauth │ = seal({state, verifier, next})       │
  │◄──────────────────────────────│                                       │
  │ 302 → authorize?state=…&code_challenge=S256(verifier) ───────────────►│
  │◄──────────────────────── 302 callback?code=…&state=… ────────────────│
  │ GET /callback (+ คุกกี้)       │ state ตรงไหม? ─► code + verifier ─────►│
  │                               │◄──────────── token + profile ─────────│
  │  302 /today + refresh cookie  │ หา/ผูก/สร้างผู้ใช้ → startSession       │
```

**state กันอะไร** — _login CSRF_: ผู้ร้ายส่งลิงก์ callback ที่มี `code` ของ**บัญชีผู้ร้าย**ให้เหยื่อเปิด → เหยื่อล็อกอินเป็นผู้ร้ายโดยไม่รู้ตัว แล้วกรอกข้อมูลส่วนตัวลงไป ·
state ที่ต้องตรงกับคุกกี้ในเบราว์เซอร์นั้นทำให้ callback ที่ไม่ได้เริ่มจากเบราว์เซอร์นี้ถูกปฏิเสธ

**PKCE กันอะไร (ทั้งที่มี client secret)** — `code` ที่หลุดระหว่างทาง (log ของ proxy · history · Referer) แลกเป็น token ไม่ได้ถ้าไม่มี verifier ที่อยู่แค่ในคุกกี้ของเรา ·
OAuth 2.1 แนะนำ PKCE ทุก client — ราคาแค่ sha256 หนึ่งครั้ง

**ทำไมเก็บในคุกกี้ ไม่ใช่ Redis** — 📁 `apps/api/src/infra/crypto/secret-box.ts` (AES-256-GCM + `aad`):
Vercel Function ไม่มี memory ร่วม · Redis ล่ม = ล็อกอินไม่ได้ · และต่อให้มี Redis ก็ยังต้องผูก state กับเบราว์เซอร์ด้วยคุกกี้อยู่ดี
`aad` (additional authenticated data) ทำให้ ciphertext ของ "oauth-state" เอาไปใช้เป็น "link-intent" หรือ token ของแถวอื่นไม่ได้ แม้กุญแจเดียวกัน

⚠️ คุกกี้นี้ต้อง `SameSite=Lax` — callback คือการนำทางจาก accounts.google.com (cross-site) · `Strict` = คุกกี้ไม่ไป = state ไม่ตรงทุกครั้ง ·
refresh cookie ยังเป็น `Strict` (ตั้งตอนตอบ callback ซึ่งเป็นการตั้ง ไม่ใช่การส่ง)

**ผูกบัญชีด้วยอีเมล — ช่องยึดบัญชีคลาสสิก**

| ผู้ให้บริการยืนยันอีเมล | บัญชีเดิมยืนยันอีเมล | ผล                            |
| ----------------------- | -------------------- | ----------------------------- |
| ✅                      | ✅                   | ผูกอัตโนมัติ                  |
| ✅                      | ❌                   | **ปฏิเสธ** (`email_conflict`) |
| ❌                      | —                    | ไม่ใช้อีเมลนี้จับคู่          |

แถวที่สองคือการโจมตี: ผู้ร้ายสมัครด้วยรหัสผ่านโดยใช้อีเมลของเหยื่อ (ยืนยันไม่ได้ แต่บัญชีมีอยู่) → รอเหยื่อมาล็อกอินด้วย Google →
ถ้าผูกอัตโนมัติ ผู้ร้ายใช้รหัสผ่านของตัวเองเข้าบัญชีที่ตอนนี้มีข้อมูลของเหยื่อ

**ผูกจากหน้าตั้งค่า** — การเปิด `/start` เป็นการนำทางของเบราว์เซอร์ (ไม่มี `Authorization` header) · จึงขอ link intent ก่อนด้วย `POST …/link`
(มี access token) ได้สตริงเข้ารหัสอายุ 2 นาทีไปแปะใน URL · ไม่มีทางส่ง access token ทาง URL

📁 `apps/api/test/oauth.int-spec.ts` — ปลอมที่ `fetch` ชั้นนอกสุดเท่านั้น (token endpoint · userinfo) ทุกอย่างข้างในวิ่งจริง: คุกกี้ · state ผิด · PKCE · ผูก/ปฏิเสธ

🎤 _"ทำไมไม่ใช้ NextAuth"_ — auth อยู่ที่ NestJS ไม่ใช่ Next.js (ADR-001) และมี session ของตัวเองแล้ว (rotation + reuse detection) ·
OAuth ทำแค่ "ยืนยันว่าเป็นใคร" แล้วส่งต่อให้ `startSession` ตัวเดิม — 300 บรรทัดที่อ่านเข้าใจทุกบรรทัด ดีกว่า session ระบบที่สองที่ต้องเชื่อมกัน

---

## 3. GitHub → งาน: ใครเป็นเจ้าของข้อมูล

ปัญหาแรก: **issue ไม่มี due date** · ทางเลือกคือเดาวัน (วันที่สร้าง? วันนี้?) หรือใช้สิ่งที่ GitHub มีจริง → `milestone.due_on` · ไม่มี milestone = งานไม่มีกำหนด
ปฏิทินที่เต็มไปด้วยวันปลอมแย่กว่าปฏิทินที่ว่าง

ปัญหาที่สองยากกว่า: ผู้ใช้แก้งานใน NOSION ได้ แล้ว cron ดึงทุกชั่วโมง — **ใครชนะ**

| นโยบาย                        | ผู้ใช้ติ๊กเสร็จใน NOSION (issue ยังเปิด) | issue ถูกปิดบน GitHub    |
| ----------------------------- | ---------------------------------------- | ------------------------ |
| GitHub ทับทุกครั้ง            | ❌ กลับเป็นยังไม่เสร็จทุกชั่วโมง         | ✅ ปิด                   |
| NOSION ชนะเสมอ                | ✅                                       | ❌ ไม่รู้เรื่อง          |
| **GitHub ชนะเมื่อ "เปลี่ยน"** | ✅ (state บน GitHub ไม่เปลี่ยน = ไม่แตะ) | ✅ (open → closed = ปิด) |

จำค่าที่ซิงก์ครั้งก่อนไว้ใน payload (`github.state`, `github.milestoneDueOn`) แล้วตัดสินจาก**การเปลี่ยน** — แนวคิดเดียวกับ three-way merge ในบท 20 (base = ค่าที่ซิงก์ครั้งก่อน)

📁 `apps/api/src/integrations/github/issue-plan.ts` — pure function ตัดสินทุกกรณี:

```ts
const stateChanged = (before?.state ?? 'open') !== issue.state;
if (stateChanged && issue.state === 'closed' && existing.status !== 'done') completes = true;
else if (stateChanged && issue.state === 'open' && existing.status === 'done')
  patch.status = 'pending';
```

กรณีที่ต้องตั้งใจ: ผู้ใช้ลบงาน → `skip: deleted-by-user` (ไม่สร้างใหม่ทุกชั่วโมง) · issue ที่ปิดก่อนเคยดึง → ไม่สร้าง (ไม่เอางานเก่าสิบปีมาท่วม)

**ดึงกับ webhook มาพร้อมกัน** — `clientId = gh:<node_id>` + unique index เดิมของ Phase 7 → ฝั่งที่สองชนแล้วอัปเดตแทน ·
สร้างผ่าน `EntriesService` ตัวเดียวกับแอป → การเตือน · event · ปฏิทิน · ⌘K ได้ฟรี (core ไม่รู้จัก GitHub)

**ดึงรอบแรกหลังเชื่อม** — โมดูล auth ไม่ import โมดูล integrations (lint กฎขอบเขต · ADR-006) → ส่ง event `oauth.github.connected` · ฝั่ง GitHub รอไม่เกิน 3 วิ
(Vercel Function มี 10 วิ — ที่เหลือให้ cron/ปุ่ม "ดึงตอนนี้")

---

## 4. Webhook: ลายเซ็นต้องคิดจากไบต์ที่ได้รับ

📁 `apps/api/src/integrations/github/signature.ts`:

```ts
const expected = Buffer.from(
  `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`,
);
return received.length === expected.length && timingSafeEqual(received, expected);
```

⚠️ **body ดิบ ไม่ใช่ `JSON.stringify(req.body)`** — parse แล้ว stringify ใหม่ อาจเรียงช่อง/เว้นวรรค/escape ยูนิโค้ดต่างจากเดิม → ลายเซ็นไม่ตรงทั้งที่ถูก ·
ต้องเปิด `rawBody: true` ตอนสร้างแอป (ทั้ง `main.ts` และ `serverless.ts` — ลืมตัวหลัง = ผ่านในเครื่อง พังบน Vercel)

⚠️ **`timingSafeEqual`** — `===` หยุดที่ไบต์แรกที่ต่าง เวลาตอบกลับบอกได้ว่าเดาถูกกี่ไบต์ · และต้องเทียบความยาวก่อน (ยาวไม่เท่า = throw)

**ทำไม 404 ทุกกรณี** — id มั่ว · ลายเซ็นผิด · ปิดใช้แล้ว ตอบเหมือนกันหมด · ไม่บอกผู้สแกนว่า id ไหนมีจริง

**ทำไมไม่เก็บ `X-GitHub-Delivery`** — GitHub ส่งซ้ำได้ (redeliver · timeout) แต่ทุกการกระทำ idempotent อยู่แล้ว: upsert ด้วย clientId · ปิดงานที่ปิดแล้ว = ข้าม ·
ถ้าการกระทำไม่ idempotent (เช่น "+1") ถึงต้องมีตาราง delivery

PR merged ปิดงานสองแบบ: ข้อความ PR อ้าง `nosion:<id>` (เมนู "คัดลอกรหัสอ้างอิง" บนการ์ดงาน) · หรือเป็นงานที่ดึงมาจาก PR นั้นเอง ·
"Closes #12" ไม่ต้อง parse — GitHub ปิด issue แล้วส่ง `issues.closed` ตามมาเอง

🎤 _"ออกแบบ webhook receiver ที่ปลอดภัย"_ — ลายเซ็นจากไบต์ดิบ · เทียบเวลาคงที่ · secret ต่อผู้ใช้ (เก็บเข้ารหัส · หลุดหนึ่งไม่กระทบคนอื่น) ·
ตอบเร็ว (ทำงานหนักทีหลัง) · idempotent หรือมี dedupe · ไม่บอกว่าอะไรผิด

---

## 5. i18n: แปลทั้งแอปโดยไม่เสีย static

ทุกหน้าของ NOSION เป็น static (● SSG) — Lighthouse 95+ ของขั้น 2 ขึ้นกับสิ่งนี้ · next-intl แบบตรงตำรามีสองทาง และทั้งสองมีราคา:

| ทาง                         | ราคา                                                           |
| --------------------------- | -------------------------------------------------------------- |
| prefix ใน URL (`/en/today`) | แก้ทุก Link/redirect/service worker · หน้าเดียวสอง URL         |
| อ่านคุกกี้ตอน render        | `cookies()` ทำให้ทุกหน้า dynamic → TTFB ของ serverless ทุกคำขอ |

ทางที่เลือก: **โครงแบบ prefix แต่ URL ไม่มี prefix** — 📁 `apps/web/src/middleware.ts`:

```ts
const locale = isLocale(cookie) ? cookie : DEFAULT_LOCALE;
url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
return NextResponse.rewrite(url); // ผู้ใช้เห็น /today · Next เสิร์ฟ /en/today ที่ build ไว้แล้ว
```

หน้าย้ายไป `app/[locale]/…` + `generateStaticParams` → build สร้างครบสองภาษา · ลิงก์, SW, bookmark ไม่ต้องรู้จักภาษาเลย

⚠️ **บั๊กที่ build จับไม่ได้** — server component ที่ลืม `setRequestLocale(locale)` ถูก render ด้วยภาษาค่าเริ่มต้น → **ไฟล์ `/en/login` เป็นภาษาไทย** ·
build ผ่าน · type ผ่าน · เจอเพราะ UI test ที่ตั้งคุกกี้ `en` แล้วหาข้อความอังกฤษ

**โค้ดที่ไม่ใช่ component** — ตัวจัดรูปแบบวันที่ · สรุปกฎการเกิดซ้ำ · โมเดล ⌘K · toast ใน sync engine ถูกเรียกจากหลายสิบที่ ·
ลาก `t` ผ่านทุกฟังก์ชัน = เปลี่ยน signature + เทสต์ทั้งหมด เพื่อค่าที่ทั้งหน้าใช้ค่าเดียว → 📁 `apps/web/src/i18n/current.ts` ตัวแปลระดับ module ที่ `<LocaleBridge>` ตั้งให้
(ยอมรับได้เพราะสลับภาษา = โหลดหน้าใหม่ ไม่มีช่วงที่สองภาษาอยู่พร้อมกัน) · ตารางชื่อ (หมวดรายจ่าย · มุมมองใน sidebar) ใช้ `get label()` — ประเมินตอนอ่าน ไม่ใช่ตอน import

**ข้อความฝั่งเซิร์ฟเวอร์** — การ์ด Today · สรุปสัปดาห์ · standup · push · อีเมล ประกอบที่ API · 📁 `packages/core/src/text.ts`:

```ts
const EN: Record<keyof typeof TH, string> = { … }; // ขาด key = คอมไพล์ไม่ผ่าน
```

ภาษาตาม `settings.locale` ของผู้รับ (ไม่ใช่ของคำขอ — cron ไม่มีคำขอ) · อีเมลมีชุดของตัวเองใน `@nosion/emails` ·
ป้ายในปฏิทินที่ API สร้างโดยไม่รู้ภาษา → ส่ง `meta.badgeKey` ให้เว็บแปล (ไม่มี key = ใช้ข้อความเดิม — เว็บใหม่กับ API เก่ายังทำงาน)

⚠️ **`Intl` ภาษาไทยไม่แน่นอน** — `th-TH` บาง runtime ใช้ปฏิทินพุทธ บางตัวเกรกอเรียน · ระบุเสมอ `th-TH-u-ca-buddhist` / `th-TH-u-ca-gregory` ·
เงิน `currencyDisplay: 'narrowSymbol'` — ไม่งั้นภาษาอังกฤษแสดง `THB 1,200` แทน `฿1,200`

⚠️ **ICU plural ภาษาไทย** — ไทยไม่มีรูปพหูพจน์ แต่ถ้าอังกฤษมี `{n, plural, …}` ไทยต้องมีตัวแปรเดียวกัน (`{n, plural, other {# รายการ}}`) ไม่งั้นตัวตรวจจับว่าตัวแปรไม่ตรง

📁 `apps/web/scripts/check-messages.mjs` (อยู่ใน `test:unit`): key ครบทั้งสองภาษา · ICU parse ได้ · ตัวแปรตรงกัน · **ทุก key ที่โค้ดเรียกมีจริง** ·
เจอจริง: key ชนกัน — `apiKeys.expiry` เป็นทั้งข้อความและกลุ่ม (`apiKeys.expiry.days`) → JSON ทับกันเงียบ ๆ

**ภาษาของบัญชี vs เครื่อง** — 📁 `use-locale-sync.ts`: เลือกบนเครื่องนี้ (มีคุกกี้) = บันทึกลงบัญชี · ไม่เคยเลือก = ใช้ของบัญชี ·
ไม่เดาจาก `Accept-Language` — ไทยเสมอจนกว่าจะเลือก (ผลแน่นอนสำหรับเทสต์ · Lighthouse · CDN cache)

🎤 _"i18n ทำให้ static page กลายเป็น dynamic ไหม"_ — ไม่จำเป็น: ภาษาเป็น path segment ภายในที่ build ไว้ครบ · middleware (edge) เลือก segment จากคุกกี้ ·
ต้นทุนคือ middleware รันทุกคำขอหน้า (ไม่กี่ ms) และไฟล์ HTML เพิ่มเท่าตัว

---

## 6. Production: deploy ที่ล้มแล้วกลับเองได้

📁 `.github/workflows/deploy-production.yml` — tag `v1.2.3` เท่านั้น:

```
check (ไม่ต้องอนุมัติ)          deploy (environment: production — อนุมัติครั้งเดียว)
 tag อยู่บน main?         ──►    จำ deployment ปัจจุบัน (api, web)
 CI ของ commit นี้เขียว?          pg_dump | age -r <public key>  → artifact 30 วัน
                                  prisma migrate deploy
                                  vercel deploy api → web → (fly worker)
                                  smoke ──── ผ่าน ──► release (notes อัตโนมัติ)
                                    └── ล้ม (if: failure()) ──► vercel rollback ตัวที่จำไว้ · เปิด issue
```

**ทำไม job เดียว** — GitHub ขออนุมัติทุก job ที่อ้าง environment ที่มี reviewer · แยก 5 job = กด 5 ครั้ง ·
และ step `if: failure()` ใน job เดียวกันเห็น outcome ของทุก step → ย้อนเฉพาะสิ่งที่ deploy ไปแล้วจริง (api ไปแล้ว web ยัง = ย้อนแค่ api)

**ทำไมไม่ย้อน migration** — rollback ย้อน**โค้ด**เท่านั้น · ใช้ได้เพราะ migration ต้อง additive (สเปก 13.4):

```
release N   : เพิ่มคอลัมน์ใหม่ (nullable/default) · โค้ดเขียนทั้งเก่าและใหม่     ← ย้อนไป N-1 ได้ คอลัมน์ใหม่แค่ไม่มีคนอ่าน
release N+1 : โค้ดอ่านจากใหม่อย่างเดียว
release N+2 : ลบคอลัมน์เก่า (contract)                                        ← ตอนนี้ไม่มีโค้ดรุ่นไหนที่ยังใช้แล้ว
```

down migration ที่ทำลายข้อมูลอันตรายกว่าปัญหาที่แก้ · ทุก migration ของ Phase 8 (`oauth_accounts`, `github_integrations`, `buddhistEra DEFAULT true`) เป็น additive

**backup ต้องเข้ารหัส** — artifact ของ run โหลดได้ทุกคนที่อ่าน repo ได้ · `age` เข้ารหัสด้วย public key ใน repo variable (ไม่ใช่ความลับ) ·
private key อยู่กับเจ้าของเท่านั้น · ไม่ตั้ง recipient = workflow หยุดก่อนแตะฐานข้อมูล

**api ก่อน web** — ช่วงระหว่างสอง deploy คือ api ใหม่ + web เก่า · api ต้องเข้ากันได้ย้อนหลัง (ช่องใหม่ optional) — ทิศกลับกัน web ใหม่จะเรียก endpoint ที่ยังไม่มี

📁 `scripts/smoke-production.sh` — ถามว่า "ผู้ใช้ใช้ได้ไหม" ไม่ใช่ "server ตอบไหม": หน้าแรก · หน้าภาษาอังกฤษ (พิสูจน์ middleware) ·
OpenAPI ผ่าน proxy · `/readyz` (DB + Redis) · demo login (200/403/429 = ระบบทำงาน) · refresh ไม่มีคุกกี้ = 401 (ไม่ใช่ 500)

⚠️ ยังไม่เคยรันจริง (ยังไม่มีโปรเจกต์ production) — actionlint ผ่าน · smoke รันกับเครื่อง dev ผ่าน · ที่เหลือเป็นสมมติฐานจนกว่าจะ tag ครั้งแรก

🎤 _"deploy แล้ว error rate พุ่ง ทำอะไรก่อน"_ — ย้อนโค้ด (วินาที) ก่อนหาสาเหตุ · ข้อมูลไม่ต้องย้อนเพราะ schema additive ·
ถ้าข้อมูลเสียจริง กู้ backup ลง**ฐานชั่วคราว**แล้วเลือกแถว — ไม่ restore ทับ production (เขียนทับข้อมูลที่ผู้ใช้สร้างหลัง backup)

---

## 7. "ใช้เองได้โดยไม่ต้องอธิบาย" วัดอย่างไร

DoD ของ phase วัดด้วยความรู้สึกไม่ได้ · แปลงเป็นสิ่งที่ตรวจได้:

- 📁 `GET /me/onboarding` → `{ task, expense, habit, push }` จาก**ฐานข้อมูลจริง** (มีรายการแล้วหรือยัง · มี push subscription ไหม) ·
  ไม่ใช่ checkbox ใน localStorage — ทำบนมือถือแล้ว desktop ก็ติ๊กด้วย · ลบงานหมดแล้วการ์ดกลับมาแนะนำ (ถูกกว่าจำว่า "เคยทำ") · `findFirst` หยุดที่แถวแรก ไม่นับทั้งตาราง
- 📁 `features/today/onboarding-card.tsx` — การ์ดสี่ข้อบนหน้า Today · แต่ละข้อพาไปหน้านั้นพร้อม `?new=1` (โฟกัสช่องพิมพ์ทันที) · ครบแล้วหายเอง · ซ่อนได้
- หน้าแรก: ภาษาคนทั่วไป ("พิมพ์ว่า กาแฟ 65 แล้วมันรู้ว่าเป็นรายจ่าย") ไม่ใช่ "NL parser + plugin architecture" · แถบบัญชีทดลองบอกว่าข้อมูลจะหาย
- 📁 `apps/web/e2e/smoke.spec.ts` — ผู้ใช้ใหม่ (API จริง) สมัคร → เห็นการ์ด → ทำครบทีละข้อ → การ์ดหายไป · เทสต์คือคำนิยามของ "ใช้เองได้"

ตัวที่วัดไม่ได้ด้วยโค้ดยังเหลือ: ส่งลิงก์ให้คนที่ไม่ใช่ dev จริง ๆ แล้วนั่งดูเงียบ ๆ (เจ้าของทำ)

---

## ข้อเสียที่ยอมรับ

- Swagger ไม่มี schema ของ body · rate limit ของ key fail-open เมื่อ Redis ล่ม
- GitHub OAuth App ไม่มี scope อ่านอย่างเดียวของ repo ส่วนตัว (`repo` เขียนได้ด้วย) · webhook ต้องเปิดทีละ repo · issue ที่ไม่มี milestone ไม่ขึ้นปฏิทิน
- เปลี่ยน `ENCRYPTION_KEY` = token GitHub ที่เก็บไว้ถอดไม่ได้ (ต้องเชื่อมใหม่) · OAuth/Google/GitHub ยังไม่ได้ลองกับของจริง
- ข้อความ error ของ API ยังเป็นไทย (เว็บอังกฤษแสดงข้อความกลางตามชนิดปัญหา) · ข้อมูลบัญชีทดลองเป็นไทย · ตัวแปลกลางเป็น state ระดับ module
- workflow production ยังไม่เคยรัน · Vercel Hobby ย้อนได้แค่ตัวก่อนหน้า · ข้าม Import CSV/Todoist ตามที่เจ้าของสั่ง

---

## แบบฝึกหัดท้ายบท

1. เอา `@PublicApi()` ออกจาก `TasksController` แล้วรัน `api-keys.int-spec.ts` — เทสต์ไหนล้ม ข้อความ error ว่าอะไร · แล้วลองติดที่ `UsersController` ดูว่าเทสต์ไหนควรจับได้
2. เปลี่ยนคุกกี้ `nosion_oauth` เป็น `SameSite=Strict` แล้วลองล็อกอินด้วย Google บน staging — พังที่บรรทัดไหน และทำไมใน integration test ไม่พัง
3. เขียน test case ใน `issue-plan.spec.ts`: ผู้ใช้เลื่อนวันงานเอง แล้ว milestone บน GitHub ถูกเลื่อนด้วย — ผลควรเป็นอะไร และโค้ดตอนนี้ให้ผลนั้นไหม
4. ใน `signature.ts` เปลี่ยน `rawBody` เป็น `Buffer.from(JSON.stringify(req.body))` แล้วส่ง payload ที่มีภาษาไทยจาก GitHub — ลายเซ็นตรงไหม ทำไม
5. ลบ `setRequestLocale` ออกจาก `app/[locale]/(auth)/login/page.tsx` แล้ว build — เปิดไฟล์ HTML ของ `/en/login` ใน `.next/server/app` ดูว่าเป็นภาษาอะไร
6. เพิ่ม key ใหม่ใน `en.json` อย่างเดียวแล้วรัน `pnpm --filter @nosion/web test:i18n` · แล้วลองเพิ่ม key ใน `TH` ของ `text.ts` อย่างเดียว — อะไรจับได้ก่อน
7. ออกแบบ migration เปลี่ยนชื่อคอลัมน์ `title` → `name` แบบ expand/contract: กี่ release · แต่ละ release โค้ดอ่าน/เขียนอะไร · ย้อนจากแต่ละ release ได้ไหม
8. ถ้าต้องรองรับ GitHub App แทน OAuth App: อะไรใน `github.service.ts` เปลี่ยน (token ต่อ installation · webhook ระดับ app) และอะไรไม่ต้องเปลี่ยนเลย (ใบ้: `planIssue`)
