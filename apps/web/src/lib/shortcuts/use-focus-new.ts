'use client';

import { useEffect } from 'react';

/**
 * ลิงก์ "เพิ่มงานแรก" / "บันทึกรายจ่ายแรก" (`?new=1` จากการ์ด Today และ "เริ่มต้นใช้งาน") → พาเคอร์เซอร์ไปช่องบันทึกด่วนเลย
 * คนที่ไม่รู้ปุ่มลัด `n` ไม่ต้องหาว่าต้องพิมพ์ตรงไหน · อ่าน URL ใน effect (ไม่ใช้ useSearchParams → หน้าไม่ต้องห่อ Suspense)
 */
export function useFocusNewOnParam(): void {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') !== '1') return;
    const id = requestAnimationFrame(() => {
      const target = [...document.querySelectorAll<HTMLElement>('[data-shortcut="new"]')].find(
        (el) => el.offsetParent !== null,
      );
      target?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, []);
}
