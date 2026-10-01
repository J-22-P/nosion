import type { ExpenseCategory } from '@nosion/contracts';

/** ชื่อหมวดภาษาไทยสำหรับข้อความสรุป (UI มีชุดของตัวเองพร้อมไอคอน) */
export const CATEGORY_LABEL_TH: Record<ExpenseCategory, string> = {
  food: 'อาหาร',
  transport: 'เดินทาง',
  housing: 'ที่พัก',
  utilities: 'สาธารณูปโภค',
  health: 'สุขภาพ',
  entertainment: 'บันเทิง',
  shopping: 'ช้อปปิ้ง',
  education: 'การศึกษา',
  subscription: 'สมาชิกรายเดือน',
  debt: 'หนี้สิน',
  savings: 'เงินออม',
  other: 'อื่น ๆ',
};
