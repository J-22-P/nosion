import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  parseCommitSchema,
  parseRequestSchema,
  type ParseCommitDto,
  type ParseCommitInput,
  type ParseRequest,
  type ParseResultDto,
} from '@nosion/contracts';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { CurrentUser, RateLimit } from '../common/decorators';
import { zodBody } from '../common/zod-validation.pipe';
import { ParseService } from './parse.service';

/** NL Parser ข้ามโมดูล (สเปก 6.4 · 7.3) — ⌘K เรียก preview ทุก 250ms ระหว่างพิมพ์ แล้ว commit ตอนกด ↵ */
@ApiTags('parse')
@Controller('parse')
@UseGuards(RateLimitGuard)
export class ParseController {
  constructor(private readonly parse: ParseService) {}

  /** preview ไม่บันทึก · 60 ครั้ง/นาที/ผู้ใช้ (สเปก 7.5) */
  @Post()
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 60, windowSeconds: 60, by: 'user' })
  preview(
    @CurrentUser('userId') userId: string,
    @Body(zodBody(parseRequestSchema)) dto: ParseRequest,
  ): Promise<ParseResultDto> {
    return this.parse.preview(userId, dto.text);
  }

  /** บันทึกในคำสั่งเดียว: entry หรือกฎการเกิดซ้ำ + การเตือน + แท็ก/โปรเจกต์ */
  @Post('commit')
  @RateLimit({ limit: 60, windowSeconds: 60, by: 'user' })
  commit(
    @CurrentUser('userId') userId: string,
    @Body(zodBody(parseCommitSchema)) dto: ParseCommitInput,
  ): Promise<ParseCommitDto> {
    return this.parse.commit(userId, dto);
  }
}
