import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ENTRY_IMAGE_MAX_BYTES,
  ENTRY_IMAGE_MAX_PER_ENTRY,
  type EntryImageDto,
  type PutEntryImageInput,
} from '@nosion/contracts';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../infra/config/env';
import { PrismaService } from '../infra/prisma/prisma.service';

const MIME = 'image/webp';

/** ไฟล์เป็น WebP จริงไหม — "RIFF" ···· "WEBP" (ไม่เชื่อแค่ที่ client บอก) */
export function isWebp(bytes: Buffer): boolean {
  return (
    bytes.length > 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  );
}

/**
 * ลายเซ็นใน URL ของรูปย่อ — `<img>` แนบ access token ไม่ได้ จึงให้ URL เป็นสิทธิ์ในตัว (แบบเดียวกับลิงก์ iCal)
 * ได้ URL จาก API ที่ล็อกอินแล้วเท่านั้น · เดา id อย่างเดียวเปิดไม่ได้ · กุญแจแยกบริบทจาก ENCRYPTION_KEY
 */
export function imageSignature(key: string, id: string): string {
  return createHmac('sha256', Buffer.from(key, 'hex'))
    .update(`entry-image:v1:${id}`)
    .digest('base64url')
    .slice(0, 32);
}

/** รูปย่อในรายละเอียดงาน — เก็บในตาราง attachments (`data`) · ลบงานถาวรแล้วหายตาม (cascade) */
@Injectable()
export class EntryImagesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** รูปทั้งหมดของผู้ใช้ (เฉพาะข้อมูลอ้างอิง ไม่มีไฟล์) — สคริปต์ใช้ดูว่ารูปไหนส่งแล้ว ในคำขอเดียว */
  async listForUser(userId: string): Promise<EntryImageDto[]> {
    const rows = await this.prisma.attachment.findMany({
      where: { entry: { userId }, sourceUrl: { not: null }, data: { not: null } },
      select: ROW,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async listForEntry(userId: string, entryId: string): Promise<EntryImageDto[]> {
    await this.requireEntry(userId, entryId);
    const rows = await this.prisma.attachment.findMany({
      where: { entryId, sourceUrl: { not: null }, data: { not: null } },
      select: ROW,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  /** เพิ่ม/แทนรูปย่อของ sourceUrl นี้ (ส่งซ้ำ = แทนที่ ไม่เพิ่มแถว) */
  async put(userId: string, entryId: string, input: PutEntryImageInput): Promise<EntryImageDto> {
    await this.requireEntry(userId, entryId);
    const bytes = Buffer.from(input.data, 'base64');
    if (bytes.length > ENTRY_IMAGE_MAX_BYTES) {
      throw new UnprocessableEntityException(
        `รูปย่อใหญ่เกิน ${ENTRY_IMAGE_MAX_BYTES / 1024} KB — ย่อก่อนส่ง`,
      );
    }
    if (!isWebp(bytes)) throw new BadRequestException('รับเฉพาะรูป WebP (base64)');

    const existing = await this.prisma.attachment.findUnique({
      where: { entryId_sourceUrl: { entryId, sourceUrl: input.sourceUrl } },
      select: { id: true },
    });
    if (!existing) {
      const count = await this.prisma.attachment.count({
        where: { entryId, sourceUrl: { not: null } },
      });
      if (count >= ENTRY_IMAGE_MAX_PER_ENTRY) {
        throw new UnprocessableEntityException(
          `งานหนึ่งเก็บรูปย่อได้ไม่เกิน ${ENTRY_IMAGE_MAX_PER_ENTRY} รูป`,
        );
      }
    }

    const fields = {
      data: bytes,
      mimeType: MIME,
      sizeBytes: bytes.length,
      width: input.width,
      height: input.height,
    };
    const row = await this.prisma.attachment.upsert({
      where: { entryId_sourceUrl: { entryId, sourceUrl: input.sourceUrl } },
      create: {
        entryId,
        sourceUrl: input.sourceUrl,
        fileName: fileNameOf(input.sourceUrl),
        ...fields,
      },
      update: fields,
      select: ROW,
    });
    return this.toDto(row);
  }

  /** ลบรูปย่อที่ไม่อยู่ใน `keep` แล้ว — คืนจำนวนที่ลบ */
  async prune(userId: string, entryId: string, keep: string[]): Promise<{ deleted: number }> {
    await this.requireEntry(userId, entryId);
    const { count } = await this.prisma.attachment.deleteMany({
      where: { entryId, sourceUrl: { not: null, notIn: keep } },
    });
    return { deleted: count };
  }

  /** ไฟล์รูปย่อสำหรับ URL สาธารณะที่มีลายเซ็น · ลายเซ็นผิด/ไม่มีรูป = null (ตอบ 404 เหมือนกัน) */
  async read(id: string, signature: string): Promise<{ data: Buffer; mimeType: string } | null> {
    const expected = Buffer.from(imageSignature(this.config.ENCRYPTION_KEY, id));
    const given = Buffer.from(signature);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const row = await this.prisma.attachment.findUnique({
      where: { id },
      select: { data: true, mimeType: true, entry: { select: { deletedAt: true } } },
    });
    if (!row?.data || row.entry.deletedAt) return null;
    return { data: Buffer.from(row.data), mimeType: row.mimeType };
  }

  private async requireEntry(userId: string, entryId: string): Promise<void> {
    const entry = await this.prisma.entry.findFirst({
      where: { id: entryId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!entry) throw new NotFoundException('ไม่พบรายการนี้');
  }

  private toDto(row: Row): EntryImageDto {
    const sig = imageSignature(this.config.ENCRYPTION_KEY, row.id);
    return {
      entryId: row.entryId,
      sourceUrl: row.sourceUrl!,
      url: `${this.config.API_URL}/api/v1/entry-images/${row.id}/${sig}.webp`,
      width: row.width ?? 0,
      height: row.height ?? 0,
      sizeBytes: row.sizeBytes,
    };
  }
}

const ROW = {
  id: true,
  entryId: true,
  sourceUrl: true,
  width: true,
  height: true,
  sizeBytes: true,
} as const;
type Row = { id: string; entryId: string; sourceUrl: string | null } & {
  width: number | null;
  height: number | null;
  sizeBytes: number;
};

function fileNameOf(url: string): string {
  const last = new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? 'image';
  return `${last.slice(0, 100)}.webp`;
}
