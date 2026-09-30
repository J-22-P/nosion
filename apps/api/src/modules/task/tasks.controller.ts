import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type {
  FocusSessionDto,
  FocusTodayDto,
  TaskSidebarDto,
  TimerStopResultDto,
} from '@nosion/contracts';
import { CurrentUser } from '../../common/decorators';
import { FocusTimerService } from './focus-timer.service';
import { TaskStatsService } from './task-stats.service';

/**
 * endpoint เฉพาะของโมดูล Task (สเปก 7.3 "Module-specific")
 * CRUD ของงานยังอยู่ที่ /entries ตัวกลาง — ที่นี่มีแต่สิ่งที่โมดูลอื่นไม่มี
 */
@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly stats: TaskStatsService,
    private readonly timer: FocusTimerService,
  ) {}

  /** ตัวเลขใน sidebar หน้า Tasks ในคำขอเดียว */
  @Get('sidebar')
  sidebar(@CurrentUser('userId') userId: string): Promise<TaskSidebarDto> {
    return this.stats.sidebar(userId);
  }

  /** เวลาโฟกัสรวมวันนี้ + เป้าหมาย + รอบที่กำลังจับ (การ์ด Focus Session) */
  @Get('focus/today')
  focusToday(@CurrentUser('userId') userId: string): Promise<FocusTodayDto> {
    return this.timer.today(userId);
  }

  /** เริ่มจับเวลา — ถ้างานอื่นจับอยู่จะหยุดให้ก่อน · เรียกซ้ำกับงานเดิมได้รอบเดิม */
  @Post(':id/timer/start')
  @HttpCode(HttpStatus.OK)
  startTimer(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ): Promise<FocusSessionDto> {
    return this.timer.start(userId, id);
  }

  /** หยุดจับเวลา → บวกนาทีเข้า payload.actualMinutes · ไม่ได้จับอยู่ = 409 */
  @Post(':id/timer/stop')
  @HttpCode(HttpStatus.OK)
  stopTimer(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ): Promise<TimerStopResultDto> {
    return this.timer.stop(userId, id);
  }
}
