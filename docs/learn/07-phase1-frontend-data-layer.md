# 07 · Phase 1 — Frontend: React, Next.js และการจัดการข้อมูล

> ส่วนที่ผู้ใช้เห็น และเป็นส่วนที่ "ดูง่ายแต่ทำให้ดีจริงยาก"
> ประเด็นหลักของไฟล์นี้: **แยกข้อมูลจากเซิร์ฟเวอร์ ออกจากสถานะของหน้าจอ**

---

## 1. React ใน 5 นาที (สำหรับคนที่ยังไม่คุ้น)

### Component คือฟังก์ชันที่คืน UI

```tsx
function TaskRow({ title }: { title: string }) {
  return <li>{title}</li>;
}
```

`title` ที่รับเข้ามาเรียกว่า **props** — ข้อมูลที่ไหลจากแม่ลงลูกทางเดียว

### State คือข้อมูลที่เปลี่ยนแล้วต้องวาดใหม่

```tsx
const [text, setText] = useState('');
```

หลักการสำคัญของ React: **UI = f(state)**
เราไม่สั่ง "เปลี่ยนข้อความในช่องนี้" แต่เปลี่ยน state แล้ว React วาดใหม่ให้เอง
เรียกว่า declarative (ต่างจาก jQuery ที่เป็น imperative — สั่งทีละขั้น)

### Re-render

เมื่อ state เปลี่ยน React เรียกฟังก์ชัน component นั้นใหม่ แล้วเทียบผลลัพธ์กับของเดิม
(virtual DOM diffing) แล้วแก้ DOM จริงเฉพาะส่วนที่ต่าง

### Hooks และกฎ 2 ข้อ

ฟังก์ชันที่ขึ้นต้นด้วย `use` เรียกได้เฉพาะ:

1. ระดับบนสุดของ component (ห้ามอยู่ใน `if` หรือ loop)
2. ใน component หรือ hook อื่นเท่านั้น

เหตุผล: React จำ state ด้วย **ลำดับการเรียก** ถ้าลำดับเปลี่ยนระหว่าง render
state จะสลับกันมั่ว (`eslint-plugin-react-hooks` คอยจับให้)

`useEffect` = "ทำสิ่งนี้หลังวาดเสร็จ" ใช้กับ side effect เช่น redirect
📁 `apps/web/src/components/shell/app-shell.tsx` _(Phase 2a ย้ายมาจาก `components/shared/`)_

---

## 2. SPA, SSR และ RSC — ต่างกันอย่างไร

| รูปแบบ                            | เกิดอะไรขึ้น                                                        | ข้อดี                   | ข้อเสีย                      |
| --------------------------------- | ------------------------------------------------------------------- | ----------------------- | ---------------------------- |
| **SPA** (Create React App เดิม)   | ส่ง HTML ว่าง + JS ก้อนใหญ่ แล้ววาดในเบราว์เซอร์                    | โต้ตอบลื่น              | หน้าแรกช้า, SEO แย่          |
| **SSR**                           | เซิร์ฟเวอร์วาด HTML ส่งมาเลย แล้ว JS มา "ต่อสาย" (hydration)        | เห็นเนื้อหาเร็ว, SEO ดี | ต้องส่ง JS มา hydrate อยู่ดี |
| **RSC** (React Server Components) | บาง component รันบนเซิร์ฟเวอร์เท่านั้น **และไม่ส่ง JS ของมันมาเลย** | bundle เล็กลงจริง       | ต้องเข้าใจเส้นแบ่งให้ชัด     |

Next.js App Router ใช้ RSC เป็นค่าเริ่มต้น

### เส้นแบ่ง: `'use client'`

```tsx
'use client'; // บรรทัดแรกของไฟล์
```

- **ไม่มี** = Server Component — รันบนเซิร์ฟเวอร์ ใช้ `useState`/event handler **ไม่ได้**
  แต่อ่านฐานข้อมูลหรือใช้ความลับได้ และไม่กินขนาด bundle
- **มี** = Client Component — รันในเบราว์เซอร์ ใช้ state/effect/event ได้

ในโปรเจกต์เรา:

