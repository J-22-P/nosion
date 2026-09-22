'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { authApi } from './api';
import { useAuthStore } from './auth-store';

/** เข้าใช้ได้ใน 1 คลิกโดยไม่ต้องสมัคร — จุดที่ทำให้คนกดดูจริงแทนที่จะปิดหน้าไป */
export function DemoButton() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    try {
      const res = await authApi.demo();
      setSession(res.accessToken, res.user);
      router.push('/tasks');
    } catch (error) {
      toast.error('เริ่มบัญชีทดลองไม่สำเร็จ', {
        description: error instanceof ApiError ? error.message : 'ลองใหม่อีกครั้งในอีกสักครู่',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button size="lg" onClick={start} disabled={pending}>
      {pending ? 'กำลังเตรียมข้อมูล…' : 'ลองใช้ทันที ไม่ต้องสมัคร'}
    </Button>
  );
}
