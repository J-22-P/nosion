import base from '@nosion/eslint-config/base';

export default [
  { ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/node_modules/**', '**/.turbo/**'] },
  ...base,
];