- 📁 `app/page.tsx` (หน้า landing) = Server Component → เนื้อหาคงที่ ไม่ต้องส่ง JS
- 📁 `app/(app)/tasks/page.tsx` = Client → ต้องมี filter ที่เปลี่ยนได้และ mutation

⚠️ กฎสำคัญ: Server Component นำเข้า Client Component ได้ แต่ **ทางกลับกันไม่ได้**
(เพราะโค้ดฝั่ง client รันบนเบราว์เซอร์ ซึ่งไม่มีทางเรียกโค้ดที่ควรอยู่บนเซิร์ฟเวอร์)

### Routing แบบโฟลเดอร์

```
app/
  page.tsx              → /
  (auth)/login/page.tsx → /login        ← (auth) เป็น route group ไม่โผล่ใน URL
  (app)/layout.tsx      → layout ร่วมของกลุ่มนี้ (sidebar + topbar)
  (app)/tasks/page.tsx  → /tasks
```

**Route group** `(ชื่อ)` มีไว้จัดกลุ่มไฟล์ให้ใช้ layout ร่วมกันโดยไม่กระทบ URL
เราใช้แยก "หน้าที่ต้องล็อกอิน" ออกจาก "หน้าสาธารณะ" อย่างชัดเจน

**Layout** ไม่ถูก unmount ตอนเปลี่ยนหน้าในกลุ่มเดียวกัน → sidebar ไม่กระพริบ

---

## 3. Server state กับ Client state — ห้ามปนกัน

นี่คือแนวคิดที่สำคัญที่สุดในไฟล์นี้

|                | Server state                   | Client state                              |
| -------------- | ------------------------------ | ----------------------------------------- |
| เป็นเจ้าของโดย | เซิร์ฟเวอร์ (เราถือแค่สำเนา)   | เบราว์เซอร์นี้เท่านั้น                    |
| ล้าสมัยได้ไหม  | **ได้ตลอดเวลา** (คนอื่นแก้ได้) | ไม่                                       |
| ตัวอย่าง       | รายการงาน, โปรไฟล์             | คำค้นที่กำลังพิมพ์, sidebar เปิด/ปิด, ธีม |
| เครื่องมือ     | **TanStack Query**             | **Zustand** / `useState`                  |

คนมักเอารายการงานจาก API ไปใส่ Redux แล้วต้องเขียนเองทั้ง loading, error,
cache, refetch, invalidate — ซึ่งเป็นงานที่ TanStack Query ทำมาให้หมดแล้ว

---

## 4. TanStack Query

### Query key คือกุญแจของทุกอย่าง

```ts
const entriesKey = (filters) => ['entries', filters] as const;
useQuery({ queryKey: entriesKey(filters), queryFn: () => entriesApi.list(filters) });
```

📁 `apps/web/src/features/entries/use-entries.ts`

key เปลี่ยน = คนละชุดข้อมูล = ดึงใหม่ (และเก็บของเก่าไว้ในแคช)
เปลี่ยน filter แล้วกดกลับ ข้อมูลเดิมจะขึ้นทันทีจากแคช

### `staleTime` ต่างจาก `gcTime`

- `staleTime` — นานแค่ไหนที่ถือว่าข้อมูล "ยังสด" (ไม่ต้องดึงใหม่) เราตั้ง 30 วินาที
- `gcTime` — นานแค่ไหนที่เก็บข้อมูลที่ไม่มีใครใช้ไว้ในหน่วยความจำก่อนทิ้ง

ตั้ง `staleTime: 0` (ค่าเริ่มต้น) = ยิง API ทุกครั้งที่ component mount → เปลืองโดยไม่จำเป็น

### `placeholderData` — กันหน้ากระพริบ

```ts
placeholderData: (previous) => previous;
```

ระหว่างรอผลของ filter ใหม่ ให้แสดงผลเก่าไปก่อน (แทนที่จะกลายเป็น skeleton ทั้งหน้า)

### Optimistic update — หัวใจของความรู้สึก "เร็ว"

ผู้ใช้ติ๊กงานเสร็จ ถ้ารอ API ตอบ 200ms ค่อยเปลี่ยน UI จะรู้สึกหน่วง
Optimistic update คือ **อัปเดตหน้าจอทันที แล้วค่อยยืนยันกับเซิร์ฟเวอร์**

