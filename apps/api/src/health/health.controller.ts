import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/decorators';
import { HealthService } from './health.service';

/**
 * แยก liveness ออกจาก readiness (สเปกหัวข้อ 14.5)
 *
 * healthz = process ยังอยู่ไหม → ถ้าตอบไม่ได้ orchestrator ควร "รีสตาร์ท"
 * readyz  = พร้อมรับ traffic ไหม (DB/Redis ต่อติด) → ถ้าไม่พร้อมควร "ถอดออกจาก LB" ไม่ใช่รีสตาร์ท
 *
 * ถ้ารวมสองอย่างเข้าด้วยกัน DB กระตุกชั่วครู่จะทำให้ทุก pod ถูกฆ่าพร้อมกัน
 */
@ApiTags('system')
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get('healthz')
  liveness(): { status: string; uptime: number } {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  @Public()
  @Get('readyz')
  async readiness(@Res({ passthrough: true }) res: Response) {
    const result = await this.health.checkDependencies();
    res.status(result.ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
