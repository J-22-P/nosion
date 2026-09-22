# 04 · Phase 1 — Authentication เชิงลึก (ตั้งแต่ศูนย์)

> **Phase 1 คืออะไร:** ทำให้ระบบมีผู้ใช้จริง ล็อกอินได้ และข้อมูลของแต่ละคนแยกจากกันจริง
> นี่คือส่วนที่ "ทำให้ทำงานได้" ใช้เวลา 1 วัน แต่ "ทำให้ถูกต้อง" ใช้เวลาอีกหลายวัน
> และเป็นส่วนที่คนสัมภาษณ์ชอบถามที่สุด

---

## 1. สองคำที่ต้องแยกให้ออก

- **Authentication (authn)** — "คุณคือใคร" · ตรวจตัวตน
- **Authorization (authz)** — "คุณทำสิ่งนี้ได้ไหม" · ตรวจสิทธิ์

ในโค้ดเรา:

- authn อยู่ที่ 📁 `apps/api/src/auth/guards/jwt-auth.guard.ts` (ถอด token → รู้ว่าเป็นใคร)
- authz อยู่ทุกที่ที่มี `where: { userId }` (ตรวจว่าของชิ้นนี้เป็นของคนนี้จริง)

⚠️ ระบบจำนวนมากทำ authn ถูกแต่ authz พลาด → กลายเป็นช่องโหว่ **IDOR** (หัวข้อ 9)

---

## 2. รหัสผ่าน: ทำไมห้ามเก็บของจริง

ถ้าฐานข้อมูลรั่ว (ซึ่งเกิดขึ้นเสมอกับใครสักคน) และเก็บรหัสผ่านตรง ๆ
ผู้โจมตีจะได้ทั้งบัญชีของเราและบัญชีอื่นของผู้ใช้ เพราะคนส่วนใหญ่ใช้รหัสผ่านซ้ำ

### Hash ≠ Encrypt

|                | Encryption                             | Hashing                 |
| -------------- | -------------------------------------- | ----------------------- |
| ย้อนกลับได้ไหม | ได้ (มีกุญแจ)                          | **ไม่ได้** ตามการออกแบบ |
| ใช้กับ         | ข้อมูลที่ต้องอ่านกลับ เช่น TOTP secret | รหัสผ่าน                |

เราเก็บ **hash** ของรหัสผ่าน เวลาล็อกอินก็เอาที่ผู้ใช้พิมพ์มา hash ใหม่แล้วเทียบกัน
ไม่มีใครอ่านรหัสผ่านจริงได้ แม้แต่เราเอง

### ทำไม SHA-256 ไม่พอ

SHA-256 ออกแบบมาให้ **เร็ว** ซึ่งเป็นคุณสมบัติที่แย่มากสำหรับรหัสผ่าน
GPU สมัยใหม่คำนวณ SHA-256 ได้หลายพันล้านครั้งต่อวินาที → เดารหัสผ่าน 8 ตัวจบในไม่กี่ชั่วโมง

### Salt — กัน rainbow table

**Rainbow table** คือตารางที่คำนวณ hash ของรหัสผ่านยอดนิยมไว้ล่วงหน้า
ถ้าทุกคนที่ใช้ `password123` ได้ hash เดียวกัน เปิดตารางเทียบครั้งเดียวได้ทั้งฐานข้อมูล

**Salt** คือค่าสุ่มที่ต่างกันทุกผู้ใช้ เอาไปผสมก่อน hash
→ คนสองคนใช้รหัสเดียวกันก็ได้ hash คนละค่า และ rainbow table ใช้ไม่ได้อีกต่อไป
(Argon2 สร้างและฝัง salt ไว้ในสตริงผลลัพธ์ให้อัตโนมัติ เราไม่ต้องจัดการเอง)

### Argon2id และพารามิเตอร์ที่เลือก

📁 `apps/api/src/auth/password.service.ts`

```ts
{ algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 }
```

- `memoryCost: 19456` KiB ≈ 19 MB — การ hash หนึ่งครั้งต้องใช้ RAM เท่านี้
  **นี่คือหัวใจ**: GPU มีคอร์เยอะก็จริง แต่ RAM ต่อคอร์น้อย การบังคับใช้ memory
  ทำให้เดาแบบขนานมหาศาลไม่คุ้ม (เรียกว่า memory-hard)
- `timeCost: 2` — จำนวนรอบการวน
- `parallelism: 1` — จำนวน thread

