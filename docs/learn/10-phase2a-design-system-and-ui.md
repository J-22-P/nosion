# 10 · Phase 2a — Design System, Theming และ UI ที่เข้าถึงได้

> Phase นี้ไม่มีฟีเจอร์ใหม่ให้ผู้ใช้เลย แต่เปลี่ยนทุกพิกเซล
> ประเด็นหลักของไฟล์นี้: **แยก "ความหมาย" ของสีออกจาก "ค่า" ของสี** แล้วทุกอย่างที่เหลือจะตามมาเอง

อ่านคู่กับ: 📁 `docs/phases/phase-2a-design-refresh.md` (ทำอะไรไปทีละขั้น) · ADR-009 (ทำไม)

---

## 1. Design token คืออะไร — และทำไมต้องมี 3 ชั้น

Token คือ "ชื่อ" ที่ใช้แทนค่าการออกแบบ เช่น `--surface` แทน `#141416`

```
ชั้น 1  ค่าดิบ         #141416, 20px, blur(20px)
ชั้น 2  ความหมาย       --surface, --text-secondary, --radius-card        ← 📁 packages/ui/src/tokens.css
ชั้น 3  การใช้งาน      bg-surface, text-fg-secondary, rounded-card       ← 📁 apps/web/src/app/globals.css
```

component ใช้แค่ชั้น 3 → ไม่มีใครรู้ว่า "การ์ด" สีอะไร รู้แค่ว่ามันคือ surface
วันที่เปลี่ยนธีม เราแก้ชั้น 2 ที่เดียว

⚠️ **ผิดบ่อย:** ตั้งชื่อ token ตามสี (`--gray-900`) แทนตามบทบาท (`--text-primary`)
พอมี dark mode `--gray-900` ต้องกลายเป็นสีขาว — ชื่อโกหกทันที

🎤 _"ถ้าต้องเพิ่มธีม high-contrast จะแก้กี่ไฟล์?"_ → หนึ่งไฟล์ เพิ่ม selector `.hc { ... }` ใน `tokens.css`
component ไม่ต้องแตะเลย

---

## 2. Dark mode ทำงานอย่างไร

### 2.1 CSS variable สลับค่าตาม class

```css
:root {
  --surface: #ffffff;
}
.dark {
  --surface: #141416;
}
```

`next-themes` ใส่ `class="dark"` ที่ `<html>` แล้วทุก `var(--surface)` เปลี่ยนตามทันที
ไม่ต้อง re-render React เลย — เบราว์เซอร์คำนวณ style ใหม่เอง

### 2.2 ปัญหา Flash (FOUC)

HTML แรกมาจากเซิร์ฟเวอร์ — เซิร์ฟเวอร์ไม่รู้ว่าผู้ใช้เลือกธีมอะไร (ค่าอยู่ใน `localStorage`)
ถ้ารอ React hydrate ก่อนค่อยใส่ class ผู้ใช้จะเห็นหน้าขาวแวบก่อนเปลี่ยนเป็นดำ

วิธีแก้ของ `next-themes`: ฉีด `<script>` เล็ก ๆ ที่รัน **ก่อน** เบราว์เซอร์วาดหน้าแรก
อ่าน `localStorage` + `prefers-color-scheme` แล้วใส่ class ทันที

ผลข้างเคียง: HTML ที่เซิร์ฟเวอร์ส่งกับ DOM จริงต่างกันที่ attribute `class` ของ `<html>`
→ ต้องใส่ `suppressHydrationWarning` ที่ `<html>` (มีอยู่แล้วใน 📁 `app/layout.tsx`)

### 2.3 UI ที่ขึ้นกับธีม ต้องรอ mount

📁 `components/shared/theme-switcher.tsx`

```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
const value = mounted ? theme : 'system';
```

