import { type LoggerService } from '@nestjs/common';
import pino, { type Logger } from 'pino';
import { requestContext } from './request-context';

/**
 * รายการ field ที่ห้ามหลุดเข้า log เด็ดขาด (สเปกหัวข้อ 9.3 / 14.1)
 * pino redact ทำงานที่ระดับ serializer จึงกันได้แม้ object ถูกส่งมาทั้งก้อน
 */
const REDACT_PATHS = [
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'token',
  '*.token',
  'authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'secret',
  '*.secret',
  'webhookSecret',
  '*.webhookSecret',
];

export function createLogger(level = 'info', pretty = false): Logger {
  return pino({
    level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    base: { service: 'nosion-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    ...(pretty
      ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }
      : {}),
  });
}

/** ผูก pino เข้ากับ LoggerService ของ NestJS และแนบ traceId ให้อัตโนมัติ */
export class PinoLoggerService implements LoggerService {
  constructor(private readonly logger: Logger) {}

  private bindings(context?: string) {
    const ctx = requestContext.get();
    return { context, traceId: ctx?.traceId, userId: ctx?.userId };
  }

  log(message: unknown, context?: string) {
    this.logger.info(this.bindings(context), String(message));
  }
  error(message: unknown, stack?: string, context?: string) {
    this.logger.error({ ...this.bindings(context), stack }, String(message));
  }
  warn(message: unknown, context?: string) {
    this.logger.warn(this.bindings(context), String(message));
  }
  debug(message: unknown, context?: string) {
    this.logger.debug(this.bindings(context), String(message));
  }
  verbose(message: unknown, context?: string) {
    this.logger.trace(this.bindings(context), String(message));
  }
}
