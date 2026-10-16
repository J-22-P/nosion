'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { ApiError } from '@/lib/api-client';
import '@/features/auth/auth-store';
import { ServiceWorkerBridge } from '@/features/notifications/use-push';
import { SyncBridge } from '@/features/sync/sync-bridge';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // 4xx เป็นความผิดของคำขอ — retry ไปก็ได้ผลเดิม เสีย quota เปล่า
            retry: (failureCount, error) => {
              if (error instanceof ApiError && error.status < 500) return false;
              return failureCount < 2;
            },
          },
          // ค่าเริ่มต้น 'online' จะพัก mutation ไว้ตอนออฟไลน์จนกว่าเน็ตกลับ (หายเมื่อรีเฟรช)
          // ชั้น api ตัดสินเองว่าส่งหรือเข้าคิว outbox (lib/sync) → ให้ mutationFn ทำงานเสมอ
          mutations: { networkMode: 'always' },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {children}
        <ServiceWorkerBridge />
        <SyncBridge />
        <Toaster position="bottom-right" richColors closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
