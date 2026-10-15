import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createReminderSchema,
  type CreateReminderInput,
  type ReminderDto,
} from '@nosion/contracts';
import { CurrentUser } from '../common/decorators';
import { zodBody } from '../common/zod-validation.pipe';
import { RemindersService } from './reminders.service';

/** การเตือน (ตาราง endpoint "Recurrence & Reminder" ของสเปก 7.x) */
@ApiTags('reminders')
@Controller()
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get('entries/:id/reminders')
  list(
    @CurrentUser('userId') userId: string,
    @Param('id') entryId: string,
  ): Promise<ReminderDto[]> {
    return this.reminders.list(userId, entryId);
  }

  @Post('entries/:id/reminders')
  add(
    @CurrentUser('userId') userId: string,
    @Param('id') entryId: string,
    @Body(zodBody(createReminderSchema)) dto: CreateReminderInput,
  ): Promise<ReminderDto> {
    return this.reminders.add(userId, entryId, dto);
  }

  @Delete('reminders/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(@CurrentUser('userId') userId: string, @Param('id') id: string): Promise<void> {
    await this.reminders.cancel(userId, id);
  }
}
