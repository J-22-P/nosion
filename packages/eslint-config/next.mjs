import nextPlugin from '@next/eslint-plugin-next';
import reactPlugin from 'eslint-plugin-react';
import hooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';
import base from './base.mjs';

export default [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
      react: reactPlugin,
      'react-hooks': hooksPlugin,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...hooksPlugin.configs.recommended.rules,
      'react/jsx-key': 'error',
      'react/self-closing-comp': 'error',
      // ชั้น UI ห้ามเรียก fetch ตรง — ต้องผ่าน features/*/api เพื่อให้ cache key คุมได้ที่เดียว
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['**/prisma/**'], message: 'Frontend ห้ามแตะ Prisma' }],
          // index ของ @nosion/core พา rrule (~13 kB gzip, CJS tree-shake ไม่ได้) เข้าทุกหน้าที่ใช้
          paths: [
            {
              name: '@nosion/core',
              message:
                "import เฉพาะ subpath เช่น '@nosion/core/money' — index พา rrule เข้า bundle",
            },
          ],
        },
      ],
    },
  },
];
