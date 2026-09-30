# ADR-009: Monochrome design system + dual theme และจุดที่ไม่ทำตาม mockup

- **สถานะ:** ยอมรับแล้ว
- **วันที่:** 2026-09-30

## บริบท

Mockup ชุด v1.1 (Stitch · Apple-inspired) เปลี่ยนภาษาภาพทั้งแอป: จากธีม indigo + สีรุ้งประจำโมดูล
เป็นขาวดำเกือบทั้งหมด มีสองธีมที่ออกแบบมาเท่ากัน (dark = Monochrome Studio OS, light = Precision OS)
แต่ mockup เป็นภาพนิ่งที่ออกแบบแยกกันสองชุด — ใช้ฟอนต์ต่างกัน, บางสีไม่ผ่าน contrast,
และใช้ Material Symbols ที่หนัก ~300 KB

## การตัดสินใจ

1. **Token ชุดเดียว สองค่า** — ทุกสีเป็น CSS variable ใน `packages/ui/src/tokens.css`
   (`:root` = light, `.dark` = dark) แล้ว map เข้า Tailwind ด้วยชื่อตามบทบาท (`bg-surface`, `text-fg-secondary`)
   component ไม่มีโค้ดแยกตามธีม
2. **สีมีความหมายเท่านั้น** — accent / danger / warning / success · ตัดสีประจำโมดูลออก
   ใช้ไอคอน + prefix (`T:` `E:` `W:` `H:`) แทน
3. **ธีมเริ่มต้น = system** เลือกได้ system / light / dark ผ่าน `next-themes` (ไม่มี flash)
4. **จุดที่ไม่ทำตาม mockup**

   | mockup                                   | ใช้จริง                               | เหตุผล                                                          |
   | ---------------------------------------- | ------------------------------------- | --------------------------------------------------------------- |
   | `#86868b` เป็นข้อความรองบนพื้นขาว        | `#6e6e73`                             | 3.6:1 ไม่ผ่าน AA 4.5:1                                          |
   | accent `#0071e3` บนพื้นดำ                | `#2997ff`                             | 3.6:1 บนพื้นเข้ม                                                |
   | Plus Jakarta Sans (light) / Inter (dark) | Inter ทั้งสองธีม + IBM Plex Sans Thai | ลด request, ตัวเลขกว้างเท่ากันเมื่อสลับธีม, Inter ไม่มีอักษรไทย |
   | Material Symbols                         | `lucide-react`                        | tree-shake ได้ ใช้อยู่แล้ว                                      |
   | FAB บนมือถือ                             | ไม่มี                                 | บังการ์ดล่างสุด — quick-add อยู่ใน hero/การ์ดแทน                |

## ผลที่ตามมา

**ได้:**

- เพิ่มธีมที่สามได้ด้วยการเพิ่ม selector เดียวใน `tokens.css`
- contrast ผ่าน AA ทั้งสองธีมตั้งแต่ระดับ token ไม่ต้องไล่แก้ราย component
- โมดูลใหม่ไม่ต้อง "จองสี" — ประกาศไอคอน + prefix ก็พอ

**เสีย:**

- หน้าตาเพี้ยนจาก mockup ในจุดที่ตั้งใจ (ข้อความรองเข้มขึ้นเล็กน้อยใน light) — ต้องอธิบายเวลาเทียบภาพ
- ทุก component ต้องเขียนด้วย utility ตามบทบาท (`text-fg-secondary`) ห้ามใช้สี Tailwind ตรง ๆ (`text-gray-500`)
  ซึ่งยังไม่มี lint บังคับ — พึ่ง code review ไปก่อน
- ชื่อ token กับชื่อ theme key ของ Tailwind ซ้ำกัน (`--radius-card`) ทำงานได้เพราะ `tokens.css` เป็น unlayered
  ถ้ามีคนย้ายไฟล์เข้า `@layer` จะเกิด var วนซ้ำ — บันทึกไว้ใน comment ของ `globals.css`
