import { describe, expect, it } from 'vitest';
import { updateSettingsSchema } from './organization';

describe('updateSettingsSchema — เวลาแบบ HH:mm', () => {
  it.each(['00:00', '07:05', '23:59'])('%s ผ่าน', (t) => {
    expect(updateSettingsSchema.safeParse({ dailyDigestTime: t }).success).toBe(true);
  });

  it.each(['24:00', '25:99', '7:00', '07:60', '0700', ''])('%j ไม่ผ่าน', (t) => {
    expect(updateSettingsSchema.safeParse({ quietHoursStart: t }).success).toBe(false);
  });
});
