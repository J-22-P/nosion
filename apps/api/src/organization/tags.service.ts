import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type TagDto } from '@nosion/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../infra/prisma/prisma.service';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<TagDto[]> {
    const rows = await this.prisma.forUser(userId).tag.findMany({ orderBy: { name: 'asc' } });
    return rows.map((t) => ({ id: t.id, name: t.name, color: t.color }));
  }

  async create(userId: string, input: { name: string; color: string }): Promise<TagDto> {
    try {
      const row = await this.prisma.forUser(userId).tag.create({ data: input });
      return { id: row.id, name: row.name, color: row.color };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`มีแท็กชื่อ "${input.name}" อยู่แล้ว`);
      }
      throw err;
    }
  }

  async update(
    userId: string,
    id: string,
    input: Partial<{ name: string; color: string }>,
  ): Promise<TagDto> {
    const result = await this.prisma.tag.updateMany({ where: { id, userId }, data: input });
    if (result.count === 0) throw new NotFoundException('ไม่พบแท็ก');
    const row = await this.prisma.tag.findFirstOrThrow({ where: { id, userId } });
    return { id: row.id, name: row.name, color: row.color };
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.prisma.tag.deleteMany({ where: { id, userId } });
    if (result.count === 0) throw new NotFoundException('ไม่พบแท็ก');
  }
}
