import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'วันนี้' };

/**
 * Phase 2 จะประกอบหน้านี้จาก widget ที่แต่ละโมดูลคืนผ่าน summarizeToday()
 * ตอนนี้ยังมีโมดูลเดียว จึงลิงก์ไปหน้า Tasks ไปก่อน
 */
export default function TodayPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">วันนี้</h1>
      <Card>
        <CardHeader>
          <CardTitle>หน้านี้กำลังมาใน Phase 2</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-fg-secondary">
          <p>
            หน้า Today ประกอบร่างจากทุกโมดูลที่เปิดใช้งาน โดยเรียก <code>summarizeToday()</code>{' '}
            บนทะเบียนโมดูล — ไม่มีเงื่อนไขเฉพาะโมดูลอยู่ในหน้านี้เลย
          </p>
          <Link href="/tasks">
            <Button variant="secondary" size="sm">
              ไปที่หน้างาน
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
