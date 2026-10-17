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
  createProjectSchema,
  createTagSchema,
  reorderSchema,
  updateProjectSchema,
  updateTagSchema,
  type ProjectDto,
  type TagDto,
} from '@nosion/contracts';
import { CurrentUser, PublicApi } from '../common/decorators';
import { zodBody } from '../common/zod-validation.pipe';
import { ProjectsService } from './projects.service';
import { TagsService } from './tags.service';

@ApiTags('projects')
@Controller('projects')
@PublicApi()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(
    @CurrentUser('userId') userId: string,
    @Query('includeArchived') includeArchived?: string,
  ): Promise<ProjectDto[]> {
    return this.projects.list(userId, includeArchived === 'true');
  }

  @Post()
  create(
    @CurrentUser('userId') userId: string,
    @Body(zodBody(createProjectSchema)) dto: { name: string; color: string; icon?: string | null },
  ): Promise<ProjectDto> {
    return this.projects.create(userId, dto);
  }

  @Post('reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorder(
    @CurrentUser('userId') userId: string,
    @Body(zodBody(reorderSchema)) dto: { items: { id: string; sortOrder: number }[] },
  ): Promise<void> {
    await this.projects.reorder(userId, dto.items);
  }

  @Patch(':id')
  update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body(zodBody(updateProjectSchema))
    dto: Partial<{
      name: string;
      color: string;
      icon: string | null;
      isArchived: boolean;
      sortOrder: number;
    }>,
  ): Promise<ProjectDto> {
    return this.projects.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser('userId') userId: string, @Param('id') id: string): Promise<void> {
    await this.projects.remove(userId, id);
  }
}

@ApiTags('tags')
@Controller('tags')
@PublicApi()
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  list(@CurrentUser('userId') userId: string): Promise<TagDto[]> {
    return this.tags.list(userId);
  }

  @Post()
  create(
    @CurrentUser('userId') userId: string,
    @Body(zodBody(createTagSchema)) dto: { name: string; color: string },
  ): Promise<TagDto> {
    return this.tags.create(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body(zodBody(updateTagSchema)) dto: Partial<{ name: string; color: string }>,
  ): Promise<TagDto> {
    return this.tags.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser('userId') userId: string, @Param('id') id: string): Promise<void> {
    await this.tags.remove(userId, id);
  }
}
