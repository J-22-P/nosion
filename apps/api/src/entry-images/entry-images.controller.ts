import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  pruneEntryImagesSchema,
  putEntryImageSchema,
  type EntryImageDto,
  type PruneEntryImagesInput,
  type PutEntryImageInput,
} from '@nosion/contracts';
import type { Response } from 'express';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { CurrentUser, Public, PublicApi, RateLimit } from '../common/decorators';
import { zodBody } from '../common/zod-validation.pipe';
import { EntryImagesService } from './entry-images.service';

/**
 * รูปย่อในรายละเอียดงาน — สคริปต์นำเข้า GitHub (API key) ส่งขึ้น · หน้าเว็บอ่านรายการแล้วแสดงด้วย URL ที่มีลายเซ็น
 * `PUT` / `POST` ต้องมีสิทธิ์ write ของ API key (guard ตัดสินจาก method) · `GET` ใช้ read
 */
@ApiTags('entries')
@Controller()
@PublicApi()
@UseGuards(RateLimitGuard)
export class EntryImagesController {
  constructor(private readonly images: EntryImagesService) {}

  @Get('entry-images')
  listAll(@CurrentUser('userId') userId: string): Promise<EntryImageDto[]> {
    return this.images.listForUser(userId);
  }

  @Get('entries/:id/images')
  list(@CurrentUser('userId') userId: string, @Param('id') id: string): Promise<EntryImageDto[]> {
    return this.images.listForEntry(userId, id);
  }

  @Put('entries/:id/images')
  put(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body(zodBody(putEntryImageSchema)) body: PutEntryImageInput,
  ): Promise<EntryImageDto> {
    return this.images.put(userId, id, body);
  }

  @Post('entries/:id/images/prune')
  @HttpCode(HttpStatus.OK)
  prune(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body(zodBody(pruneEntryImagesSchema)) body: PruneEntryImagesInput,
  ): Promise<{ deleted: number }> {
    return this.images.prune(userId, id, body.keep);
  }

  /**
   * ไฟล์รูปย่อ — ไม่ต้องล็อกอิน: ลายเซ็นใน URL คือสิทธิ์ (`<img>` แนบ token ไม่ได้)
   * เนื้อหาไม่เปลี่ยนตาม URL (ส่งรูปใหม่ = แถวเดิมแต่ไฟล์ใหม่ → ใช้ cache สั้นกว่า immutable)
   * ห้ามเบราว์เซอร์เดาชนิดไฟล์ + CSP ว่าง: ต่อให้มีคนส่งไฟล์แปลก ๆ มาก็รันอะไรไม่ได้
   */
  @Public()
  @Get('entry-images/:id/:sig.webp')
  @RateLimit({ limit: 300, windowSeconds: 60, by: 'ip' })
  async file(
    @Param('id') id: string,
    @Param('sig') sig: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.images.read(id, sig);
    if (!file) throw new NotFoundException('ไม่พบรูปนี้');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // StreamableFile: คืน Buffer ตรง ๆ Nest จะแปลงเป็น JSON
    return new StreamableFile(file.data, { type: file.mimeType, length: file.data.length });
  }
}
