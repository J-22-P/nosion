import { describe, expect, it } from 'vitest';
import { loadConfig } from './env';

const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
};

describe('loadConfig', () => {
  it('ค่าว่างใน .env (KEY=) = ไม่ได้ตั้ง — ค่าที่ไม่บังคับไม่ทำให้ boot ล้ม', () => {
    const config = loadConfig({ ...BASE, VAPID_PUBLIC_KEY: '', RESEND_API_KEY: '', PORT: '' });
    expect(config.VAPID_PUBLIC_KEY).toBeUndefined();
    expect(config.RESEND_API_KEY).toBeUndefined();
    expect(config.PORT).toBe(3001); // ใช้ค่าเริ่มต้น
  });

  it('ค่าที่บังคับยังต้องมี — ว่าง = ขาด', () => {
    expect(() => loadConfig({ ...BASE, JWT_SECRET: '' })).toThrow(/JWT_SECRET/);
  });

  it('ค่าผิดรูปแบบยังถูกปฏิเสธ (ไม่ใช่แค่ว่าง)', () => {
    expect(() => loadConfig({ ...BASE, CRON_SECRET: 'สั้นไป' })).toThrow(/CRON_SECRET/);
  });
});
