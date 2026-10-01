import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // NestJS ใช้ decorator + emitDecoratorMetadata → ต้อง transform ด้วย SWC ไม่ใช่ esbuild
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/**/*.int-spec.ts'],
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 60_000,
          // ทุกไฟล์ truncateAll() ฐานเดียวกัน → ต้องรันทีละไฟล์ ไม่งั้น TRUNCATE ชน INSERT ของอีกไฟล์ (deadlock 40P01)
          // ⚠️ fileParallelism ใช้ใน projects ไม่ได้ (vitest 3 ถือเป็น NonProjectOptions → ถูกเมินเงียบ ๆ)
          //    singleFork เป็น option ระดับ project ที่ pool อ่านจริง
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/**/*.module.ts', 'src/**/index.ts'],
    },
  },
});
