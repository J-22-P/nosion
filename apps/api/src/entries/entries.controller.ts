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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  bulkActionSchema,
  createEntrySchema,
  deferSchema,
  listEntriesQuerySchema,
  reorderSchema,
  updateEntrySchema,
  type BulkActionInput,
  type CreateEntryInput,
  type EntryDto,
  type ListEntriesQuery,
  type Paginated,
  type UpdateEntryInput,
} from '@nosion/contracts';
import { CurrentUser } from '../common/decorators';
import { zodBody, zodQuery } from '../common/zod-validation.pipe';
import { EntriesService } from './entries.service';

/**
 * Controller ตัวเดียวรองรับทุกโมดูล — ไม่มี TaskController / ExpenseController แยก
 * เพราะ payload ถูก validate ด้วย schema ของโมดูลที่ registry คืนให้
 */
@ApiTags('entries')
@Controller('entries')
export class EntriesController {
  constructor(private readonly entries: EntriesService) {}

  @Get()
  async list(
    @CurrentUser('userId') userId: string,
    @Query(zodQuery(listEntriesQuerySchema)) query: ListEntriesQuery,
  ): Promise<Paginated<EntryDto>> {
    return this.entries.list(userId, query);
  }

  @Get('trash')
  async trash(
    @CurrentUser('userId') userId: string,
    @Query(zodQuery(listEntriesQuerySchema)) query: ListEntriesQuery,
  ): Promise<Paginated<EntryDto>> {
    return this.entries.trash(userId, query);
  }

  @Get(':id')
  async findOne(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ): Promise<EntryDto> {
    return this.entries.findOne(userId, id);
  }

  @Post()
  async create(
    @CurrentUser('userId') userId: string,
    @Body(zodBody(createEntrySchema)) dto: CreateEntryInput,
  ): Promise<EntryDto> {
    return this.entries.create(userId, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body(zodBody(updateEntrySchema)) dto: UpdateEntryInput,
  ): Promise<EntryDto> {
    return this.entries.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser('userId') userId: string, @Param('id') id: string): Promise<void> {
    await this.entries.remove(userId, id);
  }

  @Post(':id/restore')
  async restore(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ): Promise<EntryDto> {
    return this.entries.restore(userId, id);
  }

  @Post(':id/complete')
  async complete(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ): Promise<EntryDto> {
    return this.entries.complete(userId, id);
  }

  @Post(':id/defer')
  async defer(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Query(zodQuery(deferSchema)) query: { to: string },
  ): Promise<EntryDto> {
    return this.entries.defer(userId, id, query.to);
  }

  @Post('bulk')
  async bulk(
    @CurrentUser('userId') userId: string,
    @Body(zodBody(bulkActionSchema)) dto: BulkActionInput,
  ): Promise<{ affected: number }> {
    return this.entries.bulk(userId, dto);
  }

  @Post('reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorder(
    @CurrentUser('userId') userId: string,
    @Body(zodBody(reorderSchema)) dto: { items: { id: string; sortOrder: number }[] },
  ): Promise<void> {
    await this.entries.reorder(userId, dto.items);
  }
}
