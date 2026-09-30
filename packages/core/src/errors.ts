/** error ของ domain — ไม่ผูกกับ HTTP หรือ NestJS (กฎข้อ 5) */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class EntryNotFoundError extends DomainError {
  constructor(id: string) {
    super(`ไม่พบรายการ ${id}`, 'entry_not_found', { id });
  }
}

export class VersionConflictError extends DomainError {
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(
      `รายการนี้ถูกแก้ไขจากที่อื่นแล้ว (เวอร์ชัน ${actual} แต่ส่งมา ${expected})`,
      'version_conflict',
      { expected, actual },
    );
  }
}

export class PayloadValidationError extends DomainError {
  constructor(
    readonly moduleKey: string,
    readonly issues: { path: string; code: string; message: string }[],
  ) {
    super(`payload ของโมดูล ${moduleKey} ไม่ถูกต้อง`, 'payload_invalid', { issues });
  }
}

export class UnknownModuleError extends DomainError {
  constructor(key: string) {
    super(`ไม่รู้จักโมดูล ${key}`, 'unknown_module', { key });
  }
}

/**
 * การกระทำที่ทำไม่ได้ในสถานะปัจจุบันของทรัพยากร เช่น หยุดจับเวลาที่ไม่ได้เริ่ม
 * หรือเริ่มจับเวลางานที่เสร็จแล้ว → HTTP 409
 */
export class InvalidStateError extends DomainError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, details);
  }
}
