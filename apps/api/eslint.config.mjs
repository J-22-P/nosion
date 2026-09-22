import nest from '@nosion/eslint-config/nest';

export default [
  { ignores: ['dist/**', 'coverage/**'] },
  ...nest,
  {
    // seed เป็นสคริปต์ CLI — การพิมพ์ผลลัพธ์ออกจอคือหน้าที่ของมัน
    files: ['prisma/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
];