📁 `use-entries.ts` → `useOptimisticEntryMutation()`

```ts
onMutate: async (vars) => {
  await queryClient.cancelQueries({ queryKey: key });          // 1. หยุด refetch ที่ค้างอยู่
  const previous = queryClient.getQueryData(key);              // 2. เก็บภาพเดิมไว้
  queryClient.setQueryData(key, { ...previous, data: applyLocally(previous.data, vars) });
  return { previous };                                          // 3. ส่งต่อให้ onError
},
onError: (error, _vars, context) => {
  queryClient.setQueryData(key, context.previous);             // 4. ย้อนกลับเมื่อพลาด
  toast.error(errorMessage);                                    // 5. บอกผู้ใช้ตามตรง
},
onSettled: () => queryClient.invalidateQueries({ queryKey: ['entries'] }),  // 6. sync ของจริง
```

ทั้ง 6 ขั้นจำเป็นหมด ⚠️ ขั้นที่ 1 มักถูกลืม: ถ้ามี refetch ค้างอยู่แล้วมันตอบกลับมาทีหลัง
มันจะเขียนทับผลลัพธ์ optimistic ของเรา → UI กระพริบกลับไปสถานะเก่า

**เราทำให้มันเป็นฟังก์ชันกลางตัวเดียว** แล้ว mutation ทุกตัว (complete/defer/delete/update)
ใช้ซ้ำ → ไม่มีโอกาสที่บางตัวลืมย้อนกลับเมื่อ error

### retry แบบมีเหตุผล

📁 `apps/web/src/app/providers.tsx`

```ts
retry: (failureCount, error) => {
  if (error instanceof ApiError && error.status < 500) return false; // 4xx ลองใหม่ก็เหมือนเดิม
  return failureCount < 2;
};
```

retry 401 หรือ 422 ซ้ำ ๆ คือการเสียทรัพยากรเปล่า และอาจไปชน rate limit เข้าอีก

---

## 5. Zustand — client state ที่เบา

```ts
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  setSession: (accessToken, user) => set({ accessToken, user, status: 'authenticated' }),
}));
```

📁 `apps/web/src/features/auth/auth-store.ts`

**ทำไมไม่ใช้ React Context:** Context ทำให้ทุก component ที่ subscribe อยู่ re-render
เมื่อค่าใดค่าหนึ่งเปลี่ยน ส่วน Zustand ให้เลือกเฉพาะส่วนที่สนใจได้:

```ts
const setSession = useAuthStore((s) => s.setSession); // เปลี่ยน user แล้วตัวนี้ไม่ re-render
```

**ทำไมไม่ใช้ Redux:** Redux มี boilerplate เยอะ (action, reducer, dispatch) ซึ่งคุ้ม
เมื่อ state ซับซ้อนมากและต้องการ time-travel debugging — ที่นี่เรามี client state
แค่ token/user/ธีม จึงไม่คุ้ม

### จุดเชื่อมที่ออกแบบไว้ให้ไม่เป็นวงกลม

api client ต้องอ่าน token จาก store แต่ store ก็ import api client → import วน
แก้ด้วยการฉีดฟังก์ชันเข้าไปแทน:

```ts
bindTokenStore(
  () => useAuthStore.getState().accessToken,
  (token) => useAuthStore.getState().setToken(token),
);
```

📁 `apps/web/src/lib/api-client.ts` — นี่คือ Dependency Inversion แบบเดียวกับฝั่ง backend

---

## 6. ฟอร์มด้วย React Hook Form + Zod

### Controlled vs Uncontrolled

- **Controlled** — ทุกตัวอักษรที่พิมพ์ทำให้ re-render ทั้งฟอร์ม (`useState` ต่อช่อง)
- **Uncontrolled** — ปล่อยให้ DOM ถือค่าไว้ อ่านตอน submit → เร็วกว่ามากเมื่อฟอร์มใหญ่

React Hook Form ใช้แบบ uncontrolled เป็นหลัก จึง re-render น้อย

