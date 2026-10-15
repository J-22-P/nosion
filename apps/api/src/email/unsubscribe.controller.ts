import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { verifyUnsubscribeToken, type EmailSubscriptionKind } from '@nosion/core';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { Public, RateLimit } from '../common/decorators';
import { APP_CONFIG, type AppConfig } from '../infra/config/env';
import { EmailPreferencesService } from './email-preferences.service';

const LABEL: Record<EmailSubscriptionKind, string> = {
  digest: 'สรุปรายวัน',
  weekly: 'สรุปสัปดาห์',
};

/**
 * ลิงก์ "เลิกรับอีเมลแบบนี้" (สเปก 10.3) + one-click unsubscribe ของ Gmail/Yahoo (RFC 8058)
 *
 * GET แสดงหน้ายืนยันเท่านั้น — ตัวสแกนลิงก์ของผู้ให้บริการอีเมลกด GET เองโดยอัตโนมัติ
 * ถ้า GET เลิกรับทันที ผู้ใช้จะถูกยกเลิกโดยไม่ได้กดอะไรเลย · การเลิกรับจริงเป็น POST เสมอ
 */
@ApiExcludeController()
@Controller('email/unsubscribe')
@UseGuards(RateLimitGuard)
export class UnsubscribeController {
  constructor(
    private readonly preferences: EmailPreferencesService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @RateLimit({ limit: 30, windowSeconds: 60 })
  confirm(@Query('token') token = ''): string {
    const claims = this.verify(token);
    if (!claims)
      return page('ลิงก์นี้หมดอายุหรือไม่ถูกต้อง', 'เปลี่ยนการรับอีเมลได้ที่หน้าตั้งค่าในแอป');
    return page(
      `เลิกรับอีเมล${LABEL[claims.kind]}?`,
      'กดปุ่มด้านล่างเพื่อยืนยัน — เปิดรับใหม่ได้ทุกเมื่อในหน้าตั้งค่า',
      `<form method="post"><button type="submit">เลิกรับ${LABEL[claims.kind]}</button></form>`,
    );
  }

  /** ทั้งปุ่มในหน้ายืนยันและ one-click (List-Unsubscribe-Post) มาที่นี่ — token อยู่ใน query · ซ้ำได้ */
  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @RateLimit({ limit: 30, windowSeconds: 60 })
  async unsubscribe(@Query('token') token = ''): Promise<string> {
    const claims = this.verify(token);
    if (!claims)
      return page('ลิงก์นี้หมดอายุหรือไม่ถูกต้อง', 'เปลี่ยนการรับอีเมลได้ที่หน้าตั้งค่าในแอป');
    await this.preferences.unsubscribe(claims.userId, claims.kind);
    return page(
      `เลิกรับ${LABEL[claims.kind]}แล้ว`,
      'เปิดรับใหม่ได้ทุกเมื่อในหน้าตั้งค่าของ NOSION',
    );
  }

  private verify(token: string) {
    const secret = this.config.NOTIFICATION_ACTION_SECRET;
    if (!secret) throw new NotFoundException();
    return verifyUnsubscribeToken(token, secret);
  }
}

/** หน้าเล็ก ๆ ที่ API ตอบเอง — ไม่มีข้อมูลจากผู้ใช้ปนในเนื้อหา จึงไม่ต้อง escape */
function page(title: string, body: string, action = ''): string {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · NOSION</title>
<style>body{font-family:-apple-system,'Segoe UI','Noto Sans Thai',sans-serif;background:#f5f5f7;color:#1d1d1f;margin:0;padding:48px 16px}
main{max-width:440px;margin:0 auto;background:#fff;border:1px solid #e5e5ea;border-radius:16px;padding:32px}
h1{font-size:20px;margin:0 0 12px}p{color:#6e6e73;line-height:1.6;margin:0 0 20px}
button{background:#1d1d1f;color:#fff;border:0;border-radius:10px;font:inherit;font-weight:600;padding:12px 20px;cursor:pointer}</style></head>
<body><main><h1>${title}</h1><p>${body}</p>${action}</main></body></html>`;
}
