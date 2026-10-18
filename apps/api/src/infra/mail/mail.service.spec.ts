import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/env';
import { MailService } from './mail.service';

const APP_PASSWORD = 'cwbn wnho bzhq vumc';

describe('MailService ตั้งค่าอีเมลผิด', () => {
  afterEach(() => vi.restoreAllMocks());

  it('SMTP_URL เป็นรหัสผ่านแอปเปล่า ๆ → สร้างได้ (API ไม่ล่ม) · log บอกค่าไหนผิด โดยไม่มีรหัสผ่าน', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const config = {
      MAIL_DRIVER: 'smtp',
      SMTP_URL: APP_PASSWORD,
      EMAIL_FROM: 'NOSION <noreply@nosion.dev>',
      APP_URL: 'http://localhost:3000',
    } as AppConfig;

    const service = new MailService(config);

    expect(service.transport.problem).toMatch(/SMTP_URL ใช้ไม่ได้/);
    const logged = error.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toMatch(/SMTP_URL ใช้ไม่ได้: ไม่ใช่ URL/);
    expect(logged).toContain('(ไม่ใช่ URL · ยาว 19 ตัวอักษร)');
    expect(logged).not.toContain('cwbn');
  });
});
