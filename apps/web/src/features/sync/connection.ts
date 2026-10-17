import type { ConnectionStatus } from '@/components/ui/status-pill';
import type { SyncState } from '@/lib/sync';
import { tr } from '@/i18n/current';

export interface ConnectionView {
  status: ConnectionStatus;
  /** Connection pill บน top bar (สเปก 8.2 / 8.6) */
  label: string;
  /** สถานะสั้นของการ์ด Outbox: Synced / Syncing… / Offline / Retrying */
  outbox: string;
}

/**
 * เน็ต + คิว → สถานะเดียวที่ทุกจุดของ UI ใช้ร่วมกัน (pure — เทสต์ได้)
 *  ● Online                 เขียว — คิวว่าง
 *  ● ออฟไลน์ · รอซิงก์ 3     แดง  — ไม่มีเน็ต (หรือมีเน็ตแต่ส่งไม่ผ่าน: server ล่ม/429)
 *  ● กำลังซิงก์…             น้ำเงิน pulse — กำลังส่ง หรือมีเน็ตแล้วคิวยังไม่ว่าง
 */
export function connectionView(online: boolean, sync: SyncState): ConnectionView {
  const waiting = sync.pending ? tr('sync.waiting', { count: sync.pending }) : '';
  if (!online)
    return { status: 'offline', label: tr('sync.offline', { waiting }), outbox: 'Offline' };
  if (sync.status === 'error' && sync.pending) {
    return { status: 'offline', label: tr('sync.failed', { waiting }), outbox: 'Retrying' };
  }
  if (sync.status === 'syncing' || sync.pending) {
    return { status: 'syncing', label: tr('sync.syncing'), outbox: 'Syncing…' };
  }
  return { status: 'online', label: 'Online', outbox: 'Synced' };
}

/** "2 นาทีที่แล้ว" — เวลาซิงก์ล่าสุดใน popover / hero */
export function syncedAgo(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return tr('sync.justNow');
  if (minutes < 60) return tr('sync.minutesAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tr('sync.hoursAgo', { n: hours });
  return tr('sync.daysAgo', { n: Math.floor(hours / 24) });
}