```tsx
const form = useForm<LoginFormValues, unknown, LoginInput>({
  resolver: zodResolver(loginSchema),
});
<Input {...form.register('email')} />;
```

📁 `apps/web/src/features/auth/auth-form.tsx`

**schema เดียวกับ backend** → กฎ "รหัสผ่าน 12 ตัว" เขียนที่เดียว

### ผูก error จากเซิร์ฟเวอร์กลับเข้าช่อง

```ts
for (const [path, message] of Object.entries(error.fieldErrors())) {
  setError(path as Path<T>, { type: 'server', message });
}
```

`errors[].path` ที่มาจาก Problem Details ([ไฟล์ 06](./06-phase1-api-design-and-validation.md))
ตรงกับชื่อ field พอดี → error จากเซิร์ฟเวอร์ไปโผล่ใต้ช่องที่ผิดจริง ไม่ใช่ toast ลอย ๆ

---

## 7. Tailwind CSS v4 และ design token

### Utility-first คืออะไร

แทนที่จะตั้งชื่อ class แล้วไปเขียน CSS ที่อื่น เราประกอบจาก utility เล็ก ๆ ในที่เดียว

```tsx
<div className="flex items-center gap-3 px-4 py-3">
```

ข้อดี: ไม่ต้องคิดชื่อ class, ไม่มี CSS ตายค้างในโปรเจกต์, เห็นสไตล์พร้อมโครงสร้าง
ข้อเสีย: class ยาว — แก้ด้วยการแยกเป็น component เมื่อซ้ำ (เช่น `Button`)

### Design token — ชั้นที่อยู่เหนือ Tailwind

📁 `packages/ui/src/tokens.css`

```css
:root {
  --module-task: #6366f1;
  --module-expense: #10b981;
  --radius: 0.625rem;
  --background: #ffffff;
}
.dark {
  --background: #0b1120;
}
```

ทำไมไม่เขียน `bg-indigo-500` ตรง ๆ: เพราะ "สีของโมดูล task" กับ "สี indigo" ไม่ใช่เรื่องเดียวกัน
วันที่อยากเปลี่ยนสีประจำโมดูล เราแก้ที่เดียวแล้วเปลี่ยนทั้ง badge, ปฏิทิน และกราฟ

โหมดมืดทำงานด้วยการประกาศค่าใหม่ใต้ `.dark` — component ไม่ต้องรู้เรื่องธีมเลย

> **อัปเดต Phase 2a:** token ชุดนี้ถูกแทนด้วยชุด v1.1 (Monochrome + Apple Blue) และตัดสีประจำโมดูลออก
> หลักการยังเหมือนเดิม — อ่านต่อที่ [บท 10](./10-phase2a-design-system-and-theming.md)

### Tailwind v4 ต่างจาก v3 ตรงไหน

v4 ตั้งค่าใน CSS แทน `tailwind.config.js`:

```css
@import 'tailwindcss';
@custom-variant dark (&:where(.dark, .dark *));
@theme inline {
  --color-background: var(--background);
}
```

📁 `apps/web/src/app/globals.css`

### `cn()` — รวม class ให้ตัวหลังชนะ

