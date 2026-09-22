import { Module } from '@nestjs/common';
import { ProjectsController, TagsController } from './organization.controller';
import { ProjectsService } from './projects.service';
import { TagsService } from './tags.service';

@Module({
  controllers: [ProjectsController, TagsController],
  providers: [ProjectsService, TagsService],
  exports: [ProjectsService, TagsService],
})
export class OrganizationModule {}
