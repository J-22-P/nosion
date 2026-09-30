# 10 · Phase 2a — Design System, CSS และ Theming (ตั้งแต่ศูนย์)

> **Phase 2a คืออะไร:** เปลี่ยนหน้าตาทั้งแอปจากธีม indigo ของ Phase 1 เป็น **Monochrome + Apple Blue**
> ที่มีสองธีมเท่ากัน (มืด/สว่าง) ตาม mockup ชุด v1.1 โดย **ไม่เพิ่มฟีเจอร์ให้ผู้ใช้เลยสักอย่าง**
>
> ฟังดูเหมือนงาน "ทาสี" แต่ถ้าวางรากผิด ทุก Phase ต่อจากนี้ต้องไล่แก้สีทีละหน้า
> บทนี้อธิบาย **CSS ทำงานอย่างไรจริง ๆ** แล้วพาเดินทีละขั้นว่าเราสร้างระบบสีของ NOSION อย่างไร

อ่านคู่กับ: 📁 `docs/phases/phase-2a-design-refresh.md` ขั้น 2–3 · ADR-009 · บทถัดไป [11](./11-phase2a-accessible-components-and-app-shell.md)

---

## 1. ปัญหาที่พยายามแก้

โค้ด Phase 1 มีแบบนี้กระจายอยู่หลายสิบจุด:

```tsx
<span className="text-amber-600 dark:text-amber-400">ปานกลาง</span>
<div className="bg-[var(--card)] border-[var(--border)]">…</div>
```

ปัญหามี 3 ชั้น:

1. **สีผูกกับค่า ไม่ใช่ความหมาย** — `amber-600` บอกว่า "สีอำพัน" แต่ไม่บอกว่า "นี่คือคำเตือน"
   วันที่ designer อยากให้คำเตือนเป็นสีส้ม ต้อง grep หาทุก `amber` แล้วเดาว่าอันไหนคือคำเตือน
2. **dark mode ต้องจำเอง** — ทุกจุดต้องเขียน `dark:` คู่กัน ลืมจุดเดียว = ข้อความดำบนพื้นดำ
3. **ไม่มีที่เดียวให้ตรวจ contrast** — ต้องไล่ดูทีละหน้า

เป้าหมายของ Phase 2a: **component ไม่รู้จักสีเลย รู้แค่บทบาท** แล้วให้ไฟล์เดียวเป็นเจ้าของค่าจริง

---

## 2. พื้นฐาน CSS ที่ต้องเข้าใจก่อน

### 2.1 Cascade — เบราว์เซอร์เลือกค่าไหนเมื่อมีหลายกฎชนกัน

"C" ใน CSS คือ **Cascading** ถ้าสองกฎตั้ง `color` ให้ element เดียวกัน เบราว์เซอร์ตัดสินตามลำดับนี้
(ข้อบนสำคัญกว่าข้อล่าง — ข้อล่างใช้ตัดสินเมื่อข้อบนเสมอกันเท่านั้น):

| ลำดับ | เกณฑ์                        | ตัวอย่าง                                                        |
| ----- | ---------------------------- | --------------------------------------------------------------- |
| 1     | **Origin และ `!important`**  | style ของเราชนะ default ของเบราว์เซอร์ · `!important` กลับลำดับ |
| 2     | **Cascade layer** (`@layer`) | กฎที่ไม่อยู่ใน layer ชนะกฎที่อยู่ใน layer                       |
| 3     | **Specificity**              | `#id` > `.class` > `div`                                        |
| 4     | **ลำดับในไฟล์**              | เขียนทีหลังชนะ                                                  |

### 2.2 Specificity

นับเป็นสามหลัก (id, class, element):

```
div                 → (0,0,1)
.card               → (0,1,0)
.card .title        → (0,2,0)
#main .card         → (1,1,0)   ← ชนะทุกอันข้างบน ไม่ว่าจะเขียนก่อนหรือหลัง
```

