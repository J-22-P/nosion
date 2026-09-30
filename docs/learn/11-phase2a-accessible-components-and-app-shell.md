# 11 · Phase 2a — Component ที่ทุกคนใช้ได้ และโครงหน้าแอป (App Shell)

> บทที่แล้วคือ "สีมาจากไหน" บทนี้คือ **"ปุ่มหนึ่งปุ่มต้องทำอะไรบ้างถึงจะเรียกว่าเสร็จ"**
> และโครงหน้าแอปที่เปลี่ยนรูปตามขนาดจอโดยไม่ต้องใช้ JavaScript วัดจอ
>
> ประเด็นหลัก: **หน้าตาเป็นแค่ครึ่งเดียวของ component** อีกครึ่งคือคีย์บอร์ด, screen reader และ focus

อ่านคู่กับ: 📁 `docs/phases/phase-2a-design-refresh.md` ขั้น 3–4 · บทก่อนหน้า [10](./10-phase2a-design-system-and-theming.md)

---

## 1. Accessibility (a11y) คืออะไร และทำไมโปรแกรมเมอร์ต้องรู้

"a11y" = accessibility (a + 11 ตัวอักษร + y) — ทำให้คนที่ใช้อุปกรณ์/ร่างกายต่างกันใช้แอปได้:

| ผู้ใช้                         | ใช้อะไร                                                 | component ต้องรองรับ                       |
| ------------------------------ | ------------------------------------------------------- | ------------------------------------------ |
| ตาบอด / สายตาเลือนราง          | **Screen reader** (VoiceOver, NVDA) อ่านหน้าจอเป็นเสียง | ชื่อ, บทบาท, สถานะที่อ่านออกเสียงได้       |
| มือใช้เมาส์ไม่ได้ / power user | **คีย์บอร์ดล้วน**                                       | Tab ไปถึงได้ทุกจุด, มองเห็นว่าโฟกัสอยู่ไหน |
| ตาบอดสี                        | ตาปกติแต่แยกสีไม่ได้                                    | ไม่สื่อด้วยสีอย่างเดียว (บท 10 หัวข้อ 7)   |
| เวียนหัวจาก animation          | ตั้งค่า "ลดการเคลื่อนไหว" ในระบบ                        | เคารพ `prefers-reduced-motion`             |

เป้าหมายของโปรเจกต์: **WCAG 2.1 AA** (สเปก 8.8)

🎤 _"ทำไม a11y ถึงเป็นงานของ dev ไม่ใช่ designer?"_ → designer กำหนดสีและขนาดได้
แต่ role, ลำดับ focus, การดักปุ่มคีย์บอร์ด และสิ่งที่ screen reader อ่าน อยู่ในโค้ดทั้งหมด

---

## 2. Accessibility tree — สิ่งที่ screen reader "เห็น"

เบราว์เซอร์สร้างต้นไม้สองต้นจาก HTML:

```
DOM tree                          Accessibility tree
<button class="…">                 button "ลบงาน"
  <svg>…</svg>                       (svg ถูกซ่อนเพราะ aria-hidden)
  ลบงาน
</button>
```

แต่ละ node ใน accessibility tree มี 3 อย่าง:

- **Role** — มันคืออะไร (`button`, `checkbox`, `link`, `menu`)
- **Name** — ชื่อที่อ่านออกเสียง (มาจากข้อความข้างใน, `aria-label` หรือ `<label>`)
- **State** — สถานะ (`checked`, `expanded`, `pressed`, `current`)

VoiceOver อ่าน: _"ลบงาน, ปุ่ม"_ · ถ้าปุ่มมีแต่ไอคอนและไม่มี `aria-label` จะอ่านแค่ _"ปุ่ม"_ — ใช้ไม่ได้

### กฎข้อแรกของ ARIA

> **ถ้าใช้ HTML element ที่มีความหมายอยู่แล้วได้ ให้ใช้**

`<button>` ได้ฟรี: role=button, โฟกัสด้วย Tab ได้, กด Enter/Space แล้ว `onClick` ทำงาน
`<div onClick>` ไม่ได้อะไรเลย ต้องเพิ่ม `role`, `tabIndex`, ดักคีย์บอร์ดเอง — และคนมักลืม

