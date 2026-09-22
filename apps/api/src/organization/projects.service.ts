import { Injectable, NotFoundException } from '@nestjs/common';
import { type ProjectDto } from '@nosion/contracts';
import { PrismaService } from '../infra/prisma/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, includeArchived = false): Promise<ProjectDto[]> {
    const rows = await this.prisma.forUser(userId).project.findMany({
      where: { deletedAt: null, ...(includeArchived ? {} : { isArchived: false }) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toProjectDto);
  }

  async create(
    userId: string,
    input: { name: string; color: string; icon?: string | null },
  ): Promise<ProjectDto> {
    const count = await this.prisma.forUser(userId).project.count({ where: { deletedAt: null } });
    const row = await this.prisma.forUser(userId).project.create({
      data: { name: input.name, color: input.color, icon: input.icon ?? null, sortOrder: count },
    });
    return toProjectDto(row);
  }

  async update(
    userId: string,
    id: string,
    input: Partial<{
      name: string;
      color: string;
      icon: string | null;
      isArchived: boolean;
      sortOrder: number;
    }>,
  ): Promise<ProjectDto> {
    const result = await this.prisma.project.updateMany({
      where: { id, userId, deletedAt: null },
      data: input,
    });
    if (result.count === 0) throw new NotFoundException('ไม่พบโปรเจกต์');
    const row = await this.prisma.project.findFirstOrThrow({ where: { id, userId } });
    return toProjectDto(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.prisma.project.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('ไม่พบโปรเจกต์');
  }

  async reorder(userId: string, items: { id: string; sortOrder: number }[]): Promise<void> {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.project.updateMany({
          where: { id: item.id, userId },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
  }
}

function toProjectDto(row: {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  sortOrder: number;
  isArchived: boolean;
}): ProjectDto {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sortOrder,
    isArchived: row.isArchived,
  };
}