ฝั่งเซิร์ฟเวอร์ไม่รู้ค่า `theme` → render ค่ากลางไปก่อน แล้วค่อยแสดงค่าจริงหลัง mount
ถ้าไม่ทำ React จะเตือน hydration mismatch

---

## 3. Cascade layers — กับดักที่เจอจริงใน Phase นี้

Tailwind v4 ให้ประกาศ theme ด้วย `@theme`:

```css
@theme inline {
  --color-surface: var(--surface); /* ชื่อไม่ซ้ำ → ไม่มีปัญหา */
  --radius-card: var(--radius-card); /* ชื่อซ้ำกับ token! */
}
```

บรรทัดที่สองดูเหมือนตัวแปรอ้างอิงตัวเอง (`--x: var(--x)`) ซึ่งใน CSS แปลว่า **ค่าไม่ถูกต้อง**

ทำไมยังทำงานได้? เพราะ CSS มี **cascade layers**:

```
ลำดับการชนะ (ท้ายชนะ):  @layer theme  <  @layer base  <  @layer utilities  <  ไม่อยู่ใน layer
```

Tailwind ปล่อย `--radius-card: var(--radius-card)` ไว้ใน `@layer theme`
ส่วน `tokens.css` ไม่อยู่ใน layer ใดเลย (unlayered) → **ชนะเสมอ ไม่ว่า specificity เท่าไร**

⚠️ ถ้าวันหนึ่งมีคนห่อ `tokens.css` ด้วย `@layer` ทุกมุมโค้งในแอปจะหายพร้อมกัน
จึงเขียน comment เตือนไว้ใน `globals.css` และบันทึกใน ADR-009

📌 บทเรียน: **ตรวจผลลัพธ์จริง ไม่ใช่เชื่อว่า "น่าจะได้"** — ตอนทำเราเปิดไฟล์ CSS ที่ build ออกมาแล้วดูว่า
ค่าไหนอยู่ใน layer ไหนก่อน commit

---

## 4. Contrast — ทำไมไม่ใช้สีตาม mockup เป๊ะ

WCAG วัดความต่างของความสว่างระหว่างตัวอักษรกับพื้น เป็นอัตราส่วน 1:1 (เหมือนกัน) ถึง 21:1 (ดำบนขาว)

| ระดับ AA                                | ต้องได้   |
| --------------------------------------- | --------- |
| ข้อความปกติ                             | ≥ 4.5 : 1 |
| ข้อความใหญ่ (≥ 18px หรือ ≥ 14px ตัวหนา) | ≥ 3 : 1   |

สูตรย่อ: แปลงสีเป็น relative luminance `L` แล้ว `ratio = (L_สว่าง + 0.05) / (L_มืด + 0.05)`

ตัวอย่างจริงใน Phase นี้:

- `#86868b` บนขาว = **3.6 : 1** ❌ → ใช้ `#6e6e73` (≈ 5.1 : 1) เป็นข้อความรอง
- `#86868b` ยังใช้ได้ในฐานะ `--text-tertiary` สำหรับข้อความตกแต่ง/placeholder เท่านั้น

🎤 _"ถ้า designer ไม่ยอมเปลี่ยนสีล่ะ?"_ → เอาตัวเลข contrast ไปคุย ไม่ใช่ความชอบ
และเสนอทางเลือก เช่น คงสีเดิมแต่ใช้ได้เฉพาะข้อความใหญ่

---

## 5. ฟอนต์: `next/font` และภาษาไทย

📁 `apps/web/src/app/layout.tsx`

```ts
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const plexThai = IBM_Plex_Sans_Thai({ subsets: ['thai', 'latin'], weight: [...], variable: '--font-plex-thai' });
```

- `next/font` **ดาวน์โหลดฟอนต์ตอน build** แล้วเสิร์ฟจากโดเมนเราเอง → ไม่มี request ไป Google ตอนผู้ใช้เปิดเว็บ
  (เร็วกว่า + ไม่รั่วข้อมูลผู้ใช้ไปบุคคลที่สาม)