ทุก component ใน Phase นี้เริ่มจาก `<button>` จริงเสมอ แล้วค่อยเสริม ARIA เฉพาะสิ่งที่ element ธรรมดาทำไม่ได้

### `aria-hidden` และ `sr-only`

| ต้องการ                              | ใช้                       | ตัวอย่างในโปรเจกต์                                       |
| ------------------------------------ | ------------------------- | -------------------------------------------------------- |
| ตาเห็น แต่ screen reader ไม่ต้องอ่าน | `aria-hidden="true"`      | ไอคอนตกแต่งทุกตัว (`<Icon aria-hidden="true" />`)        |
| screen reader อ่าน แต่ตาไม่เห็น      | class `sr-only`           | ชื่อเมนูตอน sidebar ยุบ, คำอธิบายวิธีพิมพ์ quick capture |
| ซ่อนทั้งคู่                          | `hidden` / `display:none` | ข้อความ "สร้างงาน" บนจอเล็ก                              |

⚠️ `display: none` ≠ `sr-only` — ถ้าใช้ `hidden` กับชื่อเมนูตอนยุบ sidebar
screen reader จะอ่านลิงก์ว่า _"ลิงก์"_ เฉย ๆ ไม่รู้ว่าไปไหน

---

## 3. Focus — ผู้ใช้คีย์บอร์ดอยู่ตรงไหน

### 3.1 `:focus` vs `:focus-visible`

- `:focus` — ติดทุกครั้งที่ element ได้โฟกัส (รวมถึงตอนคลิกเมาส์ → ขอบน้ำเงินโผล่ตอนคลิก คนบ่น)
- `:focus-visible` — เบราว์เซอร์ตัดสินว่า "ควรแสดง" ไหม: ใช้คีย์บอร์ด = แสดง, คลิกเมาส์ = ไม่แสดง

เราใช้ `focus-visible:shadow-[var(--focus-ring)]` ทุก component
📁 `globals.css` มี fallback `:focus-visible { outline: 2px solid var(--accent) }` สำหรับ element ที่ลืมใส่

⚠️ **ห้าม `outline: none` โดยไม่ใส่อะไรแทน** — คนใช้คีย์บอร์ดจะหลงทันที (WCAG 2.4.7)

### 3.2 Tab order

Tab เรียงตามลำดับใน DOM — ไม่ใช่ตามตำแหน่งบนจอ
ถ้าใช้ CSS ย้ายปุ่มไปด้านบน (`order: -1`) แต่ใน DOM อยู่ล่าง ผู้ใช้คีย์บอร์ดจะกระโดดสับสน
→ ใน 📁 `task-card.tsx` ปุ่มบนมือถือ "ย้ายลงแถวล่าง" ด้วย `flex-wrap` + `w-full` ซึ่งไม่เปลี่ยนลำดับ DOM

`tabIndex`:

- `0` = โฟกัสได้ตามลำดับ DOM · `-1` = โฟกัสได้ด้วยโค้ด (`el.focus()`) แต่ Tab ข้าม
- ค่าบวก (`1`, `2`) = **ห้ามใช้** ทำลายลำดับธรรมชาติทั้งหน้า

### 3.3 Skip link

📁 `components/shell/app-shell.tsx`

```tsx
<a href="#main" className="sr-only focus:not-sr-only …">
  ข้ามไปเนื้อหาหลัก
</a>
```

ผู้ใช้คีย์บอร์ดกด Tab ครั้งแรกเจอลิงก์นี้ → Enter → ข้ามเมนู 10 รายการไปที่เนื้อหาเลย
ซ่อนจนกว่าจะได้โฟกัส (คนใช้เมาส์ไม่เห็น) — WCAG 2.4.1

---

## 4. เดินทีละ component (ขั้นที่ 3 ของ Phase)

### 4.1 Button — ทำ variant ด้วย `cva`

📁 `components/ui/button.tsx`

