import { Injectable } from '@nestjs/common';
import { type ModuleKey } from '@nosion/contracts';
import { type TrackableModule, UnknownModuleError } from '@nosion/core';

/**
 * ทะเบียนกลางของโมดูลทั้งหมด — เป็น logic บริสุทธิ์ ไม่พึ่ง DI container
 * จึงทดสอบได้โดยไม่ต้อง bootstrap NestJS (กฎข้อ 5 ของสถาปัตยกรรม)
 */
@Injectable()
export class ModuleRegistryService {
  private readonly modules = new Map<ModuleKey, TrackableModule<unknown>>();

  register(module: TrackableModule<unknown>): void {
    if (this.modules.has(module.key)) {
      throw new Error(`โมดูล "${module.key}" ถูกลงทะเบียนซ้ำ — ตรวจ @RegisterModule() ที่ซ้ำกัน`);
    }
    this.modules.set(module.key, module);
  }

  registerAll(modules: TrackableModule<unknown>[]): void {
    for (const m of modules) this.register(m);
  }

  has(key: string): key is ModuleKey {
    return this.modules.has(key as ModuleKey);
  }

  /** โยน UnknownModuleError เมื่อไม่รู้จัก — ไม่คืน undefined ให้ผู้เรียกลืมเช็ค */
  get(key: ModuleKey): TrackableModule<unknown> {
    const found = this.modules.get(key);
    if (!found) throw new UnknownModuleError(key);
    return found;
  }

  /** โมดูลทั้งหมด หรือเฉพาะที่ผู้ใช้เปิดไว้ */
  all(enabledOnly?: ModuleKey[]): TrackableModule<unknown>[] {
    const list = [...this.modules.values()];
    return enabledOnly ? list.filter((m) => enabledOnly.includes(m.key)) : list;
  }

  keys(): ModuleKey[] {
    return [...this.modules.keys()];
  }

  get size(): number {
    return this.modules.size;
  }
}