- `display: 'swap'` แสดงฟอนต์สำรองก่อน ฟอนต์จริงมาถึงค่อยสลับ → ไม่มีช่วง "ข้อความหายไป"
- Next สร้าง fallback ที่ปรับขนาดให้ใกล้ฟอนต์จริง → ลด layout shift (CLS) ตอนสลับ

**Fallback chain:** `Inter, "IBM Plex Sans Thai", system-ui`
เบราว์เซอร์เลือกฟอนต์ **ทีละตัวอักษร** — ตัวอังกฤษ/ตัวเลขได้ Inter, ตัวไทยไม่มีใน Inter จึงตกไปที่ Plex Thai

⚠️ **letter-spacing ติดลบกับภาษาไทย:** หัวข้อสไตล์ Apple ใช้ `-0.03em` แต่ภาษาไทยมีสระบน/ล่างและวรรณยุกต์
พอบีบตัวอักษร สระจะชนกัน → utility `tracking-display` ติดลบเฉพาะส่วนที่ `lang="en"`

⚠️ ตัวเลขที่ต้องเรียงตรงกัน (เวลา, เงิน) ใส่ `font-variant-numeric: tabular-nums` (utility `nums`)
ไม่งั้นเลข 1 แคบกว่าเลข 8 ตัวเลขในตารางจะเต้น

---

## 6. Component ที่เข้าถึงได้ — ARIA ที่ใช้จริงใน Phase นี้

กฎข้อแรกของ ARIA: **ถ้าใช้ HTML element ที่มีความหมายอยู่แล้วได้ ให้ใช้** (`<button>`, `<input type="checkbox">`)
เราฝ่ากฎนี้เฉพาะเมื่อ element จริงทำหน้าตาตาม mockup ไม่ได้ และต้องชดเชยให้ครบ

