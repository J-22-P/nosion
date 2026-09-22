import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** รวม class ของ Tailwind โดยให้ตัวหลังชนะตัวหน้าเสมอ */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
