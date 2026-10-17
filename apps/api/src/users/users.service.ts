import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type AuthUserDto,
  type ModuleKey,
  type OnboardingDto,
  type UpdateSettingsInput,
} from '@nosion/contracts';
import { PrismaService } from '../infra/prisma/prisma.service';
import { isValidTimeZone } from './timezone';

export interface MeResponse {
  user: AuthUserDto;
  settings: {
    timezone: string;
    locale: string;
    buddhistEra: boolean;
    currency: string;
    weekStartsOn: number;
    theme: string;
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
    dailyDigestEnabled: boolean;
    dailyDigestTime: string;
    weeklyReviewEnabled: boolean;
    weeklyReviewDay: number;
    enabledModules: ModuleKey[];
    focusGoalMinutes: number;
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** /me คืนโปรไฟล์ + settings ในคำขอเดียว — frontend ไม่ต้องยิงสองรอบตอน bootstrap */
  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { settings: true },
    });
    if (!user?.settings) throw new NotFoundException('ไม่พบผู้ใช้');

    const s = user.settings;
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified?.toISOString() ?? null,
        isDemo: user.isDemo,
      },
      settings: {
        timezone: s.timezone,
        locale: s.locale,
        buddhistEra: s.buddhistEra,
        currency: s.currency,
        weekStartsOn: s.weekStartsOn,
        theme: s.theme,
        quietHoursEnabled: s.quietHoursEnabled,
        quietHoursStart: s.quietHoursStart,
        quietHoursEnd: s.quietHoursEnd,
        dailyDigestEnabled: s.dailyDigestEnabled,
        dailyDigestTime: s.dailyDigestTime,
        weeklyReviewEnabled: s.weeklyReviewEnabled,
        weeklyReviewDay: s.weeklyReviewDay,
        enabledModules: s.enabledModules as ModuleKey[],
        focusGoalMinutes: s.focusGoalMinutes,
      },
    };
  }

  /**
   * ทำขั้นพื้นฐานครบหรือยัง — นับจากข้อมูลจริง ไม่เก็บ flag แยก (ลบงานหมดแล้วการ์ดกลับมาแนะนำได้ ถูกต้องกว่าจำว่า "เคยทำ")
   * findFirst + select id = หยุดที่แถวแรก ไม่ต้องนับทั้งตาราง
   */
  async onboarding(userId: string): Promise<OnboardingDto> {
    const exists = (module: ModuleKey) =>
      this.prisma.entry
        .findFirst({ where: { userId, module, deletedAt: null }, select: { id: true } })
        .then(Boolean);
    const [task, expense, habit, push] = await Promise.all([
      exists('task'),
      exists('expense'),
      exists('habit'),
      this.prisma.pushSubscription
        .findFirst({ where: { userId }, select: { id: true } })
        .then(Boolean),
    ]);
    return { task, expense, habit, push };
  }

  async updateProfile(
    userId: string,
    input: { displayName?: string; avatarUrl?: string | null },
  ): Promise<AuthUserDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      },
    });
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified?.toISOString() ?? null,
      isDemo: user.isDemo,
    };
  }

  async updateSettings(
    userId: string,
    input: UpdateSettingsInput,
  ): Promise<MeResponse['settings']> {
    if (input.timezone && !isValidTimeZone(input.timezone)) {
      throw new NotFoundException(`ไม่รู้จักโซนเวลา ${input.timezone}`);
    }
    await this.prisma.userSettings.update({ where: { userId }, data: input });
    return (await this.me(userId)).settings;
  }
}