Tailwind ออกแบบให้ทุก utility มี specificity (0,1,0) เท่ากันหมด → ตัดสินด้วยลำดับในไฟล์
ซึ่ง Tailwind จัดให้เอง นี่คือเหตุผลที่ `cn()` (📁 `packages/ui/src/cn.ts` ใช้ `tailwind-merge`)
ต้องลบ class ที่ขัดกันออก — เขียน `p-4 p-2` แล้วหวังว่า `p-2` จะชนะไม่ได้

### 2.3 Cascade layers (`@layer`) — ของใหม่ที่ Tailwind v4 ใช้หนัก

```css
@layer base, components, utilities;
@layer base {
  a {
    color: blue;
  }
}
@layer utilities {
  .text-red {
    color: red;
  }
}
a {
  color: green;
} /* ไม่อยู่ใน layer */
```

`<a class="text-red">` เป็นสี **เขียว** — เพราะกฎที่ไม่อยู่ใน layer ชนะ **ทุก** layer
แม้ specificity จะต่ำกว่า นี่คือเครื่องมือที่ทำให้ CSS ของ library ไม่ทับของเรา
(และเป็นต้นเหตุกับดักในหัวข้อ 5)

### 2.4 Custom properties (CSS variables)

```css
:root {
  --surface: #ffffff;
}
.card {
  background: var(--surface);
}
```

คุณสมบัติที่คนมักไม่รู้:

- **สืบทอด (inherit) ลงลูก** เหมือน `color` — ตั้งที่ `<html>` แล้วทุก element เห็น
- **คำนวณตอนใช้ ไม่ใช่ตอนประกาศ** — เปลี่ยนค่าที่ `:root` แล้วทุกจุดที่ `var(--surface)` เปลี่ยนตามทันที
  โดยไม่ต้อง re-render React เลย เบราว์เซอร์คำนวณ style ใหม่เอง
- **ค่าที่วนอ้างตัวเอง** (`--x: var(--x)`) เป็น "guaranteed-invalid" → ผลเหมือนไม่ได้ตั้งค่า

ต่างจากตัวแปรของ Sass/Less ที่ถูกแทนค่าตอน build แล้วหายไป — CSS variable **มีชีวิตอยู่ใน runtime**
ซึ่งเป็นคุณสมบัติที่ทำให้สลับธีมได้โดยไม่ต้องโหลด CSS ใหม่

### 2.5 สีในคอมพิวเตอร์

- `#1d1d1f` = R 0x1d, G 0x1d, B 0x1f (0–255 ต่อช่อง) · `rgba(0,0,0,0.06)` = ดำ โปร่ง 6%
- สีโปร่ง (alpha) **ขึ้นกับพื้นหลัง** — `--border: rgba(0,0,0,.06)` บนพื้นขาวได้เทาอ่อน บนพื้นเทาได้เทาเข้มขึ้น
  เราใช้ข้อนี้โดยตั้งใจ: เส้นขอบ hairline ใช้ได้ทุกพื้นผิวโดยไม่ต้องมีค่าแยก
- ⚠️ แต่ **ห้ามใช้สีโปร่งกับข้อความ** — contrast คำนวณไม่ได้แน่นอนเพราะไม่รู้ว่าอยู่บนพื้นอะไร

---

## 3. Design token — แยก "ความหมาย" ออกจาก "ค่า"

**Token** คือชื่อที่ใช้แทนค่าการออกแบบ จัดเป็น 3 ชั้น:

```
ชั้น 1  ค่าดิบ       #141416   20px   blur(20px)
           │
ชั้น 2  ความหมาย     --surface   --radius-card   --blur-glass        ← 📁 packages/ui/src/tokens.css
           │
ชั้น 3  การใช้งาน    bg-surface  rounded-card    glass               ← 📁 apps/web/src/app/globals.css
           │
        component    <Card>                                           ← 📁 apps/web/src/components/ui/card.tsx
```

- component ใช้ชั้น 3 เท่านั้น → ไม่มีใครรู้ว่าการ์ดสีอะไร รู้แค่ว่ามันคือ "surface"
- เปลี่ยนธีม = แก้ชั้น 2 ที่ไฟล์เดียว

