import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // alias เดียวกับ tsconfig paths — เทสต์ import โมดูลที่ใช้ @/ ได้
  // tsconfig ใช้ jsx: preserve (ให้ Next แปลงเอง) → เทสต์ .tsx ต้องบอก esbuild ให้ใช้ runtime อัตโนมัติ
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
  },
});
