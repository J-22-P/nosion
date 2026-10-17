import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  updateProfileSchema,
  updateSettingsSchema,
  type AuthUserDto,
  type OnboardingDto,
  type UpdateSettingsInput,
} from '@nosion/contracts';
import { CurrentUser, DemoForbidden } from '../common/decorators';
import { zodBody } from '../common/zod-validation.pipe';
import { UsersService, type MeResponse } from './users.service';

@ApiTags('me')
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async me(@CurrentUser('userId') userId: string): Promise<MeResponse> {
    return this.users.me(userId);
  }

  /** การ์ด "เริ่มต้นใช้งาน" ของบัญชีใหม่ — ทำครบแล้วการ์ดหายเอง */
  @Get('onboarding')
  async onboarding(@CurrentUser('userId') userId: string): Promise<OnboardingDto> {
    return this.users.onboarding(userId);
  }

  @Patch()
  @DemoForbidden()
  async updateProfile(
    @CurrentUser('userId') userId: string,
    @Body(zodBody(updateProfileSchema)) dto: { displayName?: string; avatarUrl?: string | null },
  ): Promise<AuthUserDto> {
    return this.users.updateProfile(userId, dto);
  }

  @Patch('settings')
  async updateSettings(
    @CurrentUser('userId') userId: string,
    @Body(zodBody(updateSettingsSchema)) dto: UpdateSettingsInput,
  ): Promise<MeResponse['settings']> {
    return this.users.updateSettings(userId, dto);
  }
}