⚠️ **ผิดบ่อยที่สุด:** ตั้งชื่อ token ตามสี (`--gray-900`) แทนตามบทบาท (`--text-primary`)
พอมี dark mode `--gray-900` ต้องกลายเป็นสีขาว — ชื่อโกหกทันที

### ขั้นที่ 1: เขียน token ทั้งสองธีม

📁 `packages/ui/src/tokens.css` (ย่อ)

```css
:root {
  /* Light — Precision OS */
  --canvas: #f5f5f7; /* พื้นหลังแอป  level 0 */
  --surface: #ffffff; /* การ์ด       level 1 */
  --surface-sunken: #f5f5f7; /* แถวในการ์ด   level 1.5 */
  --text-primary: #1d1d1f;
  --text-secondary: #6e6e73;
  --accent: #0062c5; /* ขั้น 11: เดิม #0071e3 (สเปก) — บท 14 */
}
.dark {
  /* Dark — Monochrome Studio OS */
  --canvas: #000000;
  --surface: #141416;
  --surface-sunken: #1c1c1e;
  --text-primary: #ffffff;
  --text-secondary: #86868b;
  --accent: #2e9aff; /* ขั้น 11: เดิม #2997ff (สเปก) */
}
```

token แบ่งเป็นกลุ่มตามบทบาท:

| กลุ่ม               | ตัวอย่าง                                                                 | ใช้ทำอะไร                                  |
| ------------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| พื้นผิว (elevation) | `--canvas` `--surface` `--surface-sunken` `--glass` `--surface-elevated` | แยกชั้นด้วยความสว่าง แทนเงา                |
| ข้อความ             | `--text-primary/secondary/tertiary`                                      | ลำดับความสำคัญด้วยความเข้ม                 |
| สีที่มีความหมาย     | `--accent` `--danger` `--warning` `--success` + `*-soft`                 | ใช้ได้ 4 กรณีเท่านั้น (สเปก 8.7.1)         |
| รูปทรง              | `--radius-chip/control/row/card/panel`                                   | ยิ่ง surface ใหญ่ ยิ่งโค้งมาก              |
| เงา/เบลอ            | `--shadow-card` `--shadow-float` `--blur-glass`                          | ต่างกันตามธีม (ธีมมืดใช้ขอบเรืองแสงแทนเงา) |

**"ความลึกด้วยพื้นผิว ไม่ใช่เงา"** — ในธีมมืด เงาดำบนพื้นดำมองไม่เห็น
จึงแยกชั้นด้วยความสว่างของพื้น: canvas `#000` → การ์ด `#141416` → แถวในการ์ด `#1c1c1e`
ยิ่งอยู่ "สูง" ยิ่งสว่าง เหมือนแสงตกกระทบวัตถุที่อยู่ใกล้กว่า

### ขั้นที่ 2: ตัดสีประจำโมดูลออก

v1.0 ให้ทุกโมดูลมีสี (งาน = ม่วง, การเงิน = เขียว ...) mockup v1.1 ตัดออก
📁 `packages/ui/src/module-theme.ts` เหลือ **ไอคอน + ตัวอักษรนำหน้า** (`T:` `E:` `W:` `H:`)

เหตุผลเชิงออกแบบ: ถ้าสีมีหน้าที่บอกโมดูล สีก็ใช้บอก "เร่งด่วน" ไม่ได้อีก — สีหมด
เหตุผลเชิงวิศวกรรม: โมดูลที่ 5, 6, 7 ในอนาคตไม่ต้อง "จองสี" ที่ไม่ชนกับใคร

---

## 4. Tailwind v4 ทำงานอย่างไร

### 4.1 Utility-first คืออะไร

แทนที่จะเขียน `.card { padding: 16px; border-radius: 20px }` แล้วตั้งชื่อ class
เราเขียน `p-4 rounded-card` ตรงใน JSX — แต่ละ class ทำหน้าที่เดียว

