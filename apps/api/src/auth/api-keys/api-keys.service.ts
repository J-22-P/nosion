import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ApiKeyDto,
  ApiKeyScope,
  CreateApiKeyInput,
  CreatedApiKeyDto,
} from '@nosion/contracts';
import type { ApiKey } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { generateApiKey, hashApiKey } from './api-key';

/** ผู้ใช้หนึ่งคนถือ key ที่ยังใช้ได้พร้อมกันไม่เกินเท่านี้ — กันสร้างทิ้งไว้ไม่รู้จบ */
const MAX_ACTIVE_KEYS = 10;
/** ไม่เขียน lastUsedAt ทุกคำขอ — นาทีละครั้งก็พอให้ผู้ใช้รู้ว่า key ไหนยังถูกใช้ */
const TOUCH_INTERVAL_MS = 60_000;

export interface ApiKeyPrincipal {
  keyId: string;
  userId: string;
  email: string;
  isDemo: boolean;
  scopes: ApiKeyScope[];
}

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ApiKeyDto[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map(toDto);
  }

  async create(userId: string, input: CreateApiKeyInput): Promise<CreatedApiKeyDto> {
    const active = await this.prisma.apiKey.count({
      where: {
        userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (active >= MAX_ACTIVE_KEYS) {
      throw new ConflictException(
        `มี API key ที่ใช้งานได้ครบ ${MAX_ACTIVE_KEYS} อันแล้ว — เพิกถอนอันที่ไม่ใช้ก่อน`,
      );
    }
    const { key, hash, prefix } = generateApiKey();
    const created = await this.prisma.apiKey.create({
      data: {
        userId,
        name: input.name,
        keyHash: hash,
        keyPrefix: prefix,
        scopes: input.scopes,
        expiresAt: input.expiresInDays
          ? new Date(Date.now() + input.expiresInDays * 86_400_000)
          : null,
      },
    });
    return { ...toDto(created), key };
  }

  async revoke(userId: string, id: string): Promise<void> {
    const result = await this.prisma.apiKey.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('ไม่พบ API key นี้');
  }

  /** key ดิบ → เจ้าของ + สิทธิ์ · null = ไม่มี/เพิกถอน/หมดอายุ/บัญชีถูกลบ (ตอบแบบเดียวกันหมด) */
  async authenticate(rawKey: string, now = new Date()): Promise<ApiKeyPrincipal | null> {
    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(rawKey) },
      include: {
        user: { select: { email: true, isDemo: true, deletedAt: true, expiresAt: true } },
      },
    });
    if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= now)) return null;
    if (key.user.deletedAt || (key.user.expiresAt && key.user.expiresAt <= now)) return null;

    if (!key.lastUsedAt || now.getTime() - key.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      // ไม่รอ — การบันทึกเวลาใช้ล่าสุดล้มไม่ควรทำให้คำขอล้ม
      void this.prisma.apiKey
        .update({ where: { id: key.id }, data: { lastUsedAt: now } })
        .catch(() => undefined);
    }

    return {
      keyId: key.id,
      userId: key.userId,
      email: key.user.email,
      isDemo: key.user.isDemo,
      scopes: key.scopes as ApiKeyScope[],
    };
  }
}

function toDto(key: ApiKey): ApiKeyDto {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes as ApiKeyScope[],
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
  };
}