ตัวเลขนี้มาจากคำแนะนำของ OWASP ไม่ใช่สุ่มเลือก

**ทำไมไม่ใช้ bcrypt:** bcrypt ตัด input ที่ 72 bytes **เงียบ ๆ**
รหัสผ่านภาษาไทยชนเพดานนี้ง่ายเพราะ UTF-8 ใช้ 3 bytes ต่ออักขระ (24 ตัวอักษรก็ชนแล้ว)
และ bcrypt ใช้ memory คงที่ต่ำ จึงต้าน GPU ได้แย่กว่า

⚠️ ราคาที่จ่าย: 19 MB × คำขอล็อกอินพร้อมกัน 100 คำขอ = 1.9 GB
→ นี่คือเหตุผลหนึ่งที่ **ต้องมี rate limit ที่ endpoint ล็อกอิน**

### Timing attack และ user enumeration

ถ้าโค้ดเขียนแบบตรงไปตรงมา:

```ts
const user = await findUser(email);
if (!user) return 401; // ตอบกลับใน 5ms
const ok = await verify(user.hash); // ใช้เวลา ~50ms
```

ผู้โจมตีวัดเวลาตอบกลับก็รู้ทันทีว่าอีเมลไหน **มีอยู่ในระบบ** = ได้รายชื่อสมาชิกไปฟรี ๆ
ซึ่งมีค่ามากสำหรับ phishing

วิธีแก้ของเรา 📁 `auth.service.ts` → `login()`:

```ts
const ok = user
  ? await this.passwords.verify(user.passwordHash, input.password)
  : await this.passwords.burnTime(input.password).then(() => false);
```

ไม่พบผู้ใช้ก็ยัง verify กับ hash สมมติ เพื่อให้ใช้เวลาเท่ากัน
และข้อความ error ต้องเหมือนกันเป๊ะ ("อีเมลหรือรหัสผ่านไม่ถูกต้อง")

เราทดสอบข้อนี้จริงใน 📁 `apps/api/test/auth.int-spec.ts`

### HIBP k-anonymity — เช็ครหัสผ่านที่เคยรั่ว

ถ้าผู้ใช้ตั้งรหัสผ่านที่เคยหลุดมาแล้ว ความยาวไม่ช่วยอะไร

Have I Been Pwned มี API ที่ฉลาดมาก: เราส่งไปแค่ **5 ตัวแรกของ SHA-1** ของรหัสผ่าน
เขาส่งกลับ hash ทั้งหมดที่ขึ้นต้นแบบนั้น (หลักร้อยรายการ) แล้วเราเทียบเองในเครื่อง

```ts
const sha1 = createHash('sha1').update(plain).digest('hex').toUpperCase();
await fetch(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`);
```

→ **รหัสผ่านจริงไม่เคยออกจากเซิร์ฟเวอร์เรา** นี่คือเทคนิค k-anonymity
📁 `password.service.ts` → `isPwned()` (ถ้าเรียก API ไม่สำเร็จเราเลือก fail-open
เพราะบริการภายนอกล่มไม่ควรทำให้สมัครสมาชิกไม่ได้)

---

## 3. Session vs Token — สองวิธีจำว่า "ล็อกอินแล้ว"

HTTP ไม่จำอะไร ([ไฟล์ 01](./01-foundations-web-architecture.md)) จึงต้องมีกลไกพกหลักฐาน

### แบบ A: Session ฝั่งเซิร์ฟเวอร์ (แบบดั้งเดิม)

เซิร์ฟเวอร์เก็บข้อมูล session ไว้เอง แล้วส่ง `sessionId` ให้ client

- ✅ เพิกถอนได้ทันที (ลบแถวทิ้ง)
- ❌ ทุกคำขอต้องอ่านฐานข้อมูล/Redis

### แบบ B: JWT (token ที่พกข้อมูลมาเอง)

เซิร์ฟเวอร์เซ็นข้อมูลแล้วส่งให้ client เก็บไว้ ตรวจได้โดยไม่ต้องดูฐานข้อมูล

- ✅ ตรวจเร็วมาก scale ง่าย
- ❌ **เพิกถอนกลางคันไม่ได้** เพราะเซิร์ฟเวอร์ไม่ได้จำอะไร

### NOSION ใช้ทั้งคู่ (hybrid)

```
access token  = JWT อายุ 15 นาที  → ตรวจเร็ว ไม่แตะ DB
refresh token = opaque อายุ 30 วัน → เก็บในตาราง sessions เพิกถอนได้จริง
```

นี่คือรูปแบบที่ระบบ production ส่วนใหญ่ใช้ เพราะได้ข้อดีทั้งสองฝั่ง
และ "หน้าต่างความเสี่ยง" จำกัดที่ 15 นาที

---

## 4. JWT ภายในเป็นอย่างไร

JWT คือข้อความ 3 ส่วนคั่นด้วยจุด:

```
eyJhbGciOiJIUzI1NiJ9 . eyJzdWIiOiJjbHgxMjMiLCJleHAiOjE3...} . 4fT8s_Qw...
   header (base64url)        payload (base64url)              signature