ข้อดี: ไม่ต้องตั้งชื่อ, CSS ไม่โตตามจำนวนหน้า (class ซ้ำกันทั้งแอป), ลบ component แล้ว CSS ของมันหายไปด้วย
ข้อเสีย: JSX ยาว → แก้ด้วยการห่อเป็น component (`<Button>`) ไม่ใช่ย้อนกลับไปเขียน CSS

### 4.2 Tailwind สร้าง CSS อย่างไร

1. **สแกนไฟล์** ในโปรเจกต์หาสตริงที่หน้าตาเหมือน class (`bg-surface`, `p-4`)
2. **สร้าง CSS เฉพาะ class ที่เจอ** — ไม่เจอ = ไม่สร้าง (CSS ทั้งแอปเราจึงเล็ก)
3. ชื่อ class ต้องเป็น **สตริงเต็ม** ในโค้ด: `bg-${color}` ใช้ไม่ได้ เพราะตอนสแกนไม่มีสตริง `bg-danger` อยู่จริง
   → นี่คือเหตุผลที่ 📁 `components/ui/progress.tsx` ใช้ map `{ warning: 'bg-warning', danger: 'bg-danger' }`
   แทนการต่อสตริง

### 4.3 ผูก token เข้า Tailwind ด้วย `@theme`

📁 `apps/web/src/app/globals.css`

```css
@theme inline {
  --color-surface: var(--surface); /* → bg-surface, text-surface, border-surface */
  --color-fg-secondary: var(--text-secondary); /* → text-fg-secondary */
  --radius-card: var(--radius-card); /* → rounded-card */
  --shadow-float: var(--shadow-float); /* → shadow-float */
}
```

- ตัวแปรที่ขึ้นต้น `--color-*` กลายเป็น utility สีทุกชนิด (`bg-` `text-` `border-` `fill-` …) อัตโนมัติ
- **`inline`** แปลว่า utility จะใช้ค่า `var(--surface)` ตรง ๆ แทนที่จะอ้าง `var(--color-surface)` อีกทอด
  → ค่ายังเปลี่ยนตามธีมได้ (เพราะ `--surface` เปลี่ยน) และไม่มีชั้นตัวแปรเกินมา

ชื่อ utility ตั้งตามบทบาท: `text-fg` / `text-fg-secondary` (fg = foreground), `bg-sunken`, `border-hairline`

### 4.4 Utility ที่เขียนเอง

```css
@utility glass {
  background-color: var(--glass);
  backdrop-filter: var(--blur-glass);
  @supports not (backdrop-filter: blur(1px)) {
    background-color: var(--glass-solid);
  }
  @media (prefers-reduced-transparency: reduce) {
    background-color: var(--glass-solid);
  }
}
```

- `@supports` = ถ้าเบราว์เซอร์ไม่รองรับ feature นี้ ใช้กฎข้างใน → กระจกกลายเป็นพื้นทึบ (ยังอ่านออก)
- `prefers-reduced-transparency` = ผู้ใช้ตั้งค่าระบบว่าไม่อยากเห็นความโปร่ง (สายตาไม่ดี / ปวดหัว)
- `@utility nums` = `tabular-nums` ทำให้ตัวเลขทุกตัวกว้างเท่ากัน (เลข 1 ไม่แคบกว่า 8) → ตัวเลขในตาราง/นาฬิกาไม่เต้น

---

## 5. กับดักที่เจอจริง: ตัวแปรอ้างตัวเอง + cascade layer

บรรทัดนี้ใน `globals.css`:

```css
@theme inline {
  --radius-card: var(--radius-card);
}
```

ดูเหมือนตัวแปรอ้างตัวเอง ซึ่งในหัวข้อ 2.4 บอกว่าผลคือ "ไม่ได้ตั้งค่า"
ทำไมมุมการ์ดยังโค้งได้?