```ts
const buttonVariants = cva(
  'inline-flex … active:scale-[.98] focus-visible:shadow-[var(--focus-ring)]',
  {
    variants: {
      variant: { primary: 'bg-primary text-primary-fg', secondary: '…', ghost: '…', danger: '…' },
      size: { sm: 'h-8 px-3', md: 'h-10 px-[18px]', lg: 'h-12 px-6', icon: 'size-9' },
      shape: { control: 'rounded-control', pill: 'rounded-chip', circle: 'rounded-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md', shape: 'control' },
  },
);
```

`cva` (class-variance-authority) = ฟังก์ชันที่รับ `{ variant, size }` แล้วคืนสตริง class
ข้อดี: TypeScript รู้ว่า variant มีค่าอะไรได้บ้าง → พิมพ์ `variant="outline"` (ที่ถูกลบไปแล้ว) = compile error
ซึ่งเป็นวิธีที่เราหาจุดใช้งานเก่าที่ต้องแก้ทั้งหมดตอนเปลี่ยน API ของปุ่ม

`forwardRef` — ส่ง `ref` ทะลุไปถึง `<button>` จริง จำเป็นเมื่อ component อื่นต้องสั่ง `.focus()` ปุ่มนี้
(เช่น เมนูคืนโฟกัสให้ปุ่มเปิดเมื่อปิด — หัวข้อ 4.5)

`type = 'button'` เป็นค่าเริ่มต้น — ⚠️ `<button>` ใน `<form>` มี type เริ่มต้นเป็น `submit`
ปุ่ม "ลบ chip" ใน quick capture จะส่งฟอร์มทันทีถ้าลืมข้อนี้

### 4.2 Checkbox — เมื่อ element จริงทำหน้าตาตาม mockup ไม่ได้

`<input type="checkbox">` แต่งให้เป็นวงกลม 20px ขอบ 1.5px ได้ยากข้ามเบราว์เซอร์
📁 `components/ui/checkbox.tsx` จึงใช้:

```tsx
<button type="button" role="checkbox" aria-checked={checked} onClick={() => onCheckedChange(!checked)}>
```

สิ่งที่ต้องชดเชยเอง vs สิ่งที่ได้ฟรีจาก `<button>`:

| ต้องการ                                                                                   | ได้จาก                                                       |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| โฟกัสด้วย Tab                                                                             | `<button>` ฟรี                                               |
| กด Space เพื่อติ๊ก                                                                        | `<button>` ฟรี (Space = click)                               |
| screen reader อ่านว่า "checkbox, ติ๊กแล้ว"                                                | `role="checkbox"` + `aria-checked`                           |
| ชื่อ                                                                                      | `aria-label="ทำเครื่องหมายว่าเสร็จ: ชื่องาน"` ที่ผู้ใช้ส่งมา |
| พื้นที่กด ≥ 24px (WCAG 2.2 ข้อ 2.5.8 — เกินเป้า 2.1 ของเราโดยตั้งใจ) ทั้งที่ตัวกล่อง 20px | `::before` ยื่นออกไป `-inset-1`                              |

### 4.3 Segmented control — radiogroup + roving tabindex

📁 `components/ui/segmented-control.tsx` — "รายการ | โปรเจกต์ | เกินกำหนด | ความสำคัญ"

พฤติกรรมเลือกได้ทีละอัน = **radio group** ตามความหมาย จึงใช้ `role="radiogroup"` และ `role="radio"`

ปัญหา: ถ้าทุกปุ่ม Tab ได้ ผู้ใช้ต้องกด Tab 4 ครั้งกว่าจะผ่านกลุ่มนี้ไป
**Roving tabindex** แก้โดย:

```tsx
tabIndex={selected ? 0 : -1}      // Tab เข้ากลุ่มได้จุดเดียว: ตัวที่เลือกอยู่
onKeyDown: ←/→ = เลื่อนและเลือก, Home/End = ตัวแรก/สุดท้าย, วนรอบได้
refs.current[next]?.focus()       // ย้ายโฟกัสเอง
```

