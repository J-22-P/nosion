# Production — ตั้งค่าครั้งแรก · ปล่อยเวอร์ชัน · ย้อนกลับ · กู้ข้อมูล

> Phase 8 ขั้น 7 · workflow พร้อมแล้ว (📁 `.github/workflows/deploy-production.yml` · `rollback-production.yml`)
> แต่ **ยังไม่มีโปรเจกต์ production** (เจ้าของเลือกสร้างทีหลัง) — ระหว่างนี้ push tag แล้ว workflow ข้ามเงียบ ไม่ทำให้แดง

## 1. สร้างโครงสร้างพื้นฐาน (ครั้งเดียว)

ทำตามหัวข้อ 1–3 ของคู่มือ staging ทุกข้อ โดยตั้งชื่อเป็น production:

| บริการ   | staging                       | production (ตัวอย่าง)                  |
| -------- | ----------------------------- | -------------------------------------- |
| Supabase | `nosion-staging`              | `nosion-prod` (แยกโปรเจกต์ ไม่ใช้ร่วม) |
| Upstash  | `nosion-staging`              | `nosion-prod`                          |
| Vercel   | `nosion-staging-api` / `-web` | `nosion-api` / `nosion-web`            |

ค่าที่ต่างจาก staging:

- `JWT_SECRET` · `ENCRYPTION_KEY` · `API_PROXY_KEY` · `CRON_SECRET` **สุ่มใหม่ทั้งหมด** — ห้ามใช้ค่าเดียวกับ staging
- `ENABLE_DEMO_ACCOUNT` — `true` ถ้าอยากให้คนลองได้ทันที (สเปก 9.4) · ปิดก็ได้ smoke test รับได้ทั้งสองแบบ
- OAuth (Google/GitHub) — สร้าง client/app **แยกจาก staging** · callback = `https://<โดเมน production>/api/v1/auth/oauth/<provider>/callback`
- `MAIL_DRIVER=resend` + โดเมนที่ยืนยันแล้ว

## 2. GitHub: environment + secrets

repo → **Settings → Environments → New environment** ชื่อ `production`

1. **Required reviewers** — ใส่ตัวเอง (และคนอื่นที่อนุมัติได้) · workflow รอที่ job `deploy` จนกว่าจะกด Approve
2. **Deployment branches and tags** → _Selected branches and tags_ → เพิ่มกฎ **tag** `v*`
   (กัน workflow จาก branch อื่นมาอ่าน secrets ของ production)
3. secrets / variables ของ environment นี้:

| ชนิด     | ชื่อ                                              | ค่า                                                                           |
| -------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| secret   | `VERCEL_TOKEN`                                    | token แยกจาก staging ได้ (แนะนำ)                                              |
| secret   | `VERCEL_ORG_ID`                                   | เหมือน staging                                                                |
| secret   | `VERCEL_PROJECT_ID_API` · `VERCEL_PROJECT_ID_WEB` | ของ project production                                                        |
| secret   | `PROD_DIRECT_URL`                                 | Supabase **Session pooler :5432** ของ production (ใช้ทั้ง migrate และ backup) |
| secret   | `FLY_API_TOKEN`                                   | (ไม่บังคับ) ถ้า worker อยู่บน Fly                                             |
| variable | `PROD_BACKUP_AGE_RECIPIENT`                       | public key ของ age (หัวข้อ 3)                                                 |
| variable | `PROD_FLY_WORKER_APP`                             | (ไม่บังคับ) ชื่อ app ของ worker บน Fly                                        |

ที่ **repository** (ไม่ใช่ environment — job `check` อ่านก่อนขออนุมัติ):

| ชนิด     | ชื่อ           | ค่า                                                                                  |
| -------- | -------------- | ------------------------------------------------------------------------------------ |
| variable | `PROD_WEB_URL` | `https://<โดเมน production>` — **ตั้งเมื่อพร้อมจริง** (ไม่ตั้ง = workflow ข้ามเงียบ) |
| variable | `PROD_API_URL` | `https://<project api>.vercel.app` — smoke test ตรวจ `/readyz` ที่นี่                |

## 3. กุญแจของ backup (age)

backup เข้ารหัสด้วย **public key** · กุญแจถอด (identity) อยู่กับเจ้าของเท่านั้น **ห้ามใส่ใน GitHub**
(artifact ของ run โหลดได้ทุกคนที่อ่าน repo ได้ — ถ้าไม่เข้ารหัส = ข้อมูลผู้ใช้ทั้งหมดรั่ว)