เพราะ Tailwind ปล่อยบรรทัดนั้นไว้ **ใน `@layer theme`** ส่วน `tokens.css` ไม่อยู่ใน layer ใดเลย
ตามหัวข้อ 2.3 กฎที่ไม่อยู่ใน layer **ชนะเสมอ** → ค่าที่ใช้จริงคือ `1.25rem` จาก `tokens.css`
บรรทัดใน `@layer theme` แพ้ไปเงียบ ๆ จึงไม่เกิดการวนซ้ำ

**วิธีที่เราตรวจ (ไม่ใช่เดา):** build แล้วเปิดไฟล์ CSS ผลลัพธ์ หาตำแหน่งของทั้งสองบรรทัด
ยืนยันว่าบรรทัดวนอยู่หลัง `@layer theme{` ส่วนค่าจริงไม่อยู่ใน layer

⚠️ ถ้าวันหนึ่งมีคนห่อ `tokens.css` ด้วย `@layer base { … }` มุมโค้งและเงาทั้งแอปจะหายพร้อมกัน
จึงเขียน comment เตือนใน `globals.css` และบันทึกเป็น "ข้อเสียที่ยอมรับ" ใน ADR-009

🎤 _"ทำไมไม่ตั้งชื่อต่างกันไปเลย?"_ → เพราะอยากได้ชื่อ utility `rounded-card` ซึ่ง Tailwind สร้างจาก
ชื่อตัวแปร `--radius-card` เท่านั้น — เลือกระหว่างชื่อ utility สวยกับความซับซ้อนหนึ่งบรรทัด แล้วบันทึกเหตุผลไว้

---

## 6. Dark mode ทำงานอย่างไร (ทั้งระบบ)

### 6.1 สามแหล่งของ "ธีมที่ต้องการ"

1. ผู้ใช้เลือกเองในแอป (`light` / `dark`) → เก็บใน `localStorage`
2. ผู้ใช้เลือก `system` → ตามการตั้งค่าระบบปฏิบัติการ (`prefers-color-scheme`)
3. ยังไม่เคยเลือก → ค่าเริ่มต้น `system` (สเปก 8.7)

`next-themes` (📁 `app/providers.tsx`) รวมทั้งสามแหล่ง แล้วใส่ `class="dark"` ที่ `<html>`
Tailwind ผูก variant `dark:` เข้ากับ class นี้ด้วย `@custom-variant dark (&:where(.dark, .dark *))`

### 6.2 ปัญหาหน้ากระพริบ (FOUC — Flash of Unstyled/Incorrect Content)

ลำดับเหตุการณ์ตอนเปิดเว็บ:

```
1. เซิร์ฟเวอร์ส่ง HTML มา        ← เซิร์ฟเวอร์ไม่รู้ localStorage ของผู้ใช้
2. เบราว์เซอร์วาดหน้าแรก         ← ถ้ายังไม่มี class="dark" = หน้าขาว
3. โหลด JS, React hydrate
4. โค้ดอ่าน localStorage แล้วใส่ class  ← หน้ากลายเป็นดำ  → ผู้ใช้เห็น "แวบ"
```

`next-themes` แก้ด้วยการฉีด `<script>` เล็ก ๆ ใน `<head>` ที่รัน **ระหว่างข้อ 1 กับ 2**
(script แบบ inline ใน head บล็อกการวาด) อ่านค่าแล้วใส่ class ก่อนเบราว์เซอร์วาดครั้งแรก

ผลข้างเคียง: DOM จริงมี `class="dark"` แต่ HTML จากเซิร์ฟเวอร์ไม่มี → React เตือน hydration mismatch
→ ใส่ `suppressHydrationWarning` ที่ `<html>` (เฉพาะ element นั้น ไม่ใช่ทั้งแอป) 📁 `app/layout.tsx`

### 6.3 UI ที่แสดง "ธีมปัจจุบัน" ต้องรอ mount

📁 `components/shared/theme-switcher.tsx`

```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
const value = mounted ? theme : 'system';
```

ตอน render บนเซิร์ฟเวอร์ไม่รู้ค่า → แสดงค่ากลาง (`system`) ก่อน แล้วค่อยแสดงค่าจริงหลัง mount
ขนาดของปุ่มเท่าเดิม → ไม่มี layout shift

