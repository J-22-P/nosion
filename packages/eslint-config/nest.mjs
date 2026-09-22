import boundaries from 'eslint-plugin-boundaries';
import base from './base.mjs';

/**
 * กฎเหล็กของสถาปัตยกรรม (สเปกหัวข้อ 3.3) — บังคับด้วย lint ไม่ใช่ความตั้งใจดี
 *
 *  1. core/ ห้าม import จาก modules/            → boundaries/element-types
 *  2. modules/* ห้าม import ข้ามโมดูล            → boundaries + capture family
 *  3. modules/* สื่อสารกันผ่าน event bus เท่านั้น → ผลจากกฎข้อ 2
 *  4. Controller ห้ามเรียก Prisma ตรง             → no-restricted-imports ใน *.controller.ts
 *  5. Domain logic ห้าม import @nestjs/*          → no-restricted-imports ใน core/ (ยกเว้น DI decorator)
 */
export default [
  ...base,
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      // boundaries ต้องแปลง import path เป็นไฟล์จริงก่อน จึงต้องบอก resolver ของ TypeScript
      'import/resolver': {
        typescript: { alwaysTryTypes: true, project: './tsconfig.json' },
        node: { extensions: ['.ts', '.js'] },
      },
      'boundaries/include': ['src/**/*.ts'],
      'boundaries/elements': [
        { type: 'common', pattern: 'src/common/**' },
        { type: 'infra', pattern: 'src/infra/**' },
        { type: 'core', pattern: 'src/core/**' },
        { type: 'auth', pattern: 'src/auth/**' },
        { type: 'entries', pattern: 'src/entries/**' },
        { type: 'module', pattern: 'src/modules/*', capture: ['family'], mode: 'folder' },
        { type: 'root', pattern: 'src/*.ts', mode: 'file' },
      ],
    },
    rules: {
      /**
       * NestJS ใช้ emitDecoratorMetadata: `constructor(private x: FooService)` ต้องมี
       * reference ของ FooService อยู่ตอน runtime เพื่อให้ DI container หาค่าเจอ
       * ถ้าบังคับเป็น `import type` เมื่อไร DI จะพังทันทีตอนรัน ทั้งที่ compile ผ่าน
       */
      '@typescript-eslint/consistent-type-imports': 'off',
      'boundaries/no-unknown-files': 'off',
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: ['common'], allow: ['common'] },
            { from: ['infra'], allow: ['common', 'infra'] },
            // กฎข้อ 1: core เรียก infra/common ได้ แต่ไม่รู้จัก modules
            { from: ['core'], allow: ['common', 'infra', 'core'] },
            { from: ['auth'], allow: ['common', 'infra', 'core', 'auth'] },
            // entries ทำงานกับโมดูลผ่าน registry เท่านั้น จึงไม่ import modules ตรง ๆ
            { from: ['entries'], allow: ['common', 'infra', 'core', 'entries'] },
            // กฎข้อ 2: โมดูลเห็นได้เฉพาะตัวเอง
            {
              from: ['module'],
              allow: ['common', 'infra', 'core', ['module', { family: '${from.family}' }]],
            },
            {
              from: ['root'],
              allow: ['root', 'common', 'infra', 'core', 'auth', 'entries', 'module'],
            },
          ],
        },
      ],
    },
  },
  {
    // กฎข้อ 5 — domain logic ทดสอบได้โดยไม่ต้อง bootstrap NestJS
    // ยกเว้นไฟล์ *.module.ts ซึ่งเป็นชั้น wiring ของ DI ไม่ใช่ domain logic
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/**/*.module.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nestjs/*', '!@nestjs/common'],
              message:
                'Domain logic ห้ามผูกกับ NestJS — อนุญาตเฉพาะ @nestjs/common สำหรับ decorator DI',
            },
            {
              group: ['@prisma/client', '../infra/prisma/*', 'src/infra/prisma/*'],
              message:
                'core/ ทำงานกับ domain type เท่านั้น — ให้ service ชั้นนอกจัดการ persistence',
            },
          ],
        },
      ],
    },
  },
  {
    // กฎข้อ 4 — Controller ห้ามแตะ Prisma
    files: ['src/**/*.controller.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@prisma/client', '**/prisma.service', '**/infra/prisma/**'],
              message: 'Controller ห้ามเรียก Prisma ตรง — ต้องผ่าน Service เสมอ',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts', 'test/**/*.ts', 'prisma/**/*.ts'],
    rules: { 'boundaries/element-types': 'off', 'no-restricted-imports': 'off' },
  },
];