```bash
brew install age
age-keygen -o ~/.config/nosion/prod-backup.key   # เก็บไฟล์นี้ไว้ในที่ปลอดภัย (password manager)
grep 'public key' ~/.config/nosion/prod-backup.key   # age1… → ใส่ใน vars.PROD_BACKUP_AGE_RECIPIENT
```

ไม่มี recipient = workflow **ไม่ deploy** (ไม่ปล่อยของขึ้นโดยไม่มี backup)

## 4. ปล่อยเวอร์ชัน

```bash
git switch main && git pull
# CI ของ commit ล่าสุดต้องเขียวก่อน
git tag -a v1.0.0 -m "NOSION 1.0.0"
git push origin v1.0.0
```

GitHub → Actions → **Deploy production** → กด **Review deployments → Approve** · ดูผลใน Summary ของ run
(deployment เดิม · ขนาด backup · URL ใหม่ · ผล smoke)

- tag ที่ไม่อยู่บน `main` หรือ CI ยังไม่เขียว → ล้มที่ `check` ก่อนขออนุมัติ (ยังไม่แตะ production)
- deploy ซ้ำ tag เดิม (เช่น Vercel ล่มชั่วคราว): Actions → Deploy production → **Run workflow** → ใส่ tag

## 5. ย้อนกลับ

**อัตโนมัติ:** ขั้นไหนล้มหลังเริ่มแตะ production (migrate · deploy · smoke) → `vercel rollback` api/web ไปตัวที่จำไว้ + worker ไป image เดิม → เปิด issue

**ด้วยมือ** (เจอปัญหาหลัง smoke ผ่านไปแล้ว): Actions → **Rollback production** → Run workflow
→ เลือก both/api/web · ไม่ระบุ deployment = ตัวก่อนหน้า · ต้องอนุมัติเหมือนการ deploy

- **ฐานข้อมูลไม่ถูกย้อน** — migration เป็นแบบ additive เสมอ (สเปก 13.4 expand → contract) โค้ดรุ่นก่อนจึงทำงานกับ schema ใหม่ได้
- Vercel แผน Hobby ย้อนได้แค่ "ตัวก่อนหน้า" ตัวเดียว (แผน Pro ย้อนไปตัวไหนก็ได้)
- หลัง rollback แล้ว deploy ตัวใหม่ทับ: rollback บน Vercel ปิด auto-assign ของโดเมนไว้ → `vercel promote <url>` หรือ deploy tag ใหม่

## 6. กู้ข้อมูลจาก backup

ทำเมื่อข้อมูลเสียจริงเท่านั้น (เช่น migration ลบข้อมูลผิด) — เป็นการตัดสินใจของคน ไม่มี workflow อัตโนมัติ

```bash
gh run download <run-id> -n db-backup-v1.2.0                 # ไฟล์ nosion-v1.2.0.dump.age
age -d -i ~/.config/nosion/prod-backup.key nosion-v1.2.0.dump.age > nosion.dump
pg_restore --list nosion.dump | head                          # ตรวจว่าเปิดได้ก่อน
# กู้ลงฐานใหม่ก่อนเสมอ (Supabase project ชั่วคราว) แล้วค่อยย้ายข้อมูลที่ต้องการกลับ — ห้าม restore ทับ production ตรง ๆ
pg_restore --no-owner --no-privileges --dbname="<ฐานชั่วคราว>" nosion.dump
```

artifact เก็บ 30 วัน · Supabase เองมี daily backup (แผนฟรีเก็บ 7 วัน) เป็นอีกชั้น

## ปัญหาที่น่าจะเจอ

| อาการ                               | สาเหตุ / ทางแก้                                                            |
| ----------------------------------- | -------------------------------------------------------------------------- |
| run จบเร็ว สีเขียว แต่ไม่ได้ deploy | ยังไม่ได้ตั้ง `vars.PROD_WEB_URL` (ตั้งใจให้ข้าม)                          |
| `check` ล้ม "ไม่ได้อยู่บน main"     | tag ถูกสร้างบน branch อื่น — ลบ tag แล้ว tag ใหม่จาก main                  |
| `pg_dump: server version mismatch`  | Supabase อัป major version → แก้ `postgresql-client-17` ใน workflow ให้ตรง |
| smoke `demo login → 429`            | ยอมรับได้ (rate limit ต่อ IP ของ runner) — ไม่ทำให้ล้ม                     |
| rollback แล้วโดเมนยังชี้ตัวใหม่     | ดู `vercel rollback status` ของ project · ตรวจว่า token มีสิทธิ์ในทีมนั้น  |
