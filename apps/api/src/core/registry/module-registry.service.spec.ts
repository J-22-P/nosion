import { type ModuleKey } from '@nosion/contracts';
import { type TrackableModule, UnknownModuleError } from '@nosion/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ModuleRegistryService } from './module-registry.service';

const fakeModule = (key: ModuleKey): TrackableModule<unknown> =>
  ({
    key,
    meta: { label: { th: key, en: key }, icon: 'x', color: '#000' },
    payloadSchema: z.object({}),
    supportsRecurrence: false,
    supportsReminder: false,
    toCalendarEvent: () => null,
    summarizeToday: () => ({
      module: key,
      title: key,
      order: 0,
      headline: '',
      items: [],
      isEmpty: true,
    }),
    summarizeWeek: () => ({ module: key, title: key, order: 0, stats: [], highlights: [] }),
    parseNaturalLanguage: () => null,
  }) satisfies TrackableModule<unknown>;

describe('ModuleRegistryService', () => {
  let registry: ModuleRegistryService;

  beforeEach(() => {
    registry = new ModuleRegistryService();
  });

  it('ลงทะเบียนแล้วค้นเจอด้วย key', () => {
    registry.register(fakeModule('task'));
    expect(registry.get('task').key).toBe('task');
    expect(registry.size).toBe(1);
  });

  it('ลงทะเบียนซ้ำ key เดิม → โยน error ทันทีตอน bootstrap ไม่ใช่ตอน runtime', () => {
    registry.register(fakeModule('task'));
    expect(() => registry.register(fakeModule('task'))).toThrow(/ลงทะเบียนซ้ำ/);
  });

  it('ขอโมดูลที่ไม่มี → UnknownModuleError ไม่ใช่ undefined', () => {
    expect(() => registry.get('habit')).toThrow(UnknownModuleError);
  });

  it('all() กรองเฉพาะโมดูลที่ผู้ใช้เปิดไว้', () => {
    registry.registerAll([fakeModule('task'), fakeModule('expense'), fakeModule('habit')]);
    expect(registry.all(['task', 'habit']).map((m) => m.key)).toEqual(['task', 'habit']);
    expect(registry.all()).toHaveLength(3);
  });

  it('has() เป็น type guard ของ ModuleKey', () => {
    registry.register(fakeModule('expense'));
    expect(registry.has('expense')).toBe(true);
    expect(registry.has('ไม่มีจริง')).toBe(false);
  });
});
