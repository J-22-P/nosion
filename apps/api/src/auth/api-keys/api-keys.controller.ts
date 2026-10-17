import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createApiKeySchema,
  type ApiKeyDto,
  type CreateApiKeyInput,
  type CreatedApiKeyDto,
} from '@nosion/contracts';
import { CurrentUser, RateLimit } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { ApiKeysService } from './api-keys.service';

/**
 * จัดการ API key จากหน้าตั้งค่า — ล็อกอินด้วย session เท่านั้น
 * (ไม่ติด @PublicApi → key ที่หลุดไปสร้าง key ใหม่ให้ตัวเองไม่ได้)
 */
@ApiTags('api-keys')
@Controller('me/api-keys')
@UseGuards(RateLimitGuard)
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get()
  async list(@CurrentUser('userId') userId: string): Promise<ApiKeyDto[]> {
    return this.keys.list(userId);
  }

  /** คืน key เต็มครั้งเดียว — หลังจากนี้เห็นแค่ prefix */
  @Post()
  @RateLimit({ limit: 10, windowSeconds: 3600, by: 'user' })
  async create(
    @CurrentUser('userId') userId: string,
    @Body(zodBody(createApiKeySchema)) dto: CreateApiKeyInput,
  ): Promise<CreatedApiKeyDto> {
    return this.keys.create(userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@CurrentUser('userId') userId: string, @Param('id') id: string): Promise<void> {
    await this.keys.revoke(userId, id);
  }
}
