import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../infra/config/env';
import { OAuthService } from './oauth.service';

const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
  GOOGLE_CLIENT_ID: 'google-id',
  GOOGLE_CLIENT_SECRET: 'google-secret',
  GITHUB_CLIENT_ID: 'github-id',
  GITHUB_CLIENT_SECRET: 'github-secret',
};

function service(env: Record<string, string>): OAuthService {
  // providers() อ่านแค่ config — dependency อื่นไม่ถูกเรียก
  return new OAuthService(null as never, null as never, null as never, loadConfig(env));
}

describe('OAuthService.providers — ENCRYPTION_KEY', () => {
  it('production ที่ไม่ได้ตั้ง ENCRYPTION_KEY (ได้ศูนย์ล้วนจากค่าเริ่มต้น) → ปิดทุกผู้ให้บริการ', () => {
    expect(service({ ...BASE, NODE_ENV: 'production' }).providers()).toEqual({
      google: false,
      github: false,
    });
  });

  it('production ที่ตั้งกุญแจแล้ว → เปิดตามค่า client', () => {
    const key = '0123456789abcdef'.repeat(4);
    expect(service({ ...BASE, NODE_ENV: 'production', ENCRYPTION_KEY: key }).providers()).toEqual({
      google: true,
      github: true,
    });
  });

  it('เครื่อง dev ใช้ค่าเริ่มต้นได้ตามเดิม', () => {
    expect(service({ ...BASE, NODE_ENV: 'development' }).providers()).toEqual({
      google: true,
      github: true,
    });
  });
});
