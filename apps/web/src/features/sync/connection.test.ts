import { describe, expect, it } from 'vitest';
import type { SyncState } from '@/lib/sync';
import { connectionView, syncedAgo } from './connection';

const state = (patch: Partial<SyncState> = {}): SyncState => ({
  pending: 0,
  queue: [],
  status: 'idle',
  lastSyncedAt: null,
  lastError: null,
  ...patch,
});

describe('connectionView (Connection pill 3 สถานะ · สเปก 8.6)', () => {
  it('ออนไลน์ คิวว่าง → Online (เขียว)', () => {
    expect(connectionView(true, state())).toEqual({
      status: 'online',
      label: 'Online',
      outbox: 'Synced',
    });
  });

  it('ออฟไลน์ → แดง พร้อมจำนวนที่รอ', () => {
    expect(connectionView(false, state({ pending: 3, status: 'offline' }))).toMatchObject({
      status: 'offline',
      label: 'ออฟไลน์ · รอซิงก์ 3',
    });
    expect(connectionView(false, state()).label).toBe('ออฟไลน์');
  });

  it('กำลังส่ง / มีเน็ตแต่คิวยังไม่ว่าง → กำลังซิงก์ · ส่งไม่ผ่าน → แดง', () => {
    expect(connectionView(true, state({ pending: 2, status: 'syncing' })).status).toBe('syncing');
    expect(connectionView(true, state({ pending: 2, status: 'error' }))).toMatchObject({
      status: 'offline',
      label: 'ซิงก์ไม่สำเร็จ · รอซิงก์ 2',
      outbox: 'Retrying',
    });
  });
});

describe('syncedAgo', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');
  it('อ่านเป็นภาษาคน', () => {
    expect(syncedAgo(null, now)).toBeNull();
    expect(syncedAgo('2026-10-16T11:59:40Z', now)).toBe('เมื่อสักครู่');
    expect(syncedAgo('2026-10-16T11:58:00Z', now)).toBe('2 นาทีที่แล้ว');
    expect(syncedAgo('2026-10-16T09:00:00Z', now)).toBe('3 ชั่วโมงที่แล้ว');
    expect(syncedAgo('2026-10-14T12:00:00Z', now)).toBe('2 วันที่แล้ว');
  });
});