```

- **header** — บอกว่าใช้อัลกอริทึมอะไร เช่น `HS256`
- **payload** — ข้อมูล (claims) เช่น `sub` (subject = ใคร), `exp` (หมดอายุเมื่อไร)
- **signature** — `HMAC-SHA256(header + "." + payload, JWT_SECRET)`

⚠️ **ข้อเข้าใจผิดที่พบบ่อยที่สุด: JWT ไม่ได้เข้ารหัส**
base64 ไม่ใช่การเข้ารหัส ใครก็ตามที่ถือ token เอาไปวางที่ jwt.io อ่าน payload ได้หมด
→ **ห้ามใส่ความลับใด ๆ ลง payload** (รหัสผ่าน, เลขบัตร, ข้อมูลส่วนตัว)

สิ่งที่ signature รับประกันคือ **ความถูกต้อง (integrity)** ไม่ใช่ความลับ:
ถ้าแก้ payload สักตัวอักษร signature จะไม่ตรง และเราจะปฏิเสธ token นั้น
เพราะผู้โจมตีไม่มี `JWT_SECRET` จึงเซ็นใหม่ไม่ได้

claims ที่เราใส่ 📁 `apps/api/src/auth/token.service.ts`:

```ts
{ sub: user.id, email, sid: session.id, demo: user.isDemo }
```

`sid` สำคัญ: ทำให้เรารู้ว่า access token ใบนี้ผูกกับ session ไหน → ใช้เพิกถอนได้ (หัวข้อ 7)

เราตั้ง `issuer` และ `audience` ด้วย เพื่อกันการเอา token จากระบบอื่นมาใช้ข้ามกัน

---

## 5. เก็บ token ไว้ที่ไหน — และภัย 2 ชนิด

### XSS (Cross-Site Scripting)

ผู้โจมตีทำให้ JavaScript ของเขารันในหน้าเว็บของเรา (เช่นผ่านข้อความที่เราเผลอ render เป็น HTML)
→ อ่านอะไรก็ได้ที่ JavaScript อ่านได้

### CSRF (Cross-Site Request Forgery)

ผู้ใช้ที่ล็อกอินอยู่ไปเปิดเว็บร้าย ๆ เว็บนั้นสั่งเบราว์เซอร์ยิงคำขอมาที่เว็บเรา
**เบราว์เซอร์แนบ cookie ให้อัตโนมัติ** → คำขอนั้นดูเหมือนผู้ใช้ตัวจริงทำเอง

### เปรียบเทียบที่เก็บ

| ที่เก็บ             | ปลอดภัยจาก XSS    | ปลอดภัยจาก CSRF          | อยู่รอดหลังรีเฟรช |
| ------------------- | ----------------- | ------------------------ | ----------------- |
| `localStorage`      | ❌ JS อ่านได้     | ✅ ไม่ถูกแนบอัตโนมัติ    | ✅                |
| ตัวแปรใน memory     | ✅ หายไปพร้อมหน้า | ✅                       | ❌                |
| cookie ธรรมดา       | ❌                | ❌                       | ✅                |
| **httpOnly cookie** | ✅ JS อ่านไม่ได้  | ⚠️ ต้องใช้ SameSite ช่วย | ✅                |

### ทางเลือกของ NOSION

- **access token → เก็บในตัวแปร memory เท่านั้น** 📁 `apps/web/src/features/auth/auth-store.ts`
  รีเฟรชหน้าแล้วหาย แต่ขอใหม่จาก refresh cookie ได้ทันที = แลกความสะดวกเล็กน้อยกับความปลอดภัย
- **refresh token → httpOnly cookie** JavaScript แตะไม่ได้เลย

### Cookie flags ที่เราตั้ง

📁 `apps/api/src/auth/auth.controller.ts` → `cookieOptions()`

```ts
{ httpOnly: true, secure: NODE_ENV === 'production', sameSite: 'strict', path: '/api/v1/auth' }
```

- `httpOnly` — JS อ่านไม่ได้ (กัน XSS ขโมย)
- `secure` — ส่งเฉพาะบน HTTPS (กันดักฟังบน WiFi สาธารณะ) ปิดใน dev เพราะ localhost เป็น http
- `sameSite: 'strict'` — เบราว์เซอร์จะไม่แนบ cookie นี้เมื่อคำขอมาจากเว็บอื่น = **กัน CSRF**
- `path` แคบ — cookie นี้ถูกส่งเฉพาะตอนเรียก endpoint auth ไม่ใช่ทุกคำขอ
  (ยิ่งส่งบ่อย ยิ่งมีโอกาสหลุดผ่าน log หรือ proxy)

> **เกร็ด:** `localhost:3000` กับ `localhost:3001` ถือเป็น "same site" (พอร์ตไม่นับ)
> `SameSite=Strict` จึงใช้งานได้ทั้งใน dev และบน production ที่เป็น `nosion.dev` กับ `api.nosion.dev`

### CORS — คนละเรื่องกับ authentication

เบราว์เซอร์ห้ามหน้าเว็บจาก origin หนึ่งอ่านคำตอบจากอีก origin หนึ่ง (Same-Origin Policy)
เซิร์ฟเวอร์ต้องอนุญาตด้วย header `Access-Control-Allow-Origin`

📁 `apps/api/src/main.ts`

```ts
app.enableCors({ origin: config.CORS_ORIGINS, credentials: true });
```

⚠️ `credentials: true` (ส่ง cookie ข้าม origin ได้) **ใช้คู่กับ `origin: '*'` ไม่ได้**
เบราว์เซอร์จะปฏิเสธ — จึงต้องระบุ origin ที่อนุญาตเป็นรายชื่อเสมอ

สำหรับคำขอที่ "ไม่ธรรมดา" (มี header แปลก, เป็น PATCH/DELETE) เบราว์เซอร์จะยิง
**preflight** `OPTIONS` ไปถามก่อนว่าอนุญาตไหม — นี่คือเหตุผลที่บางที
คุณเห็นคำขอเพิ่มมาอีกหนึ่งใน Network tab

---

## 6. Refresh rotation + reuse detection (หัวใจของไฟล์นี้)

### ปัญหา

refresh token อายุ 30 วัน ถ้าถูกขโมยไป ผู้โจมตีใช้ได้ 30 วันโดยเราไม่มีทางรู้

### วิธีแก้: หมุนทุกครั้ง + จำของเก่าไว้

```
login    → ออก RT#1 (familyId = F1)
refresh  → เพิกถอน RT#1, ออก RT#2 (familyId = F1 เหมือนเดิม)
refresh  → เพิกถอน RT#2, ออก RT#3
```

**ประเด็นสำคัญ:** เราไม่ลบแถวของ RT#1 ทิ้ง แต่ mark ว่า revoked
เพราะถ้าลบทิ้ง การใช้ RT#1 ซ้ำจะดูเหมือน "token มั่ว" ธรรมดา แยกไม่ออกจากการถูกขโมย

```
ถ้ามีคนใช้ RT#1 อีกครั้ง → แปลว่ามีสำเนาอยู่ในมือคนอื่น
   → เพิกถอนทุก token ใน family F1 ทันที (รวม RT#3 ที่ใช้อยู่)
   → บังคับ login ใหม่ + ส่งอีเมลแจ้งผู้ใช้
```

📁 `apps/api/src/auth/auth.service.ts` → `refresh()`

```ts
if (session.revokedAt) {
  await this.revokeFamily(session.familyId, 'token_reuse_detected');
  void this.mail.sendSuspiciousActivity(session.user.email);
  throw new UnauthorizedException({ type: ProblemType.tokenReuse, ... });
}
```

**ผลลัพธ์:** token ที่ถูกขโมยใช้ได้อย่างมาก 1 ครั้ง และการใช้ครั้งนั้นเองคือสัญญาณเตือน
ไม่ว่าคนร้ายจะใช้ก่อนหรือหลังเจ้าของ ระบบก็จับได้ทั้งคู่

### เก็บเฉพาะ hash ของ refresh token

```ts
createRefreshToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };   // เก็บแต่ hash ลง DB
}
```

ถ้าฐานข้อมูลรั่ว ผู้โจมตีได้แต่ hash ซึ่งใช้ล็อกอินไม่ได้
(ที่นี่ใช้ SHA-256 ธรรมดาได้ เพราะ token เป็นค่าสุ่ม 256 บิต ไม่ใช่รหัสผ่านที่คนคิดเอง
จึง brute force ไม่ไหวอยู่แล้ว — ต่างจากกรณีรหัสผ่านที่ต้องใช้ Argon2)

### ⚠️ กับดักฝั่ง frontend: หลายแท็บยิง refresh พร้อมกัน

ถ้าผู้ใช้เปิด 3 แท็บแล้วทั้งสามยิง refresh พร้อมกันด้วย token เดียวกัน
ตัวที่สองและสามจะถูกตีความว่าเป็น **reuse** → ผู้ใช้โดนเตะออกทั้งที่ไม่มีใครขโมยอะไร

แก้ด้วย **single-flight**: ให้มีคำขอ refresh จริงแค่ครั้งเดียว ที่เหลือรอผลเดียวกัน
📁 `apps/web/src/lib/api-client.ts`

```ts
refreshInFlight ??= (async () => { ... })();   // ใครมาทีหลังได้ promise เดิม
return refreshInFlight;
```

🎤 นี่คือรายละเอียดที่แยกโปรเจกต์ที่ "ทำตามบทความ" ออกจากโปรเจกต์ที่ "เคยเจอปัญหาจริง"

---

## 7. การเพิกถอน session ด้วย Redis

ปัญหาที่เหลืออยู่: ผู้ใช้กด "ออกจากระบบ" แต่ access token ใบปัจจุบันยังไม่หมดอายุอีก 14 นาที
และ JWT ตรวจได้โดยไม่ดูฐานข้อมูล → ยังใช้ได้อยู่

วิธีแก้: เก็บ `sid` ที่ถูกเพิกถอนไว้ใน Redis เป็นเวลาเท่ากับอายุที่เหลือของ token
📁 `apps/api/src/auth/session-revocation.service.ts`

```ts
await this.redis.client.set(`revoked:session:${sessionId}`, '1', 'EX', ttlSeconds);
```

guard ตรวจ Redis ทุกคำขอ (เร็วระดับไมโครวินาที ยอมรับได้)
ถ้า Redis ล่มเราเลือก **fail-open** — ยอมให้ token ที่เพิ่งถูก logout ใช้ได้อีกไม่เกิน 15 นาที
ดีกว่าทั้งระบบใช้งานไม่ได้ และฐานข้อมูลยังเป็นแหล่งความจริงสุดท้ายตอน refresh

---

## 8. Rate limiting

ทำไมต้องมี: กัน brute force รหัสผ่าน, กันสมัครบัญชีอัตโนมัติ, กันสแปมอีเมลรีเซ็ตรหัสผ่าน

### อัลกอริทึมที่พบบ่อย

- **Fixed window** — นับต่อช่วงเวลาตายตัว เช่น 10 ครั้ง/15 นาที (เราใช้ตัวนี้)
  ข้อเสีย: ยิง 10 ครั้งท้ายหน้าต่างแรก + 10 ครั้งต้นหน้าต่างถัดไป = 20 ครั้งติดกัน
- **Sliding window** — แม่นกว่า แต่เปลืองหน่วยความจำกว่า
- **Token bucket** — ให้ยิงเป็นชุดได้ แล้วเติมโควตาคืนตามเวลา

📁 `apps/api/src/auth/guards/rate-limit.guard.ts` + decorator ที่อ่านง่าย:

```ts
@RateLimit({ limit: 10, windowSeconds: 900, by: 'ip+body.email' })
```

`by: 'ip+body.email'` สำคัญ: ถ้านับแค่ IP ผู้โจมตีที่มี IP หลายตัวก็เจาะบัญชีเดียวได้
ถ้านับแค่อีเมล ผู้โจมตีจะล็อกบัญชีคนอื่นเล่นได้ (denial of service) — จึงนับคู่กัน
และเรา hash อีเมลก่อนทำ key เพื่อไม่ให้อีเมลจริงไปโผล่ใน Redis

การใช้ Redis ทำให้การนับถูกต้องแม้ API จะรันหลาย instance
(กลับไปอ่านหลักการ "process ไม่แชร์ memory" ใน [ไฟล์ 01](./01-foundations-web-architecture.md))

---

## 9. IDOR และ defense in depth

**IDOR (Insecure Direct Object Reference)** = ผู้ใช้เปลี่ยน id ใน URL แล้วเข้าถึงของคนอื่นได้
เป็นช่องโหว่ที่พบบ่อยที่สุดอันดับต้น ๆ ใน OWASP และเกิดจากการลืมเช็คแค่บรรทัดเดียว

```ts
// ผิด — รู้ id ก็อ่านได้เลย
prisma.entry.findUnique({ where: { id } });

