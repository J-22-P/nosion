import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { TodayDto } from '@nosion/contracts';
import { CurrentUser, PublicApi } from '../../common/decorators';
import { TodayService } from './today.service';

@ApiTags('today')
@Controller('today')
@PublicApi()
export class TodayController {
  constructor(private readonly today: TodayService) {}

  /** รวมการ์ดทุกโมดูลที่เปิดอยู่ในคำขอเดียว */
  @Get()
  get(@CurrentUser('userId') userId: string): Promise<TodayDto> {
    return this.today.today(userId);
  }
}
