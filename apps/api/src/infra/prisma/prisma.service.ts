import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { APP_CONFIG, type AppConfig } from '../config/env';

/** ชื่อโมเดลที่มีคอลัมน์ userId — ใช้บังคับ tenant scope อัตโนมัติ */
const USER_SCOPED_MODELS = new Set<string>([
  'Entry',
  'Project',
  'Tag',
  'Budget',
  'RecurrenceRule',
  'Session',
  'ApiKey',
  'PushSubscription',
  'AuditLog',
  'FocusSession',
]);

const READ_WRITE_OPS = new Set<string>([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'updateMany',
  'deleteMany',
  'count',
  'aggregate',
]);

export type ScopedPrisma = ReturnType<PrismaService['forUser']>;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      datasources: { db: { url: config.DATABASE_URL } },
      log:
        config.NODE_ENV === 'development'
          ? [{ emit: 'event', level: 'query' }, 'warn', 'error']
          : ['warn', 'error'],
    });
  }

  /**
   * ต่อฐานข้อมูลตอนเริ่ม — ต่อไม่ได้ **ไม่ล้มทั้ง process** (Prisma ต่อเองตอน query แรกอยู่แล้ว)
   * บน Vercel การล้มตอนบูต = `FUNCTION_INVOCATION_FAILED` แล้ว instance ใหม่ถูกเปิดมาลองซ้ำ → connection ยิ่งแน่น
   * เจอจริงบน staging (Phase 8 ขั้น 2): pooler เต็มชั่วคราว ทุก instance ใหม่ตาย API ล่มทั้งตัว ~15 นาที
   * แบบนี้คำขอที่ต้องใช้ DB ได้ error ทีละคำขอ (ProblemDetails 500) และหายเองเมื่อ pooler ว่าง
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('เชื่อมต่อฐานข้อมูลแล้ว');
    } catch (err) {
      this.logger.warn(`ยังต่อฐานข้อมูลไม่ได้ตอนเริ่ม — จะลองใหม่ตอน query แรก: ${String(err)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * ชั้นป้องกัน IDOR ชั้นที่สอง (สเปกหัวข้อ 9.3)
   *
   * Guard ตรวจ userId อยู่แล้วที่ชั้น HTTP แต่ถ้ามีใครลืมใส่ `where: { userId }`
   * ใน service สักที่เดียว ข้อมูลข้ามผู้ใช้จะรั่วทันที — extension นี้เติมให้อัตโนมัติ
   * จึงต้องพลาดสองชั้นพร้อมกันถึงจะรั่วได้
   */
  forUser(userId: string) {
    return this.$extends({
      query: {
        $allModels: {
          $allOperations({ model, operation, args, query }) {
            if (!model || !USER_SCOPED_MODELS.has(model)) return query(args);

            // แก้ args ในที่เดิมแล้วส่งตัวเดิมกลับ เพื่อคง type ที่ query() คาดหวังไว้
            if (READ_WRITE_OPS.has(operation)) {
              const a = args as { where?: Record<string, unknown> };
              a.where = { ...(a.where ?? {}), userId };
              return query(args);
            }

            if (operation === 'create') {
              const a = args as { data?: Record<string, unknown> };
              a.data = { ...(a.data ?? {}), userId };
              return query(args);
            }

            if (operation === 'createMany') {
              const a = args as { data?: Record<string, unknown> | Record<string, unknown>[] };
              const rows = Array.isArray(a.data) ? a.data : [a.data ?? {}];
              a.data = rows.map((row) => ({ ...row, userId }));
              return query(args);
            }

            return query(args);
          },
        },
      },
    });
  }

  /** ใช้ตอนทดสอบเท่านั้น — ล้างทุกตารางโดยคงโครงสร้างไว้ */
  async truncateAll(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('truncateAll ห้ามเรียกบน production');
    }
    const tables = await this.$queryRaw<{ tablename: string }[]>(
      Prisma.sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    if (tables.length === 0) return;
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await this.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
}
