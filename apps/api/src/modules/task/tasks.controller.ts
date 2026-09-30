import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { TaskSidebarDto } from '@nosion/contracts';
import { CurrentUser } from '../../common/decorators';
import { TaskStatsService } from './task-stats.service';

/**
 * endpoint เฉพาะของโมดูล Task (สเปก 7.3 "Module-specific")
 * CRUD ของงานยังอยู่ที่ /entries ตัวกลาง — ที่นี่มีแต่สิ่งที่โมดูลอื่นไม่มี
 */
@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly stats: TaskStatsService) {}

  /** ตัวเลขใน sidebar หน้า Tasks ในคำขอเดียว */
  @Get('sidebar')
  sidebar(@CurrentUser('userId') userId: string): Promise<TaskSidebarDto> {
    return this.stats.sidebar(userId);
  }
}
