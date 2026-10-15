import { Injectable } from '@nestjs/common';
import {
  parseNaturalText,
  type NlContext,
  type NlResult,
  type ParsedEntry,
  type UserContext,
} from '@nosion/core';
import { ModuleRegistryService } from '../registry/module-registry.service';

export interface ParseOutcome {
  /** ชิ้นส่วนที่ parser กลางแยกได้ (แท็ก โปรเจกต์ ตำแหน่ง token) */
  text: NlResult;
  best: ParsedEntry | null;
  alternatives: ParsedEntry[];
}

export function nlContextOf(ctx: UserContext): NlContext {
  return { now: ctx.now ?? new Date(), timeZone: ctx.timezone, weekStartsOn: ctx.weekStartsOn };
}

/**
 * NL Parser ข้ามโมดูล (สเปก 6.4) — แยกชิ้นครั้งเดียว แล้วให้ทุกโมดูลที่ผู้ใช้เปิดไว้ลองตีความ
 * เรียงตามความมั่นใจ: ตัวแรกคือคำตอบ ที่เหลือเป็น "หรือสร้างเป็น…" ใน ⌘K
 * ไม่มี `if (module === ...)` — โมดูลใหม่ที่ลงทะเบียนแล้วเข้าร่วมเองอัตโนมัติ
 */
@Injectable()
export class ParserService {
  constructor(private readonly registry: ModuleRegistryService) {}

  parse(input: string, ctx: UserContext): ParseOutcome {
    const text = parseNaturalText(input, nlContextOf(ctx));
    const candidates = this.registry
      .all(ctx.enabledModules)
      .map((m) => m.parseNaturalLanguage(text, ctx))
      .filter((c): c is ParsedEntry => c !== null)
      .sort((a, b) => b.confidence - a.confidence);

    return { text, best: candidates[0] ?? null, alternatives: candidates.slice(1, 3) };
  }
}