### 6.4 `color-scheme`

```css
:root {
  color-scheme: light;
}
.dark {
  color-scheme: dark;
}
```

บอกเบราว์เซอร์ให้ใช้ scrollbar, date picker, checkbox เนทีฟแบบมืดด้วย
ไม่ตั้ง = ช่องเลือกวันที่ใน quick capture จะเป็นกล่องขาวโผล่กลางธีมมืด

---

## 7. Contrast — คณิตศาสตร์เบื้องหลัง "อ่านออก"

### 7.1 WCAG วัดอะไร

อัตราส่วนความสว่างระหว่างตัวอักษรกับพื้น จาก 1:1 (สีเดียวกัน) ถึง 21:1 (ดำบนขาว)

| ระดับ AA                                                                  | ต้องได้       |
| ------------------------------------------------------------------------- | ------------- |
| ข้อความปกติ                                                               | **≥ 4.5 : 1** |
| ข้อความใหญ่ (≥ 24px หรือ ≥ 18.66px ตัวหนา) และไอคอน/เส้นขอบที่ต้องมองเห็น | ≥ 3 : 1       |

### 7.2 คำนวณเอง (ทำครั้งเดียวแล้วจะเข้าใจเครื่องมือทุกตัว)

1. แปลงแต่ละช่องสี 0–255 เป็น 0–1 แล้ว "ถอด gamma" (จอแสดงผลไม่เป็นเส้นตรง):
   `c ≤ 0.03928 ? c/12.92 : ((c + 0.055) / 1.055) ^ 2.4`
2. **Relative luminance** `L = 0.2126 R + 0.7152 G + 0.0722 B`
   (ตาคนไวต่อสีเขียวที่สุด สีน้ำเงินน้อยที่สุด)
3. **Ratio** = `(L สว่าง + 0.05) / (L มืด + 0.05)`

ตัวอย่างจริงของ Phase นี้ — ข้อความรองบนการ์ดขาว (`L ขาว = 1`):

| สี                        | L       | ratio       | ผล         |
| ------------------------- | ------- | ----------- | ---------- |
| `#86868b` (ค่าจาก mockup) | ≈ 0.240 | **3.6 : 1** | ❌ ไม่ผ่าน |
| `#6e6e73` (ที่ใช้จริง)    | ≈ 0.157 | **5.1 : 1** | ✅         |

ดังนั้น `--text-secondary` ของธีมสว่างจึงไม่ตรง mockup (บันทึกใน ADR-009)
ส่วน `#86868b` ยังอยู่ในระบบเป็น `--text-tertiary` สำหรับ placeholder/ข้อความตกแต่งเท่านั้น

ธีมมืดมีปัญหากลับด้าน: accent `#0071e3` บนพื้นดำได้แค่ 3.6:1 → ใช้ `#2997ff` ที่สว่างกว่า

> **อัปเดตขั้น 11:** ตอนเพิ่มการตรวจอัตโนมัติ พบว่าค่าจากสเปกอีกหลายค่าตกเมื่อ **สีโปร่งซ้อนกันสองชั้น**
> (badge `*-soft` บนแถว `surface-sunken`) จึงปรับ accent/danger/warning/success ทั้งสองธีมเล็กน้อย
> และทุกคู่สีถูกตรวจใน 📁 `packages/ui/src/tokens.test.ts` — อ่านต่อที่ [บท 14](./14-phase2a-pwa-icons-visual-and-a11y-testing.md) หัวข้อ 4

🎤 _"ถ้า designer ไม่ยอมเปลี่ยนสีล่ะ?"_ → เอาตัวเลขไปคุย ไม่ใช่ความชอบ แล้วเสนอทางเลือก
เช่น คงสีเดิมไว้ใช้เฉพาะข้อความใหญ่ หรือเพิ่มน้ำหนักฟอนต์

