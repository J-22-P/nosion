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
import { tr } from '@/i18n/current';

/** ไอคอนของหมวด — ไอคอนเป็นตัวบอกหมวด ไม่ใช่สี (v1.1 ตัดสีรุ้ง) */
const CATEGORY_ICON: Record<ExpenseCategory, LucideIcon> = {
  food: UtensilsCrossed,
  transport: Car,
  housing: Home,
  utilities: Plug,
  health: HeartPulse,
  entertainment: Clapperboard,
  shopping: ShoppingBag,
  education: BookOpen,
  subscription: Repeat,
  debt: CreditCard,
  savings: PiggyBank,
  other: Tag,
};

/** ชื่อ (ตามภาษาปัจจุบัน — getter อ่านตอนใช้) + ไอคอนของหมวด */
export const CATEGORY = Object.fromEntries(
  (Object.keys(CATEGORY_ICON) as ExpenseCategory[]).map((key) => [
    key,
    {
      icon: CATEGORY_ICON[key],
      get label() {
        return tr(`category.${key}`);
      },
    },
  ]),
) as Record<ExpenseCategory, { readonly label: string; icon: LucideIcon }>;

type PaymentMethod = 'cash' | 'card' | 'transfer' | 'ewallet' | 'other';

export const PAYMENT_LABEL = Object.defineProperties(
  {},
  Object.fromEntries(
    (['cash', 'card', 'transfer', 'ewallet', 'other'] as const).map((key) => [
      key,
      { enumerable: true, get: () => tr(`payment.${key}`) },
    ]),
  ),
) as Readonly<Record<PaymentMethod, string>>;
