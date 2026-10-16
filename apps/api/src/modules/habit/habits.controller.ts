import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  habitCheckSchema,
  habitIncrementSchema,
  type HabitCheckInput,
  type HabitIncrementInput,
  type HabitListDto,
  type HabitTodayDto,
} from '@nosion/contracts';
import { CurrentUser } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import { HabitsService } from './habits.service';

/** endpoint เฉพาะโมดูลนิสัย (สเปก 7.3) — สร้าง/หยุด/ลบใช้ /recurrence-rules และ /parse/commit */
@ApiTags('habits')
@Controller('habits')
export class HabitsController {
  constructor(private readonly habits: HabitsService) {}

  /** นิสัยทั้งหมด + รอบวันนี้ + streak (ปัจจุบัน/ยาวสุด) + แถบ 7 วัน — รวม `/habits/streaks` ของสเปกไว้ในคำขอเดียว */
  @Get()
  list(@CurrentUser('userId') userId: string): Promise<HabitListDto> {
    return this.habits.list(userId);
  }

  /** ปุ่ม −1 / +1 ของนิสัยแบบนับจำนวน · `:id` = entry ของรอบนั้น */
  @Post(':id/increment')
  @HttpCode(HttpStatus.OK)
  increment(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body(zodBody(habitIncrementSchema)) dto: HabitIncrementInput,
  ): Promise<HabitTodayDto> {
    return this.habits.increment(userId, id, dto.delta);
  }

  @Post(':id/check')
  @HttpCode(HttpStatus.OK)
  check(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body(zodBody(habitCheckSchema)) dto: HabitCheckInput,
  ): Promise<HabitTodayDto> {
    return this.habits.check(userId, id, dto.done);
  }
}
