import { describe, expect, it } from 'vitest';
import { findNosionRefs, nosionRef } from './github';

describe('findNosionRefs — อ้างถึงงานจาก PR', () => {
  const id = 'tz4a98xxat96iws9zmbrgj3a';

  it('เจอในชื่อ/คำอธิบาย/branch · ไม่สนตัวพิมพ์ · ไม่ซ้ำ', () => {
    expect(
      findNosionRefs(
        `แก้ refresh (${nosionRef(id)})`,
        `Closes NOSION:${id.toUpperCase()}`,
        `feature/nosion-${id}`,
      ),
    ).toEqual([id]);
  });

  it('หลายงานใน PR เดียว · ข้าม null', () => {
    const other = 'k0abcdefghijklmnopqrstuv';
    expect(findNosionRefs(null, `nosion:${id} และ nosion#${other}`, undefined)).toEqual([
      id,
      other,
    ]);
  });

  it('ไม่นับข้อความที่ไม่ใช่รหัสงาน', () => {
    expect(findNosionRefs('nosion: ดีมาก', 'nosion:short', 'see nosion.dev')).toEqual([]);
  });
});