| Component                                  | Pattern                                             | สิ่งที่ต้องทำเองเมื่อไม่ใช้ element จริง                                       |
| ------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Checkbox` 📁 `components/ui/checkbox.tsx` | `<button role="checkbox" aria-checked>`             | Space/Enter ได้ฟรีจาก `<button>` · พื้นที่กด ≥ 24px ด้วย `::before`            |
| `SegmentedControl`                         | `role="radiogroup"` + `role="radio"`                | **roving tabindex**: Tab เข้าได้จุดเดียว (ตัวที่เลือก) แล้วใช้ลูกศรเลื่อน      |
| `Menu` 📁 `components/ui/menu.tsx`         | menu button: `aria-haspopup="menu"` `aria-expanded` | เปิดแล้วโฟกัสรายการแรก · ↑↓ · Esc ปิดและ **คืนโฟกัสให้ปุ่ม** · คลิกนอกกล่องปิด |
| `StatusPill`                               | `role="status"` `aria-live="polite"`                | ไม่สื่อด้วยสีอย่างเดียว — มีข้อความเสมอ                                        |
| `Chip`                                     | `<button aria-pressed>`                             | toggle button: screen reader อ่านว่า "กดอยู่"                                  |

### Roving tabindex คืออะไร

กลุ่มปุ่มที่เลือกได้ทีละอัน (segmented, tab, radio) ถ้าให้ Tab ผ่านทุกปุ่ม ผู้ใช้คีย์บอร์ดต้องกด Tab หลายครั้งกว่าจะผ่านกลุ่มไปได้
วิธีแก้: ปุ่มที่เลือกอยู่ได้ `tabIndex={0}` ที่เหลือ `-1` แล้วดักลูกศรเพื่อย้ายโฟกัสเอง

### `sr-only` ไม่ใช่ `display: none`

sidebar ตอนยุบเหลือแต่ไอคอน — ถ้าลบข้อความทิ้ง screen reader จะอ่านลิงก์ว่า "ลิงก์" เฉย ๆ
`sr-only` ซ่อนจากสายตาแต่ยังอยู่ใน accessibility tree

🎤 _"ทดสอบ accessibility อย่างไร?"_ → 3 ชั้น: lint (`jsx-a11y`) จับของพื้นฐาน · axe ใน CI จับ contrast/role ·
คนจริงใช้คีย์บอร์ดล้วน + VoiceOver อย่างน้อยหนึ่งรอบต่อหน้า (เครื่องมืออัตโนมัติจับได้ราว 30–40% เท่านั้น)

---

## 7. App shell แบบ responsive

📁 `apps/web/src/components/shell/`

```
< 768px      header + bottom tab bar (ไม่มี sidebar)
768–1023px   icon rail 72px
≥ 1024px     sidebar 260px (ยุบเป็น rail ได้ด้วย `[`)
```

ทำด้วย class ล้วน ไม่มี JS วัดขนาดจอ:

```tsx
className={cn('hidden md:flex w-[72px]', expanded && 'lg:w-[260px]')}
```

→ HTML แรกจากเซิร์ฟเวอร์ถูกต้องทุกขนาดจอ ไม่มีการกระโดดหลัง hydrate

**Safe area (iPhone):** `pb-[env(safe-area-inset-bottom)]` ใต้ tab bar กันปุ่มจมใต้ home indicator

### จำสถานะ sidebar ด้วย Zustand persist

📁 `lib/stores/ui-store.ts` — `persist` middleware เขียนลง `localStorage` ให้อัตโนมัติ

⚠️ ค่าที่มาจาก `localStorage` ไม่มีบนเซิร์ฟเวอร์ → ถ้า render ตั้งแต่ HTML แรกจะ hydration mismatch
ที่นี่รอดเพราะ shell render หลัง session โหลดเสร็จ (ฝั่ง client เท่านั้น)
ถ้าวันหนึ่งย้าย shell ไปเป็น Server Component ต้องกลับมาคิดเรื่องนี้ใหม่

### `useSyncExternalStore` สำหรับสถานะออนไลน์

📁 `lib/use-online-status.ts` — hook ทางการของ React สำหรับ "ค่าที่อยู่นอก React และเปลี่ยนได้เอง"
(`navigator.onLine`) รับ 3 อย่าง: subscribe, อ่านค่าฝั่ง client, อ่านค่าฝั่ง server
ดีกว่า `useState + useEffect` เพราะไม่มีช่วงที่ค่าไม่ตรงกันระหว่าง render

---

## 8. URL คือ state

📁 `features/tasks/use-task-view.ts`

`/tasks?view=priority&list=today&q=auth`

| ถ้าเก็บใน... | refresh แล้ว | ส่งลิงก์ให้เพื่อน | ปุ่ม back           |
| ------------ | ------------ | ----------------- | ------------------- |
| `useState`   | หาย          | ไม่ได้            | ไม่ทำงาน            |
| URL          | อยู่         | ได้               | ทำงาน (ถ้าใช้ push) |

เลือก `router.replace` (ไม่ใช่ `push`) เพราะการเปลี่ยน filter ไม่ควรเพิ่มประวัติจนกด back ไม่ออก

**แยก pure function ออกมาเทสต์:** `buildTaskFilters(view, list, q, now)` ไม่แตะ React ไม่แตะ URL
รับ `now` เป็นพารามิเตอร์ → เทสต์ควบคุมเวลาได้ (กฎเดียวกับ 📁 `packages/core/src/time.ts`)

⚠️ `useSearchParams` ใน Next 15 ต้องอยู่ใต้ `<Suspense>` ไม่งั้น build ล้มตอน prerender
(📁 `app/(app)/tasks/page.tsx`)

---

## 9. Regex parser กับภาษาไทย

📁 `features/tasks/quick-capture-parser.ts`

```ts
const WORD = '[\\p{L}\\p{M}\\p{N}_.-]+';
new RegExp(`(^|\\s)([!#+])(${WORD})(?=\\s|$)`, 'gu');
```

- `\p{L}` = ตัวอักษรทุกภาษา · `\p{N}` = ตัวเลข · **`\p{M}` = mark** (สระบน/ล่าง วรรณยุกต์ไทย)
  ถ้าลืม `\p{M}`, `#ด่วนมาก` จะถูกตัดที่ "ด" เพราะ ่ ไม่ใช่ letter ในมาตรฐาน Unicode
