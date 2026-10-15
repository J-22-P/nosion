'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import { pushApi, type PushState } from './push';
import { usePushStatus, useTogglePush } from './use-push';

const DESCRIPTION: Record<PushState, string> = {
  on: 'เครื่องนี้จะได้รับการเตือนบิลและงานตามเวลาที่ตั้งไว้ · กด "จ่ายแล้ว" จากการแจ้งเตือนได้เลย',
  off: 'เปิดเพื่อรับการเตือนบนเครื่องนี้ (เปิดแยกทีละเครื่อง)',
  denied:
    'เบราว์เซอร์บล็อกการแจ้งเตือนของเว็บนี้ไว้ — เปิดสิทธิ์ที่ไอคอนแม่กุญแจข้างแถบที่อยู่ แล้วกลับมากดเปิดอีกครั้ง',
  'ios-needs-install':
    'บน iPhone/iPad ต้องเพิ่มแอปลงหน้าจอโฮมก่อน (ปุ่มแชร์ → "เพิ่มไปยังหน้าจอโฮม") แล้วเปิดจากไอคอนนั้น',
  unsupported: 'เบราว์เซอร์นี้ไม่รองรับ Web Push',
  'server-disabled': 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่าการแจ้งเตือน (VAPID)',
};

/** การแจ้งเตือนในหน้า Settings (สเปก 10.3) — สถานะเป็นของ "เครื่องนี้" ไม่ใช่ของบัญชี */
export function NotificationsCard() {
  const status = usePushStatus();
  const toggle = useTogglePush();
  const state = status.data?.state;
  const queryClient = useQueryClient();
  const test = useMutation({
    mutationFn: pushApi.test,
    onSuccess: ({ fireAt }) => {
      const time = new Intl.DateTimeFormat('th-TH', { timeStyle: 'short' }).format(
        new Date(fireAt),
      );
      toast.success(`จะเด้งประมาณ ${time} น.`, {
        description:
          'สร้างงาน “ทดสอบการแจ้งเตือน” แล้ว — ลองกด “เสร็จแล้ว” จากการแจ้งเตือนได้ (ช่วงห้ามรบกวนจะเลื่อนไปส่งตอนจบช่วง)',
      });
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
    onError: (error) =>
      toast.error('ส่งทดสอบไม่สำเร็จ', {
        description: error instanceof ApiError ? error.message : undefined,
      }),
  });

  const aside = status.isPending ? (
    <Skeleton className="h-9 w-28" />
  ) : state === 'on' ? (
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="secondary" onClick={() => test.mutate()} disabled={test.isPending}>
        <Send size={16} aria-hidden="true" /> ส่งทดสอบ
      </Button>
      <Button
        variant="secondary"
        onClick={() => toggle.mutate({ enable: false })}
        disabled={toggle.isPending}
      >
        <BellOff size={16} aria-hidden="true" /> ปิด
      </Button>
    </div>
  ) : state === 'off' && status.data?.publicKey ? (
    <Button
      onClick={() => toggle.mutate({ enable: true, publicKey: status.data.publicKey! })}
      disabled={toggle.isPending}
    >
      <Bell size={16} aria-hidden="true" /> {toggle.isPending ? 'กำลังเปิด…' : 'เปิดการแจ้งเตือน'}
    </Button>
  ) : null;

  return (
    <Card>
      <CardHeader
        title="การแจ้งเตือน"
        description={
          status.isError
            ? 'ตรวจสถานะการแจ้งเตือนไม่สำเร็จ — ลองรีเฟรชหน้า'
            : state
              ? DESCRIPTION[state]
              : 'กำลังตรวจสถานะ…'
        }
        aside={aside}
      />
    </Card>
  );
}