นี่คือพฤติกรรมเดียวกับ radio เนทีฟของเบราว์เซอร์ และเป็น pattern มาตรฐานใน
**WAI-ARIA Authoring Practices Guide (APG)** — ก่อนทำ component ใหม่ให้เปิด APG ดู pattern ก่อนเสมอ

### 4.4 Chip และ Badge — ต่างกันที่ "กดได้ไหม"

- `Badge` 📁 `components/ui/badge.tsx` = `<span>` แสดงผลอย่างเดียว (priority, branch, PR #)
- `Chip` = `<button aria-pressed={selected}>` = **toggle button** — screen reader อ่าน _"#dev, ปุ่มสลับ, กดอยู่"_

แยกเป็นสอง component เพราะถ้ารวมกัน คนจะเผลอใส่ `onClick` ให้ `<span>` แล้วคีย์บอร์ดกดไม่ได้

### 4.5 Menu (⋯) — pattern ที่ซับซ้อนที่สุดใน Phase นี้

📁 `components/ui/menu.tsx` ตาม APG "Menu Button":

```
ปุ่ม ⋯  aria-haspopup="menu"  aria-expanded={open}  aria-controls={menuId}
   │ คลิก / Enter
   ▼
div role="menu"  →  button role="menuitem" tabIndex={-1}  ×N
```

| การกระทำ     | พฤติกรรม                       | ทำไม                                                             |
| ------------ | ------------------------------ | ---------------------------------------------------------------- |
| เปิด         | โฟกัสรายการแรกทันที            | ผู้ใช้คีย์บอร์ดเลือกต่อได้เลย                                    |
| ↑ ↓ Home End | เลื่อนระหว่างรายการ (วนรอบ)    | รายการเป็น `tabIndex=-1` Tab จะไม่วนอยู่ในเมนู                   |
| Esc          | ปิด **และคืนโฟกัสให้ปุ่ม ⋯**   | ไม่งั้นโฟกัสหายไปที่ `<body>` ผู้ใช้ต้องเริ่ม Tab ใหม่จากต้นหน้า |
| Tab          | ปิด ปล่อยโฟกัสไปต่อตามธรรมชาติ |                                                                  |
| คลิกนอกกล่อง | ปิด (ไม่ย้ายโฟกัส)             | ฟัง `pointerdown` ที่ `document` แล้วเช็ค `contains()`           |

⚠️ **Focus management คือส่วนที่คนลืมมากที่สุด** — เปิดได้ปิดได้ไม่พอ ต้องรู้ว่าโฟกัสไปไหนหลังปิดด้วย

### 4.6 StatusPill และ `aria-live`

📁 `components/ui/status-pill.tsx` — `role="status" aria-live="polite"`

**Live region** = พื้นที่ที่ screen reader จะอ่านเมื่อเนื้อหาเปลี่ยน โดยผู้ใช้ไม่ต้องย้ายโฟกัสไปที่นั่น

- `polite` = รอให้อ่านสิ่งที่กำลังอ่านอยู่จบก่อน (สถานะออนไลน์/ออฟไลน์)
- `assertive` = ขัดทันที (ใช้น้อยมาก)

⚠️ ตรงข้าม: นาฬิกาจับเวลาใน 📁 `features/tasks/focus-card.tsx` ใส่ `aria-live="off"`
— ถ้าปล่อยให้ประกาศ screen reader จะอ่านเวลาใหม่ทุกวินาทีไม่หยุด

### 4.7 Progress

📁 `components/ui/progress.tsx` — `role="progressbar"` + `aria-valuenow/min/max` + `aria-label`
กฎสีงบ (≥85% เตือน, ≥100% เกิน) แยกเป็น pure function 📁 `lib/progress.ts` พร้อม unit test
เพราะเป็น **กฎธุรกิจ** ที่หน้า Expenses/Today จะใช้ซ้ำ ไม่ใช่รายละเอียดการแสดงผล

### 4.8 ห้าสถานะของทุก list (ทบทวนจากบท 07)

Loading (skeleton รูปทรงเหมือนจริง) · Success · **Empty** · **Error** · **Stale**
Phase นี้ปรับ 📁 `components/shared/states.tsx` ให้ใช้ token ใหม่ และเพิ่มไอคอนให้ Empty/Error
เพื่อไม่ให้สื่อสถานะด้วยสีหรือข้อความอย่างเดียว

---

## 5. Motion และความชอบของผู้ใช้

📁 `globals.css`

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- ตั้งเป็น `.01ms` ไม่ใช่ `0` เพราะโค้ดบางส่วนรอ event `transitionend` — ถ้าเป็น 0 event อาจไม่ยิง
- ระยะเวลามาตรฐาน 180ms + `cubic-bezier(.2,.8,.2,1)` (เร็วตอนต้น นุ่มตอนท้าย) — token `--ease-standard`

---

## 6. Responsive design — พื้นฐาน

### 6.1 Viewport และ breakpoint

Tailwind เป็น **mobile-first**: class ไม่มี prefix = ทุกจอ, `md:` = ตั้งแต่ 768px ขึ้นไป, `lg:` = 1024px ขึ้นไป

```tsx
className = 'hidden md:flex'; // มือถือซ่อน, ตั้งแต่ tablet แสดง
className = 'max-md:flex-wrap'; // เฉพาะจอ < 768px
```

เขียนแบบ "ค่าพื้นฐานสำหรับจอเล็ก แล้วเพิ่มสำหรับจอใหญ่" ง่ายกว่ากลับด้าน เพราะจอเล็กมีข้อจำกัดมากที่สุด

### 6.2 Flexbox vs Grid (ย่อที่สุด)

- **Flex** = จัดของ **แถวเดียว** (แนวนอนหรือแนวตั้ง) — top bar, แถวปุ่ม, การ์ดงาน
- **Grid** = จัดของ **สองมิติ** — หน้า Tasks: `lg:grid-cols-12` sidebar กิน 3 คอลัมน์ เนื้อหา 9 คอลัมน์

⚠️ `min-w-0` บนลูกของ flex — ค่าเริ่มต้นของ flex item คือ `min-width: auto` = ห้ามแคบกว่าเนื้อหา
ชื่องานยาว ๆ จะดันการ์ดทะลุจอแทนที่จะ `truncate` → ใส่ `min-w-0` ทุกที่ที่มีข้อความยาวใน flex

### 6.3 `position: sticky` vs `fixed`

- top bar = `sticky top-0` — อยู่ในเนื้อหาปกติ แต่ติดขอบบนเมื่อ scroll ผ่าน
- bottom tab bar = `fixed bottom-0` — หลุดจากเนื้อหาไปติดจอเลย → เนื้อหาต้องเผื่อพื้นที่ด้านล่าง
  (`pb-[calc(88px+env(safe-area-inset-bottom))]` ใน `<main>`)

### 6.4 iPhone: safe area และ `dvh`

- **Safe area** — iPhone มี home indicator ด้านล่างและรอยบากด้านบน
  `env(safe-area-inset-bottom)` = ความสูงของส่วนที่ห้ามวางปุ่ม → tab bar เผื่อไว้ปุ่มจึงไม่จมใต้แถบ
- **`100vh` บนมือถือโกหก** — นับรวมแถบ URL ที่ซ่อน/แสดงได้ → หน้า "เต็มจอ" เลยล้นจอ
  `100dvh` (dynamic viewport height) = ความสูงที่มองเห็นจริง ณ ขณะนั้น → ใช้ `min-h-dvh` ทั้ง shell

---

## 7. App shell ทีละส่วน (ขั้นที่ 4 ของ Phase)

📁 `apps/web/src/components/shell/`

```
< 768px           768–1023px          ≥ 1024px
┌──────────┐      ┌──┬────────┐      ┌──────┬──────────┐
│ header   │      │▣ │ topbar │      │ Logo │ topbar   │
├──────────┤      │▢ ├────────┤      │ ▣ … │          │
│ เนื้อหา   │      │▢ │ เนื้อหา │      │ ▢ … │ เนื้อหา   │
├──────────┤      │  │        │      │ ⚙   │          │
│ tab bar  │      └──┴────────┘      └──────┴──────────┘
└──────────┘       rail 72px          sidebar 260px (ยุบเป็น rail ได้)
```

### 7.1 เปลี่ยนรูปด้วย CSS ล้วน — ไม่มี JS วัดจอ

📁 `sidebar.tsx`

```tsx
className={cn('hidden md:flex w-[72px]', expanded && 'lg:w-[260px]')}
// ชื่อเมนู:
<span className={cn('sr-only', expanded && 'lg:not-sr-only')}>
```

ถ้าใช้ JS (`window.innerWidth`) ตัดสิน: เซิร์ฟเวอร์ไม่รู้ขนาดจอ → HTML แรกผิด → hydrate แล้วกระโดด
ใช้ CSS: HTML เดียวถูกต้องทุกขนาดจอตั้งแต่ไบต์แรก

### 7.2 Config เมนูที่เดียว

📁 `nav.ts` — `PRIMARY_NAV`, `MOBILE_TABS`, `HUB_ITEMS` ใช้ข้อมูลชุดเดียว
หน้าที่ยังไม่มี (`ready: false`) แสดงเป็น "เร็ว ๆ นี้" + `aria-disabled` แทนลิงก์ที่พาไป 404

Tab bar มือถือมี 5 ช่องคงที่ตามสเปก: วันนี้ · งาน · การเงิน · ปฏิทิน · **สรุป**
"สรุป" 📁 `hub-view.tsx` รวมโมดูลที่ใช้น้อย (Workouts, Habits, Review, Settings) — จอมือถือมีที่จำกัด

### 7.3 จำสถานะ sidebar — Zustand `persist` และกับดัก hydration

📁 `lib/stores/ui-store.ts`

```ts
export const useUIStore = create<UIState>()(
  persist((set) => ({ sidebarCollapsed: false, toggleSidebar: () => set(s => ({ … })) }),
          { name: 'nosion:ui', partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }) }),
);
```

`persist` เขียน/อ่าน `localStorage` ให้อัตโนมัติ · `partialize` เลือกเฉพาะ field ที่ควรจำ

**Hydration** (ทบทวนจากบท 07): React ฝั่ง client ต้อง render ได้ผลเหมือน HTML ที่เซิร์ฟเวอร์ส่งมาเป๊ะ
แล้วค่อย "ต่อสาย" event เข้าไป ถ้าต่างกัน = hydration mismatch

⚠️ `localStorage` ไม่มีบนเซิร์ฟเวอร์ → ถ้า sidebar ยุบอยู่ client จะ render ต่างจาก server
ที่นี่ **รอดเพราะ shell render หลัง session โหลดเสร็จ** (ตอนแรกทั้ง server และ client แสดง skeleton เหมือนกัน)
ถ้าวันหนึ่งย้าย shell ไป render บนเซิร์ฟเวอร์ ต้องกลับมาแก้ข้อนี้ (เช่นเก็บใน cookie แทน)

### 7.4 ปุ่มลัด `[` — ไม่ดักตอนผู้ใช้พิมพ์

📁 `app-shell.tsx` → `isTypingTarget()` ข้ามถ้าโฟกัสอยู่ใน `input/textarea/select/contenteditable`
ไม่งั้นพิมพ์ `[` ในชื่องานแล้ว sidebar ยุบ

### 7.5 สถานะออนไลน์ — `useSyncExternalStore`

📁 `lib/use-online-status.ts`

```ts
return useSyncExternalStore(
  subscribe,
  () => navigator.onLine,
  () => true,
);
//                          ฟัง event   ค่าฝั่ง client        ค่าฝั่ง server
```

Hook ทางการของ React สำหรับ **"ค่าที่อยู่นอก React และเปลี่ยนเองได้"** (browser API, store ภายนอก)
ดีกว่า `useState + useEffect` เพราะ: ไม่มีช่วงที่ค่าผิดระหว่าง render แรกกับ effect,
และรองรับ concurrent rendering (React 18+) โดยไม่ "ฉีก" (tearing) — component สองตัวเห็นค่าไม่ตรงกัน

ค่าฝั่ง server = `true` — HTML แรกแสดง "Online" ไม่ใช่ "ออฟไลน์" ผิด ๆ แวบหนึ่ง

⚠️ `navigator.onLine = true` แปลว่า "ต่อ network ได้" ไม่ใช่ "API ของเราตอบ" (Wi-Fi ที่ต้อง login ก็ true)
Phase 7 จะผูก pill นี้กับ outbox ของ offline sync ที่รู้จริงว่า request สำเร็จไหม

### 7.6 Profile menu และปุ่มที่ยังไม่มีปลายทาง

- ⌘K ยังไม่มี (Phase 5) → กดแล้วขึ้น toast บอกตรง ๆ ดีกว่ากดแล้วเงียบ (ผู้ใช้จะคิดว่าแอปค้าง)
- ออกจากระบบย้ายเข้าเมนูโปรไฟล์ (desktop) และหน้า hub (มือถือ) — logic อยู่ใน `useLogout()` ที่เดียว

---

## 8. ทดสอบ a11y อย่างไร

| ชั้น     | เครื่องมือ                                                                           | จับอะไรได้                       |
| -------- | ------------------------------------------------------------------------------------ | -------------------------------- |
| ตอนเขียน | TypeScript + props บังคับ (`label` ของ `SegmentedControl`, `Progress` เป็น required) | ลืมตั้งชื่อ                      |
| CI       | axe (สเปก 8.8 — ตั้งใน Phase 2b) รันทั้งสองธีม                                       | contrast, role ผิด, ชื่อหาย      |
| คน       | คีย์บอร์ดล้วน + VoiceOver อย่างน้อยหนึ่งรอบต่อหน้า                                   | focus หาย, ลำดับแปลก, อ่านแล้วงง |

เครื่องมืออัตโนมัติจับปัญหา a11y ได้ราว 30–40% เท่านั้น ที่เหลือต้องใช้คนลองจริง

🎤 _"ลองอธิบาย a11y ของ component ที่เคยทำมาสักตัว"_ → เล่า Menu ในหัวข้อ 4.5:
role/state ที่ใส่, พฤติกรรมคีย์บอร์ด, และเรื่องคืนโฟกัส — แสดงว่ารู้เกิน "ใส่ aria-label"

---

## ข้อเสียที่ยอมรับ

- Checkbox ไม่ใช่ `<input>` จริง → ไม่ส่งค่าไปกับ `<form>` อัตโนมัติ (ตอนนี้ไม่มีฟอร์มไหนต้องการ)
- ยังไม่ใช้ framer-motion (สเปกให้ spring กับ segmented) — CSS transition ธรรมดา
- sidebar state ใช้ `localStorage` → ถ้าเปลี่ยนเป็น server render ต้องย้ายไป cookie
- ยังไม่มี axe ใน CI

---

## แบบฝึกหัดท้ายบท

1. เปิด VoiceOver (⌘F5) แล้วใช้ VO+→ อ่านการ์ดงานหนึ่งใบ — ได้ยินอะไรบ้าง? ลองลบ `aria-label` ของ Checkbox แล้วฟังใหม่
2. ใช้คีย์บอร์ดอย่างเดียว: เปลี่ยนมุมมองเป็น "ความสำคัญ" แล้วลบงานหนึ่งชิ้นผ่านเมนู ⋯
   นับจำนวนครั้งที่กด Tab แล้วคิดว่าถ้าไม่มี roving tabindex จะกี่ครั้ง
3. ใน 📁 `menu.tsx` ลบ `buttonRef.current?.focus()` ออก แล้วเปิด–ปิดเมนูด้วย Esc — `document.activeElement` คืออะไร?
4. เปลี่ยน `min-h-dvh` ใน shell เป็น `min-h-screen` แล้วเปิดบน iPhone Safari — ต่างกันอย่างไรเมื่อแถบ URL ย่อ/ขยาย
5. ทำไม `useOnlineStatus` คืน `true` ฝั่ง server? ลองเปลี่ยนเป็น `false` แล้วดู HTML ที่ server ส่งมา