- flag `u` จำเป็นเพื่อให้ `\p{...}` ใช้ได้
- `(^|\s)` นำหน้า → `C#` และ `1+1` ไม่ถูกตีความเป็น tag/project
- `\b` ใช้กับภาษาไทยไม่ได้ (ไทยไม่มีช่องว่างระหว่างคำ และ `\b` ยึดตาม `\w` ที่มีแต่ ASCII) → ใช้ lookahead `(?=\s|$)` แทน

🎤 _"ทำไมไม่ใช้ NL parser เลย?"_ → Phase 5 จะมี parser กลางที่ใช้ร่วมกับ ⌘K
ตอนนี้ regex 3 รูปแบบให้คุณค่า 80% ด้วยโค้ด 60 บรรทัดที่เทสต์ครบ และเปลี่ยนทีหลังได้ที่ไฟล์เดียว

---

## 10. Performance ที่ต้องระวังในงานดีไซน์

- **`backdrop-filter` แพง** — GPU ต้องเบลอทุกพิกเซลด้านหลังทุกเฟรมที่ scroll
  ใช้เฉพาะ top bar / tab bar / modal ห้ามใส่ในการ์ดที่อยู่ใน list ยาว
- **Bundle budget** — route แรก < 180 KB gzip (สเปก 8.10) · ตอนจบ Phase 2a `/tasks` = 164 KB
  เหตุผลที่ยังไม่ใส่ framer-motion (~30 KB) เพื่อแค่ animation ของ segmented control
- **ไอคอน** — `lucide-react` import ทีละตัว bundler ตัดตัวที่ไม่ใช้ทิ้ง (tree-shaking)
  ต่างจาก icon font ที่ต้องโหลดทั้งก้อนแม้ใช้ 10 ไอคอน

---

## ข้อเสียที่ยอมรับใน Phase นี้

- ยังไม่มี lint ห้ามใช้สี Tailwind ตรง ๆ (`text-gray-500`) — พึ่ง review
- Undo ใช้ `PATCH status=pending` ธรรมดา ไม่ได้ย้อนผลข้างเคียงอื่น (เช่น `completedAt` ยังไม่ถูกล้าง
  ถ้า API ไม่ล้างให้) — audit-log undo มาทีหลัง
- ไม่ได้ติดตั้ง `nuqs` ตามสเปก — hook เดียวทำหน้าที่แทน ถ้า URL state ซับซ้อนขึ้นค่อยเปลี่ยน

---

## แบบฝึกหัด

1. ห่อ `tokens.css` ด้วย `@layer base { ... }` แล้วเปิดหน้า Tasks — มุมการ์ดเป็นอย่างไร? อธิบายด้วยข้อ 3
2. ลบ `\p{M}` ออกจาก parser แล้วรันเทสต์ — เคสไหนพัง และพังเพราะอะไร
3. ใช้คีย์บอร์ดอย่างเดียว: เปลี่ยนมุมมองหน้า Tasks เป็น "ความสำคัญ" แล้วลบงานหนึ่งชิ้นผ่านเมนู ⋯
   นับว่ากด Tab กี่ครั้ง แล้วลองคิดว่าถ้าไม่มี roving tabindex จะกี่ครั้ง
4. คำนวณ contrast ของ `--accent` light (`#0071e3`) บน `--surface` (`#ffffff`) ด้วยมือหรือเครื่องมือ — ผ่าน AA ไหม