// ถูก — ต้องเป็นของผู้ใช้คนนี้ด้วย
prisma.entry.findFirst({ where: { id, userId } });
```

เราป้องกัน 3 ชั้น:

1. **Guard** ตรวจ token ทุก endpoint (global guard — ปลอดภัยโดยค่าเริ่มต้น
   endpoint ที่เปิดสาธารณะต้องติด `@Public()` อย่างชัดเจน)
2. **Service** ใส่ `userId` ใน `where` ทุก query
3. **Prisma extension** เติม `userId` ให้อัตโนมัติ 📁 `prisma.service.ts` → `forUser()`

ต้องพลาดพร้อมกันทั้งสามชั้นถึงจะรั่ว — หลักการนี้เรียกว่า **defense in depth**

และเราพิสูจน์ด้วยเทสต์จริง 📁 `apps/api/test/entries.int-spec.ts`:
"bob เข้าถึงรายการของ alice ไม่ได้เลยไม่ว่าจะอ่าน แก้ หรือลบ"

> **เกร็ดเรื่อง status code:** เราตอบ **404** ไม่ใช่ 403 เมื่อ bob พยายามแตะของ alice
> เพราะ 403 เท่ากับยืนยันว่า "ของชิ้นนี้มีอยู่จริงแต่ไม่ใช่ของคุณ" ซึ่งเป็นการรั่วข้อมูลอย่างหนึ่ง

---

## 10. รายละเอียดเล็ก ๆ ที่เหลือแต่สำคัญ

### บัญชีทดลอง (demo account)

📁 `auth.service.ts` → `loginAsDemo()`
สร้าง **ผู้ใช้ใหม่ต่อผู้เข้าชมหนึ่งคน** ไม่ใช่บัญชีกลางที่แชร์กัน
เพราะบัญชีกลางจะถูกคนอื่นลบข้อมูลทิ้งภายในวันเดียว
มี `expiresAt` 24 ชั่วโมง แล้ว worker ลบให้ และติด `@DemoForbidden()` กับ endpoint
ที่บัญชีทดลองไม่ควรทำได้

### Token ใช้ครั้งเดียวสำหรับยืนยันอีเมล/รีเซ็ตรหัสผ่าน

- เก็บเฉพาะ hash
- อายุ 15 นาทีสำหรับรีเซ็ตรหัสผ่าน
- `updateMany({ where: { id, usedAt: null } })` แล้วเช็คว่าอัปเดตได้กี่แถว
  → ถ้าได้ 0 แปลว่ามีคนใช้ตัดหน้าไปแล้ว **นี่คือวิธีกัน race condition โดยให้ฐานข้อมูลตัดสิน**
- เปลี่ยนรหัสผ่านสำเร็จ → เพิกถอนทุก session ใน transaction เดียวกัน

### ตอบเหมือนกันเสมอที่ `/auth/forgot-password`

ไม่ว่าอีเมลจะมีอยู่จริงหรือไม่ ตอบ 202 พร้อมข้อความเดียวกัน
(ด้วยเหตุผลเดียวกับ user enumeration)

---

## แบบฝึกหัดท้ายบท

1. ล็อกอินในเบราว์เซอร์ แล้วเปิด DevTools → Application → Cookies
   หา `nosion_rt` สังเกต flag HttpOnly แล้วลองพิมพ์ `document.cookie` ใน console — จะไม่เห็นมัน
2. ก๊อป access token ไปวางที่ jwt.io แล้วอ่าน payload — ยืนยันกับตัวเองว่า JWT ไม่ได้เข้ารหัส
3. อ่าน 📁 `apps/api/test/auth.int-spec.ts` เคส reuse detection แล้วอธิบายให้ได้ว่า
   ทำไมหลังจากตรวจพบ ระบบถึงต้องเพิกถอน **ทุก** session ใน family ไม่ใช่แค่ใบที่ถูกใช้ซ้ำ
4. ลองแก้ `sameSite` เป็น `'none'` แล้วคิดว่าเปิดช่องโหว่อะไรขึ้นมา
5. ตอบให้ได้ว่า ถ้าเราย้าย access token ไปเก็บใน localStorage จะแลกอะไรกับอะไร