⚠️ **ไม่สื่อด้วยสีอย่างเดียว** (WCAG 1.4.1) — งานเลยกำหนดมีทั้งสีแดง **และ** ไอคอน ⚠ **และ** ข้อความ "เลยมา 2 วัน"
คนตาบอดสีแดง-เขียวราว 8% ของผู้ชายจะแยกไม่ออกถ้ามีแค่สี

---

## 8. ฟอนต์บนเว็บ

### 8.1 เบราว์เซอร์โหลดฟอนต์อย่างไร

```
HTML → CSS → เจอ @font-face → เจอข้อความที่ต้องใช้ฟอนต์นั้น → ค่อยเริ่มดาวน์โหลด
```

ระหว่างรอมีสองพฤติกรรม:

- **FOIT** (Flash of Invisible Text) — ซ่อนข้อความจนกว่าฟอนต์มา → หน้าว่างเปล่านานหลายวินาทีบนเน็ตช้า
- **FOUT** (Flash of Unstyled Text) — แสดงฟอนต์สำรองก่อนแล้วค่อยสลับ

`font-display: swap` เลือก FOUT → เนื้อหาอ่านได้ทันที (เราใช้ค่านี้ทั้งสามฟอนต์)

### 8.2 `next/font` ทำอะไรให้

📁 `apps/web/src/app/layout.tsx`

```ts
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
const plexThai = IBM_Plex_Sans_Thai({ subsets: ['thai', 'latin'], weight: ['400','500','600','700'], … });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], … });
```

1. **ดาวน์โหลดตอน build** แล้วเสิร์ฟจากโดเมนเราเอง (self-host)
   → ไม่มี request ไป Google ตอนผู้ใช้เปิดเว็บ: เร็วกว่า (ไม่ต้องเปิด connection ใหม่) และไม่ส่งข้อมูลผู้ใช้ให้บุคคลที่สาม
2. **Subset** — ตัดเอาเฉพาะชุดอักขระที่ขอ (`latin`, `thai`) ไฟล์เล็กลงหลายเท่า
3. **Fallback ที่ปรับขนาดแล้ว** — สร้าง `@font-face` ของฟอนต์ระบบที่ปรับ `size-adjust` ให้กว้างเท่าฟอนต์จริง
   → ตอนสลับจากฟอนต์สำรองเป็นฟอนต์จริง ข้อความไม่ขยับ (ลด CLS — Cumulative Layout Shift)
4. `variable: '--font-inter'` → ได้ CSS variable ไว้อ้างใน `--font-sans` ของ Tailwind

⚠️ ผลข้างเคียงที่เจอจริง: `next build` ต้องต่อ Google Fonts ได้ ถ้าเครื่อง build ไม่มีเน็ต build ล้ม
(ใน sandbox ที่ใช้พัฒนาเราจำลองฟอนต์ด้วย `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` — CI ต่อเน็ตได้ตามปกติ)

### 8.3 ภาษาไทยกับ fallback chain

```css
--font-sans: var(--font-inter), var(--font-plex-thai), ui-sans-serif, system-ui, sans-serif;
```

Inter **ไม่มีอักษรไทย** — เบราว์เซอร์เลือกฟอนต์ **ทีละตัวอักษร**:
"แก้ bug login" → "แก้" ได้ Plex Thai, "bug login" ได้ Inter
จึงได้ตัวเลขและภาษาอังกฤษที่คมแบบ Inter กับภาษาไทยที่อ่านง่ายในบรรทัดเดียวกัน

⚠️ **letter-spacing ติดลบกับภาษาไทย** — หัวข้อสไตล์ Apple ใช้ `-0.03em` ให้ตัวอักษรชิดกัน
แต่ภาษาไทยมีสระบน/ล่างและวรรณยุกต์ซ้อนกันในแนวตั้ง พอบีบ สระจะชนกัน
→ utility `tracking-display` 📁 `globals.css` ติดลบเฉพาะส่วนที่ `lang="en"`
(ใส่ `lang="en"` ที่ `(Tasks)` ในหัวข้อ, ตัวเลข KPI ฯลฯ)

### 8.4 ทำไมฟอนต์เดียวทั้งสองธีม

