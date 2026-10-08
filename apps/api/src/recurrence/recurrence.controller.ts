import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createRecurrenceRuleSchema,
  occurrenceDateSchema,
  pauseRecurrenceRuleSchema,
  previewDraftRuleSchema,
  previewQuerySchema,
  updateRecurrenceRuleSchema,
  type CreateRecurrenceRuleInput,
  type PreviewDraftRuleInput,
  type RecurrencePreviewDto,
  type RecurrenceRuleDto,
  type UpdateRecurrenceRuleInput,
} from '@nosion/contracts';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { CurrentUser, RateLimit } from '../common/decorators';
import { zodBody, zodQuery } from '../common/zod-validation.pipe';
import { RecurrenceService } from './recurrence.service';

/** กฎการเกิดซ้ำ (สเปก 6.1 + ตาราง endpoint "Recurrence & Reminder") */
@ApiTags('recurrence-rules')
@Controller('recurrence-rules')
// guard อ่าน @RateLimit เฉพาะ handler ที่ติดไว้ (preview, materialize) — handler อื่นผ่านตรง
@UseGuards(RateLimitGuard)
export class RecurrenceController {
  constructor(private readonly recurrence: RecurrenceService) {}

  @Get()
  list(@CurrentUser('userId') userId: string): Promise<RecurrenceRuleDto[]> {
    return this.recurrence.list(userId);
  }

  /** preview กฎที่ยังไม่บันทึก (ตัวสร้าง rrule) — ประกาศก่อน :id เพื่อไม่ให้ "preview" ถูกตีความเป็น id */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 60, windowSeconds: 60, by: 'user' })
  previewDraft(
    @CurrentUser('userId') userId: string,
    @Body(zodBody(previewDraftRuleSchema)) dto: PreviewDraftRuleInput,
  ): Promise<RecurrencePreviewDto> {
    return this.recurrence.previewDraft(userId, dto);
  }

  /** ปุ่ม "Materialize Recurrence" ใน Today — 7 วันข้างหน้า · idempotent */
  @Post('materialize')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 6, windowSeconds: 60, by: 'user' })
  materialize(@CurrentUser('userId') userId: string): Promise<{ rules: number; created: number }> {
    return this.recurrence.materializeForUser(userId);
  }

  @Get(':id')
  get(@CurrentUser('userId') userId: string, @Param('id') id: string): Promise<RecurrenceRuleDto> {
    return this.recurrence.get(userId, id);
  }

  @Post()
  create(
    @CurrentUser('userId') userId: string,
    @Body(zodBody(createRecurrenceRuleSchema)) dto: CreateRecurrenceRuleInput,
  ): Promise<RecurrenceRuleDto> {
    return this.recurrence.create(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body(zodBody(updateRecurrenceRuleSchema)) dto: UpdateRecurrenceRuleInput,
  ): Promise<RecurrenceRuleDto> {
    return this.recurrence.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser('userId') userId: string, @Param('id') id: string): Promise<void> {
    await this.recurrence.remove(userId, id);
  }

  /** body `{ paused: false }` = เริ่มต่อ */
  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  pause(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body(zodBody(pauseRecurrenceRuleSchema)) dto: { paused: boolean },
  ): Promise<RecurrenceRuleDto> {
    return this.recurrence.setPaused(userId, id, dto.paused);
  }

  @Post(':id/preview')
  @HttpCode(HttpStatus.OK)
  preview(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Query(zodQuery(previewQuerySchema)) query: { limit: number },
  ): Promise<RecurrencePreviewDto> {
    return this.recurrence.preview(userId, id, query.limit);
  }

  /** ลบเฉพาะรอบของวันนั้น (เพิ่มเข้า exceptions) — `:date` = YYYY-MM-DD ตามโซนของกฎ */
  @Delete(':id/occurrences/:date')
  deleteOccurrence(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Param('date', zodBody(occurrenceDateSchema)) date: string,
  ): Promise<RecurrenceRuleDto> {
    return this.recurrence.deleteOccurrence(userId, id, date);
  }
}
