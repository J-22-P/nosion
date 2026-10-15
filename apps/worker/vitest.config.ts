import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.spec.ts'], environment: 'node' } },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/**/*.int-spec.ts'],
          environment: 'node',
          // log ของ pipeline (ส่งสำเร็จ/ล้ม) ทำให้ผลเทสต์อ่านยาก — เทสต์ตรวจจาก DB อยู่แล้ว
          env: { LOG_LEVEL: 'silent' },
          testTimeout: 30_000,
          hookTimeout: 60_000,
          // ใช้ฐานเดียวกับ integration ของ API — turbo รันต่อจาก API (turbo.json) และไฟล์ในนี้รันทีละไฟล์
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
});