mockup ธีมสว่างใช้ Plus Jakarta Sans แต่ธีมมืดใช้ Inter — เราใช้ Inter ทั้งคู่ เพราะ
(1) ลด request หนึ่งฟอนต์ (2) สลับธีมแล้วตัวเลขกว้างเท่าเดิม ตารางไม่กระโดด

---

## 9. ประกอบทั้งหมด: เดินทางของหนึ่งพิกเซล

ตามรอยว่า "พื้นหลังการ์ดงาน" ได้สีมาอย่างไร เมื่อผู้ใช้ตั้งธีมระบบเป็นมืด:

```
1. script ของ next-themes ใน <head> → matchMedia('(prefers-color-scheme: dark)') = true
                                       → <html class="dark">
2. tokens.css:  .dark { --surface: #141416 }         (unlayered — ชนะ)
3. globals.css: @theme inline { --color-surface: var(--surface) }
4. Tailwind สร้าง: .bg-surface { background-color: var(--surface) }
5. card.tsx:    <div className="… bg-surface …">
6. เบราว์เซอร์: var(--surface) → #141416
```

ผู้ใช้กดเปลี่ยนเป็นสว่าง → ข้อ 1 เปลี่ยน class → ข้อ 6 คำนวณใหม่ **ไม่มี React component ไหน re-render เลย**

---

## 10. Performance ของงานดีไซน์

- **`backdrop-filter` แพง** — GPU ต้องเบลอทุกพิกเซลด้านหลังทุกเฟรมที่ scroll
  ใช้เฉพาะ top bar / tab bar / popover ห้ามใส่ในการ์ดที่อยู่ใน list ยาว (สเปก 8.10)
- **ไอคอน:** mockup ใช้ Material Symbols (icon font ~300 KB โหลดทั้งก้อนแม้ใช้ 10 ไอคอน)
  เราใช้ `lucide-react` ที่ import ทีละตัว → bundler ตัดตัวที่ไม่ใช้ทิ้ง (tree-shaking)
- **Bundle budget** route แรก < 180 KB gzip — จบ Phase 2a `/tasks` = 165 KB
  เป็นเหตุผลที่ยังไม่ติดตั้ง framer-motion (~30 KB) เพื่อ animation ตัวเดียว

---

## ข้อเสียที่ยอมรับ

- ยังไม่มี lint ห้ามใช้สี Tailwind ตรง ๆ (`text-gray-500`) — พึ่ง code review
- ชื่อ token ซ้ำกับ theme key ของ Tailwind — ทำงานได้เพราะ cascade layer (หัวข้อ 5) ต้องรักษาเงื่อนไขนี้ไว้
- หน้าตาต่างจาก mockup ในจุดที่ตั้งใจ (contrast) — ต้องอธิบายเวลาเทียบภาพ

---

## แบบฝึกหัดท้ายบท

1. ห่อเนื้อหา `tokens.css` ด้วย `@layer base { … }` แล้วเปิดหน้า Tasks — มุมการ์ดเป็นอย่างไร? อธิบายด้วยหัวข้อ 2.3 และ 5
2. คำนวณ contrast ของ `--accent` ธีมสว่าง (`#0071e3`) บนการ์ดขาวด้วยสูตรในหัวข้อ 7.2 — ผ่าน AA ไหม?
   _(เฉลย: L ≈ 0.174 → ≈ 4.7 : 1 ผ่านแบบเฉียดฉิว)_
3. ลบ `color-scheme: dark` ออกจาก `.dark` แล้วเปิดช่องเลือกวันที่ใน quick capture ด้วยธีมมืด — เห็นอะไร?
4. เขียน `className={\`bg-${tone}\`}` ใน component ใหม่ แล้ว build — ทำไมสีไม่ขึ้น? (หัวข้อ 4.2)
5. เปิด DevTools → Rendering → Emulate `prefers-color-scheme: dark` ขณะตั้งธีมเป็น `system` แล้วสังเกตว่า
   React DevTools มี component ไหน re-render บ้าง (หัวข้อ 9)
