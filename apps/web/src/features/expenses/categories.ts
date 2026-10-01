import type { ExpenseCategory } from '@nosion/contracts';
import {
  BookOpen,
  Car,
  Clapperboard,
  CreditCard,
  HeartPulse,
  Home,
  PiggyBank,
  Plug,
  Repeat,
  ShoppingBag,
  Tag,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';

/** ชื่อ + ไอคอนของหมวด — ไอคอนเป็นตัวบอกหมวด ไม่ใช่สี (v1.1 ตัดสีรุ้ง) */
export const CATEGORY: Record<ExpenseCategory, { label: string; icon: LucideIcon }> = {
  food: { label: 'อาหาร', icon: UtensilsCrossed },
  transport: { label: 'เดินทาง', icon: Car },
  housing: { label: 'ที่พัก', icon: Home },
  utilities: { label: 'สาธารณูปโภค', icon: Plug },
  health: { label: 'สุขภาพ', icon: HeartPulse },
  entertainment: { label: 'บันเทิง', icon: Clapperboard },
  shopping: { label: 'ช้อปปิ้ง', icon: ShoppingBag },
  education: { label: 'การศึกษา', icon: BookOpen },
  subscription: { label: 'สมาชิกรายเดือน', icon: Repeat },
  debt: { label: 'หนี้สิน', icon: CreditCard },
  savings: { label: 'เงินออม', icon: PiggyBank },
  other: { label: 'อื่น ๆ', icon: Tag },
};

export const PAYMENT_LABEL = {
  cash: 'เงินสด',
  card: 'บัตร',
  transfer: 'โอน',
  ewallet: 'e-Wallet',
  other: 'อื่น ๆ',
} as const;