```ts
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

ถ้าไม่มี `twMerge` การเขียน `className="px-4"` ทับ component ที่มี `px-2` อยู่แล้ว
จะได้ทั้งสองคลาส แล้วผลลัพธ์ขึ้นอยู่กับลำดับใน CSS ซึ่งเดาไม่ได้

---

## 8. ห้าสถานะที่ทุกลิสต์ต้องมี

คนส่วนใหญ่ทำแค่สองอันแรก:

| สถานะ        | ต้องแสดงอะไร                                                 | ที่ไหนในโค้ด       |
| ------------ | ------------------------------------------------------------ | ------------------ |
| 1. Loading   | **skeleton ที่มีรูปร่างเหมือนของจริง** ไม่ใช่ spinner กลางจอ | `TaskListSkeleton` |
| 2. Success   | ข้อมูลปกติ                                                   | `TaskList`         |
| 3. **Empty** | อธิบาย + ปุ่มพาไปทำต่อ ("ยังไม่มีงาน · เพิ่มงานแรก")         | `EmptyState`       |
| 4. **Error** | บอกว่าพลาดอะไร + ปุ่มลองใหม่                                 | `ErrorState`       |
| 5. **Stale** | มีของเก่าในแคชแต่ refetch พลาด → แสดงของเก่า + แถบเตือน      | `StaleBanner`      |

📁 `apps/web/src/components/shared/states.tsx` และการใช้งานที่ `features/tasks/task-board.tsx` _(Phase 2a)_

```ts
const hasStaleData = query.isError && query.data !== undefined;
```

เหตุผลที่ skeleton ควรเหมือนของจริง: ลด **layout shift** (เนื้อหากระโดดตอนโหลดเสร็จ)
ซึ่งเป็นหนึ่งในตัวชี้วัด Core Web Vitals (CLS) ที่มีผลต่อคะแนน Lighthouse

---

## 9. Accessibility (a11y) — ขั้นต่ำที่ควรทำ

ไม่ใช่เรื่องการกุศล แต่เป็นคุณภาพของ UI และมีผลต่อ SEO ด้วย

- **ปุ่มที่มีแต่ไอคอนต้องมี `aria-label`** ไม่งั้น screen reader อ่านว่า "button" เฉย ๆ

  ```tsx
  <Button aria-label={`เลื่อน ${entry.title} ไปพรุ่งนี้`}>
  ```

- **Semantic HTML** — ใช้ `<nav>`, `<main>`, `<ul>/<li>` ไม่ใช่ `<div>` ทั้งหมด
- **`aria-current="page"`** บอกว่าเมนูไหนคือหน้าปัจจุบัน
- **focus ring ต้องมองเห็น** — เราตั้งไว้ใน `globals.css` ห้ามเขียน `outline: none` ลอย ๆ
- **`role="alert"`** สำหรับข้อความ error → screen reader ประกาศทันทีโดยไม่ต้องย้าย focus
- **`prefers-reduced-motion`** — ผู้ใช้บางคนเวียนหัวกับ animation เราปิดให้เขา

---

## 10. ประสิทธิภาพ

หลังรัน `pnpm --filter @nosion/web build` จะเห็นตาราง:

```
Route (app)                    Size     First Load JS
┌ ○ /                          3.05 kB  127 kB
├ ○ /tasks                     8.97 kB  138 kB
+ First Load JS shared by all           102 kB
```

- **First Load JS** = JS ทั้งหมดที่ต้องโหลดก่อนหน้านั้นใช้งานได้ → ยิ่งน้อยยิ่งดี
  (เกณฑ์ที่ยอมรับกันคือ < 200 kB)
- `○ (Static)` = หน้าถูก prerender ตั้งแต่ตอน build → เสิร์ฟเร็วมาก

เทคนิคที่ใช้:

- Server Component เท่าที่ทำได้ (JS ของมันไม่ถูกส่งมาเลย)
- `next/font` ฝังฟอนต์ตอน build → ไม่มีคำขอไป Google ตอนผู้ใช้เปิดเว็บ
  (ดีทั้งความเร็วและความเป็นส่วนตัว)
- `output: 'standalone'` ทำให้ image production เล็กลงมาก

---

## แบบฝึกหัดท้ายบท

1. เปิดหน้า `/tasks` แล้วเปิด DevTools → Network → ตั้ง throttling เป็น "Slow 3G"
   ติ๊กงานให้เสร็จ สังเกตว่า UI เปลี่ยน **ก่อน** คำขอจะเสร็จ
2. ปิด API (`docker compose stop api`) แล้วกดติ๊กงาน — ดูว่ามันย้อนกลับและขึ้น toast
3. ปิด API ตั้งแต่ก่อนโหลดหน้า แล้วดู `ErrorState`; จากนั้นโหลดหน้าให้สำเร็จก่อนแล้วค่อยปิด API
   แล้ว refetch — ดู `StaleBanner`
4. เพิ่ม `'use client'` ลงใน `app/page.tsx` แล้ว build ใหม่ เทียบตัวเลข First Load JS
5. ลบ `aria-label` ออกจากปุ่มไอคอนสักปุ่ม แล้วลองใช้ VoiceOver/Narrator ฟังดู
