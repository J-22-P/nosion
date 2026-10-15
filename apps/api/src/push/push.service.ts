import { Injectable } from '@nestjs/common';
import { pushSubscribeSchema, type PushSubscribeInput } from '@nosion/contracts';
import { PrismaService } from '../infra/prisma/prisma.service';

/** เก็บ Web Push subscription ของแต่ละเครื่อง — worker อ่านไปส่ง (สเปก 10.3) */
@Injectable()
export class PushService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * endpoint เป็นของเครื่อง/เบราว์เซอร์ ไม่ใช่ของบัญชี — เครื่องเดิมล็อกอินบัญชีอื่นแล้ว subscribe ใหม่
   * ต้องย้ายเจ้าของ ไม่ใช่สร้างซ้ำ (endpoint unique) ไม่งั้นการเตือนของคนเก่าจะเด้งบนเครื่องคนใหม่
   */
  async subscribe(userId: string, input: PushSubscribeInput): Promise<void> {
    const dto = pushSubscribeSchema.parse(input);
    const data = {
      userId,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userAgent: dto.userAgent ?? null,
    };
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: { endpoint: dto.endpoint, ...data },
      update: data,
    });
  }

  /** ลบเฉพาะของตัวเอง · ซ้ำได้ */
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }
}
